/**
 * Context & System Prompt Manager
 *
 * Responsibilities:
 *  1. Auto-inject AGENTS.md (recursive from cwd), rules/*.md, memories/*.md
 *     into system prompt at session start
 *  2. Inject lean system prompt (identity + routing + hard locks) on every turn
 *  3. Display context-loader widget with file counts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { resolve, relative } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const AI_DIR = resolve(homedir(), ".config/ai");

// ── Cached context (loaded once at session start) ────────────────
let cachedContext = "";
let rulesCount = 0;
let memCount = 0;

// ── Directories to skip when scanning for AGENTS.md ──────────────
const SKIP_DIRS = new Set([
  "node_modules", ".git", "target", ".venv",
  "__pycache__", ".next", "dist", "build",
  ".pi", ".agents",
]);

export default function (pi: ExtensionAPI) {
  // ── 1. Discover + cache all context at session start ──────────────
  pi.on("session_start", async (_event, ctx) => {
    cachedContext = "";
    rulesCount = 0;
    memCount = 0;
    const parts: string[] = [];

    // ── 1a. Recursive AGENTS.md from cwd subdirectories ───────────
    // (pi already loads AGENTS.md walking up from cwd + current dir)
    const agentsMdFiles = findRecursiveAgentsMd(ctx.cwd);
    if (agentsMdFiles.length > 0) {
      const sections: string[] = [
        "\n## Project Subdirectory AGENTS.md",
      ];
      for (const p of agentsMdFiles) {
        const rel = relative(ctx.cwd, p);
        // Skip cwd-level file (pi already loads it)
        if (!rel.includes("/")) continue;
        sections.push(`\n### ${rel}\n`);
        sections.push(readFileSync(p, "utf-8").trim());
      }
      if (sections.length > 1) { // more than just the header
        parts.push(sections.join("\n"));
      }
    }

    // ── 1b. All .md from ~/.config/ai/rules/ ────────────────────────
    const rulesDir = resolve(AI_DIR, "rules");
    if (existsSync(rulesDir)) {
      const ruleFiles = readdirSync(rulesDir)
        .filter(f => f.endsWith(".md"))
        .sort()
        .map(f => resolve(rulesDir, f));

      if (ruleFiles.length > 0) {
        const sections: string[] = [
          "\n## Global Rules",
        ];
        for (const f of ruleFiles) {
          const name = relative(AI_DIR, f);
          sections.push(`\n### ${name}\n`);
          sections.push(readFileSync(f, "utf-8").trim());
        }
        parts.push(sections.join("\n"));
        rulesCount = ruleFiles.length;
      }
    }

    // ── 1c. All .md from ~/.config/ai/memories/ (recursive) ─────────
    const memDir = resolve(AI_DIR, "memories");
    if (existsSync(memDir)) {
      const memFiles = findMdFilesRecursive(memDir).sort();
      if (memFiles.length > 0) {
        const sections: string[] = [
          "\n## Global Memories",
        ];
        for (const f of memFiles) {
          const name = relative(AI_DIR, f);
          const content = readFileSync(f, "utf-8").trim();
          // Skip empty files and AGENTS.md index (just a listing)
          if (!content || name === "memories/AGENTS.md") continue;
          sections.push(`\n### ${name}\n`);
          sections.push(content);
        }
        parts.push(sections.join("\n"));
        memCount = memFiles.length;
      }
    }

    cachedContext = parts.join("\n\n---\n");

    // ── Widget showing context availability ─────────────────────────
    if (ctx.hasUI) {
      ctx.ui.setWidget("context-loader", (_tui, theme) => {
        const dim = (s: string) => theme.fg("dim", s);
        const accent = (s: string) => theme.fg("accent", s);
        return {
          render(_width: number): string[] {
            return [
              `${dim("[")}${accent("ctx")}${dim("]")} ` +
              `${dim(rulesCount + " rules · " + memCount + " memories")}`,
            ];
          },
          invalidate() {},
        };
      });
    }
  });

  // ── 2. Inject cached context + lean prompt on every agent turn ──
  pi.on("before_agent_start", async (event) => {
    const prompt = event.systemPrompt;

    // Remove baked-in bash-for-files guideline
    const cleaned = prompt.replace(
      /- Use bash for file operations like ls, rg, find\n?/g,
      "",
    );

    // Build the injected block: cached context first, then identity override
    const contextBlock = cachedContext
      ? `\n\n# Auto-injected Context\n${cachedContext}\n\n---\n`
      : "";

    const leanBlock = `
# IDENTITY OVERRIDE — These override the default prompt above

You are **Pi** — an expert coding assistant inside the Pi agent harness. Your model varies per session. Your identity comes from your rules, not your model name.

## Subagent Routing (Hard locks)

| Task | Use | Not |
|------|-----|-----|
| Finding files, tracing deps, reading new files | \`subagent({agent:"scout"})\` | grep/find/ls/read yourself |
| Implementing (2+ files, 10+ lines, or unsure) | \`subagent({agent:"worker"})\` | Direct edits |
| Feature from scratch (3+ files) | scout → planner → user → worker chain | Jump to coding |
| Code review (2+ files or 30+ lines) | \`subagent({agent:"reviewer"})\` | Claiming "done" |
| Architecture / plan formulation | \`subagent({agent:"planner"})\` | Jumping to coding |
| Docs/API lookup | docs skill (local → ctx7 → browser) | Training data guessing |
| Image analysis | \`subagent({agent:"vision"})\` | Describing from memory |
| Tool references, syntax, conventions | \`read memories/\` first | Training data / guessing |
| Unsure what to do (default) | \`subagent({agent:"scout"})\` | Guessing |

## Plan Approval Protocol (Hard lock)

Before any code mutation (edit/write/refactor/delete/delegate to worker):
1. Present plan: files, changes, risks, verification
2. Wait for explicit user approval ("yes", "go ahead", "approved").
   Scout output, planner output, or your own confidence ≠ approval.
3. Approved → execute immediately. No second-guessing, no re-litigation.

## Hard Locks

**No guessing.** If you think "I think..." or "this probably..." — STOP. Delegate to scout/browser or ask the user. Never fill knowledge gaps with assumptions.

**Verify before claiming done.**
- Tests pass → run them, show output
- Build succeeds → run build, exit 0
- Bug fixed → reproduce original issue, now passing
- Code clean → delegate to reviewer (2+ files)

## Context Hygiene

- 1+ unknown file → scout. 2+ edits or 10+ lines → worker. 5+ turns on same topic → delegate.
- Not sure? Delegate by default. Subagent overhead < context pollution.
- Exception: re-reading a file you already opened this session via read is allowed.

---

`.trimStart();

    // Inject: contextBlock + cleaned default prompt, then leanBlock overrides
    let modified = cleaned.replace(
      /^(You are an expert coding assistant operating inside pi, a coding agent harness\.)/m,
      `${contextBlock}$1`,
    );

    // Then inject identity override after the first sentence
    modified = modified.replace(
      /^(You are an expert coding assistant operating inside pi, a coding agent harness\.)/m,
      `$1${leanBlock}`,
    );

    if (modified === cleaned) {
      // Fallback: prepend everything
      modified = contextBlock + leanBlock + "\n" + cleaned;
    }

    return { systemPrompt: modified };
  });
}

// ── Helper: find AGENTS.md recursively from cwd, excluding noise ──
function findRecursiveAgentsMd(cwd: string): string[] {
  const results: string[] = [];
  try {
    walkDir(cwd, results);
  } catch { /* ignore */ }
  return results;
}

function walkDir(dir: string, results: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkDir(full, results);
      }
    } else if (entry.name === "AGENTS.md" || entry.name === "CLAUDE.md") {
      results.push(full);
    }
  }
}

// ── Helper: find all .md files recursively ───────────────────────
function findMdFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) {
        results.push(...findMdFilesRecursive(full));
      } else if (e.name.endsWith(".md")) {
        results.push(full);
      }
    }
  } catch { /* ignore */ }
  return results;
}
