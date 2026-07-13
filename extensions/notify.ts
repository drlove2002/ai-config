import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TITLE = "Pi Agent";
const READY = "Ready for input";
const ACTION_NEEDED = "Action needed";
const FALLBACK = "Pi finished and is waiting for you.";
const MAX_BODY_LENGTH = 180;

type Message = {
	role?: string;
	content?: unknown;
	stopReason?: string;
};

function appleString(value: string): string {
	return JSON.stringify(value);
}

function plainText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") {
					return part;
				}

				if (part && typeof part === "object" && "text" in part) {
					const text = (part as { text?: unknown }).text;
					return typeof text === "string" ? text : "";
				}

				return "";
			})
			.join(" ");
	}

	return "";
}

function compact(value: string): string {
	return value
		.replace(/<voice>[\s\S]*?<\/voice>/g, "")
		.replace(/```[\s\S]*?```/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function truncate(value: string): string {
	if (value.length <= MAX_BODY_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_BODY_LENGTH - 1).trim()}…`;
}

function lastAssistant(messages: Message[] = []): Message | undefined {
	return messages.filter((message) => message.role === "assistant").at(-1);
}

function description(message: Message | undefined): string {
	const body = truncate(compact(plainText(message?.content)));

	return body || FALLBACK;
}

function notify(title: string, subtitle: string, body: string): void {
	if (process.platform !== "darwin") {
		return;
	}

	const { execFile } = require("node:child_process");
	const script = [
		"display notification",
		appleString(body),
		"with title",
		appleString(title),
		"subtitle",
		appleString(subtitle),
		"sound name",
		appleString("Glass"),
	].join(" ");

	execFile("osascript", ["-e", script], { timeout: 5000 }, () => {});
}

function shouldNotify(ctx: { mode: string }): boolean {
	return ctx.mode === "tui" && process.env.PI_SUBAGENT !== "1";
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_execution_start", async (event, ctx) => {
		if (!shouldNotify(ctx) || event.toolName !== "ask_user_decisions") {
			return;
		}

		notify(TITLE, ACTION_NEEDED, "Pi needs your input to continue.");
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!shouldNotify(ctx)) {
			return;
		}

		const message = lastAssistant(event.messages);

		if (message?.stopReason === "aborted") {
			return;
		}

		notify(TITLE, READY, description(message));
	});
}
