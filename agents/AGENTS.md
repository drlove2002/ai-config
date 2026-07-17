# AGENTS

Subagent catalog for `~/.config/ai/agents`.

## Agent Structure

Each agent is defined by a Markdown file with YAML frontmatter in the `agents/` directory:

```yaml
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: provider/model-id
thinkingLevel: medium
enabled: true  # optional, defaults to true
---
```

- `name` and `description` are required.
- `tools` is a comma-separated list of allowed tool names.
- `model` and `thinkingLevel` override session defaults for this agent.
- See [Agent Availability](#agent-availability) for the `enabled` field.
- The live catalog of enabled agents is generated at session start. Use `/subagents` to inspect or change configuration.

## Agent Usage

Agents are invoked via the `subagent` tool in three modes (see [Tool: subagent](#tool-subagent)):

- **Single**: One agent, one task.
- **Parallel**: Up to 8 agents concurrently (max 4 at a time) for independent work.
- **Chain**: Sequence where each step receives the prior step's output via `{previous}`.

Choose an agent by matching its declared capabilities (tools, model) to the task. Available agents and their capabilities are listed in the live catalog injected at session start.

## Agent Source

All agents are user-level (`source: "user"`). Project-local agents in `.pi/agents/` override when `agentScope: "both"`.

## Agent Availability

Each agent definition can include an optional `enabled` frontmatter field:

```yaml
---
name: my-agent
enabled: false  # optional, defaults to true
---
```

- Missing or invalid values default to `enabled: true`.
- Disabled agents are rejected before process spawning and excluded from runtime discovery.
- In `both` scope, a disabled project definition shadows a same-named user definition.
- Management commands (`/subagents`) list all physical definitions with state for bulk management.

## Tool: subagent

Invoke with the `subagent` tool. Three modes:

```toon
// Single
agent: <agent-name>
cwd: /path
task: describe the task clearly

// Parallel (max 8, 4 concurrent)
tasks[2]{agent,task}:
  <agent-a>,find models
  <agent-b>,fetch API docs

// Chain ({previous} = output of prior step)
chain[2]{agent,task}:
  <agent-a>,find auth
  <agent-b>,"using {previous}, plan refactor"
```
