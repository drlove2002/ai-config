# AGENTS

Subagent catalog for `~/.config/ai/agents`.

## Agent Definitions

| Agent | Model | Tools | Description |
|-------|-------|-------|-------------|
| **`worker`** | `opencode-zen/deepseek-v4-flash-free` | read, edit, write, bash, grep, find, ls, browser | General-purpose. Executes approved coding plans: reads files, edits code, runs commands, browses web. |
| **`scout`** | `opencode-zen/deepseek-v4-flash-free` | read, grep, find, ls, bash, browser | Fast recon. Finds relevant files, returns compressed context for handoff.
| **`planner`** | `commandcode/deepseek/deepseek-v4-pro` | read, grep, find, ls, browser | Architecture & plan formulation. Reads codebase, produces numbered step-by-step plans. Read-only. |
| **`reviewer`** | `commandcode/deepseek/deepseek-v4-pro` | read, grep, find, ls, bash (read-only), browser | Code review. Analyzes diffs and modified files for bugs, security, maintainability. |
| **`browser`** | `opencode-zen/deepseek-v4-flash-free` | browser | Web research. Fetches pages, scrapes docs, and can inspect screenshots when page layout or visual state matters. |
| **`vision`** | `google-vertex/gemini-3.1-pro-preview` | read | Image analysis. Reads image files (png, jpg, gif, webp) and returns dense structured descriptions of layout, text, UI elements, and visual state. |

## Usage Patterns

- **Chain**: `scout` → `planner` → user approval → `worker` (implement feature from scratch)
- **Chain**: `worker` → `reviewer` → user approval if changes expand scope → `worker` (implement then fix)
- **Parallel**: Multiple `scout`s for separate areas of codebase
- **Single**: `browser` for docs lookups, `scout` for quick recon

## Agent Source

All agents are user-level (`source: "user"`). Project-local agents in `.pi/agents/` override when `agentScope: "both"`.

## Tool: subagent

Invoke with the `subagent` tool. Three modes:

```toon
// Single
agent: scout
cwd: /path
task: find all auth code

// Parallel (max 8, 4 concurrent)
tasks[2]{agent,task}:
  scout,find models
  browser,fetch API docs

// Chain ({previous} = output of prior step)
chain[2]{agent,task}:
  scout,find auth
  planner,"using {previous}, plan refactor"
```
