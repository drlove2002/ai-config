import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Context loader — runs once per session and preloads everything:
 *  1. Recursive AGENTS.md from the project tree (downward from cwd)
 *  2. All .md guidelines from ~/.config/ai/rules/
 *  3. All .md guidelines from ~/.config/ai/memories/
 *
 * Also registers the search_ai_context tool for on-demand lookups.
 */

const AI_DIR = resolve(homedir(), ".config/ai");

let projectAgentsContent = "";
let globalContextContent = "";

export default function (pi: ExtensionAPI) {
  // ── Discover and cache all context at session start ──────────────────
  pi.on("session_start", async (_event, ctx) => {
    projectAgentsContent = "";
    globalContextContent = "";
    const loaded: string[] = [];

    // ── 1. Recursive AGENTS.md from project tree ───────────────────────
    const findResult = await pi.exec("find", [
      ".",
      "-name", "AGENTS.md",
      "-not", "-path", "*/node_modules/*",
      "-not", "-path", "*/.git/*",
      "-not", "-path", "*/target/*",
      "-not", "-path", "*/.venv/*",
      "-not", "-path", "*/__pycache__/*",
      "-not", "-path", "*/.next/*",
      "-not", "-path", "*/dist/*",
      "-not", "-path", "*/build/*",
      "-type", "f",
    ], {});

    if (findResult.code === 0 && findResult.stdout.trim()) {
      const allPaths = findResult.stdout.trim().split("\n").filter(Boolean);
      // pi already loads AGENTS.md walking up from cwd and ~/.pi/agent/AGENTS.md.
      const filtered = allPaths.filter(
        (p) => !p.startsWith("./.pi/") && p !== "./AGENTS.md",
      );

      if (filtered.length > 0) {
        const parts: string[] = [
          "\n\n## Recursive AGENTS.md Context",
          "The following AGENTS.md files were discovered recursively in the project tree:\n",
        ];
        for (const p of filtered) {
          const cat = await pi.exec("cat", [p], {});
          if (cat.code === 0 && cat.stdout.trim()) {
            parts.push(`\n### ${p}\n`);
            parts.push(cat.stdout.trim());
            loaded.push(p);
          }
        }
        projectAgentsContent = parts.join("\n");
      }
    }

    // ── 2. All guidelines from ~/.config/ai/ ───────────────────────────
    const aiFind = await pi.exec("find", [
      AI_DIR,
      "-name", "*.md",
      "-type", "f",
    ], {});

    if (aiFind.code === 0 && aiFind.stdout.trim()) {
      const aiFiles = aiFind.stdout.trim().split("\n").filter(Boolean).sort();

      const rulesFiles: string[] = [];
      const memoriesFiles: string[] = [];

      for (const f of aiFiles) {
        if (f.startsWith(AI_DIR + "/rules/")) rulesFiles.push(f);
        else if (f.startsWith(AI_DIR + "/memories/")) memoriesFiles.push(f);
      }

      const parts: string[] = [];

      if (rulesFiles.length > 0) {
        parts.push(
          "\n\n## Global AI Rules",
          "Durable operational rules loaded from ~/.config/ai/rules/:\n",
        );
        for (const f of rulesFiles) {
          const cat = await pi.exec("cat", [f], {});
          if (cat.code === 0 && cat.stdout.trim()) {
            parts.push(`\n### ${f}\n`);
            parts.push(cat.stdout.trim());
            loaded.push(f);
          }
        }
      }

      if (memoriesFiles.length > 0) {
        parts.push(
          "\n\n## Global AI Memories",
          "Durable tech preferences and project guidelines from ~/.config/ai/memories/:\n",
        );
        for (const f of memoriesFiles) {
          const cat = await pi.exec("cat", [f], {});
          if (cat.code === 0 && cat.stdout.trim()) {
            parts.push(`\n### ${f}\n`);
            parts.push(cat.stdout.trim());
            loaded.push(f);
          }
        }
      }

      globalContextContent = parts.join("\n");
    }

    // ── Persistent widget above editor ─────────────────────────────
    if (loaded.length > 0 && ctx.hasUI) {
      // Group by source for compact display
      const projectFiles = loaded.filter((f) => f.startsWith("./"));
      const rulesFiles = loaded.filter((f) => f.startsWith(AI_DIR + "/rules/"));
      const memFiles = loaded.filter((f) => f.startsWith(AI_DIR + "/memories/"));

      const base = (f: string) => f.split("/").pop()!;
      const groupLabel = (label: string, files: string[]): string => {
        if (files.length === 0) return "";
        const names = files.map(base);
        // Fold deeply nested writing-style refs
        const unique = [...new Set(names)];
        return `${label}: ${files.length}`;
      };

      const pLabel = groupLabel("project", projectFiles);
      const rLabel = groupLabel("rules", rulesFiles);
      const mLabel = groupLabel("memories", memFiles);

      ctx.ui.setWidget("context-loader", (_tui, theme) => {
        const dim = (s: string) => theme.fg("dim", s);
        const muted = (s: string) => theme.fg("muted", s);
        const accent = (s: string) => theme.fg("accent", s);

        return {
          render(_width: number): string[] {
            const parts = [`${dim("[")}${accent("ctx")}${dim("]")} ${dim(String(loaded.length) + " files")}`];
            for (const label of [pLabel, rLabel, mLabel]) {
              if (label) parts.push(muted(label));
            }
            return [parts.join(`  ${muted("·")}  `)];
          },
          invalidate() {},
        };
      });
    }
  });

  // ── Inject cached context on every agent start ───────────────────────
  pi.on("before_agent_start", async (event) => {
    let prompt = event.systemPrompt;
    if (globalContextContent) prompt += globalContextContent;
    if (projectAgentsContent) prompt += projectAgentsContent;
    if (prompt === event.systemPrompt) return {};
    return { systemPrompt: prompt };
  });

  // ── On-demand context search tool ────────────────────────────────────
  pi.registerTool({
    name: "search_ai_context",
    label: "Search AI Context",
    description: "Search and retrieve rules and memories from ~/.config/ai/rules/ and ~/.config/ai/memories/. Use when you need project rules, tech guidelines, or user preferences not already in context.",
    parameters: Type.Object({
      keyword: Type.String({
        description: "Term to search for (e.g., 'python', 'nextjs', 'code style')",
      }),
    }),
    async execute(_id, params, signal) {
      const keyword = params.keyword.toLowerCase();
      const result = await pi.exec("bash", [
        "-c",
        `grep -iRl "${keyword}" ~/.config/ai/rules/ ~/.config/ai/memories/ 2>/dev/null | xargs -I {} cat {}`,
      ], { signal });

      if (result.killed) {
        return {
          content: [{ type: "text", text: "Search cancelled." }],
          details: {},
        };
      }

      if (result.code !== 0 || !result.stdout.trim()) {
        return {
          content: [{ type: "text", text: `No context found for "${keyword}".` }],
          details: {},
        };
      }

      const truncation = truncateHead(result.stdout, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      let text = truncation.content;
      if (truncation.truncated) {
        text += `\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines. Use bash for more specific searches.]`;
      }

      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  });
}
