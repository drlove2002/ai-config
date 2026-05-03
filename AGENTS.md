# Global AI Agent Configuration

This directory (`~/.config/ai`) serves as the central operating state and knowledge base for all AI coding agents. It provides a standard environment across all workspaces.

## Context Resolution Priority

When working, always respect instructions in this order:

1. Repo-specific `AGENTS.md` (inside the active project)
2. Workspace-level `AGENTS.md` (e.g., mono-repo root)
3. Global rules & memories (`~/.config/ai/rules/` and `~/.config/ai/memories/`)
4. This global `~/.config/ai/AGENTS.md`

## Directory Tree

```
~/.config/ai/
├── AGENTS.md              ← this file (global defaults, context resolution, subagent routing)
├── agents/
│   ├── AGENTS.md           ← subagent catalog (capabilities, models, tools per agent)
│   ├── worker.md           ← general-purpose: read, write, edit, bash, browser (model: nvidia-nim/z-ai/glm-4.7)
│   ├── scout.md            ← fast recon: read, grep, find, ls, bash, browser (model: gemini-3-flash)
│   ├── planner.md          ← implementation plans: read, grep, find, ls, browser (model: openrouter-fallback/deepseek/deepseek-pro)
│   ├── reviewer.md         ← code reviews: read, grep, find, ls, bash (read-only), browser
│   └── browser.md          ← web research: browser, read, bash (model: gemini-3-flash)
├── extensions/
│   ├── clear-command.ts    ← /clear command (permanently delete session)
│   ├── pi-rules.ts         ← search_ai_context tool + context directive
│   ├── user-decisions.ts   ← interactive TUI questionnaire + /edit-decisions command
│   └── subagent/           ← subagent tool (spawn isolated pi processes)
├── memories/
│   ├── AGENTS.md           ← memory directory guide
│   ├── writing-style/           ← prose quality rules + references (phrases, structures, examples)
│   ├── python-guidelines.md     ← Python coding standards
│   ├── rust-guidelines.md       ← Rust coding standards + WWAPI focus
│   └── nextjs-guidelines.md     ← Next.js App Router standards + WWPAGE focus
├── rules/
│   ├── AGENTS.md           ← rules directory guide
│   ├── default.rules       ← command allowlist (nix, cargo, pnpm, git, psql, etc.)
│   └── orchestrator.md     ← always-active session protocol (context hygiene, subagent routing, implementation discipline)
├── skills/                 ← on-demand workflows (15 skills: TDD, bug triage, refactor plans, DDD, etc.)
├── settings.json           ← default model: openrouter/deepseek/deepseek-v4-pro, thinking: low
├── models.json             ← provider + model definitions (openrouter, groq, cloudflare, nvidia-nim)
├── auth.json               ← API keys (permissions: 600)
└── packages/               ← npm packages (pi-agent-browser)
```

## Directory Usage

- **`agents/`**: Specialized subagent definitions (system prompts, tool sets, models). See `agents/AGENTS.md` for catalog.
- **`extensions/`**: Custom TypeScript plugins for pi (tools, commands, system prompt hooks).
- **`memories/`**: Durable tech preferences and project guidelines. See `memories/AGENTS.md` for index.
- **`rules/`**: Operational policies and command allowlists. See `rules/AGENTS.md` for index.
- **`skills/`**: Executable capabilities loaded on-demand based on task descriptions (18 skills available).

## Global Defaults

- **Ultimate Goal**: Your primary objective over time is to deeply understand the user based on their interactions, codebase patterns, and preferences. You should strive to become progressively more autonomous, self-reliant, and capable. Your North Star is to achieve complete task resolution with zero human feedback or intervention required. Learn, adapt, and act independently.
- **Be concise**: Prefer factual, direct communication without unnecessary politeness padding.
- **Action over planning**: Prefer implementation over long proposal cycles unless explicitly asked to plan.
- **Inspect first**: Always read files or use search tools (`rg`) before making edits.
- **Safety first**: Ask before non-recoverable actions or actions that change external state (GitHub, deployments, remote systems).
- **Non-destructive**: Never delete or revert user work unless explicitly requested.
- **Temporary Files & Testing**: For any non-project-related testing, downloading files from the internet, or creating scratch files, ALWAYS use the Linux temporary directory (e.g., `/tmp`). Do not pollute the active workspace or the user's home directory with temporary artifacts.

## System Configuration (NixOS)

This machine runs NixOS.

- **Configuration Source**: The declarative source of truth for the entire system configuration is located at `~/.config/nixos/`.
- **System Changes**: To inspect system settings, installed packages, or core services, always read the configuration files within `~/.config/nixos/` rather than looking in `/etc/`.
- **Applying Changes**: Never attempt to modify system state mutably (e.g., via `apt` or `dnf`). If system-level changes are required, modify the relevant Nix expressions in `~/.config/nixos/` and rebuild the system.

## Subagents

Subagents are specialized workers that operate in isolated context windows. Use the `subagent` tool to delegate tasks without polluting the main conversation. They can be spawned individually, in parallel, or in sequential chains.

**Available Subagents:**

- **`worker`**: General-purpose execution. Can read, write, edit, run bash, and browse. Use for autonomous coding tasks.
- **`scout`**: Fast codebase recon. Use to quickly find relevant files and return compressed context to hand off to other agents.
- **`planner`**: Architecture and plan formulation. Reads codebase and requirements to produce step-by-step implementation plans without making edits.
- **`reviewer`**: Code review specialist. Analyzes code for quality, security, and maintainability.
- **`browser`**: Expert web browsing subagent. Use to fetch pages, scrape documentation, and return exactly the facts or snippets needed. (Fallbacks: `browser-nv`, `browser-or`).

**How to use Subagents:**

- **Single**: `{"agent": "worker", "cwd": "/...", "task": "..."}`
- **Parallel**: `{"tasks": [ {"agent": "scout", "task": "..."}, {"agent": "browser", "task": "..."} ]}`
- **Chain (Sequential)**: `{"chain": [ {"agent": "scout", "task": "..."}, {"agent": "planner", "task": "... use {previous} ..."} ]}`
Always provide an absolute `cwd` and clear, explicit instructions for the task.
