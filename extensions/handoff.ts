import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { uuidv7 } from "@earendil-works/pi-ai";
import { complete, type Message } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

const SYSTEM_PROMPT = `You create self-contained handoff prompts for a new chat thread.

Read the conversation and produce a concise prompt that lets another assistant continue without access to the old thread. Include only relevant facts under these headings:

## Context
Summarize the user's goal and the work completed.

## Decisions and Requirements
List locked decisions, user preferences, constraints, and rejected approaches.

## Files and Changes
List files discussed, inspected, created, or modified. State the important change in each file.

## Verification and Current State
Record tests, builds, commands, results, uncommitted work, blockers, and anything that still needs verification. Never claim a check passed unless the conversation contains evidence.

## Next Steps
Describe unresolved work and future plans in priority order.

## Task
Give the new assistant one clear instruction for what to do next. Include the user's supplied next goal when present. If no goal was supplied, infer the next task from the latest unresolved work.

Write the output as a prompt addressed to the assistant in the new thread. Preserve exact paths, commands, identifiers, and error messages when they matter. Do not add a preamble, commentary, or facts absent from the conversation.`;

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "message") {
		return entry.message;
	}

	if (entry.type === "compaction") {
		return {
			role: "compactionSummary",
			summary: entry.summary,
			tokensBefore: entry.tokensBefore,
			timestamp: new Date(entry.timestamp).getTime(),
		};
	}

	return undefined;
}

function getHandoffMessages(branch: SessionEntry[]): AgentMessage[] {
	let compactionIndex = -1;
	for (let index = branch.length - 1; index >= 0; index--) {
		if (branch[index].type === "compaction") {
			compactionIndex = index;
			break;
		}
	}

	if (compactionIndex < 0) {
		return branch.map(entryToMessage).filter((message) => message !== undefined);
	}

	const compaction = branch[compactionIndex];
	const firstKeptIndex =
		compaction.type === "compaction"
			? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId)
			: -1;
	const compactedBranch = [
		compaction,
		...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
		...branch.slice(compactionIndex + 1),
	];

	return compactedBranch.map(entryToMessage).filter((message) => message !== undefined);
}

export default function handoffExtension(pi: ExtensionAPI) {
	pi.registerCommand("handoff", {
		description: "Summarize this chat and continue in a new thread",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("handoff requires interactive mode", "error");
				return;
			}

			if (!ctx.model) {
				ctx.ui.notify("No model selected", "error");
				return;
			}

			await ctx.waitForIdle();

			const messages = getHandoffMessages(ctx.sessionManager.getBranch());
			if (messages.length === 0) {
				ctx.ui.notify("No conversation to hand off", "warning");
				return;
			}

			const conversation = serializeConversation(convertToLlm(messages));
			const nextGoal = args.trim() || "No explicit next goal was supplied. Infer it from the unresolved work.";
			const parentSession = ctx.sessionManager.getSessionFile();

			const prompt = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
				const loader = new BorderedLoader(tui, theme, "Generating handoff prompt...");
				loader.onAbort = () => done(null);

				const generate = async () => {
					const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
					if (!auth.ok || !auth.apiKey) {
						throw new Error(auth.ok ? `No API key for ${ctx.model!.provider}` : auth.error);
					}

					const request: Message = {
						role: "user",
						content: [
							{
								type: "text",
								text: `## Conversation History\n\n${conversation}\n\n## Next Goal\n\n${nextGoal}`,
							},
						],
						timestamp: Date.now(),
					};

					const response = await complete(
						ctx.model!,
						{ systemPrompt: SYSTEM_PROMPT, messages: [request] },
						{
							apiKey: auth.apiKey,
							headers: auth.headers,
							env: auth.env,
							signal: loader.signal,
							cacheRetention: "none",
							sessionId: uuidv7(),
						},
					);

					if (response.stopReason === "aborted") {
						return null;
					}

					return response.content
						.filter((content): content is { type: "text"; text: string } => content.type === "text")
						.map((content) => content.text)
						.join("\n")
						.trim();
				};

				generate()
					.then(done)
					.catch((error) => {
						console.error("Handoff generation failed:", error);
						done(null);
					});

				return loader;
			});

			if (!prompt) {
				ctx.ui.notify("Handoff cancelled or generation failed", "info");
				return;
			}

			const editedPrompt = await ctx.ui.editor("Review handoff prompt", prompt);
			if (!editedPrompt?.trim()) {
				ctx.ui.notify("Handoff cancelled", "info");
				return;
			}

			const result = await ctx.newSession({
				parentSession,
				withSession: async (replacementCtx) => {
					replacementCtx.ui.setEditorText(editedPrompt.trim());
					replacementCtx.ui.notify("Handoff ready in the new thread. Submit when ready.", "success");
				},
			});

			if (result.cancelled) {
				ctx.ui.notify("New thread creation cancelled", "info");
			}
		},
	});
}
