/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }  or  { agent: "name", workerPackage: {...} }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 *
 * Worker agents use workerPackage instead of raw task.
 * Non-worker agents use raw task and reject workerPackage.
 *
 * Uses JSON mode to capture structured output from subagents.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import { type ExtensionAPI, getMarkdownTheme, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";
import {
	buildDiagnosticSummary,
	classifyLine,
	formatLimitLabel,
	isActivityEvent,
} from "./runner-events.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const COLLAPSED_ITEM_COUNT = 10;
const DEFAULT_WALL_CLOCK_MS = 15 * 60 * 1000;
const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000;
const DEFAULT_SHUTDOWN_GRACE_MS = 2_000;

// ── WorkerPackage schema & helpers ────────────────────────────────────────────

const WorkerPackageSchema = Type.Object({
	objective: Type.String({ minLength: 1, description: "One sentence summary of the task" }),
	files: Type.Array(Type.String(), { minItems: 1, description: "Files the worker is allowed to edit" }),
	changes: Type.String({ minLength: 1, description: "Precise description of what to change" }),
	acceptance: Type.String({ minLength: 1, description: "Acceptance criteria that must be met" }),
	verification: Type.String({ minLength: 1, description: "How to verify (commands, expected output)" }),
});

type WorkerPackage = {
	objective: string;
	files: string[];
	changes: string;
	acceptance: string;
	verification: string;
};

function isWorkerAgent(agentName: string): boolean {
	return agentName === "worker";
}

function isSubagentError(result: { exitCode: number; stopReason?: string }): boolean {
	if (result.exitCode === -1) return false;
	return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted" || Boolean(result.hitLimit);
}

function validateWorkerPackage(wp: WorkerPackage, label: string): string | null {
	if (!wp.objective || !wp.objective.trim()) return `${label}: workerPackage.objective must be nonempty`;
	if (!wp.files || wp.files.length === 0) return `${label}: workerPackage.files must be nonempty`;
	const forbidden = /[\n\r\x00-\x1f`]/;
	for (let i = 0; i < wp.files.length; i++) {
		const entry = wp.files[i];
		if (!entry || !entry.trim()) return `${label}: workerPackage.files[${i}] must be nonblank`;
		if (forbidden.test(entry)) return `${label}: workerPackage.files[${i}] contains forbidden characters`;
	}
	if (!wp.changes || !wp.changes.trim()) return `${label}: workerPackage.changes must be nonempty`;
	if (!wp.acceptance || !wp.acceptance.trim()) return `${label}: workerPackage.acceptance must be nonempty`;
	if (!wp.verification || !wp.verification.trim()) return `${label}: workerPackage.verification must be nonempty`;
	return null;
}

function validateTaskPayload(
	agentName: string,
	task: string | undefined,
	workerPackage: WorkerPackage | undefined,
	label: string,
): string | null {
	const hasTask = task !== undefined;
	const hasWorkerPackage = workerPackage !== undefined;

	if (hasTask && hasWorkerPackage) {
		return `${label} "${agentName}": provide either task or workerPackage, not both`;
	}

	if (isWorkerAgent(agentName)) {
		if (hasTask) return `${label} "${agentName}": worker agent requires workerPackage, not raw task`;
		if (!hasWorkerPackage) return `${label} "${agentName}": worker agent requires workerPackage`;
		return validateWorkerPackage(workerPackage, `${label} "${agentName}"`);
	}

	if (hasWorkerPackage) {
		return `${label} "${agentName}": non-worker agent does not accept workerPackage, use task`;
	}
	if (!hasTask) return `${label} "${agentName}": task must be provided`;
	if (!task!.trim()) return `${label} "${agentName}": task must be nonempty`;
	return null;
}

function buildWorkerTask(wp: WorkerPackage): string {
	return [
		wp.objective,
		"",
		"## Files Allowed",
		...wp.files.map((f) => `- \`${f.trim()}\``),
		"",
		"## Changes",
		wp.changes,
		"",
		"## Acceptance",
		wp.acceptance,
		"",
		"## Verification",
		wp.verification,
	].join("\n");
}

function normalizeFilePath(p: string, cwd: string): string {
	if (path.isAbsolute(p)) return path.normalize(p);
	return path.normalize(path.join(cwd, p));
}

function isAncestor(parent: string, child: string): boolean {
	const rel = path.relative(parent, child);
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function detectFileOverlaps(
	tasks: Array<{ agent: string; workerPackage?: WorkerPackage; cwd?: string }>,
	defaultCwd: string,
): string | null {
	const fileMap = new Map<string, string>();
	for (const t of tasks) {
		if (!t.workerPackage) continue;
		const taskCwd = t.cwd ?? defaultCwd;
		for (const f of t.workerPackage.files) {
			const norm = normalizeFilePath(f.trim(), taskCwd);
			const existing = fileMap.get(norm);
			if (existing) return `File overlap: "${norm}" claimed by both "${existing}" and "${t.agent}"`;
			for (const [prior, priorAgent] of fileMap) {
				if (isAncestor(prior, norm)) return `File overlap: "${prior}" (${priorAgent}) is a parent of "${norm}" (${t.agent})`;
				if (isAncestor(norm, prior)) return `File overlap: "${norm}" (${t.agent}) is a parent of "${prior}" (${priorAgent})`;
			}
			fileMap.set(norm, t.agent);
		}
	}
	return null;
}

function safeWorkerPackagePreview(wp: Record<string, unknown> | undefined): string {
	if (!wp) return "(no package)";
	const obj = typeof wp.objective === "string" ? wp.objective.trim() : "";
	if (obj) return obj.length > 60 ? `${obj.slice(0, 60)}...` : obj;
	return "(no objective)";
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	}
	if (model) parts.push(model);
	return parts.join(" ");
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	const shortenPath = (p: string) => {
		const home = os.homedir();
		return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
	};

	switch (toolName) {
		case "bash": {
			const command = (args.command as string) || "...";
			const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
			return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let text = themeFg("accent", filePath);
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				text += themeFg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
			}
			return themeFg("muted", "read ") + text;
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			let text = themeFg("muted", "write ") + themeFg("accent", filePath);
			if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
			return text;
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath));
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "find ") + themeFg("accent", pattern) + themeFg("dim", ` in ${shortenPath(rawPath)}`);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "grep ") +
				themeFg("accent", `/${pattern}/`) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
			return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
		}
	}
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface Limits {
	wallClockMs: number;
	inactivityMs: number;
	shutdownGraceMs: number;
}

interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	hitLimit?: "wallClock" | "inactivity" | "shutdownGrace";
	diagnostic?: string;
	lifecyclePhase?: string;
	step?: number;
}

interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return { dir: tmpDir, filePath };
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

async function runSingleAgent(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	limits?: Limits,
	noExtensions?: boolean,
): Promise<SingleResult> {
	const agent = agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			step,
		};
	}

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.thinkingLevel) args.push("--thinking", agent.thinkingLevel);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
	if (noExtensions) args.push("--no-extensions");

	const effectiveLimits: Limits = {
		wallClockMs: limits?.wallClockMs ?? DEFAULT_WALL_CLOCK_MS,
		inactivityMs: limits?.inactivityMs ?? DEFAULT_INACTIVITY_MS,
		shutdownGraceMs: limits?.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS,
	};

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: agent.model,
		lifecyclePhase: "init",
		step,
	};

	// ── lifecycle tracking ───────────────────────────────────────────
	let lifecyclePhase = "init";
	let lastActivityMs = Date.now();
	let completedToolCalls: string[] = [];
	let latestAssistantText = "";
	let terminalProviderFailure: string | null = null;
	let hitLimit: "wallClock" | "inactivity" | "shutdownGrace" | undefined;

	// ── idempotent termination tracking ──────────────────────────────
	let killed = false;
	let killTimer: ReturnType<typeof setTimeout> | null = null;

	const updatePhase = (phase: string) => {
		lifecyclePhase = phase;
		currentResult.lifecyclePhase = phase;
	};

	const trackActivity = (line: string) => {
		if (isActivityEvent(line)) {
			lastActivityMs = Date.now();
		}
	};

	const emitUpdate = () => {
		if (onUpdate) {
			onUpdate({
				content: [{ type: "text", text: getFinalOutput(currentResult.messages) || "(running...)" }],
				details: makeDetails([currentResult]),
			});
		}
	};

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const exitCode = await new Promise<number>((resolve, reject) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				env: { ...process.env, PI_SUBAGENT: "1" },
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			// ── idempotent termination ──────────────────────────────
			const terminate = () => {
				if (killed) return;
				killed = true;
				if (killTimer) { clearTimeout(killTimer); killTimer = null; }
				proc.kill("SIGTERM");
				killTimer = setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
					killTimer = null;
				}, 5_000);
			};

			// ── timers ──────────────────────────────────────────────
			let wallClockTimer: ReturnType<typeof setTimeout> | null = null;
			let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
			let shutdownGraceTimer: ReturnType<typeof setTimeout> | null = null;
			let settled = false;

			const clearAllTimers = () => {
				if (wallClockTimer) { clearTimeout(wallClockTimer); wallClockTimer = null; }
				if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
				if (shutdownGraceTimer) { clearTimeout(shutdownGraceTimer); shutdownGraceTimer = null; }
			};

			const resetInactivityTimer = () => {
				if (inactivityTimer) clearTimeout(inactivityTimer);
				if (effectiveLimits.inactivityMs > 0 && !settled) {
					inactivityTimer = setTimeout(() => {
						if (!killed && !settled) {
							hitLimit = "inactivity";
							terminate();
						}
					}, effectiveLimits.inactivityMs);
				}
			};

			// wall clock
			if (effectiveLimits.wallClockMs > 0) {
				wallClockTimer = setTimeout(() => {
					if (!killed) {
						hitLimit = "wallClock";
						terminate();
					}
				}, effectiveLimits.wallClockMs);
			}

			// initial inactivity timer
			resetInactivityTimer();

			const processLine = (line: string) => {
				if (!line.trim()) return;

				// track activity *before* parsing to avoid JSON parse cost skewing timing
				trackActivity(line);
				resetInactivityTimer();

				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				// ── lifecycle phase tracking ─────────────────────────
				if (event.type === "agent_start") updatePhase("thinking");
				if (event.type === "turn_start") updatePhase("thinking");
				if (event.type === "message_start") updatePhase("thinking");
				if (event.type === "message_update") updatePhase("thinking");
				if (event.type === "tool_execution_start") updatePhase("tool");
				if (event.type === "tool_execution_update") updatePhase("tool");
				if (event.type === "auto_retry_start") updatePhase("retry");
				if (event.type === "compaction_start") updatePhase("compact");
				if (event.type === "agent_end") updatePhase("settled");
				if (event.type === "agent_settled") {
					updatePhase("settled");
					settled = true;
					if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
					// start shutdown grace timer
					if (effectiveLimits.shutdownGraceMs > 0) {
						shutdownGraceTimer = setTimeout(() => {
							if (!killed) {
								hitLimit = "shutdownGrace";
								terminate();
							}
						}, effectiveLimits.shutdownGraceMs);
					}
				}

				// ── provider failure classification ─────────────────
				const failure = classifyLine(line);
				if (failure) {
					terminalProviderFailure = failure.reason;
					updatePhase("settled");
					settled = true;
					terminate();
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					currentResult.messages.push(msg);

					if (msg.role === "assistant") {
						currentResult.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!currentResult.model && msg.model) currentResult.model = msg.model;
						if (msg.stopReason) currentResult.stopReason = msg.stopReason;
						if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;

						// capture latest assistant text for diagnostics
						for (const part of msg.content) {
							if (part.type === "text" && part.text.trim()) {
								latestAssistantText = part.text;
							}
						}
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					currentResult.messages.push(event.message as Message);
					emitUpdate();
				}

				// track completed tool calls for diagnostics
				if (event.type === "tool_execution_end" && event.name) {
					completedToolCalls.push(String(event.name));
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			proc.on("close", (code) => {
				clearAllTimers();
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				clearAllTimers();
				resolve(1);
			});

			if (signal) {
				const killProc = () => {
					wasAborted = true;
					terminate();
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		currentResult.exitCode = exitCode;
		if (wasAborted) throw new Error("Subagent was aborted");

		// ── post-run diagnostics ─────────────────────────────────────
		if (terminalProviderFailure) {
			currentResult.stopReason = "error";
			currentResult.errorMessage = terminalProviderFailure;
			currentResult.exitCode = currentResult.exitCode === 0 ? 1 : currentResult.exitCode;
		}
		if (hitLimit) currentResult.hitLimit = hitLimit;
		if (hitLimit || terminalProviderFailure) {
			const stderrLines = currentResult.stderr.split("\n");
			const stderrTail = stderrLines.slice(-10).join("\n");
			currentResult.diagnostic = buildDiagnosticSummary({
				hitLimit,
				errorMessage: currentResult.errorMessage,
				lifecyclePhase,
				lastActivityAgeMs: Date.now() - lastActivityMs,
				latestAssistantText,
				completedToolCalls,
				stderrTail: stderrTail.trim() || undefined,
			});
		}
		if (currentResult.exitCode === 0 && !wasAborted) updatePhase("exited");

		return currentResult;
	} finally {
		if (tmpPromptPath)
			try {
				fs.unlinkSync(tmpPromptPath);
			} catch {
				/* ignore */
			}
		if (tmpPromptDir)
			try {
				fs.rmdirSync(tmpPromptDir);
			} catch {
				/* ignore */
			}
	}
}

// ── TypeBox schemas ───────────────────────────────────────────────────────────

const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.Optional(Type.String({ description: "Task to delegate to the agent" })),
	workerPackage: Type.Optional(WorkerPackageSchema),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.Optional(Type.String({ description: "Task with optional {previous} placeholder for prior output" })),
	workerPackage: Type.Optional(WorkerPackageSchema),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
});

const LimitsSchema = Type.Object({
	wallClockMs: Type.Optional(Type.Number({ description: "Total wall-clock time in ms before SIGTERM→SIGKILL. Default: 15 min. Set to 0 to disable." })),
	inactivityMs: Type.Optional(Type.Number({ description: "Maximum time in a single phase before escalation. Default: 5 min. Set to 0 to disable." })),
	shutdownGraceMs: Type.Optional(Type.Number({ description: "After agent_settled, wait this long for child to exit. Default: 2 sec. Set to 0 to disable." })),
});

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
	workerPackage: Type.Optional(WorkerPackageSchema),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {agent, task?, workerPackage?} for parallel execution" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task?, workerPackage?} for sequential execution" })),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
	),
	limits: Type.Optional(LimitsSchema),
	noExtensions: Type.Optional(
		Type.Boolean({ description: "Run child process with --no-extensions to isolate from main session extensions.", default: false }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
});

// ── Main tool registration ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate tasks to specialized subagents with isolated context.",
			'Modes: single (agent + task or agent + workerPackage), parallel (tasks array), chain (sequential with {previous} placeholder).',
			"Worker agents require workerPackage; non-worker agents require task.",
			'Default agent scope is "user" (from ~/.pi/agent/agents).',
			'To enable project-local agents in .pi/agents, set agentScope: "both" (or "project").',
		].join(" "),
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const agentScope: AgentScope = params.agentScope ?? "user";
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? true;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && (params.workerPackage || params.task));
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			// ── helper: validate payload + resolve final task string ────────
			const resolvePayload = (
				agentName: string,
				rawTask: string | undefined,
				rawWP: typeof params.workerPackage,
				label: string,
			): { task: string } | { error: string } => {
				const err = validateTaskPayload(agentName, rawTask, rawWP as WorkerPackage | undefined, label);
				if (err) return { error: err };
				if (isWorkerAgent(agentName)) {
					return { task: buildWorkerTask(rawWP as WorkerPackage) };
				}
				return { task: rawTask as string };
			};

			const makeDetails =
				(mode: "single" | "parallel" | "chain") =>
				(results: SingleResult[]): SubagentDetails => ({
					mode,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
					results,
				});

			if (modeCount !== 1) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode.\nAvailable agents: ${available}`,
						},
					],
					details: makeDetails("single")([]),
				};
			}

			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
				const requestedAgentNames = new Set<string>();
				if (params.chain) for (const step of params.chain) requestedAgentNames.add(step.agent);
				if (params.tasks) for (const t of params.tasks) requestedAgentNames.add(t.agent);
				if (params.agent) requestedAgentNames.add(params.agent);

				const projectAgentsRequested = Array.from(requestedAgentNames)
					.map((name) => agents.find((a) => a.name === name))
					.filter((a): a is AgentConfig => a?.source === "project");

				if (projectAgentsRequested.length > 0) {
					const names = projectAgentsRequested.map((a) => a.name).join(", ");
					const dir = discovery.projectAgentsDir ?? "(unknown)";
					const ok = await ctx.ui.confirm(
						"Run project-local agents?",
						`Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
					);
					if (!ok)
						return {
							content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
							details: makeDetails(hasChain ? "chain" : hasTasks ? "parallel" : "single")([]),
						};
				}
			}

			// ── Chain mode ──────────────────────────────────────────────────

			if (params.chain && params.chain.length > 0) {
				// Validate all chain payloads upfront
				const chainTasks: string[] = [];
				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const resolved = resolvePayload(step.agent, step.task, step.workerPackage, `Chain step ${i + 1}`);
					if ("error" in resolved) {
						return {
							content: [{ type: "text", text: resolved.error }],
							details: makeDetails("chain")([]),
						};
					}
					chainTasks.push(resolved.task);
				}

				const results: SingleResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const taskWithContext = chainTasks[i].replace(/\{previous\}/g, previousOutput);

					// Create update callback that includes all previous results
					const chainUpdate: OnUpdateCallback | undefined = onUpdate
						? (partial) => {
								const currentResult = partial.details?.results[0];
								if (currentResult) {
									const allResults = [...results, currentResult];
									onUpdate({
										content: partial.content,
										details: makeDetails("chain")(allResults),
									});
								}
							}
						: undefined;

					const result = await runSingleAgent(
						ctx.cwd,
						agents,
						step.agent,
						taskWithContext,
						step.cwd,
						i + 1,
						signal,
						chainUpdate,
						makeDetails("chain"),
					);
					results.push(result);

					if (isSubagentError(result)) {
						const errorMsg =
							result.diagnostic || result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}` }],
							details: makeDetails("chain")(results),
							isError: true,
						};
					}
					previousOutput = getFinalOutput(result.messages);
				}
				return {
					content: [{ type: "text", text: getFinalOutput(results[results.length - 1].messages) || "(no output)" }],
					details: makeDetails("chain")(results),
				};
			}

			// ── Parallel mode ───────────────────────────────────────────────

			if (params.tasks && params.tasks.length > 0) {
				if (params.tasks.length > MAX_PARALLEL_TASKS)
					return {
						content: [
							{
								type: "text",
								text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
							},
						],
						details: makeDetails("parallel")([]),
					};

				// Validate payloads
				const parallelTasks: string[] = [];
				for (let i = 0; i < params.tasks.length; i++) {
					const t = params.tasks[i];
					const resolved = resolvePayload(t.agent, t.task, t.workerPackage, `Parallel task ${i + 1}`);
					if ("error" in resolved) {
						return {
							content: [{ type: "text", text: resolved.error }],
							details: makeDetails("parallel")([]),
						};
					}
					parallelTasks.push(resolved.task);
				}

				// Detect overlapping worker files
				const overlapErr = detectFileOverlaps(
					params.tasks.map((t) => ({ agent: t.agent, workerPackage: t.workerPackage as WorkerPackage | undefined, cwd: t.cwd })),
					ctx.cwd,
				);
				if (overlapErr) {
					return {
						content: [{ type: "text", text: overlapErr }],
						details: makeDetails("parallel")([]),
					};
				}

				// Track all results for streaming updates
				const allResults: SingleResult[] = new Array(params.tasks.length);

				// Initialize placeholder results
				for (let i = 0; i < params.tasks.length; i++) {
					allResults[i] = {
						agent: params.tasks[i].agent,
						agentSource: "unknown",
						task: parallelTasks[i],
						exitCode: -1, // -1 = still running
						messages: [],
						stderr: "",
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
					};
				}

				const emitParallelUpdate = () => {
					if (onUpdate) {
						const running = allResults.filter((r) => r.exitCode === -1).length;
						const done = allResults.filter((r) => r.exitCode !== -1).length;
						onUpdate({
							content: [
								{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` },
							],
							details: makeDetails("parallel")([...allResults]),
						});
					}
				};

				const results = await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, async (t, index) => {
					const result = await runSingleAgent(
						ctx.cwd,
						agents,
						t.agent,
						parallelTasks[index],
						t.cwd,
						undefined,
						signal,
						// Per-task update callback
						(partial) => {
							if (partial.details?.results[0]) {
								allResults[index] = partial.details.results[0];
								emitParallelUpdate();
							}
						},
						makeDetails("parallel"),
					);
					allResults[index] = result;
					emitParallelUpdate();
					return result;
				});

				const errorCount = results.filter((r) => isSubagentError(r)).length;
				const successCount = results.filter((r) => !isSubagentError(r)).length;
				const failureSummary =
					errorCount > 0
						? results
								.filter((r) => isSubagentError(r))
								.map((r) => {
									const reason = r.stopReason || (r.exitCode !== 0 ? `exit ${r.exitCode}` : "unknown");
									return `  [${r.agent}] ${reason}${r.errorMessage ? `: ${r.errorMessage}` : ""}`;
								})
								.join("\n")
						: "";
				const summaries = results.map((r) => {
					const output = getFinalOutput(r.messages);
					const preview = output.slice(0, 100) + (output.length > 100 ? "..." : "");
					const status = isSubagentError(r) ? "failed" : "completed";
					return `[${r.agent}] ${status}: ${preview || "(no output)"}`;
				});
				const header = errorCount > 0
					? `Parallel: ${errorCount}/${results.length} failed${failureSummary ? `\n${failureSummary}` : ""}\n\n${summaries.join("\n\n")}`
					: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`;
				return {
					content: [{ type: "text", text: header }],
					details: makeDetails("parallel")(results),
					isError: errorCount > 0 ? true : undefined,
				};
			}

			// ── Single mode ─────────────────────────────────────────────────

			if (params.agent) {
				const resolved = resolvePayload(params.agent, params.task, params.workerPackage, "Single");
				if ("error" in resolved) {
					return {
						content: [{ type: "text", text: resolved.error }],
						details: makeDetails("single")([]),
					};
				}

				const result = await runSingleAgent(
					ctx.cwd,
					agents,
					params.agent,
					resolved.task,
					params.cwd,
					undefined,
					signal,
					onUpdate,
					makeDetails("single"),
					params.limits,
					params.noExtensions,
				);
				if (isSubagentError(result)) {
					const errorMsg =
						result.diagnostic || result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
					const label = result.hitLimit
						? `Agent ${result.hitLimit}${result.errorMessage ? `: ${result.errorMessage}` : ""}`
						: `Agent ${result.stopReason || "failed"}: ${errorMsg}`;
					return {
						content: [{ type: "text", text: label }],
						details: makeDetails("single")([result]),
						isError: true,
					};
				}
				return {
					content: [{ type: "text", text: getFinalOutput(result.messages) || "(no output)" }],
					details: makeDetails("single")([result]),
				};
			}

			const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
			return {
				content: [{ type: "text", text: `Invalid parameters. Available agents: ${available}` }],
				details: makeDetails("single")([]),
			};
		},

		renderCall(args, theme, _context) {
			const scope: AgentScope = args.agentScope ?? "user";
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `chain (${args.chain.length} steps)`) +
					theme.fg("muted", ` [${scope}]`);
				for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
					const step = args.chain[i];
					const isWorker = isWorkerAgent(step.agent);
					const preview = isWorker
						? safeWorkerPackagePreview(step.workerPackage)
						: step.task
							? (step.task.replace(/\{previous\}/g, "").trim().slice(0, 40) + (step.task.replace(/\{previous\}/g, "").trim().length > 40 ? "..." : ""))
							: "...";
					text +=
						"\n  " +
						theme.fg("muted", `${i + 1}.`) +
						" " +
						theme.fg("accent", step.agent) +
						theme.fg("dim", ` ${preview}`);
				}
				if (args.chain.length > 3) text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			if (args.tasks && args.tasks.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `parallel (${args.tasks.length} tasks)`) +
					theme.fg("muted", ` [${scope}]`);
				for (const t of args.tasks.slice(0, 3)) {
					const isWorker = isWorkerAgent(t.agent);
					const preview = isWorker
						? safeWorkerPackagePreview(t.workerPackage)
						: t.task
							? (t.task.length > 40 ? `${t.task.slice(0, 40)}...` : t.task)
							: "...";
					text += `\n  ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${preview}`)}`;
				}
				if (args.tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			const agentName = args.agent || "...";
			const isWorker = isWorkerAgent(agentName);
			const preview = isWorker
				? safeWorkerPackagePreview(args.workerPackage)
				: args.task
					? (args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task)
					: "...";
			let text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", agentName) +
				theme.fg("muted", ` [${scope}]`);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as SubagentDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();

			const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
				const toShow = limit ? items.slice(-limit) : items;
				const skipped = limit && items.length > limit ? items.length - limit : 0;
				let text = "";
				if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
				for (const item of toShow) {
					if (item.type === "text") {
						const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
						text += `${theme.fg("toolOutput", preview)}\n`;
					} else {
						text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
					}
				}
				return text.trimEnd();
			};

			if (details.mode === "single" && details.results.length === 1) {
				const r = details.results[0];
				const isError = isSubagentError(r);
				const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
				const displayItems = getDisplayItems(r.messages);
				const finalOutput = getFinalOutput(r.messages);

				if (expanded) {
					const container = new Container();
					const limitLabel = formatLimitLabel(r.hitLimit, r.errorMessage, r.stopReason);
					let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
					if (isError && r.stopReason && r.stopReason !== "error") header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
					if (limitLabel) header += ` ${theme.fg("warning", limitLabel)}`;
					if (r.lifecyclePhase) header += ` ${theme.fg("dim", `[${r.lifecyclePhase}]`)}`;
					container.addChild(new Text(header, 0, 0));
					if (isError && r.errorMessage)
						container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
					if (r.diagnostic)
						container.addChild(new Text(theme.fg("warning", r.diagnostic), 0, 0));
					if (isError && r.stderr.trim() && !r.diagnostic)
						container.addChild(new Text(theme.fg("error", `Stderr: ${r.stderr.trim()}`), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
					container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
					if (displayItems.length === 0 && !finalOutput) {
						container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
					} else {
						for (const item of displayItems) {
							if (item.type === "toolCall")
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}
					}
					const usageStr = formatUsageStats(r.usage, r.model);
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
					}
					return container;
				}

				let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
				const limitLabel = formatLimitLabel(r.hitLimit, r.errorMessage, r.stopReason);
				if (isError && r.stopReason && r.stopReason !== "error") text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
				if (limitLabel) text += ` ${theme.fg("warning", limitLabel)}`;
				if (isError && r.errorMessage) text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
				else if (r.diagnostic) text += `\n${theme.fg("warning", r.diagnostic)}`;
				else if (isError && r.stderr.trim()) text += `\n${theme.fg("error", `Stderr: ${r.stderr.trim()}`)}`;
				else if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
				else {
					text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
					if (displayItems.length > COLLAPSED_ITEM_COUNT) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				}
				const usageStr = formatUsageStats(r.usage, r.model);
				if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
				return new Text(text, 0, 0);
			}

			const aggregateUsage = (results: SingleResult[]) => {
				const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
				for (const r of results) {
					total.input += r.usage.input;
					total.output += r.usage.output;
					total.cacheRead += r.usage.cacheRead;
					total.cacheWrite += r.usage.cacheWrite;
					total.cost += r.usage.cost;
					total.turns += r.usage.turns;
				}
				return total;
			};

			if (details.mode === "chain") {
				const successCount = details.results.filter((r) => r.exitCode === 0).length;
				const icon = successCount === details.results.length ? theme.fg("success", "✓") : theme.fg("error", "✗");

				if (expanded) {
					const container = new Container();
					container.addChild(
						new Text(
							icon +
								" " +
								theme.fg("toolTitle", theme.bold("chain ")) +
								theme.fg("accent", `${successCount}/${details.results.length} steps`),
							0,
							0,
						),
					);

					for (const r of details.results) {
						const rIcon = isSubagentError(r) ? theme.fg("error", "✗") : theme.fg("success", "✓");
						const displayItems = getDisplayItems(r.messages);
						const finalOutput = getFinalOutput(r.messages);

						container.addChild(new Spacer(1));
						container.addChild(
							new Text(
								`${theme.fg("muted", `─── Step ${r.step}: `) + theme.fg("accent", r.agent)} ${rIcon}`,
								0,
								0,
							),
						);
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));
						// Show hitLimit / diagnostic for failed steps
						if (r.hitLimit) {
							container.addChild(
								new Text(theme.fg("warning", `Limit: ${r.hitLimit}`), 0, 0),
							);
						}
						if (r.diagnostic) {
							container.addChild(new Text(theme.fg("warning", r.diagnostic), 0, 0));
						}

						// Show tool calls
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
							}
						}

						// Show final output as markdown
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}

						const stepUsage = formatUsageStats(r.usage, r.model);
						if (stepUsage) container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
					}

					const usageStr = formatUsageStats(aggregateUsage(details.results));
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0));
					}
					return container;
				}

				// Collapsed view
				let text =
					icon +
					" " +
					theme.fg("toolTitle", theme.bold("chain ")) +
					theme.fg("accent", `${successCount}/${details.results.length} steps`);
				for (const r of details.results) {
					const rIcon = isSubagentError(r) ? theme.fg("error", "✗") : theme.fg("success", "✓");
					const displayItems = getDisplayItems(r.messages);
					text += `\n\n${theme.fg("muted", `─── Step ${r.step}: `)}${theme.fg("accent", r.agent)} ${rIcon}`;
					if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
				}
				const usageStr = formatUsageStats(aggregateUsage(details.results));
				if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			if (details.mode === "parallel") {
				const running = details.results.filter((r) => r.exitCode === -1).length;
				const failCount = details.results.filter((r) => isSubagentError(r)).length;
				const successCount = details.results.filter((r) => r.exitCode !== -1 && !isSubagentError(r)).length;
				const isRunning = running > 0;
				const icon = isRunning
					? theme.fg("warning", "⏳")
					: failCount > 0
						? theme.fg("error", "✗")
						: theme.fg("success", "✓");
				const status = isRunning
					? `${successCount + failCount}/${details.results.length} done, ${running} running`
					: `${successCount}/${details.results.length} tasks`;

				if (expanded && !isRunning) {
					const container = new Container();
					container.addChild(
						new Text(
							`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`,
							0,
							0,
						),
					);

					for (const r of details.results) {
						const rIcon = isSubagentError(r) ? theme.fg("error", "✗") : theme.fg("success", "✓");
						const displayItems = getDisplayItems(r.messages);
						const finalOutput = getFinalOutput(r.messages);

						container.addChild(new Spacer(1));
						container.addChild(
							new Text(`${theme.fg("muted", "─── ") + theme.fg("accent", r.agent)} ${rIcon}`, 0, 0),
						);
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));
						// Show hitLimit / diagnostic for failed steps
						if (r.hitLimit) {
							container.addChild(
								new Text(theme.fg("warning", `Limit: ${r.hitLimit}`), 0, 0),
							);
						}
						if (r.diagnostic) {
							container.addChild(new Text(theme.fg("warning", r.diagnostic), 0, 0));
						}

						// Show tool calls
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
							}
						}

						// Show final output as markdown
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}

						const taskUsage = formatUsageStats(r.usage, r.model);
						if (taskUsage) container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
					}

					const usageStr = formatUsageStats(aggregateUsage(details.results));
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0));
					}
					return container;
				}

				// Collapsed view (or still running)
				let text = `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
				for (const r of details.results) {
					const rIcon =
						r.exitCode === -1
							? theme.fg("warning", "⏳")
							: isSubagentError(r)
								? theme.fg("error", "✗")
								: theme.fg("success", "✓");
					const displayItems = getDisplayItems(r.messages);
					text += `\n\n${theme.fg("muted", "─── ")}${theme.fg("accent", r.agent)} ${rIcon}`;
					if (displayItems.length === 0)
						text += `\n${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
				}
				if (!isRunning) {
					const usageStr = formatUsageStats(aggregateUsage(details.results));
					if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				}
				if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
		},
	});
}
