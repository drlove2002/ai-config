/**
 * Tests for runner-events.ts — provider-failure classification,
 * activity detection, and diagnostic summary building.
 *
 * Run with: npx tsx --test runner-events.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { classifyLine, isActivityEvent, buildDiagnosticSummary, stderrSuggestsRateLimit } from "./runner-events.js";

describe("classifyLine", () => {
	// ── Non-terminal events ────────────────────────────────────────
	it("returns null for empty lines", () => {
		assert.strictEqual(classifyLine(""), null);
		assert.strictEqual(classifyLine("   "), null);
	});

	it("returns null for unparseable lines", () => {
		assert.strictEqual(classifyLine("not json"), null);
		assert.strictEqual(classifyLine("{broken"), null);
	});

	it("returns null for unrelated events", () => {
		assert.strictEqual(classifyLine('{"type":"agent_start"}'), null);
		assert.strictEqual(classifyLine('{"type":"turn_start"}'), null);
		assert.strictEqual(classifyLine('{"type":"message_start"}'), null);
		assert.strictEqual(classifyLine('{"type":"tool_execution_start"}'), null);
		assert.strictEqual(classifyLine('{"type":"session","id":"x"}'), null);
	});

	// ── agent_end with willRetry ───────────────────────────────────
	it("returns null when agent_end has willRetry=true", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: true,
			messages: [{ role: "assistant", stopReason: "error", errorMessage: "timeout" }],
		});
		assert.strictEqual(classifyLine(line), null);
	});

	it("returns ProviderFailure when agent_end has willRetry=false after error", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [{ role: "assistant", stopReason: "error", errorMessage: "rate limit exceeded" }],
		});
		const result = classifyLine(line);
		assert.ok(result !== null);
		assert.ok(result!.reason.includes("rate limit exceeded"));
	});

	it("returns null when agent_end has missing willRetry field (conservative)", () => {
		const line = JSON.stringify({
			type: "agent_end",
			messages: [{ role: "assistant", stopReason: "error", errorMessage: "something" }],
		});
		assert.strictEqual(classifyLine(line), null);
	});

	it("returns null when agent_end assistant does NOT have stopReason:error", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [{ role: "assistant", stopReason: "end_turn" }],
		});
		assert.strictEqual(classifyLine(line), null);
	});

	it("handles agent_end with no assistant messages", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [],
		});
		assert.strictEqual(classifyLine(line), null);
	});

	it("uses errorMessage from the last assistant message", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [
				{ role: "user", content: "hi" },
				{ role: "assistant", stopReason: "error", errorMessage: "Provider returned 429" },
			],
		});
		const result = classifyLine(line);
		assert.ok(result !== null);
		assert.ok(result!.reason.includes("429"));
	});

	it("falls back to generic message when errorMessage is missing", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [{ role: "assistant", stopReason: "error" }],
		});
		const result = classifyLine(line);
		assert.ok(result !== null);
		assert.ok(result!.reason.includes("model error"));
	});

	// ── auto_retry_end ─────────────────────────────────────────────
	it("returns ProviderFailure when auto_retry_end has success=false", () => {
		const line = JSON.stringify({
			type: "auto_retry_end",
			success: false,
			attempt: 3,
			finalError: "All retries failed",
		});
		const result = classifyLine(line);
		assert.ok(result !== null);
		assert.ok(result!.reason.includes("All retries failed"));
	});

	it("falls back to generic message when auto_retry_end success=false without finalError", () => {
		const line = JSON.stringify({
			type: "auto_retry_end",
			success: false,
			attempt: 3,
		});
		const result = classifyLine(line);
		assert.ok(result !== null);
		assert.ok(result!.reason.includes("retries exhausted"));
	});

	it("returns null for auto_retry_end with success=true", () => {
		const line = JSON.stringify({
			type: "auto_retry_end",
			success: true,
			attempt: 2,
		});
		assert.strictEqual(classifyLine(line), null);
	});

	it("returns null for auto_retry_end when success field is absent", () => {
		// Missing field — non-terminal (conservative)
		const line = JSON.stringify({
			type: "auto_retry_end",
			attempt: 1,
		});
		assert.strictEqual(classifyLine(line), null);
	});

	// ── auto_retry_start ──────────────────────────────────────────
	it("returns null for auto_retry_start (will never reach runner after classifier)", () => {
		const line = JSON.stringify({
			type: "auto_retry_start",
			attempt: 1,
			maxAttempts: 3,
			delayMs: 1000,
			errorMessage: "timeout",
		});
		assert.strictEqual(classifyLine(line), null);
	});

	// ── agent_end without stopReason:error ─────────────────────────
	it("returns null for normal agent_end without error", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [{ role: "assistant", stopReason: "end_turn" }],
		});
		assert.strictEqual(classifyLine(line), null);
	});
});

describe("stderrSuggestsRateLimit", () => {
	it("detects 429 status code", () => {
		assert.strictEqual(stderrSuggestsRateLimit("HTTP 429 Too Many Requests"), true);
	});

	it("detects rate limit message", () => {
		assert.strictEqual(stderrSuggestsRateLimit("rate limit exceeded"), true);
		assert.strictEqual(stderrSuggestsRateLimit("RATE_LIMIT_ERROR"), true);
	});

	it("returns false for unrelated stderr", () => {
		assert.strictEqual(stderrSuggestsRateLimit("some warning"), false);
		assert.strictEqual(stderrSuggestsRateLimit(""), false);
	});
});

describe("immediate-failure policy", () => {
	it("auto_retry_end success:false is terminal — runner kills immediately", () => {
		const line = JSON.stringify({
			type: "auto_retry_end",
			success: false,
			attempt: 5,
			finalError: "all provider attempts exhausted",
		});
		const result = classifyLine(line);
		assert.ok(result !== null, "auto_retry_end success:false must produce ProviderFailure");
		assert.ok(result!.reason.includes("provider"), "Reason should describe provider failure");
	});

	it("agent_end willRetry:false is terminal — runner kills immediately", () => {
		const line = JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [{ role: "assistant", stopReason: "error", errorMessage: "Provider timeout" }],
		});
		const result = classifyLine(line);
		assert.ok(result !== null, "agent_end willRetry:false must produce ProviderFailure");
		assert.ok(result!.reason.includes("Provider timeout"));
	});

	it("agent_start is never reached after terminal failure — child already killed", () => {
		assert.strictEqual(classifyLine(JSON.stringify({ type: "agent_start" })), null);
	});

	it("compaction events are non-terminal but unreachable after terminal", () => {
		assert.strictEqual(classifyLine(JSON.stringify({ type: "compaction_start" })), null);
		assert.strictEqual(classifyLine(JSON.stringify({ type: "compaction_end" })), null);
	});

	it("agent_settled is non-terminal — terminal failures are handled before settlement", () => {
		assert.strictEqual(classifyLine(JSON.stringify({ type: "agent_settled" })), null);
	});

	it("stopReason:error without terminal failure → still a failure", () => {
		const line = JSON.stringify({
			type: "message_end",
			message: { role: "assistant", stopReason: "error", errorMessage: "model error" },
		});
		assert.strictEqual(classifyLine(line), null,
			"message_end stopReason:error is not a ProviderFailure — runner handles it via stopReason field");
	});

	it("parallel/chain failure: exitCode 0 + stopReason:error = failure", () => {
		const terminal = classifyLine(JSON.stringify({
			type: "agent_end",
			willRetry: false,
			messages: [{ role: "assistant", stopReason: "error", errorMessage: "x" }],
		}));
		assert.ok(terminal !== null, "Classifier must return ProviderFailure for terminal agent_end");
	});

	it("hitLimit absent when provider failure is the cause", () => {
		const failure = classifyLine(JSON.stringify({
			type: "auto_retry_end",
			success: false,
			finalError: "retries exhausted",
		}));
		assert.ok(failure !== null);
		assert.ok(failure.reason.includes("retries exhausted"));
	});

	it("retry-related events are never classified as failures", () => {
		assert.strictEqual(classifyLine(JSON.stringify({ type: "agent_end", willRetry: true,
			messages: [{ role: "assistant", stopReason: "error" }] })), null);
		assert.strictEqual(classifyLine(JSON.stringify({ type: "auto_retry_start" })), null);
	});
});

// ── Inactivity / activity detection ────────────────────────────────
describe("isActivityEvent", () => {
	it("returns false for empty/whitespace lines", () => {
		assert.strictEqual(isActivityEvent(""), false);
		assert.strictEqual(isActivityEvent("   "), false);
		assert.strictEqual(isActivityEvent("\n"), false);
	});

	it("returns false for unparseable JSON", () => {
		assert.strictEqual(isActivityEvent("not json"), false);
		assert.strictEqual(isActivityEvent("{broken"), false);
		assert.strictEqual(isActivityEvent("null"), false);
	});

	it("returns false for the session header (excluded)", () => {
		assert.strictEqual(isActivityEvent('{"type":"session","id":"abc"}'), false);
	});

	it("returns true for agent_start", () => {
		assert.strictEqual(isActivityEvent('{"type":"agent_start"}'), true);
	});

	it("returns true for turn_start", () => {
		assert.strictEqual(isActivityEvent('{"type":"turn_start","turn":1}'), true);
	});

	it("returns true for message_start, message_update, message_end", () => {
		assert.strictEqual(isActivityEvent('{"type":"message_start"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"message_update"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}'), true);
	});

	it("returns true for tool_execution_start, tool_execution_update, tool_execution_end", () => {
		assert.strictEqual(isActivityEvent('{"type":"tool_execution_start","name":"bash"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"tool_execution_update"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"tool_execution_end"}'), true);
	});

	it("returns true for compaction_start, compaction_end", () => {
		assert.strictEqual(isActivityEvent('{"type":"compaction_start"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"compaction_end"}'), true);
	});

	it("returns true for auto_retry_start, auto_retry_end", () => {
		assert.strictEqual(isActivityEvent('{"type":"auto_retry_start"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"auto_retry_end","success":true}'), true);
	});

	it("returns true for agent_end, agent_settled", () => {
		assert.strictEqual(isActivityEvent('{"type":"agent_end"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"agent_settled"}'), true);
	});

	it("returns true for unknown event types (conservative)", () => {
		assert.strictEqual(isActivityEvent('{"type":"some_future_event"}'), true);
		assert.strictEqual(isActivityEvent('{"type":"unknown"}'), true);
	});

	it("returns false for JSON without a type field", () => {
		assert.strictEqual(isActivityEvent('{"foo":"bar"}'), false);
	});

	it("activity events keep alive; session and malformed do not", () => {
		// All lifecycle events (including unknown types) must reset inactivity.
		const activeEvents = [
			'{"type":"agent_start"}',
			'{"type":"turn_start"}',
			'{"type":"message_start"}',
			'{"type":"message_update"}',
			'{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"x"}]}}',
			'{"type":"tool_execution_start","name":"read"}',
			'{"type":"tool_execution_update"}',
			'{"type":"tool_execution_end"}',
			'{"type":"compaction_start"}',
			'{"type":"compaction_end"}',
			'{"type":"auto_retry_start"}',
			'{"type":"auto_retry_end","success":false}',
			'{"type":"agent_end"}',
			'{"type":"agent_settled"}',
			'{"type":"future_event_xyz"}',
		];
		for (const event of activeEvents) {
			assert.strictEqual(isActivityEvent(event), true, `Should be activity: ${event.slice(0, 50)}`);
		}

		const notActive = [
			"",
			"   ",
			"not json",
			"{broken",
			'{"type":"session","id":"x"}',
			'{"foo":"bar"}',
		];
		for (const event of notActive) {
			assert.strictEqual(isActivityEvent(event), false, `Should NOT be activity: ${event}`);
		}
	});
});

// ── Diagnostic summary ─────────────────────────────────────────────
describe("buildDiagnosticSummary", () => {
	it("includes hitLimit when present", () => {
		const summary = buildDiagnosticSummary({
			hitLimit: "wallClock",
			lastActivityAgeMs: 5000,
		});
		assert.ok(summary.includes("Limit: wallClock"));
	});

	it("includes errorMessage when present", () => {
		const summary = buildDiagnosticSummary({
			errorMessage: "rate limit exceeded",
			lastActivityAgeMs: 5000,
		});
		assert.ok(summary.includes("Error: rate limit exceeded"));
	});

	it("includes lifecycle phase (defaults to init)", () => {
		const s1 = buildDiagnosticSummary({ lastActivityAgeMs: 5000 });
		assert.ok(s1.includes("Phase: init"));

		const s2 = buildDiagnosticSummary({
			lifecyclePhase: "thinking",
			lastActivityAgeMs: 5000,
		});
		assert.ok(s2.includes("Phase: thinking"));
	});

	it("reports last activity age in seconds", () => {
		const summary = buildDiagnosticSummary({ lastActivityAgeMs: 12500 });
		assert.ok(summary.includes("Last activity: 13s ago"));
	});

	it("includes latest assistant text (truncated at 300 chars)", () => {
		const short = buildDiagnosticSummary({
			lastActivityAgeMs: 1000,
			latestAssistantText: "Hello world",
		});
		assert.ok(short.includes("Latest output: Hello world"));

		const long = "x".repeat(500);
		const summary = buildDiagnosticSummary({
			lastActivityAgeMs: 1000,
			latestAssistantText: long,
		});
		assert.ok(summary.includes("Latest output: " + "x".repeat(300) + "..."));
	});

	it("includes completed tool calls with count and last 5", () => {
		const summary = buildDiagnosticSummary({
			lastActivityAgeMs: 1000,
			completedToolCalls: ["read", "grep", "find", "bash", "write", "edit", "ls"],
		});
		assert.ok(summary.includes("Tool calls (7):"));
		assert.ok(summary.includes("bash, write, edit, ls"));
		// Should NOT include the first 2 (read, grep) since we only show last 5
		assert.ok(!summary.includes("read, grep,"));
	});

	it("omits tool calls when empty or missing", () => {
		const summary = buildDiagnosticSummary({
			lastActivityAgeMs: 1000,
			completedToolCalls: [],
		});
		assert.ok(!summary.includes("Tool calls"));
	});

	it("includes stderr tail when present", () => {
		const summary = buildDiagnosticSummary({
			lastActivityAgeMs: 1000,
			stderrTail: "some error\nanother error",
		});
		assert.ok(summary.includes("Stderr: some error\nanother error"));
	});

	it("omits stderr tail when absent", () => {
		const summary = buildDiagnosticSummary({
			lastActivityAgeMs: 1000,
		});
		assert.ok(!summary.includes("Stderr:"));
	});

	it("full example: wallClock timeout with evidence", () => {
		const summary = buildDiagnosticSummary({
			hitLimit: "wallClock",
			errorMessage: undefined,
			lifecyclePhase: "thinking",
			lastActivityAgeMs: 900_000, // 15 min
			latestAssistantText: "I'm analyzing the codebase and found several files to modify...",
			completedToolCalls: ["read", "grep", "find", "read", "read", "bash"],
			stderrTail: "",
		});
		assert.ok(summary.includes("Limit: wallClock"));
		assert.ok(summary.includes("Phase: thinking"));
		assert.ok(summary.includes("Last activity: 900s ago"));
		assert.ok(summary.includes("Latest output: I'm analyzing"));
		assert.ok(summary.includes("Tool calls (6): grep, find, read, read, bash"));
		assert.ok(!summary.includes("Stderr:"));
	});

	it("full example: provider error with inactivity", () => {
		const summary = buildDiagnosticSummary({
			hitLimit: "inactivity",
			errorMessage: "Retries exhausted: provider timeout",
			lifecyclePhase: "retry",
			lastActivityAgeMs: 300_000,
			latestAssistantText: "",
			completedToolCalls: ["read", "grep"],
			stderrTail: "connect ETIMEDOUT",
		});
		assert.ok(summary.includes("Limit: inactivity"));
		assert.ok(summary.includes("Error: Retries exhausted: provider timeout"));
		assert.ok(summary.includes("Phase: retry"));
		assert.ok(summary.includes("Last activity: 300s ago"));
		assert.ok(summary.includes("Tool calls (2): read, grep"));
		assert.ok(summary.includes("Stderr: connect ETIMEDOUT"));
	});
});
