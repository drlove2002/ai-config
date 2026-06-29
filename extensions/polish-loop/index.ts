/**
 * Polish Loop Extension
 *
 * Orchestrates autonomous code improvement passes via the subagent tool.
 * - Main agent (coordinator) uses subagent(worker, task) for each pass
 * - Extension tracks state, monitors context, forks when full
 * - State persists via JSON file for cross-session resume
 *
 * Flow:
 *   /polish -> extension sends message to agent
 *     -> agent calls subagent(worker, task-pass-1)
 *       -> after worker finishes, agent calls polish_continue
 *         -> extension updates state, optionally queues fork
 *         -> agent continues or stops
 *
 * Commands:
 *   /polish [dir] [--passes N] [--aspects a,b,c]
 *   /polish-status
 *   /polish-stop
 *   /polish-reset
 *   /polish-fork     (internal)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── State ──────────────────────────────────────────────────────────────────

interface PolishState {
	maxPasses: number;
	currentPass: number;
	targetDir: string;
	aspects: string[];
	currentAspectIndex: number;
	totalChanges: number;
	fileExtensions: string[];
	startedAt: number;
	running: boolean;
	sessionForks: number;
}

const STATE_DIR = path.join(os.homedir(), ".pi/agent");
const STATE_FILE = path.join(STATE_DIR, "polish-loop-state.json");
const DEFAULT_ASPECTS = ["readability", "structure", "design", "efficiency"];
const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"];

const ASPECT_PROMPTS: Record<string, string> = {
	readability: `## Focus: Readability
- Read the whole file before editing. Does it have one job? Is data flow obvious?
- Replace abbreviations, single-letter names with descriptive names. Use domain language.
- Extract complex conditionals into named booleans. Replace magic values with constants.
- Add comments explaining *why* (tradeoffs, edge cases), not *what* (the code says that).
- Run the project's formatter on changed files.`,

	structure: `## Focus: Structure & File Organization
- Split files over 300 lines. One responsibility per file.
- Group helpers below callers. Move shared state into structs/classes.
- Replace deep nesting with early returns, guard clauses, extracted functions.
- Remove unused imports. Order by: stdlib, third-party, local.
- Reduce coupling between modules.`,

	design: `## Focus: API Design & Interfaces
- Public functions need clear contracts. Avoid 5+ positional parameters.
- Replace ad-hoc strings/bools with domain types, enums, tagged unions.
- Hide internals with access modifiers (private, pub(crate), internal).
- Return meaningful error types. Preserve context in error chains.
- Follow the module's established patterns.`,

	efficiency: `## Focus: Performance & Efficiency
- Look for O(n^2) patterns where O(n) or O(log n) works (nested loops over large data).
- Avoid keeping large data in memory longer than needed. Stream when possible.
- Remove redundant computations and allocations inside loops.
- Use the right collection: Set for membership, Map for lookups, arrays for iteration.
- No micro-optimizations. Don't trade readability for perf without a measured bottleneck.`,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseArgs(args: string) {
	const parts = args.trim().split(/\s+/);
	let targetDir = process.cwd();
	let maxPasses = 10;
	let aspects = DEFAULT_ASPECTS;
	let extensions = DEFAULT_EXTENSIONS;

	for (let i = 0; i < parts.length; i++) {
		if (parts[i] === "--passes" && i + 1 < parts.length) {
			maxPasses = Math.max(1, parseInt(parts[i + 1], 10) || 10);
			i++;
		} else if (parts[i] === "--aspects" && i + 1 < parts.length) {
			aspects = parts[i + 1].split(",").map((a) => a.trim()).filter(Boolean);
			if (!aspects.length) aspects = DEFAULT_ASPECTS;
			i++;
		} else if (parts[i] === "--extensions" && i + 1 < parts.length) {
			extensions = parts[i + 1].split(",").map((e) => (e.startsWith(".") ? e : `.${e}`)).filter(Boolean);
			if (!extensions.length) extensions = DEFAULT_EXTENSIONS;
			i++;
		} else if (!parts[i].startsWith("--")) {
			targetDir = parts[i];
		}
	}
	return { targetDir, maxPasses, aspects, extensions };
}

function loadState(): PolishState | null {
	try {
		if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
	} catch { /* corrupt */ }
	return null;
}

function saveState(state: PolishState) {
	try {
		fs.mkdirSync(STATE_DIR, { recursive: true });
		fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
	} catch { /* best effort */ }
}

function clearState() {
	try { fs.unlinkSync(STATE_FILE); } catch { /* ignore */ }
}

function isNearLimit(tokens: number, modelCtx: number): boolean {
	return tokens > modelCtx * 0.7;
}

function buildFindExts(extensions: string[]): string {
	return extensions.map((e) => `-name "*${e}"`).join(" -o ");
}

function buildTaskPrompt(state: PolishState): string {
	const aspect = state.aspects[state.currentAspectIndex % state.aspects.length];
	const aspectPrompt = ASPECT_PROMPTS[aspect] || ASPECT_PROMPTS.readability;
	const findExts = buildFindExts(state.fileExtensions);

	return [
		`# Polish Pass ${state.currentPass}/${state.maxPasses}: ${aspect}`,
		``,
		`Target: ${state.targetDir}`,
		``,
		aspectPrompt,
		``,
		`## How to work`,
		`- Run: find "${state.targetDir}" -type f ( ${findExts} ) -not -path "*/node_modules/*" -not -path "*/.git/*"`,
		`- Read each file with the \`read\` tool before editing`,
		`- Use \`edit\` or \`write\` to apply improvements`,
		`- After editing, run the project's formatter (nix fmt, pnpm exec, ruff, cargo fmt, etc.)`,
		`- Report what files you changed and why`,
		`- If no files needed changes, end with: NO_CHANGES`,
	].join("\n");
}

function buildResumePrompt(state: PolishState): string {
	const aspect = state.aspects[state.currentAspectIndex % state.aspects.length];
	const task = buildTaskPrompt(state);

	return [
		`Resume polish loop: pass ${state.currentPass}/${state.maxPasses}`,
		`Next aspect: ${aspect}`,
		`Target: ${state.targetDir}`,
		``,
		`Use subagent with agent "worker" to apply improvements.`,
		`After the subagent finishes, call polish_continue with the results.`,
		`polish_continue will tell you what to do next.`,
		``,
		task,
	].join("\n");
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Resume after restart or session fork
	pi.on("session_start", async (_event, ctx) => {
		const state = loadState();
		if (!state?.running) return;
		if (state.currentPass > state.maxPasses) return;

		ctx.ui.notify(
			`Resuming polish loop: pass ${state.currentPass}/${state.maxPasses}` +
				(state.sessionForks > 0 ? ` (fork #${state.sessionForks})` : ""),
			"info",
		);

		await new Promise((r) => setTimeout(r, 600));
		pi.sendUserMessage(buildResumePrompt(state), { triggerTurn: true });
	});

	// ── /polish ──
	pi.registerCommand("polish", {
		description:
			"Start autonomous code improvement loop. " +
			"Usage: /polish [dir] [--passes N] [--aspects a,b,c] [--extensions .ts,.rs,.py]",
		handler: async (args, ctx) => {
			const existing = loadState();
			if (existing?.running) {
				ctx.ui.notify(
					`Loop already running (pass ${existing.currentPass}/${existing.maxPasses}). ` +
						"Use /polish-stop then /polish to restart.",
					"warning",
				);
				return;
			}

			const parsed = parseArgs(args);
			if (!fs.existsSync(parsed.targetDir)) {
				ctx.ui.notify(`Directory not found: ${parsed.targetDir}`, "error");
				return;
			}

			const state: PolishState = {
				maxPasses: parsed.maxPasses,
				currentPass: 1,
				targetDir: parsed.targetDir,
				aspects: parsed.aspects,
				currentAspectIndex: 0,
				totalChanges: 0,
				fileExtensions: parsed.extensions,
				startedAt: Date.now(),
				running: true,
				sessionForks: 0,
			};
			saveState(state);

			ctx.ui.notify(
				`Polish loop: ${state.maxPasses} passes on ${state.targetDir}` +
					` [${state.aspects.join(", ")}]`,
				"info",
			);

			pi.sendUserMessage(
				`Start polish loop on ${state.targetDir} (${state.maxPasses} passes).\n\n` +
					buildTaskPrompt(state) +
					"\n\nAfter working, call polish_continue with your results to continue the loop.",
				{ triggerTurn: true },
			);
		},
	});

	// ── /polish-status ──
	pi.registerCommand("polish-status", {
		description: "Show current polish loop status",
		handler: async (_args, ctx) => {
			const state = loadState();
			if (!state) {
				ctx.ui.notify("No active polish loop.", "info");
				return;
			}

			const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
			const mins = Math.floor(elapsed / 60);
			const aspect = state.aspects[state.currentAspectIndex % state.aspects.length];

			ctx.ui.notify(
				`[${state.running ? "RUNNING" : "STOPPED"}] ` +
					`Pass ${state.currentPass}/${state.maxPasses} | ${aspect} | ` +
					`${state.totalChanges} changed | ${state.sessionForks} forks | ${mins}m`,
				"info",
			);
		},
	});

	// ── /polish-stop ──
	pi.registerCommand("polish-stop", {
		description: "Stop the polish loop",
		handler: async (_args, ctx) => {
			const state = loadState();
			if (!state) {
				ctx.ui.notify("No active polish loop.", "warning");
				return;
			}

			state.running = false;
			saveState(state);

			const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
			const mins = Math.floor(elapsed / 60);
			ctx.ui.notify(
				`Stopped at pass ${state.currentPass}/${state.maxPasses}. ` +
					`${state.totalChanges} files changed. ${mins}m elapsed.`,
				"info",
			);
		},
	});

	// ── /polish-reset ──
	pi.registerCommand("polish-reset", {
		description: "Clear polish loop state",
		handler: async (_args, ctx) => {
			clearState();
			ctx.ui.notify("Polish loop state cleared.", "info");
		},
	});

	// ── /polish-fork (internal) ──
	pi.registerCommand("polish-fork", {
		description: "Internal: fork to fresh session preserving polish state",
		handler: async (_args, ctx) => {
			const state = loadState();
			if (!state) {
				ctx.ui.notify("No polish state to fork.", "warning");
				return;
			}

			state.sessionForks++;
			saveState(state);

			ctx.ui.notify(
				`Forking at pass ${state.currentPass}/${state.maxPasses} (fork #${state.sessionForks})...`,
				"info",
			);

			const aspect = state.aspects[state.currentAspectIndex % state.aspects.length];
			const summary = [
				`## Polish Loop Continuation (Fork #${state.sessionForks})`,
				``,
				`Pass: ${state.currentPass}/${state.maxPasses}`,
				`Next aspect: ${aspect}`,
				`Total changes so far: ${state.totalChanges}`,
				`Target: ${state.targetDir}`,
				``,
				`Continue the loop by running subagent and calling polish_continue.`,
			].join("\n");

			await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
				setup: async (sm) => {
					sm.appendMessage({
						role: "user",
						content: [{ type: "text", text: summary }],
						timestamp: Date.now(),
					});
				},
				withSession: async (_newCtx) => {
					// Loop continues via session_start -> resume logic
				},
			});
		},
	});

	// ── polish_continue tool ──
	pi.registerTool({
		name: "polish_continue",
		label: "Polish Continue",
		description:
			"Call this after each subagent pass completes. " +
			"Reports what was done and decides next step.",
		parameters: Type.Object({
			passNumber: Type.Number({ description: "Which pass just completed" }),
			changesMade: Type.Boolean({ description: "Whether any files were modified" }),
			summary: Type.String({ description: "Summary of what was done this pass" }),
			filesChanged: Type.Optional(
				Type.Array(Type.String(), { description: "List of modified files" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const state = loadState();
			if (!state || !state.running) {
				return {
					content: [{ type: "text", text: "No active polish loop. Use /polish to start one." }],
				};
			}

			// Accumulate changes
			if (params.changesMade) {
				state.totalChanges += (params.filesChanged as string[])?.length || 1;
			}
			saveState(state);

			// ── Stopping conditions ──
			const noChanges = !params.changesMade;
			const maxReached = state.currentPass >= state.maxPasses;

			if (noChanges || maxReached) {
				state.running = false;
				saveState(state);

				const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
				const mins = Math.floor(elapsed / 60);
				const reason = noChanges ? "converged (no changes)" : `max passes (${state.maxPasses})`;

				ctx.ui.notify(
					`Polish done: ${state.currentPass} passes, ` +
						`${state.totalChanges} files changed, ${mins}m. ${reason}.`,
					"success",
				);

				return {
					content: [
						{
							type: "text",
							text:
								`POLISH_COMPLETE: ${reason}. ` +
								`${state.currentPass} passes, ${state.totalChanges} files changed.`,
						},
					],
					terminate: true,
				};
			}

			// ── Advance to next pass ──
			state.currentPass++;
			state.currentAspectIndex++;
			saveState(state);

			const nextAspect = state.aspects[state.currentAspectIndex % state.aspects.length];

			// ── Check context — queue fork if near limit ──
			const usage = ctx.getContextUsage();
			const model = ctx.model;
			const modelCtx = model?.contextWindow ?? 128000;

			if (usage && isNearLimit(usage.tokens, modelCtx)) {
				ctx.ui.notify(
					`Context ${Math.round((usage.tokens / modelCtx) * 100)}%. Forking session...`,
					"warning",
				);
				pi.sendUserMessage("/polish-fork", { deliverAs: "followUp" });

				return {
					content: [
						{
							type: "text",
							text:
								`CONTEXT_FULL: ${Math.round(usage.tokens / 1000)}k / ` +
								`${Math.round(modelCtx / 1000)}k tokens. ` +
								`Fork queued. Resume pass ${state.currentPass}/${state.maxPasses}, ` +
								`aspect: ${nextAspect}, target: ${state.targetDir} in the new session.`,
						},
					],
					terminate: true,
				};
			}

			// ── Continue loop ──
			const task = buildTaskPrompt(state);
			return {
				content: [
					{
						type: "text",
						text:
							`CHECKPOINT: Pass ${params.passNumber} done. ` +
							`Continue pass ${state.currentPass}/${state.maxPasses}. ` +
							`Next aspect: ${nextAspect}.\n\n` + task,
					},
				],
			};
		},
	});
}
