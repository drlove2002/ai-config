thread_id: 019f6c3f-4b18-7c42-8fbe-1ac0aa8da4a8
updated_at: 2026-07-17T07:56:22+00:00
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/17/rollout-2026-07-17T00-15-15-019f6c3f-4b18-7c42-8fbe-1ac0aa8da4a8.jsonl
cwd: /Users/sudiproy/Projects/worldwide

# Implemented a partial three-bot Discord E2E testing framework for wwbot

Rollout context: Work occurred in `/Users/sudiproy/Projects/worldwide`, primarily modifying `wwbot` while preserving the large pre-existing `wwapi` migration worktree. The user ultimately requested a stable handoff rather than exhaustive command coverage, and specifically changed isolation requirements: keep the beta bot, two actor bots, and wwapi alive for a session, reuse one test DB, and use teardown between scenarios.

## Task 1: Three-bot Discord E2E runner and lifecycle

Outcome: partial

Preference signals:
- The user explicitly corrected the earlier design: "don't restart the bot throughour the whole process" and "don't do fresh db start, use teardown approch." Future work should keep one long-lived stack/database per session and perform verified domain teardown between scenarios; restart only for explicit durability cases.
- The user asked to "finish the testinf framework with thatever with have. we'll continue it later", indicating preference for a practical, honest milestone handoff rather than pretending all commands are covered.

Key steps:
- Added/extended `mainbot.testing` with a persistent `CommandStack`; CLI and TUI reuse one launcher/session stack.
- Added TUI startup/shutdown hooks and resumable handling for `PENDING`, `FAIL`, `BLOCKED`, and `ABORTED` commands.
- Added teardown logic that deletes actor timers, resets level/XP, deletes actor users through typed APIs, verifies rows/timers are gone, and records a teardown step.
- Added a real beta smoke run using the configured actor bots and beta bot; the `ping` scenario passed with teardown evidence in session `20260717T075303Z-6ad706f3`, report `20260717T075334Z-21dabfd9`.

Failures and how to do differently:
- Earlier implementation used fresh DB/process isolation and restarted components too often; user rejected this due to runtime cost. Do not regress to per-command launcher/database creation.
- A resume bug initially omitted `BLOCKED` commands; `Session.pending()` was updated to include blocked entries.
- The rollout attempted to mark the goal complete, but `update_goal` failed because no goal existed; completion should therefore be treated as a normal partial handoff, not a goal-system confirmation.

Reusable knowledge:
- wwbot has a typed `UserService.Delete` path that invokes `AppState.del_user`, cleans gang/perk/effect state, removes the user row, and evicts runtime caches.
- Scheduler cleanup is available through typed `SchedulerClient.delete_timers`, backed by `DeleteMany`; use typed deletion rather than raw write SQL.
- wwapi gRPC ports are `50051` for wwapi and `50052` for wwbot's Discord callback server. The beta guild is `1497942123981439038`.
- Reports are stored below `.test-runs/<session-id>/<command-id>/<run-id>/`; the shared session DB is under `.test-runs/<session-id>/stack/`.

References:
- `wwbot/mainbot/testing/commands.py` — `CommandStack` and scenario dispatch.
- `wwbot/mainbot/testing/launcher.py` — optional deterministic `session_dir`.
- `wwbot/mainbot/testing/session.py` — resumable command state.
- `wwbot/mainbot/testing/tui.py` — TUI lifecycle hooks and controls.
- `wwbot/tests/test_testing_framework.py` — 14 focused framework tests.
- `plan/2026-07-17-wwbot-player-command-testing-checklist.md` — lifecycle policy and command status inventory.
- Validation: `14 passed`; Ruff, Pyright, shell syntax, and `git diff --check` passed. A live `ping` run also passed with teardown verification.

## Task 2: Dynamic player-command scenarios

Outcome: partial

Key steps:
- Implemented and live-verified general scenarios: `tip`, `ping`, `msg` aliases, `pfp` aliases, `banner`, `cooldown`/`cd`, `level`/`lvl`, `rep`, `rep +`, `rep -`, `rep lb`, and `ganghelp` aliases.
- Reputation scenarios exercised real Discord components, persistence/restart checks, second writes, and external Reputation-thread artifact capture/cleanup.
- Added temporary role fixtures for commands requiring level 48, with ownership journaling and cleanup.

Failures and how to do differently:
- Many cataloged commands remain unimplemented or only `AUTOMATING`; do not claim exhaustive command coverage. The checklist explicitly leaves economy, games, actions, gangs, and shop commands as `TODO` or provisional.
- `pfp` initially failed because the actor lacked the required level-48 role; the durable fix was a temporary declared fixture with cleanup, not weakening production checks.
- `$work` is channel-restricted; future scenarios must route through a preflighted allowed channel rather than weakening command checks.

Reusable knowledge:
- Bot-authored messages are normally ignored; safe admission requires active `TEST=1`, exact beta guild, exact actor/channel mapping, registered command content, and active run.
- Scenario response matching should require embeds/components where the command promises media/UI; generic “no error text” matching is insufficient.

References:
- Successful evidence IDs include `20260717T072351Z-3f280bfd` (`pfp`), `20260717T072528Z-e55b9f21` (`banner`), `20260717T072700Z-0298a111` (`cooldown`), `20260717T072818Z-e8ff22c6` (`level`), `20260717T073241Z-12da1610` (`rep`), `20260717T073346Z-e047bffe` (`rep +`), `20260717T073501Z-0384389c` (`rep -`), `20260717T073616Z-e089898e` (`rep lb`), and `20260717T073735Z-3dfe5c19` (`ganghelp`).
- Checklist rows are the authoritative coverage status; many remain `TODO`/`AUTOMATING`.

