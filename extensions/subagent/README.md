# Subagent Example

Delegate tasks to specialized subagents with isolated context windows.

## Features

- **Isolated context**: Each subagent runs in a separate `pi` process
- **Streaming output**: See tool calls and progress as they happen
- **Parallel streaming**: All parallel tasks stream updates simultaneously
- **Markdown rendering**: Final output rendered with proper formatting (expanded view)
- **Usage tracking**: Shows turns, tokens, cost, and context usage per agent
- **Abort support**: Ctrl+C propagates to kill subagent processes
- **Lifecycle observability**: Live phase tracking with idle-time display
- **Configurable limits**: Wall-clock, inactivity, and shutdown grace with graceful escalation
- **Diagnostic mode**: Optional `noExtensions` flag for extension-free subagent runs

## Structure

```
subagent/
├── README.md            # This file
├── index.ts             # The extension (entry point)
├── agents.ts            # Agent discovery logic
├── agents/              # Sample agent definitions
│   ├── scout.md         # Fast recon, returns compressed context
│   ├── planner.md       # Creates implementation plans
│   ├── reviewer.md      # Code review
│   └── worker.md        # General-purpose (full capabilities)
└── prompts/             # Workflow presets (prompt templates)
    ├── implement.md     # scout -> planner -> worker
    ├── scout-and-plan.md    # scout -> planner (no implementation)
    └── implement-and-review.md  # worker -> reviewer -> worker
```

## Installation

From the repository root, symlink the files:

```bash
# Symlink the extension (must be in a subdirectory with index.ts)
mkdir -p ~/.pi/agent/extensions/subagent
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/index.ts" ~/.pi/agent/extensions/subagent/index.ts
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/agents.ts" ~/.pi/agent/extensions/subagent/agents.ts

# Symlink agents
mkdir -p ~/.pi/agent/agents
for f in packages/coding-agent/examples/extensions/subagent/agents/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/agents/$(basename "$f")
done

# Symlink workflow prompts
mkdir -p ~/.pi/agent/prompts
for f in packages/coding-agent/examples/extensions/subagent/prompts/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/prompts/$(basename "$f")
done
```

## Agent Availability

Each agent definition can include an optional `enabled` frontmatter field:

```markdown
---
name: my-agent
description: Does something
enabled: false  # optional, defaults to true
---
```

- Missing or invalid values default to `enabled: true`.
- Disabled agents are rejected at the tool level before any process spawning (`subagent` returns a generic "not available" error).
- Runtime discovery (`discoverAgents`) filters disabled agents after scope/shadowing resolution.
- Management discovery (`listAllPhysicalDefinitions`) returns ALL definitions with state for management UIs.
- In `both` scope, a disabled project definition shadows a same-named user definition.
- Use `/subagents` (interactive, no arguments) → "Manage availability" to toggle agents on/off.

## Security Model

This tool executes a separate `pi` subprocess with a delegated system prompt and tool/model configuration.

**Project-local agents** (`.pi/agents/*.md`) are repo-controlled prompts that can instruct the model to read files, run bash commands, etc.

**Default behavior:** Only loads **user-level agents** from `~/.pi/agent/agents`.

To enable project-local agents, pass `agentScope: "both"` (or `"project"`). Only do this for repositories you trust.

When running interactively, the tool prompts for confirmation before running project-local agents. Set `confirmProjectAgents: false` to disable.

## Usage

### Single agent
```
Use scout to find all authentication code
```

### Parallel execution
```
Run 2 scouts in parallel: one to find models, one to find providers
```

### Chained workflow
```
Use a chain: first have scout find the read tool, then have planner suggest improvements
```

### Workflow prompts
```
/implement add Redis caching to the session store
/scout-and-plan refactor auth to support OAuth
/implement-and-review add input validation to API endpoints
```

## Tool Modes

| Mode | Parameter | Description |
|------|-----------|-------------|
| Single | `{ agent, task }` or `{ agent, workerPackage }` | One agent, one task or worker package |
| Parallel | `{ tasks: [...] }` | Multiple agents run concurrently (max 8, 4 concurrent) |
| Chain | `{ chain: [...] }` | Sequential with `{previous}` placeholder |

## Worker Packages

When dispatching to the `worker` agent, use `workerPackage` instead of raw `task`:

```json
{
  "agent": "worker",
  "workerPackage": {
    "objective": "One sentence summary",
    "files": ["path/to/file1.ts", "path/to/file2.ts"],
    "changes": "Precise description of what to change",
    "acceptance": "Acceptance criteria that must be met",
    "verification": "How to verify (commands, expected output)"
  }
}
```

Worker packages are validated:
- All fields (`objective`, `files`, `changes`, `acceptance`, `verification`) must be nonempty
- `files` must contain at least one non-blank entry
- Worker agents (`agent: "worker"`) **require** `workerPackage` — raw `task` is rejected
- Non-worker agents (`scout`, `planner`, `reviewer`, etc.) **reject** `workerPackage` — use `task`
- Providing both `task` and `workerPackage` on any agent is rejected
- Parallel mode detects overlapping normalized file paths among worker packages

### Worker package in chain mode

```json
{
  "chain": [
    { "agent": "scout", "task": "find auth code" },
    { "agent": "worker", "workerPackage": { "objective": "Fix auth", "files": ["auth.ts"], "changes": "...", "acceptance": "...", "verification": "..." } }
  ]
}
```

### Worker package in parallel mode

```json
{
  "tasks": [
    { "agent": "worker", "workerPackage": { "objective": "Fix auth", "files": ["auth.ts"], "changes": "...", "acceptance": "...", "verification": "..." } },
    { "agent": "worker", "workerPackage": { "objective": "Fix database", "files": ["db.ts"], "changes": "...", "acceptance": "...", "verification": "..." } }
  ]
}
```

## Output Display

**Collapsed view** (default):
- Status icon (✓/✗/⏳) and agent name
- Last 5-10 items (tool calls and text)
- Usage stats: `3 turns ↑input ↓output RcacheRead WcacheWrite $cost ctx:contextTokens model`

**Expanded view** (Ctrl+O):
- Full task text
- Lifecycle phase and idle time
- All tool calls with formatted arguments
- Final output rendered as Markdown
- Per-task usage (for chain/parallel)

**Parallel mode streaming**:
- Shows all tasks with live status (⏳ running, ✓ done, ✗ failed)
- Updates as each task makes progress
- Shows "2/3 done, 1 running" status

**Tool call formatting** (mimics built-in tools):
- `$ command` for bash
- `read ~/path:1-10` for read
- `grep /pattern/ in ~/path` for grep
- etc.

## Lifecycle Phases & Limits

The subagent tracks JSON-mode lifecycle events from the child `pi` process. Current phase
and idle time are displayed in the running UI.

| Phase | Meaning | Events |
|-------|---------|--------|
| `init` | Before first event | (initial state) |
| `thinking` | Provider inference | `agent_start`, `turn_start`, `message_start`, `message_update`, `message_end` |
| `tool` | Tool execution | `tool_execution_start`, `tool_execution_update` |
| `retry` | Provider retry | `auto_retry_start` |
| `compact` | Context compaction | `compaction_start` |
| `settled` | Agent ended, awaiting exit | `agent_end` (lifecycle progress), `agent_settled` (final settlement) |
| `exited` | Process closed | (final) |

### Configurable Limits

Pass `limits` in the subagent parameters to prevent indefinite hangs:

```json
{
  "agent": "scout",
  "task": "analyze the codebase",
  "limits": {
    "wallClockMs": 300000,
    "inactivityMs": 120000,
    "shutdownGraceMs": 2000
  }
}
```

| Limit | Default | Behavior |
|-------|---------|----------|
| `wallClockMs` | 15 min | Total wall-clock time before SIGTERM→SIGKILL escalation |
| `inactivityMs` | 5 min | Maximum time in a single phase before escalation. Set to 0 to disable |
| `shutdownGraceMs` | 2 sec | After `agent_settled`, wait this long for the child to exit before force-killing. Set to 0 to disable. **When 0, the post-settlement bound is still enforced by `wallClockMs`.** |

**Important:** The inactivity timer resets on **every valid JSON event** from the child
(except the `session` header). A stuck phase (e.g., a hung bash command) triggers
inactivity, but active inference/tool/retry/compaction streams — even if a single
phase runs long — do not. Use `wallClockMs` for hard time-boxing. Configure
`inactivityMs: 0` to disable inactivity entirely.

When a limit is hit, the subagent reports `hitLimit` in the result and the UI shows
`[limit: wallClock]` / `[limit: inactivity]` / `[limit: shutdownGrace]`.

### Diagnostic Mode

Set `noExtensions: true` to run the child process with `--no-extensions`. This helps
diagnose whether extensions in the main session interfere with subagent behavior.

```json
{
  "agent": "scout",
  "task": "find auth code",
  "noExtensions": true
}
```

Extension-free mode is compatible with A/B testing: run the same task with
`noExtensions: true` and `noExtensions: false` (default) to compare behavior.

## Agent Definitions

Agents are markdown files with YAML frontmatter:

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-haiku-4-5
enabled: true        # optional, defaults to true
---

System prompt for the agent goes here.
```

**Locations:**
- `~/.pi/agent/agents/*.md` - User-level (always loaded)
- `.pi/agents/*.md` - Project-level (only with `agentScope: "project"` or `"both"`)

Project agents override user agents with the same name when `agentScope: "both"`.

## Sample Agents

| Agent | Purpose | Model | Tools |
|-------|---------|-------|-------|
| `scout` | Fast codebase recon (read-only) | opencode-zen/deepseek-v4-flash-free | read, grep, find, ls, bash (read-only) |
| `planner` | Implementation plans | openai-codex/gpt-5.6-sol | read, grep, find, ls, browser |
| `reviewer` | Code review | openai-codex/gpt-5.6-sol | read, grep, find, ls, bash, browser |
| `worker` | General-purpose (full capabilities) | commandcode/deepseek/deepseek-v4-pro | read, edit, write, bash, grep, find, ls, browser |
| `browser` | Web research (vision via screenshots) | commandcode/MiniMaxAI/MiniMax-M3 | browser |
| `vision` | Image analysis (disabled by default) | commandcode/MiniMaxAI/MiniMax-M3 | read |

## Workflow Prompts

| Prompt | Flow |
|--------|------|
| `/implement <query>` | scout → planner → plan output → STOP for user approval → dispatch bounded worker packages individually |
| `/scout-and-plan <query>` | scout → planner → plan output (no implementation) |
| `/implement-and-review <query>` | worker(bounded package) → output → STOP for user approval → reviewer → review output → fresh workerPackage → user approval → worker |

## Error Handling

- **Exit code != 0**: Tool returns error with stderr/output
- **stopReason "error"**: LLM error propagated with error message
- **stopReason "aborted"**: User abort (Ctrl+C) kills subprocess, throws error
- **Limit hits**: `hitLimit` field reports which limit caused termination ("wallClock"|"inactivity"|"shutdownGrace")
- **Chain mode**: Stops at first failing step, reports which step failed
- **Worker package validation**: Rejects empty/whitespace-only objective, files, changes, acceptance, verification fields; rejects mixed task+workerPackage payloads; worker agents require workerPackage, non-worker require task
- **Parallel file overlap detection**: Normalized absolute file paths are checked; overlapping scopes are rejected

### Terminal Provider / Rate-Limit Failures

When a provider returns errors that exhaust all retries (e.g., 429 rate limits, 5xx server errors), the subagent runner detects the terminal failure via JSON-mode events and **immediately terminates the child process**. No waiting for compaction, retries, grace timers, inactivity, or `agent_settled`.

**Detection uses only documented JSON-stream events** (`agent_end.willRetry`, `auto_retry_end.success`):

| Event | Field | Value | Classification |
|-------|-------|-------|----------------|
| `agent_end` | `willRetry` | `true` | Retryable — keep going |
| `agent_end` | `willRetry` | `false` + `stopReason: error` | **Terminal** — kill immediately |
| `agent_end` | `willRetry` | *absent* | Non-terminal (conservative) |
| `auto_retry_end` | `success` | `true` | Retryable — keep going |
| `auto_retry_end` | `success` | `false` | **Terminal** — retries exhausted, kill immediately |
| `auto_retry_end` | `success` | *absent* | Non-terminal (conservative) |

**stderr is diagnostic only**: a 429 or "rate limit" message on stderr does NOT trigger termination. Only the structured JSON events above determine when the child is killed.

On terminal detection:
1. The result is marked as `stopReason: "error"` with a descriptive `errorMessage`.
2. The child process is killed immediately (SIGTERM, then SIGKILL after 5s).
3. The exit code is forced non-zero even if the child exits 0.
4. All modes (single, parallel, chain) treat `stopReason:error` or `stopReason:aborted` as failure regardless of exit code.
5. Provider failures are tracked separately from `hitLimit` — `hitLimit` only reports wallClock/inactivity/shutdownGrace breaches.

### Diagnostic Handoff

When a child times out or hits a terminal error, the result includes a `diagnostic`
string field with a concise summary:

```
Limit: wallClock
Error: (if any provider/delivery error)
Phase: thinking|tool|retry|compact|settled|exited
Last activity: Ns ago
Latest output: (truncated last assistant text)
Tool calls (N): (last 5 tool names)
Stderr: (last 10 lines)
```

This diagnostic is surfaced at multiple levels:
- **Single mode**: shown in collapsed + expanded views; preferred over raw stderr
  in the content text (`result.diagnostic ?? errorMessage`).
- **Chain mode**: if a step fails, the chain-stop message uses the diagnostic.
- **Parallel mode**: each failed task's expanded card includes its diagnostic.

The main orchestrator uses the diagnostic to decide next steps (decompose, retry,
or investigate) without losing partial findings.

### Timeout Policy

A **wall-clock timeout** (`hitLimit: "wallClock"`) means the task was too large for
the configured time budget. The orchestrator (parent agent) must:

1. Read the diagnostic to understand progress.
2. Use the `planner` to break the task into smaller bounded packages.
3. Seek any needed approval before dispatching new worker packages.
4. **Never** blindly retry the same large task — it will just hit the same limit.

Inactivity timeouts (`hitLimit: "inactivity"`) indicate a stalled child that
stopped emitting events; the orchestrator should check if the task description was
unclear or if the agent model had connectivity issues.

## Limitations

- Output truncated to last 10 items in collapsed view (expand to see all)
- Agents discovered fresh on each invocation (allows editing mid-session)
- Parallel mode limited to 8 tasks, 4 concurrent
- Inactivity detection resets on every valid child JSON event: a stuck tool execution
  (e.g., a hung bash command) triggers after the inactivity limit, but active streams
  (inference, retries, compactions, tool output) stay alive
