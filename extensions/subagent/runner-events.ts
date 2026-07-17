/**
 * runner-events.ts — provider-failure classification for subagent JSON-mode runners.
 *
 * Pure functions with no side effects. Call from the line-by-line JSON parser in
 * the subagent runner to decide whether a provider error is terminal (retries
 * exhausted) or retryable.
 *
 * Compatibility note: these classifiers only depend on fields documented in the
 * official JSON event stream (docs/json.md). The `willRetry` field on `agent_end`
 * and the `auto_retry_start` / `auto_retry_end` events are used exactly as emitted
 * by pi's agent session.  When a field is missing the classifier treats it as
 * non-terminal (conservative default) to avoid killing retryable runs.
 */

/** Classification result for a line processed from the child JSON stream. */
export interface ProviderFailure {
	/** Human-readable reason. */
	reason: string;
	/** The raw event (if parsed from JSON). */
	event?: Record<string, unknown>;
}

/**
 * Classify a single JSON-mode line from the child pi process.
 *
 * Returns a `ProviderFailure` when the line indicates a terminal provider failure
 * (retries exhausted, or explicit non-retryable error).  Returns `null` when the
 * line is not a terminal failure.
 */
export function classifyLine(line: string): ProviderFailure | null {
	if (!line.trim()) return null;

	let event: Record<string, unknown>;
	try {
		event = JSON.parse(line);
	} catch {
		return null;
	}

	const type = event.type as string | undefined;
	if (!type) return null;

	// ── agent_end with terminal stopReason ────────────────────────
	// willRetry === true  → retryable, keep going
	// willRetry === false → terminal
	// willRetry absent    → non-terminal (conservative — may be older pi version)
	if (type === "agent_end") {
		const messages = event.messages as Array<Record<string, unknown>> | undefined;
		const lastAssistant = findLastAssistant(messages ?? []);
		if (lastAssistant && lastAssistant.stopReason === "error") {
			const willRetry = event.willRetry;
			if (willRetry === false) {
				return {
					reason: `Provider error: ${stringOr(lastAssistant.errorMessage, "model error")}`,
					event,
				};
			}
			// willRetry === true or absent — retryable
		}
	}

	// ── auto_retry_end with success: false → terminal ────────────
	// This is the definitive "retries exhausted" signal.
	if (type === "auto_retry_end") {
		const success = event.success;
		if (success === false) {
			const finalError = stringOr(event.finalError, "retries exhausted");
			return {
				reason: `Retries exhausted: ${finalError}`,
				event,
			};
		}
	}

	// ── auto_retry_start → explicitly non-terminal ───────────────
	// The runner itself uses this to reset terminal-tracking state.
	// We return null here because this is not a failure at all.

	return null;
}

/**
 * Returns true when the line is a JSON event that signals the child process
 * is still alive and making progress.  Only the `session` header line and
 * unparseable / blank lines are excluded — everything else (including unknown
 * event types) counts as activity.
 *
 * The runner calls this on every line from the child stdout to decide whether
 * to reset the inactivity timer.
 */
export function isActivityEvent(line: string): boolean {
	if (!line.trim()) return false;
	try {
		const event = JSON.parse(line);
		// Only valid JSON events with a known type field count as activity.
		// session headers are excluded; events without a type field are
		// treated as unrecognized (not activity).
		return typeof event.type === "string" && event.type !== "session";
	} catch {
		return false;
	}
}

/** Structured inputs for {@link buildDiagnosticSummary}. */
export interface DiagnosticInputs {
	/** Which limit was hit, if any. */
	hitLimit?: "wallClock" | "inactivity" | "shutdownGrace";
	/** Error message from the child (provider error, etc.). */
	errorMessage?: string;
	/** Last observed lifecycle phase label. */
	lifecyclePhase?: string;
	/** Milliseconds since the last meaningful activity event. */
	lastActivityAgeMs: number;
	/** Latest assistant text (truncated by caller if needed). */
	latestAssistantText?: string;
	/** Names of completed tool calls, most recent last. */
	completedToolCalls?: string[];
	/** Last N lines of stderr (caller truncates). */
	stderrTail?: string;
}

/**
 * Build a concise, human-readable diagnostic summary from the structured
 * inputs.  Used by the subagent runner when a child times out or hits a
 * terminal error so the main orchestrator has enough evidence to decide
 * whether to decompose, retry, or investigate.
 */
export function buildDiagnosticSummary(inputs: DiagnosticInputs): string {
	const lines: string[] = [];
	if (inputs.hitLimit) lines.push(`Limit: ${inputs.hitLimit}`);
	if (inputs.errorMessage) lines.push(`Error: ${inputs.errorMessage}`);
	lines.push(`Phase: ${inputs.lifecyclePhase ?? "init"}`);
	const ageSec = Math.round(inputs.lastActivityAgeMs / 1000);
	lines.push(`Last activity: ${ageSec}s ago`);
	if (inputs.latestAssistantText) {
		const preview =
			inputs.latestAssistantText.length > 300
				? inputs.latestAssistantText.slice(0, 300) + "..."
				: inputs.latestAssistantText;
		lines.push(`Latest output: ${preview}`);
	}
	if (inputs.completedToolCalls && inputs.completedToolCalls.length > 0) {
		const count = inputs.completedToolCalls.length;
		const recent = inputs.completedToolCalls.slice(-5);
		lines.push(`Tool calls (${count}): ${recent.join(", ")}`);
	}
	if (inputs.stderrTail) lines.push(`Stderr: ${inputs.stderrTail}`);
	return lines.join("\n");
}

/**
 * Format a limit label for display, respecting error precedence.
 *
 * shutdownGrace is suppressed when a concrete error (errorMessage or
 * stopReason==="error") already explains the failure — showing
 * `[limit: shutdownGrace]` would mislead the user about the root cause.
 * wallClock and inactivity limits are always shown.
 */
export function formatLimitLabel(
	hitLimit?: "wallClock" | "inactivity" | "shutdownGrace",
	errorMessage?: string,
	stopReason?: string,
): string {
	if (!hitLimit) return "";
	if (hitLimit === "shutdownGrace" && (errorMessage || stopReason === "error")) {
		return "";
	}
	return ` [limit: ${hitLimit}]`;
}

/**
 * Check whether stderr contains rate-limit diagnostic patterns.
 *
 * This is a diagnostic-only check. The runner must NOT kill the child based on
 * stderr alone — stderr 429 / rate-limit messages may be transient and the JSON
 * stream carries the authoritative retry/terminal signals.
 */
export function stderrSuggestsRateLimit(stderr: string): boolean {
	return /\b429\b/.test(stderr) || /rate.?limit/i.test(stderr);
}

// ── helpers ──────────────────────────────────────────────────────────

function findLastAssistant(
	messages: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") return messages[i];
	}
	return null;
}

function stringOr(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}
