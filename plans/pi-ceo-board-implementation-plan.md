# Pi CEO Board — Implementation Plan

## Purpose

Build a Pi extension/package that turns a Markdown plan file into an autonomous, web-managed ticket execution system.

The system should:

- Start a local webapp from a Pi extension.
- Parse a provided `plan.md` into implementation tickets.
- Display those tickets on a Trello/Jira-like animated Kanban board.
- Let Pi agents work tickets one by one or in parallel.
- Show active agents, logs, CLI output, tool calls, touched files, diffs, comments, questions, and validation status.
- Let the user answer questions or add comments from the browser.
- Move tickets through the board automatically as work progresses.
- Persist state so the board can resume after restart.
- Enforce proof-based completion: no ticket moves to `Done` without validation output.

This plan is written for an implementation agent. Follow it sequentially. Do not skip validation gates.

---

## Non-goals for v1

Do not build everything at once.

The first working version does **not** need:

- Full parallel worker execution.
- Git worktree merge queues.
- Complex auth.
- Cloud deployment.
- Rust backend.
- Perfect IDE-grade code browsing.
- Mobile optimization.

The MVP must prove the control loop:

```text
plan.md -> tickets -> web board -> realtime updates -> ticket execution state
```

Add autonomous worker execution after the board and persistence layer are stable.

---

## Recommended technology stack

### Extension/control plane

Use TypeScript.

Reason:

- Pi extensions are TypeScript modules.
- The extension can directly register commands, tools, event hooks, and interact with Pi runtime APIs.
- TypeScript avoids a Rust bridge for v1.
- Rust can be added later as an optional high-performance daemon.

### Web frontend

Use:

```text
React
Vite
TypeScript
Tailwind CSS
Framer Motion
Zustand or TanStack Query
Monaco Editor or CodeMirror
xterm.js
React Flow
```

### Local backend

Use a Node HTTP server inside the extension process or spawned by the extension.

Recommended packages:

```text
fastify
@fastify/static
ws
better-sqlite3
zod
nanoid
open
```

If Pi’s runtime already provides compatible helpers for process execution, prefer them over raw `child_process`.

### Persistence

Use SQLite.

Database location:

```text
.pi/ceo-board/ceo-board.sqlite
```

Additional generated state:

```text
.pi/ceo-board/
  ceo-board.sqlite
  logs/
  sessions/
  worktrees/
  web/
```

### Worker agents

Use Pi RPC mode for worker agents.

The extension should spawn child processes roughly like:

```bash
pi --mode rpc --session-dir .pi/ceo-board/sessions --no-session
```

Later versions can use persistent per-ticket session files.

---

## Package layout

Create a Pi package named `pi-ceo-board`.

Target structure:

```text
pi-ceo-board/
  package.json
  README.md

  extensions/
    ceo-board.ts

  skills/
    ceo-board-orchestration/
      SKILL.md

  src/
    extension/
      commands.ts
      tools.ts
      lifecycle.ts
      config.ts

    server/
      startServer.ts
      routes.ts
      websocket.ts
      staticAssets.ts
      auth.ts

    db/
      db.ts
      schema.sql
      migrations.ts
      repositories.ts

    tickets/
      model.ts
      transitions.ts
      dependencyGraph.ts
      ticketStore.ts

    orchestrator/
      ingestPlan.ts
      scheduler.ts
      prompts.ts
      validation.ts

    agents/
      rpcClient.ts
      workerProcess.ts
      workerPool.ts
      eventParser.ts
      workerPrompts.ts

    git/
      diffs.ts
      fileRefs.ts
      fileLocks.ts
      worktrees.ts

    events/
      eventBus.ts
      eventTypes.ts
      publish.ts

    logs/
      logStore.ts
      streamBuffer.ts

  web/
    package.json
    index.html
    vite.config.ts
    src/
      main.tsx
      App.tsx
      styles.css

      api/
        client.ts
        socket.ts
        types.ts

      store/
        boardStore.ts

      components/
        AppShell.tsx
        CommandCenter.tsx
        KanbanBoard.tsx
        KanbanColumn.tsx
        TicketCard.tsx
        TicketDrawer.tsx
        AgentFleet.tsx
        LogStream.tsx
        CodeViewer.tsx
        DiffViewer.tsx
        QuestionCenter.tsx
        DependencyGraph.tsx
        Timeline.tsx
        StatusBadge.tsx
        EmptyState.tsx
```

Package manifest should expose the extension and optional skill:

```json
{
  "name": "pi-ceo-board",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  }
}
```

---

## Extension commands

Register these commands.

### `/ceo start <plan.md> [--port 7777] [--host 127.0.0.1]`

Starts the server and dashboard, initializes project state, ingests the plan, and creates tickets.

Behavior:

1. Resolve the plan path relative to `ctx.cwd`.
2. Verify the file exists.
3. Initialize `.pi/ceo-board/`.
4. Initialize SQLite schema.
5. Start local web server.
6. Print/open dashboard URL.
7. Ask main Pi agent to convert the plan into tickets by calling board tools.
8. Stream ticket creation events to the UI.

### `/ceo serve [--port 7777] [--host 127.0.0.1]`

Starts only the web server and resumes persisted board state.

### `/ceo stop`

Stops the web server and worker agents.

### `/ceo status`

Prints:

- server status
- dashboard URL
- project status
- ticket counts
- active workers
- unresolved questions

### `/ceo open`

Opens the dashboard URL in the browser.

### `/ceo pause`

Pauses scheduling new tickets. Running workers may continue unless explicitly configured otherwise.

### `/ceo resume`

Resumes scheduling.

### `/ceo run-next`

Runs the next ready ticket with a single worker.

### `/ceo run-all [--max-agents N]`

Runs available ready tickets. For MVP, reject `N > 1` with a clear message until parallel execution is implemented.

### `/ceo reset`

Destructive. Requires confirmation. Clears `.pi/ceo-board/` state for the current project.

---

## Model-callable extension tools

Register these tools through `pi.registerTool()`.

### `create_ticket`

Used by the main agent when converting `plan.md` into tickets.

Input:

```ts
{
  title: string;
  description: string;
  type: "feature" | "bug" | "refactor" | "test" | "docs" | "infra" | "research";
  priority: "low" | "medium" | "high" | "critical";
  acceptanceCriteria: string[];
  dependencies?: string[];
  likelyFiles?: string[];
  validationCommands?: string[];
  parallelizable?: boolean;
  risk?: "low" | "medium" | "high";
}
```

Behavior:

- Creates a ticket in SQLite.
- Emits `ticket.created`.
- Returns the ticket ID.

### `update_ticket`

Input:

```ts
{
  ticketId: string;
  patch: {
    title?: string;
    description?: string;
    priority?: string;
    acceptanceCriteria?: string[];
    dependencies?: string[];
    likelyFiles?: string[];
    validationCommands?: string[];
    parallelizable?: boolean;
    risk?: string;
  };
}
```

Behavior:

- Updates the ticket.
- Emits `ticket.updated`.

### `move_ticket`

Input:

```ts
{
  ticketId: string;
  status: TicketStatus;
  reason?: string;
}
```

Behavior:

- Validates legal transition.
- Updates ticket status.
- Emits `ticket.moved`.

### `add_ticket_comment`

Input:

```ts
{
  ticketId: string;
  author: "agent" | "user" | "system";
  body: string;
}
```

Behavior:

- Adds a comment.
- Emits `comment.created`.

### `raise_user_question`

Input:

```ts
{
  ticketId?: string;
  agentId?: string;
  severity: "info" | "warning" | "blocking";
  question: string;
  options?: string[];
  recommendation?: string;
}
```

Behavior:

- Creates a question.
- If severity is `blocking`, moves ticket to `Waiting for User`.
- Emits `question.created`.
- Browser shows alert/notification.

### `record_agent_log`

Input:

```ts
{
  ticketId?: string;
  agentId?: string;
  stream: "stdout" | "stderr" | "system" | "tool" | "thought";
  line: string;
}
```

Behavior:

- Stores log line.
- Emits `log.created`.

### `record_file_reference`

Input:

```ts
{
  ticketId: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "read" | "modified" | "created" | "deleted" | "referenced";
  note?: string;
}
```

Behavior:

- Stores file reference.
- Emits `file.reference.created`.

### `record_diff`

Input:

```ts
{
  ticketId: string;
  filePath?: string;
  diffText: string;
}
```

Behavior:

- Stores diff.
- Emits `diff.created`.

### `record_validation_result`

Input:

```ts
{
  ticketId: string;
  command: string;
  exitCode: number;
  output: string;
  passed: boolean;
}
```

Behavior:

- Stores validation result.
- Emits `validation.recorded`.
- If all required validations pass, ticket may move to `Review` or `Done`.

### `finish_ticket`

Input:

```ts
{
  ticketId: string;
  summary: string;
  validationSummary: string;
  filesChanged: Array<{
    path: string;
    summary: string;
  }>;
}
```

Behavior:

- Refuse completion if required validation results are missing.
- Move ticket to `Done` only if validation passed.
- Otherwise move to `Review` or `Blocked`.
- Emits `ticket.finished`.

### `block_ticket`

Input:

```ts
{
  ticketId: string;
  reason: string;
  recoverable: boolean;
}
```

Behavior:

- Moves ticket to `Blocked`.
- Emits `ticket.blocked`.

---

## Ticket statuses

Use this enum:

```ts
type TicketStatus =
  | "Backlog"
  | "Ready"
  | "Planning"
  | "In Progress"
  | "Waiting for User"
  | "Review"
  | "Testing"
  | "Done"
  | "Blocked"
  | "Cancelled";
```

Legal transitions:

```text
Backlog -> Ready
Ready -> Planning
Planning -> In Progress
In Progress -> Waiting for User
Waiting for User -> In Progress
In Progress -> Testing
Testing -> Review
Testing -> Done
Testing -> Blocked
Review -> Done
Review -> In Progress
Any -> Blocked
Any -> Cancelled
```

Rules:

- `Done` requires validation proof unless the ticket is explicitly marked as `docs` or `research`.
- `Waiting for User` requires at least one unresolved question.
- `Ready` requires dependencies to be complete.
- `In Progress` requires an assigned agent.

---

## SQLite schema

Create `src/db/schema.sql`.

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  plan_path TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  priority TEXT NOT NULL,
  risk TEXT,
  parent_id TEXT,
  assigned_agent_id TEXT,
  dependency_ids_json TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  likely_files_json TEXT NOT NULL DEFAULT '[]',
  validation_commands_json TEXT NOT NULL DEFAULT '[]',
  parallelizable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  pid INTEGER,
  rpc_session_file TEXT,
  current_ticket_id TEXT,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ticket_id TEXT,
  agent_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ticket_id TEXT,
  agent_id TEXT,
  severity TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  recommendation TEXT,
  status TEXT NOT NULL,
  answer TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS file_refs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  path TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  kind TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS diffs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  file_path TEXT,
  diff_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS validation_results (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  command TEXT NOT NULL,
  exit_code INTEGER NOT NULL,
  output TEXT NOT NULL,
  passed INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ticket_id TEXT,
  agent_id TEXT,
  stream TEXT NOT NULL,
  line TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

---

## HTTP API

Implement these routes.

### `GET /api/state`

Returns:

```ts
{
  project: Project | null;
  tickets: Ticket[];
  agents: Agent[];
  events: BoardEvent[];
  questions: Question[];
  comments: Comment[];
  fileRefs: FileRef[];
  diffs: DiffSummary[];
  validationResults: ValidationResult[];
}
```

### `GET /api/tickets/:id`

Returns full ticket detail.

### `POST /api/comments`

Input:

```ts
{
  ticketId: string;
  body: string;
}
```

Creates a user comment.

### `POST /api/questions/:id/answer`

Input:

```ts
{
  answer: string;
}
```

Stores answer, marks question answered, moves ticket out of `Waiting for User` if no other unresolved blocking questions remain, and sends answer to the assigned worker if one exists.

### `POST /api/tickets/:id/approve`

Moves ticket from `Review` to `Done`.

### `POST /api/orchestrator/pause`

Pauses scheduling.

### `POST /api/orchestrator/resume`

Resumes scheduling.

### `GET /api/files?path=...`

Reads a file under `ctx.cwd`.

Security:

- Normalize paths.
- Reject paths outside `ctx.cwd`.
- Do not expose arbitrary home directory files.

### `GET /api/diff/:ticketId`

Returns stored diffs for a ticket.

### `WS /events`

Push realtime events.

Event envelope:

```ts
{
  id: string;
  type: string;
  projectId: string;
  ticketId?: string;
  agentId?: string;
  payload: unknown;
  createdAt: string;
}
```

---

## Web UI requirements

The UI should feel like a polished mission-control dashboard.

### Visual language

Use:

- dark mode first
- glassmorphism panels
- subtle gradients
- animated status glows
- smooth card transitions
- realtime log streaming
- animated dependency lines
- clear alerts for user action

Do not make a plain CRUD app.

### Main screen layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Command Center                                              │
│ Project | Plan | Status | Agents | Progress | Open issues   │
├───────────────┬───────────────────────────┬─────────────────┤
│ Agent Fleet   │ Kanban Board              │ Question Center │
│               │                           │                 │
├───────────────┴───────────────────────────┴─────────────────┤
│ Timeline / Logs                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required components

#### `CommandCenter`

Shows:

- project name
- dashboard status
- plan path
- total tickets
- done count
- blocked count
- active agents
- unresolved questions
- scheduler state

#### `KanbanBoard`

Columns:

- Backlog
- Ready
- Planning
- In Progress
- Waiting for User
- Review
- Testing
- Done
- Blocked

Use horizontal scroll if needed.

#### `TicketCard`

Shows:

- ticket ID
- title
- priority
- risk
- assigned agent
- status
- progress indicator
- dependency count
- file count
- validation state

Animations:

- running card pulses
- blocked card glows red
- waiting card glows yellow
- completed card briefly sweeps green
- testing card shows animated progress stripe

#### `TicketDrawer`

Tabs:

```text
Overview
Plan
Logs
Files
Diff
Questions
Comments
Validation
Timeline
```

#### `AgentFleet`

Shows each worker:

- ID
- role
- status
- current ticket
- runtime
- last event
- current command
- log tail

#### `QuestionCenter`

Shows unresolved questions prominently.

User can:

- choose option
- write custom answer
- submit answer
- add comment
- mark non-blocking note resolved

#### `LogStream`

Use `xterm.js` or styled virtualized log list.

Features:

- filter by ticket
- filter by agent
- filter stdout/stderr/system/tool
- pause autoscroll
- copy logs

#### `CodeViewer`

Use Monaco or CodeMirror.

Features:

- read file content from backend
- highlight line references
- show file path
- show ticket notes
- show diff tab

#### `DependencyGraph`

Use React Flow.

Shows ticket dependency graph:

- nodes colored by status
- animated edges for active dependencies
- click node opens ticket drawer

---

## Plan ingestion prompt

When `/ceo start <plan.md>` runs, send this prompt to the main Pi session:

```text
You are initializing the Pi CEO Board from a Markdown plan.

Read the plan file at: <PLAN_PATH>

Create implementation tickets by calling the `create_ticket` tool.

Rules:
- Break work into small, independently verifiable tickets.
- Each ticket must have acceptance criteria.
- Each ticket must have validation commands where possible.
- Identify dependencies between tickets.
- Mark whether each ticket is safe to run in parallel.
- Include likely files/modules if inferable.
- Do not start implementation yet.
- Only create tickets and summarize the resulting plan.

After creating all tickets, produce a concise summary:
- total tickets
- critical path
- parallelizable groups
- main risks
- first recommended ticket
```

Important:

- The agent should use `create_ticket`.
- The extension should track whether ticket creation occurred.
- If no tickets are created, show an error and do not proceed.

---

## Worker prompt

When assigning a ticket to a worker, use:

```text
You are a Pi CEO Board worker agent.

Worker ID: <AGENT_ID>
Ticket ID: <TICKET_ID>
Project root: <CWD>

You must implement exactly this ticket and nothing else.

Ticket:
<title>
<description>

Acceptance criteria:
<criteria>

Likely files:
<files>

Validation commands:
<commands>

Rules:
1. Stay within ticket scope.
2. Before editing, inspect the relevant files.
3. If requirements are ambiguous, call `raise_user_question`.
4. Record important logs with `record_agent_log`.
5. Record files read or modified with `record_file_reference`.
6. After changes, record the diff with `record_diff`.
7. Run validation commands.
8. Record validation results with `record_validation_result`.
9. Only call `finish_ticket` after validation has passed or the ticket is docs/research-only.
10. If blocked, call `block_ticket` with the reason.

Do not claim the ticket is complete without proof.
```

---

## Scheduler

### MVP scheduler

Single worker only.

Algorithm:

```text
while scheduler is running:
  find first Ready ticket
  if no Ready ticket:
    if all tickets Done/Blocked/Cancelled:
      stop
    else:
      wait
  assign ticket to worker
  move Ready -> Planning
  run worker
  wait for worker completion
  recompute Ready tickets
```

### Ready calculation

A ticket is ready when:

```text
status is Backlog
all dependency tickets are Done
no unresolved blocking questions exist
```

Then move it to `Ready`.

### Later parallel scheduler

Only after MVP:

```text
maxAgents = config.maxAgents
readyTickets = dependency-ready tickets
filter out tickets with file lock conflicts
spawn workers until maxAgents reached
```

---

## File-lock strategy for parallel mode

Do not implement in MVP, but design for it.

Each ticket has likely files. When a worker starts:

```text
lock each likely file path/pattern
```

If another ready ticket overlaps locked files, keep it waiting.

For stronger isolation, use git worktrees:

```text
.pi/ceo-board/worktrees/T-001
.pi/ceo-board/worktrees/T-002
```

Each worker runs in its own worktree and produces a diff. The orchestrator merges completed work one ticket at a time.

---

## Git integration

### MVP

Use current working tree only.

Implement:

- `git diff -- <files>` after ticket work.
- Store diff.
- Show diff in UI.

### Later

Add:

- branch per ticket
- worktree per worker
- merge queue
- conflict detection
- rollback

---

## Validation rules

A ticket cannot move to `Done` unless:

- it has no validation commands, and type is `docs` or `research`; or
- all validation commands have a passing result.

If validation fails:

- Move `Testing -> Blocked`.
- Store command output.
- Show failure in UI.
- Let user rerun or send ticket back to `In Progress`.

Completion check:

```ts
function canFinishTicket(ticket, validationResults) {
  if (ticket.type === "docs" || ticket.type === "research") {
    return true;
  }

  const commands = ticket.validationCommands;
  if (commands.length === 0) {
    return false;
  }

  return commands.every(command =>
    validationResults.some(result =>
      result.command === command && result.passed
    )
  );
}
```

---

## Event model

Every meaningful action should emit an event.

Required event types:

```text
project.created
server.started
server.stopped

ticket.created
ticket.updated
ticket.moved
ticket.assigned
ticket.started
ticket.finished
ticket.blocked

agent.spawned
agent.started
agent.log
agent.idle
agent.failed
agent.stopped

question.created
question.answered

comment.created

file.reference.created
diff.created
validation.recorded

scheduler.paused
scheduler.resumed
scheduler.completed
```

Events must be:

- persisted in SQLite
- broadcast over WebSocket
- used by frontend to update state

---

## Security requirements

Local network mode is risky. Implement basic safety.

Defaults:

```text
host = 127.0.0.1
port = 7777
```

If host is `0.0.0.0`:

- generate random token
- print full URL with token
- require token for HTTP and WebSocket
- warn user that local network access is enabled

Path safety:

- file APIs must reject paths outside project root
- never expose arbitrary home directory files
- never serve `.env` contents unless explicitly allowed later

Dangerous actions:

- `/ceo reset` requires confirmation
- stopping workers requires confirmation if workers are active
- deleting DB requires confirmation

---

## Config

Support config file:

```text
.pi/ceo-board/config.json
```

Schema:

```json
{
  "host": "127.0.0.1",
  "port": 7777,
  "autoOpen": true,
  "maxAgents": 1,
  "allowLocalNetwork": false,
  "requireApprovalForDone": false,
  "validationRequired": true,
  "useWorktrees": false,
  "theme": "dark"
}
```

CLI args override config.

---

## Companion skill

Create a skill:

```text
skills/ceo-board-orchestration/SKILL.md
```

Frontmatter:

```yaml
---
name: ceo-board-orchestration
description: use when converting markdown implementation plans into ticket-based autonomous work for a pi ceo board. applies to tasks that need creating tickets, dependency ordering, acceptance criteria, validation commands, user questions, worker-agent execution, ticket status updates, and proof-based completion through board tools.
---
```

Body should instruct agents to:

- split plans into small tickets
- create acceptance criteria
- define validation commands
- prefer explicit dependencies
- mark parallelizable tickets
- ask questions instead of guessing
- update board tools whenever status changes
- never call `finish_ticket` without validation proof
- record files, diffs, logs, and comments

---

## Implementation phases

## Phase 0 — Repository setup

Tasks:

1. Create package structure.
2. Add root `package.json`.
3. Add extension entry file.
4. Add web app skeleton.
5. Add TypeScript config.
6. Add build scripts.

Acceptance criteria:

- `npm install` succeeds.
- `npm run build` succeeds.
- Extension can be loaded by Pi with `pi -e ./extensions/ceo-board.ts`.
- `/ceo status` works and reports no active board.

Validation commands:

```bash
npm install
npm run build
pi -e ./extensions/ceo-board.ts
```

---

## Phase 1 — Server and static webapp

Tasks:

1. Implement `startServer`.
2. Serve web `dist`.
3. Implement `/api/state`.
4. Implement WebSocket `/events`.
5. Register `/ceo start`, `/ceo serve`, `/ceo stop`, `/ceo open`, `/ceo status`.
6. Add `server.started` and `server.stopped` events.

Acceptance criteria:

- `/ceo serve` starts dashboard.
- Browser loads dashboard.
- `/api/state` returns JSON.
- WebSocket connects.
- `/ceo stop` stops server.

Validation commands:

```bash
npm run build
pi -e ./extensions/ceo-board.ts
curl http://127.0.0.1:7777/api/state
```

---

## Phase 2 — SQLite persistence

Tasks:

1. Add schema.
2. Add DB initialization.
3. Add repositories for projects, tickets, events, agents, questions, comments, logs, file refs, diffs, validations.
4. Add event persistence and broadcasting.
5. Load persisted state on server restart.

Acceptance criteria:

- DB file appears at `.pi/ceo-board/ceo-board.sqlite`.
- Events persist.
- Tickets persist after server restart.
- `/api/state` returns persisted state.

Validation commands:

```bash
npm run build
npm test
```

---

## Phase 3 — Manual ticket board

Tasks:

1. Implement `create_ticket`, `update_ticket`, `move_ticket`, `add_ticket_comment`.
2. Implement Kanban UI.
3. Implement ticket drawer.
4. Implement comment UI.
5. Implement realtime updates.

Acceptance criteria:

- Calling `create_ticket` creates a card.
- Moving a ticket updates board live.
- Comments appear in drawer.
- Refreshing page preserves state.

Validation commands:

```bash
npm run build
npm test
```

Manual validation:

- Start Pi extension.
- Create ticket through tool call or test harness.
- Confirm board updates.

---

## Phase 4 — Plan ingestion

Tasks:

1. Implement `/ceo start <plan.md>`.
2. Read and validate plan path.
3. Send plan ingestion prompt to main Pi agent.
4. Ensure agent creates tickets with `create_ticket`.
5. Show ingestion progress in UI.
6. Summarize created tickets.

Acceptance criteria:

- Given a Markdown plan, board fills with tickets.
- Tickets have acceptance criteria.
- Tickets have dependencies where needed.
- Tickets have validation commands where possible.
- No implementation starts automatically unless explicitly requested.

Validation:

Use a sample plan:

```markdown
# Sample Plan

Build a notes app with:
- SQLite schema
- REST API
- React UI
- tests
```

Expected:

- At least 4 tickets.
- Ticket dependencies are sensible.
- UI updates live.

---

## Phase 5 — Questions and user feedback

Tasks:

1. Implement `raise_user_question`.
2. Add `questions` table integration.
3. Add browser `QuestionCenter`.
4. Add answer endpoint.
5. Add blocking ticket transition.
6. Send browser answers back to current worker or main session.

Acceptance criteria:

- Agent can raise a question.
- Browser shows alert.
- Ticket moves to `Waiting for User` for blocking questions.
- User answers in browser.
- Ticket resumes after answer.

Validation:

- Simulate `raise_user_question`.
- Answer from browser.
- Confirm state changes.

---

## Phase 6 — Logs and file references

Tasks:

1. Implement `record_agent_log`.
2. Implement `record_file_reference`.
3. Add log viewer.
4. Add file references tab.
5. Add safe file read API.
6. Add code viewer with line highlighting.

Acceptance criteria:

- Logs stream live.
- Ticket drawer shows logs.
- File refs appear with path and line ranges.
- Clicking file ref opens code viewer.
- File API cannot read outside project root.

Validation:

- Try reading a safe project file.
- Try reading `../../.env`; must fail.

---

## Phase 7 — Diffs and validation

Tasks:

1. Implement `record_diff`.
2. Implement `record_validation_result`.
3. Add diff viewer.
4. Add validation tab.
5. Enforce completion rule in `finish_ticket`.
6. Implement `block_ticket`.

Acceptance criteria:

- Diff appears in UI.
- Validation output appears in UI.
- Ticket cannot move to `Done` without passing validation unless docs/research.
- Failed validation moves or keeps ticket out of `Done`.

Validation:

- Attempt `finish_ticket` without validation. It must fail.
- Record passing validation, then finish. It must succeed.

---

## Phase 8 — Single worker RPC execution

Tasks:

1. Implement RPC child process client.
2. Spawn one worker.
3. Send worker prompt for one ticket.
4. Parse worker JSON events.
5. Stream stdout/stderr/logs to UI.
6. Let worker use board tools.
7. Mark agent status.
8. Implement `/ceo run-next`.

Acceptance criteria:

- `/ceo run-next` assigns a ready ticket.
- Worker process starts.
- Agent appears in AgentFleet.
- Logs stream live.
- Ticket moves through Planning/In Progress/Testing/Done or Blocked.
- Worker exits cleanly.

Validation:

- Run with a tiny safe ticket.
- Confirm file changes and validation result.

---

## Phase 9 — Scheduler

Tasks:

1. Implement dependency readiness.
2. Move eligible Backlog tickets to Ready.
3. Implement scheduler loop.
4. Implement `/ceo run-all`.
5. Implement pause/resume.
6. Stop when all tickets terminal.

Acceptance criteria:

- Tickets run in dependency order.
- Scheduler waits on blocked tickets.
- Pause prevents new assignments.
- Resume continues.
- Completion summary appears when done.

Validation:

- Create tickets A -> B -> C.
- Run all.
- Confirm order A, then B, then C.

---

## Phase 10 — Parallel workers

Only implement after single-worker mode is stable.

Tasks:

1. Add `maxAgents`.
2. Add file lock detection.
3. Spawn multiple workers for independent tickets.
4. Update AgentFleet UI.
5. Prevent overlapping likely file edits.
6. Show parallel/chained execution in UI.

Acceptance criteria:

- Independent tickets run in parallel.
- Dependent tickets wait.
- Conflicting likely files do not run together.
- UI shows which worker owns which ticket.

Validation:

- Create 4 independent tickets.
- Set `maxAgents: 2`.
- Confirm 2 run at once.
- Confirm others wait.

---

## Phase 11 — Git worktrees

Only implement after parallel mode is stable.

Tasks:

1. Create worktree per ticket.
2. Run worker inside worktree.
3. Capture diff.
4. Merge completed ticket back into main worktree.
5. Show merge conflicts in UI.
6. Add rollback.

Acceptance criteria:

- Each worker modifies isolated worktree.
- Completed work merges sequentially.
- Conflict blocks ticket and shows conflict details.

---

## Phase 12 — UI polish

Tasks:

1. Add Framer Motion board transitions.
2. Add animated status effects.
3. Add dependency graph animation.
4. Add timeline playback.
5. Add command palette.
6. Add keyboard shortcuts.
7. Add better empty/loading/error states.

Acceptance criteria:

- UI feels like a high-quality autonomous work control center.
- Important states are visually obvious.
- User questions are impossible to miss.

---

## Test strategy

### Unit tests

Test:

- ticket transitions
- dependency readiness
- validation completion rule
- DB repositories
- event broadcasting
- path normalization
- config loading

### Integration tests

Test:

- server starts/stops
- `/api/state`
- WebSocket receives events
- ticket creation through tool function
- question answer flow
- validation enforcement

### Manual tests

Run these scenarios:

1. Empty board start.
2. Plan ingestion creates tickets.
3. Manual ticket move.
4. Question raised and answered.
5. Logs streamed.
6. File ref opened.
7. Diff displayed.
8. Finish blocked without validation.
9. Finish allowed with validation.
10. Single worker executes safe ticket.

---

## Sample plan for testing

Create `examples/sample-plan.md`:

```markdown
# Sample Implementation Plan

Build a tiny notes feature.

## Requirements

- Add a SQLite table for notes.
- Add API routes to create and list notes.
- Add a React UI to display notes.
- Add tests for the API.
- Add README documentation.

## Constraints

- Keep changes small.
- Do not add authentication.
- Use existing project conventions.
```

Expected tickets:

1. Create notes schema.
2. Add notes API.
3. Add notes UI.
4. Add API tests.
5. Add README docs.

Expected dependencies:

```text
schema -> API -> UI
API -> tests
docs can run after API/UI
```

---

## Final acceptance criteria for MVP

The MVP is done when:

- User can run `/ceo start ./plan.md`.
- A local dashboard starts.
- The plan becomes tickets.
- Tickets appear on an animated Kanban board.
- State persists in SQLite.
- Comments/questions/logs can be created and viewed.
- Ticket status updates stream live.
- At least one ticket can be executed by a single worker through Pi RPC.
- The worker logs appear in the dashboard.
- The worker records files/diffs/validation.
- The ticket cannot move to `Done` without proof.
- `/ceo stop` shuts down server and workers cleanly.
- Build and tests pass.

---

## Implementation discipline

Follow these rules while building:

1. Do not guess Pi APIs. Inspect installed types or docs before using them.
2. Keep the first version small.
3. Prefer working vertical slices over broad incomplete scaffolding.
4. Every phase must end with a runnable system.
5. Do not implement parallelism until single-worker mode is reliable.
6. Do not implement Rust until TypeScript MVP is stable.
7. Do not claim success without running validation.
8. If a requirement is unclear, create a browser/user question instead of guessing.
9. Persist all important events.
10. Make the UI operational, not decorative.

---

## Suggested first agent instruction

Use this as the first prompt to the implementing agent:

```text
Implement Phase 0 and Phase 1 from `pi-ceo-board-implementation-plan.md`.

Scope:
- Create the Pi package structure.
- Register `/ceo serve`, `/ceo stop`, `/ceo status`, and `/ceo open`.
- Start a local Fastify server on 127.0.0.1:7777.
- Serve a minimal React/Vite dashboard.
- Implement `/api/state`.
- Implement WebSocket `/events`.
- Add basic build scripts.
- Run build and basic validation.

Do not implement ticket ingestion or worker agents yet.
After implementation, show changed files and validation output.
```
