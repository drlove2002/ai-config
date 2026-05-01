import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";
import { Type } from "typebox";

// --- Types ---

interface Question {
	id: string;
	text: string;
	options: string[];
}

interface Answer {
	selections: string[];
	customOption?: string;
	comment?: string;
}

// --- UI Helpers ---

/**
 * Renders a rich TUI SelectList using the Pi component system.
 */
async function interactiveSelect<T>(ctx: any, title: string, items: SelectItem<T>[]): Promise<T | null> {
	return await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (val: T | null) => void) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));

		const selectList = new SelectList(items, Math.min(items.length, 15), {
			selectedPrefix: (t: string) => theme.fg("accent", t),
			selectedText: (t: string) => theme.fg("accent", t),
			description: (t: string) => theme.fg("muted", t),
			scrollInfo: (t: string) => theme.fg("dim", t),
			noMatch: (t: string) => theme.fg("warning", t),
		});
		
		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);

		container.addChild(selectList);
		container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return {
			render: (w: number) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => { selectList.handleInput?.(data); tui.requestRender(); },
		};
	});
}

/**
 * Form loop for a single question (simulating multi-select + custom fields)
 */
async function editQuestion(ctx: any, q: Question, answer: Answer): Promise<boolean> {
	while (true) {
		const options: SelectItem<string>[] = q.options.map(opt => ({
			value: `opt:${opt}`,
			label: (answer.selections.includes(opt) ? "✅ " : "⬜ ") + opt,
		}));

		const customLabel = answer.customOption ? `✏️  Custom: ${answer.customOption}` : "✏️  Add Custom Answer...";
		const commentLabel = answer.comment ? `💬 Comment: ${answer.comment}` : "💬 Add Comment...";

		const choices: SelectItem<string>[] = [
			...options,
			{ value: "custom", label: customLabel },
			{ value: "comment", label: commentLabel },
			{ value: "done", label: "➡️  Done / Next" }
		];

		const picked = await interactiveSelect<string>(ctx, `Question: ${q.text}\nSelect to toggle, or add custom/comment:`, choices);

		if (!picked) return false; // aborted with Escape

		if (picked === "done") break;

		if (picked.startsWith("opt:")) {
			const opt = picked.slice(4);
			if (answer.selections.includes(opt)) {
				answer.selections = answer.selections.filter(x => x !== opt);
			} else {
				answer.selections.push(opt);
			}
		} else if (picked === "custom") {
			const custom = await ctx.ui.input("Custom answer (leave empty to clear):", answer.customOption || "");
			if (custom !== undefined) {
				answer.customOption = custom.trim() ? custom : undefined;
			}
		} else if (picked === "comment") {
			const comment = await ctx.ui.input("Comment (leave empty to clear):", answer.comment || "");
			if (comment !== undefined) {
				answer.comment = comment.trim() ? comment : undefined;
			}
		}
	}
	return true;
}

/**
 * Main Form loop for all questions and summary
 */
async function runForm(ctx: any, questions: Question[], answers: Record<string, Answer>): Promise<Record<string, Answer> | null> {
	// Ensure all questions have an answer object initialized
	for (const q of questions) {
		if (!answers[q.id]) {
			answers[q.id] = { selections: [] };
		}
	}

	// First pass: auto-prompt for any question that has absolutely no interaction yet
	for (const q of questions) {
		const ans = answers[q.id]!;
		if (ans.selections.length === 0 && !ans.customOption && !ans.comment) {
			const ok = await editQuestion(ctx, q, ans);
			if (!ok) return null; // aborted entirely
		}
	}

	// Summary loop
	while (true) {
		const choices: SelectItem<string>[] = questions.map(q => {
			const ans = answers[q.id]!;
			const parts = [...ans.selections];
			if (ans.customOption) parts.push(`Custom: ${ans.customOption}`);
			if (ans.comment) parts.push(`(Comment: ${ans.comment})`);
			
			const preview = parts.length > 0 ? parts.join(" | ") : "No answer provided";
			
			return {
				value: `edit:${q.id}`,
				label: `📝 ${q.text}`,
				description: preview
			};
		});

		choices.push({ value: "submit", label: "🚀 SUBMIT TO AGENT", description: "Lock in answers and continue the chain." });
		choices.push({ value: "cancel", label: "❌ Cancel", description: "Abort without saving." });

		const picked = await interactiveSelect<string>(ctx, "Review your decisions. Select one to edit, or Submit:", choices);

		if (!picked || picked === "cancel") return null;
		if (picked === "submit") break;

		if (picked.startsWith("edit:")) {
			const qId = picked.slice(5);
			const q = questions.find(x => x.id === qId);
			if (q) await editQuestion(ctx, q, answers[q.id]!);
		}
	}

	return answers;
}

// --- Main Extension ---

export default function userDecisionsExtension(pi: ExtensionAPI) {
	let latestQuestions: Question[] = [];
	let latestAnswers: Record<string, Answer> = {};

	// Rehydrate state on reload so you can still edit decisions after restarting pi
	pi.on("session_start", async (_event, ctx) => {
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "ask_user_decisions") {
				latestQuestions = entry.message.details?.questions || latestQuestions;
				latestAnswers = entry.message.details?.answers || latestAnswers;
			}
		}
	});

	// Register the Tool for the Agent
	pi.registerTool({
		name: "ask_user_decisions",
		label: "Ask User Decisions",
		description: "Ask the user a series of questions interactively. The user will see a multi-select form with abilities to add custom answers and comments. ALWAYS use this tool before starting complex chained workflows to gather decisions.",
		parameters: Type.Object({
			questions: Type.Array(Type.Object({
				id: Type.String({ description: "Unique identifier for the question" }),
				text: Type.String({ description: "The question text to display" }),
				options: Type.Array(Type.String(), { description: "Available options for the user to select from" })
			}))
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				throw new Error("This tool requires an interactive UI.");
			}

			latestQuestions = params.questions;

			// Clone existing answers if IDs match, else initialize
			const newAnswers: Record<string, Answer> = {};
			for (const q of params.questions) {
				newAnswers[q.id] = latestAnswers[q.id] || { selections: [] };
			}
			latestAnswers = newAnswers;

			const result = await runForm(ctx, latestQuestions, latestAnswers);

			if (!result) {
				return { 
					content: [{ type: "text", text: "User cancelled the questionnaire." }], 
					details: { questions: latestQuestions, answers: latestAnswers } 
				};
			}

			latestAnswers = result;

			// Format answers nicely for the LLM
			const formattedResult: any = {};
			for (const q of latestQuestions) {
				formattedResult[q.id] = {
					question: q.text,
					...latestAnswers[q.id]
				};
			}

			return {
				content: [{ 
					type: "text", 
					text: `User has submitted the following decisions:\n${JSON.stringify(formattedResult, null, 2)}` 
				}],
				details: { questions: latestQuestions, answers: latestAnswers }
			};
		}
	});

	// Register the Command for the User
	pi.registerCommand("edit-decisions", {
		description: "Edit your answers to the most recent interactive questionnaire",
		handler: async (_args, ctx) => {
			if (!latestQuestions || latestQuestions.length === 0) {
				ctx.ui.notify("No active questionnaire to edit.", "warning");
				return;
			}

			const result = await runForm(ctx, latestQuestions, latestAnswers);
			if (result) {
				latestAnswers = result;
				
				const formattedResult: any = {};
				for (const q of latestQuestions) {
					formattedResult[q.id] = {
						question: q.text,
						...latestAnswers[q.id]
					};
				}

				// Submit the updated state back into the chat context!
				pi.sendUserMessage(`I have updated my decisions for the task using the /edit-decisions command. Please review the new answers and adjust your plan/work if needed:\n\n\`\`\`json\n${JSON.stringify(formattedResult, null, 2)}\n\`\`\``, {
					deliverAs: "steer"
				});
				
				ctx.ui.notify("Decisions updated and sent to the agent.", "success");
			} else {
				ctx.ui.notify("Edit cancelled.", "info");
			}
		}
	});
}