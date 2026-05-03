# AGENTS

Subagent catalog for `~/.config/ai/agents`.

## Agent Definitions

| Agent | Model | Tools | Description |
|-------|-------|-------|-------------|
| **`worker`** | `openrouter-fallback/deepseek/deepseek-v4-flash` | read, edit, write, bash, grep, find, ls, browser | General-purpose. Autonomous coding: reads files, edits code, runs commands, browses web. |
| **`scout`** | `openrouter-fallback/deepseek/deepseek-v4-flash` | read, grep, find, ls, bash, browser | Fast recon. Finds relevant files, returns compressed context for handoff. |
| **`planner`** | `openrouter-fallback/deepseek/deepseek-v4-pro` | read, grep, find, ls, browser | Architecture & plan formulation. Reads codebase, produces numbered step-by-step plans. Read-only. |
| **`reviewer`** | `openrouter-fallback/deepseek/deepseek-v4-pro` | read, grep, find, ls, bash (read-only), browser | Code review. Analyzes diffs and modified files for bugs, security, maintainability. |
| **`browser`** | `openrouter-fallback/deepseek/deepseek-v4-flash` | browser | Web research. Fetches pages, scrapes docs, returns facts/snippets. Browser tool only — no local file access. |
| **`vision`** | `google-vertex/gemini-3.1-pro-preview` | read | Image analysis. Reads image files (png, jpg, gif, webp) and returns dense structured descriptions of layout, text, UI elements, and visual state. |

Compact TOON catalog:
```toon
agents[6]{name,model,tools,role}:
  worker,ds-v4-flash,"read,edit,write,bash,grep,find,ls,browser","General-purpose coding"
  scout,ds-v4-flash,"read,grep,find,ls,bash,browser","Fast recon"
  planner,ds-v4-pro,"read,grep,find,ls,browser","Architecture planning, read-only"
  reviewer,ds-v4-pro,"read,grep,find,ls,bash,browser","Code review"
  browser,ds-v4-flash,browser,"Web research"
  vision,gemini-3.1-pro,read,"Image analysis and description"
```

## Usage Patterns

- **Chain**: `scout` → `planner` → `worker` (implement feature from scratch)
- **Chain**: `worker` → `reviewer` → `worker` (implement then fix)
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
