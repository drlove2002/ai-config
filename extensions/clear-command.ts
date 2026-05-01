import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function clearCommandExtension(pi: ExtensionAPI) {
	pi.registerCommand("clear", {
		description: "Permanently clear the current session context (history is deleted forever)",
		handler: async (_args, ctx) => {
			const confirmed = await ctx.ui.confirm(
				"Clear Session",
				"This will permanently delete the current chat history and cannot be undone. Continue?"
			);
			if (!confirmed) {
				ctx.ui.notify("Clear cancelled.", "info");
				return;
			}

			// Delete the session JSONL file from disk
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (sessionFile) {
				try {
					await pi.exec("rm", ["-f", sessionFile]);
				} catch {
					// file doesn't exist, no problem
				}
			}

			// Start a new session to reset in-memory state
			const result = await ctx.newSession();
			if (result.cancelled) {
				ctx.ui.notify("Session clear cancelled.", "warning");
				return;
			}

			ctx.ui.notify("Session cleared permanently.", "success");
		}
	});
}
