# Session Orchestration

## Core Principle: Main Agent Owns the Task

The main agent is self-sufficient. It inspects, plans, implements, and verifies work directly, and remains responsible for the final result.

Subagents are optional tools, not a required workflow. File count, changed-line count, task duration, risk, or uncertainty do not automatically trigger delegation.

Use a subagent only when it offers a concrete benefit:

- independent work can run in parallel without overlapping edits;
- a specialist capability is materially better suited to a bounded task;
- isolating a large research context keeps the main task clearer;
- the user explicitly asks for delegation or multi-agent work.

Do not delegate work the main agent can complete efficiently. Keep decisions, integration, and final verification in the main conversation. Validate relevant subagent findings before relying on them.

Rules and memories stay on disk rather than being dumped wholesale into the system prompt. Read the relevant sources directly when needed.

## Hard Locks

### 1. No Circular Thinking

After the user approves a plan, execute it. Do not re-litigate the approved approach unless new evidence creates a material safety or correctness issue.

### 2. No Guessing

Verify uncertain facts with direct tools. Ask the user only when a material decision cannot be resolved from the available context without risking divergence from their intent. A subagent is optional, not the default answer to uncertainty.

### 3. Verify Before Claiming Done

| Claim | Requires |
|-------|----------|
| "Tests pass" | Run tests and report the result |
| "Build succeeds" | Run the build and confirm exit 0 |
| "Bug fixed" | Reproduce the original issue with a now-passing check |
| "Code is clean" | Inspect the diff and run relevant checks; independent review is optional |

## Default Workflow

1. Inspect the relevant files, instructions, history, and callers directly.
2. Present the required plan and wait for explicit user approval before mutation.
3. Implement the approved changes directly.
4. Inspect the diff and run verification proportional to risk.
5. Report the outcome, limitations, and any remaining user decision.

Delegation may be inserted into this workflow when it has a stated concrete benefit, but it never replaces main-agent ownership.

## Plan Approval Protocol

Before code editing, file writing, refactoring, deletion, or delegating implementation:

1. Present a concise plan with files, intended changes, assumptions or risks, and verification.
2. Wait for explicit user approval such as "yes", "go ahead", or "approved".
3. Do not treat subagent output or confidence as user approval.
4. After approval, execute without unnecessary delay or repeated planning.

## Context Hygiene

- Use direct tools for narrow and broad inspection, dependency tracing, implementation, and verification.
- Search before re-reading large files and load only the sections needed for the current decision.
- Keep durable findings in the appropriate plan or issue record when required.
- Use subagents selectively for bounded parallel, specialist, or context-isolation work.
- Do not delegate merely because a task spans multiple files, exceeds a line threshold, continues for several turns, or is uncertain.

## Optional Subagent Protocol

When delegation is beneficial:

1. State the specific benefit.
2. Give the subagent a bounded objective, relevant context, allowed files if editing, acceptance criteria, and verification expectations.
3. Avoid overlapping write scopes between concurrent agents.
4. Review and integrate the result in the main agent.
5. Run final verification from the main task.

If a subagent times out or fails, preserve useful partial findings and continue directly when practical. Retry or decompose only when that is more efficient than completing the work in the main agent.

## Implementation Rules

- Track multi-step implementation with the available todo or plan tool when useful.
- Make the minimum approved change; avoid speculative abstractions and adjacent cleanup.
- Reuse existing helpers, types, modules, patterns, libraries, and standard tools before adding new structures.
- Search for callers before changing shared functions, classes, APIs, or schemas.
- Remove imports or variables made unused by the current change, without deleting unrelated pre-existing code.
- Preserve user changes and unrelated dirty-worktree content.

## Tool Call Shapes (Reference)

```text
edit { path: "/abs/path/file.ts", edits: [{ oldText: "...", newText: "..." }] }
read { path: "/abs/path/file.md" }
bash { command: "ls -la" }
write { path: "/abs/path/file.ts", content: "..." }
subagent { agent: "<agent-name>", cwd: "/path", task: "..." }
subagent { tasks: [ {agent: "<agent-a>", task: "..."}, ... ] }
subagent { agent: "worker", workerPackage: { objective, files: [...], changes, acceptance, verification } }
subagent { chain: [ {agent: "<agent-a>", task: "..."}, {agent: "<agent-b>", task: "..."} ] }
```
