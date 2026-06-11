/**
 * Git Guard Extension
 *
 * Hard-blocks destructive git commands that can wipe work:
 *   git reset --hard  — destroys uncommitted changes
 *   git reset HEAD     — wipes staging area
 *   git reset          — same as HEAD
 *
 * No confirmation. Just blocked.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const blocked = [
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+reset\s+HEAD\b/,
  /\bgit\s+reset\s*$/,
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (!isToolCallEventType("bash", event)) return;

    const cmd = event.input.command as string;
    if (blocked.some((p) => p.test(cmd))) {
      return { block: true, reason: "git reset blocked: use git restore for files, git reset --soft for commits" };
    }
  });
}
