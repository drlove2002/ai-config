import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeSync, openSync } from "node:fs";

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

// ── Safe OSC writer ──
// Terminal emulators (kitty, tmux, etc.) read control sequences from the
// controlling terminal, not from a redirected stdout. Writing OSC escapes
// directly to /dev/tty makes notifications work even when stdout is piped
// (e.g. `pi | tee log`). We fall back to fd 1 only if /dev/tty is unavailable.
// `process.stdout.write` is intentionally NOT used for OSC output.
let ttyFd: number | null = null;
try {
	ttyFd = openSync("/dev/tty", "w");
} catch {
	ttyFd = null;
}

function writeOSC(data: string): void {
	const buf = Buffer.from(data, "utf8");

	if (ttyFd !== null) {
		try {
			writeSync(ttyFd, buf);
			return;
		} catch {
			// tty became unavailable mid-session; fall through to fd 1
		}
	}

	try {
		writeSync(1, buf);
	} catch {
		// last-resort write failed; give up silently
	}
}

// ── tmux passthrough ──
// When running inside tmux, control sequences written to /dev/tty reach tmux,
// not the underlying terminal, so kitty OSC 99 / OSC 777 are swallowed unless
// wrapped in tmux's DCS passthrough. The wrapping form is:
//   ESC P tmux ; <data-with-every-ESC-doubled> ESC \
// Any ESC (0x1b) inside <data> must be doubled (ESC ESC) so tmux treats it as
// payload instead of the end of the passthrough sequence. The inner OSC's own
// ST (ESC \) is therefore also doubled.
function tmuxPassthrough(seq: string): string {
	const doubled = seq.replace(/\x1b/g, "\x1b\x1b");
	return `\x1bPtmux;${doubled}\x1b\\`;
}

// Route an OSC/control sequence to the terminal, wrapping it in tmux
// passthrough when running inside tmux. Outside tmux the raw sequence is used.
function emitOSC(seq: string): void {
	if (process.env.TMUX) {
		writeOSC(tmuxPassthrough(seq));
		return;
	}

	writeOSC(seq);
}

// Whether /dev/tty is currently writable. Used by /notify-test diagnostics.
function ttyAvailable(): boolean {
	if (ttyFd === null) {
		return false;
	}

	try {
		writeSync(ttyFd, Buffer.alloc(0));
		return true;
	} catch {
		return false;
	}
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

// Combine subtitle + body into one readable line for protocols that only
// take a single text payload (OSC 777, Windows toast).
function combine(subtitle: string, body: string): string {
	const sub = subtitle.trim();
	const b = body.trim();

	if (!sub) {
		return b;
	}

	if (!b) {
		return sub;
	}

	return `${sub}: ${b}`;
}

// Kitty OSC 99 sends payloads as plaintext; escape backslash and semicolon
// so they don't break the control sequence.
function kittyPayload(value: string): string {
	return value.replace(/[\x00-\x1f\x7f]/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;");
}

function notifyKitty(title: string, subtitle: string, body: string): void {
	const st = "\x1b\\";
	const message = combine(subtitle, body);

	// Chunked OSC 99: title first (d=0 = more chunks follow), then body.
	// a=focus makes notification clicks focus the originating kitty window.
	emitOSC(`\x1b]99;i=1:d=0:a=focus:s=aW5mbw==:p=title;${kittyPayload(title)}${st}`);
	emitOSC(`\x1b]99;i=1:p=body;${kittyPayload(message)}${st}`);
}

function windowsToastScript(title: string, body: string): string {
	const type = "Windows.UI.Notifications";
	const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
	const template = `[${type}.ToastTemplateType]::ToastText01`;
	const toast = `[${type}.ToastNotification]::new($xml)`;
	return [
		`${mgr} > $null`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
		`$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body.replace(/'/g, "''")}')) > $null`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier('${title.replace(/'/g, "''")}').Show(${toast})`,
	].join("; ");
}

function notifyWindows(title: string, subtitle: string, body: string): void {
	const { execFile } = require("child_process");
	execFile("powershell.exe", [
		"-NoProfile",
		"-Command",
		windowsToastScript(title, combine(subtitle, body)),
	]);
}

function notifyOSC777(title: string, subtitle: string, body: string): void {
	// OSC 777 splits on ';', so keep ';' out of the payload.
	const clean = (value: string) => value.replace(/;/g, ":").replace(/[\x07\x1b]/g, "");
	emitOSC(`\x1b]777;notify;${clean(title)};${clean(combine(subtitle, body))}\x07`);
}

function notify(title: string, subtitle: string, body: string): void {
	if (process.env.KITTY_WINDOW_ID) {
		notifyKitty(title, subtitle, body);
	} else if (process.env.WT_SESSION) {
		notifyWindows(title, subtitle, body);
	} else {
		notifyOSC777(title, subtitle, body);
	}
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

// Exported for testing/building without affecting runtime behavior.
export {
	writeOSC,
	emitOSC,
	tmuxPassthrough,
	ttyAvailable,
	notifyKitty,
	notifyOSC777,
	notifyWindows,
	notify,
	shouldNotify,
	TITLE,
	READY,
	ACTION_NEEDED,
};
