/**
 * Git Guard Extension
 *
 * Hard-blocks destructive git reset commands:
 *   git reset --hard / --mixed
 *   git reset HEAD
 *   git reset (bare)
 *   Any of the above with -C <path> flags
 *
 * Allows git reset --soft for approved local history cleanup.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

// Match git reset in destructive forms, with optional -C <path> flags.
// Pattern: git [(-C <path>)*] reset [--hard|--mixed|HEAD|$]
const GIT_PREFIX = /\bgit(\s+-C\s+\S+)*\s+/;

const blocked = [
  /\breset\s+--hard\b/,
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
