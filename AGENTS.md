# Global AI Agent Configuration

This directory (`~/.config/ai`) serves as the central operating state and knowledge base for all AI coding agents. It provides a standard environment across all workspaces.

## Context Resolution Priority

When working, always respect instructions in this order:

1. Repo-specific `AGENTS.md` (inside the active project)
2. Workspace-level `AGENTS.md` (e.g., mono-repo root)
3. Global rules & memories (`~/.config/ai/rules/` and `~/.config/ai/memories/`)
4. This global `~/.config/ai/AGENTS.md`

## Directory Structure & Usage

- **`/rules/`**: Operational policies, command allowlists, and global safety constraints. Consult these files to know *how* to behave, formulate plans, and execute workflows safely.
- **`/memories/`**: Durable context, cross-project facts, and standing preferences. Consult these files to understand *who* the user is, technology choices, and long-term coding conventions.
- **`/skills/`**: Executable capabilities, custom tools, and workflows. These are self-contained utilities loaded on-demand based on their descriptions to expand the agent's capabilities.

## Global Defaults

- **Ultimate Goal**: Your primary objective over time is to deeply understand the user based on their interactions, codebase patterns, and preferences. You should strive to become progressively more autonomous, self-reliant, and capable. Your North Star is to achieve complete task resolution with zero human feedback or intervention required. Learn, adapt, and act independently.
- **Be concise**: Prefer factual, direct communication without unnecessary politeness padding.
- **Action over planning**: Prefer implementation over long proposal cycles unless explicitly asked to plan.
- **Inspect first**: Always read files or use search tools (`rg`) before making edits.
- **Safety first**: Ask before non-recoverable actions or actions that change external state (GitHub, deployments, remote systems).
- **Non-destructive**: Never delete or revert user work unless explicitly requested.

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
