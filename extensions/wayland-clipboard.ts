import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";

function copyViaWlCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("wl-copy", [], { stdio: ["pipe", "ignore", "ignore"] });
    proc.stdin.on("error", () => {});
    proc.stdin.write(text);
    proc.stdin.end();
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wl-copy exited with code ${code}`));
    });
    proc.unref();
  });
}

function getLastAssistantText(entries: any[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;
    const content = Array.isArray(msg.content) ? msg.content : [];
    const textParts = content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text);
    if (textParts.length > 0) return textParts.join("\n");
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("cp", {
    description: "Copy last agent message to clipboard (Wayland-native via wl-copy)",
    handler: async (_args, ctx) => {
      const entries = ctx.sessionManager.getEntries();
      const text = getLastAssistantText(entries);

      if (!text) {
        ctx.ui.notify("No agent messages to copy yet.", "error");
        return;
      }

      try {
        await copyViaWlCopy(text);
        ctx.ui.notify("Copied last agent message to clipboard", "info");
      } catch (error) {
        ctx.ui.notify(
          `Failed to copy: ${error instanceof Error ? error.message : String(error)}`,
          "error"
        );
      }
    },
  });
}
