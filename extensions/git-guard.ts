/**
 * Git Guard Extension
 *
 * Hard-blocks ALL destructive git reset commands:
 *   git reset --hard / --soft / --mixed
 *   git reset HEAD
 *   git reset (bare)
 *   Any of the above with -C <path> flags
 *
 * No confirmation. Just blocked.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

// Match git reset in any destructive form, with optional -C <path> flags
// Pattern: git [(-C <path>)*] reset [--hard|--soft|--mixed|HEAD|$]
const GIT_PREFIX = /\bgit(\s+-C\s+\S+)*\s+/;

const blocked = [
  /\breset\s+--hard\b/,
  /\breset\s+--soft\b/,
  /\breset\s+--mixed\b/,
  /\breset\s+HEAD\b/,
  /\breset\s*$/,
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (!isToolCallEventType("bash", event)) return;

    const cmd = event.input.command as string;
    if (GIT_PREFIX.test(cmd) && blocked.some((p) => p.test(cmd))) {
      return { block: true, reason: "git reset blocked: destructive commands are prohibited. Use git restore for file changes." };
    }
  });
}
