/**
 * Unified status bar — renders token stats, model, and extension indicators
 * in a single line using setFooter. Other extensions register status with
 * registerStatus(key, text) and it gets rendered inline.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

interface StatusEntry {
  text: string;
  priority: number;
}

const entries = new Map<string, StatusEntry>();

export function registerStatus(key: string, text: string, priority = 0) {
  entries.set(key, { text, priority });
  // Request re-render if TUI available
  const tui = (globalThis as any).__statusBarTui;
  if (tui) tui.requestRender();
}

// Expose globally so other extensions can call without imports
(globalThis as any).__statusBarRegister = registerStatus;
(globalThis as any).__statusBarUnregister = unregisterStatus;

export function unregisterStatus(key: string) {
  entries.delete(key);
}

export default function (pi: ExtensionAPI) {
  let active = false;

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI || active) return;
    active = true;

    ctx.ui.setFooter((tui, theme, footerData) => {
      (globalThis as any).__statusBarTui = tui;
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: () => {
          unsub();
          active = false;
        },
        invalidate() {},
        render(width: number): string[] {
          // Token stats (from existing logic)
          let input = 0, output = 0, cost = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              input += m.usage.input;
              output += m.usage.output;
              cost += m.usage.cost.total;
            }
          }

          const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);
          const dim = (s: string) => theme.fg("dim", s);
          const muted = (s: string) => theme.fg("muted", s);

          // Left: token stats
          const left = dim(`↑${fmt(input)} ↓${fmt(output)} $${cost.toFixed(3)}`);

          // Right: model name
          const modelName = `${ctx.model?.provider || "?"}/${ctx.model?.id || "?"}`;
          let right = dim(modelName);

          // Extension statuses (sorted by priority desc)
          if (entries.size > 0) {
            const sorted = [...entries.values()].sort((a, b) => b.priority - a.priority);
            const statuses = sorted.map((e) => e.text).join(muted(" · "));
            right = dim(modelName) + muted(" · ") + statuses;
          }

          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });

  // Fallback: clear footer on shutdown
  pi.on("session_shutdown", async (_event, ctx) => {
    if (active) {
      ctx.ui.setFooter(undefined);
      active = false;
      entries.clear();
    }
  });
}
