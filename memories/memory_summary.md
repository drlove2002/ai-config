v1

## User Profile

Works across Worldwide's WWAPI Rust/Turso storage, wwbot Discord flows, and WWPAGE Next.js UI. For material changes, they want design discussion and a locked plan before implementation, then readable modular code for manual review before any commit or deployment. They value production-scale evidence, explicit scope control, and portable home-relative project paths. They run AI configuration from `/Users/sudiproy/.config/ai` and expect the main agent to own work unless a subagent brings a concrete benefit.

## User preferences

- “I need main to be self sufficient and only use subagent when needed.” Keep ownership, integration, and verification with the main agent; delegate only for a concrete benefit.
- For substantial work: “discuss → lock the plan → You do all the coding → I’ll read all of the code … commit only after your approval.”
- Preserve approved scope and simple policies. For migrations, use read-only reconnaissance and wait for explicit approval before edits; avoid unrelated deployment-script changes.
- For production-risk work, “find the causes and fix it one by one”: measure on disposable production-sized Linux copies, distinguish verified causes from open risks, and do not push or touch production without approval.
- Prefer modular, easy-to-read code, no unnecessary additions, and shared components/data paths over duplicated implementations.
- Use `$HOME/Projects/worldwide/plan/` for Worldwide plans, issues, and postmortems.

## General Tips

- Start Worldwide work with current status/diff and canonical schema/contracts; rollout facts can describe uncommitted or superseded designs.
- For WWAPI checks blocked by unrelated debt, report targeted compilation/tests separately from repository-wide Clippy or wwbot pytest failures.
- Turso/SQLite lock work requires short transaction topology, whole-transaction retry for MVCC serialization conflicts, and measured retention batches.
- For WWPAGE role rosters, WWAPI serves ascending `granted_at`; shared frontend mapping must preserve it then sort newest-first for the grid.

## What's in Memory

### /Users/sudiproy/Projects/worldwide/wwpage

#### 2026-07-21

- Weekly role badges and shared roster UI: granted_at, GetRoleMembersByKinds, role-list.ts, src/components/roster, roster.module.css, newest-first
  - desc: WWPAGE Speakers/Chatters timestamp flow, badge geometry, shared components, and order regression coverage.
  - learnings: retain Unix-second `grantedAt`, reject invalid timestamps, and sort shared `roleSince` descending for top-left newest cards.

### /Users/sudiproy/Projects/worldwide

#### 2026-07-19

- Atomic user backup and bounded reconciliation: backup_user_at, restore_user_at, backup/user.rs, InactiveUsers, TimerKey::UsageReset, level() > 10
  - desc: Locked WWAPI/wwbot/wwpage backup rules, uncommitted implementation, reputation/timer transfer, and targeted validation boundaries.
  - learnings: `backup` stays singular while generic KV remains `backups`; cleanup handles 100 rows/transaction and reconciliation caps runs at 1,000 operations.

- Archive CPU/RAM and Turso retention: leaderboard_archive.rs, unarchived_days, DELETE LIMIT 100000, Vec<Vec<DeltaRow>>, -wal, x86_64-unknown-linux-musl
  - desc: Linux production-copy investigation of retention, false streaming, Parquet safety, and WAL recovery/contention.
  - learnings: retention deletes form the confirmed bottleneck; measure much smaller batches before a production change.

### /Users/sudiproy/Projects/worldwide/wwapi

#### 2026-07-17

- Toasty/Turso MVCC migration and cookie archival: concurrent_writes, BEGIN CONCURRENT, migrate.rs, cookie_events, archive_next_completed_cookie_day
  - desc: SQLx/SQLite replacement rationale, migration rehearsal, MVCC constraints, beta checklist, and incomplete one-day cookie archive backfill.
  - learnings: transaction topology caused SQLite self-locking; do not claim final cookie archival completion without rerunning its aborted focused test.

### /Users/sudiproy/Projects/worldwide/wwbot

#### 2026-07-17

- Three-bot Discord E2E runner: CommandStack, Session.pending, SchedulerClient.delete_timers, UserService.Delete, .test-runs
  - desc: Long-lived beta stack/session teardown and partial player-command coverage.
  - learnings: reuse one DB and live stack per session; hand off unimplemented economy/game/action coverage honestly.

### Older Memory Topics

#### /Users/sudiproy/Projects/worldwide

- Redis removal, reputation leaderboard, and SQLite lock handling: DeathWishExpiry, GrappleHeist, RepLeaderboard, ww2, _sqlx_migrations, deplay.sh
  - desc: cwd=/Users/sudiproy/Projects/worldwide. Approval-gated gang-state migration plan, completed reputation UI, and safe production lock investigation.

#### /Users/sudiproy/.config/ai

- Autonomy-first orchestration and Worldwide paths: extensions/pi-rules.ts, orchestrator, subagent, $HOME/Projects/worldwide/plan, PYTHONPYCACHEPREFIX
  - desc: cwd=/Users/sudiproy/.config/ai. Active prompt routing source, optional-delegation policy, portable plan path, and restricted Python-cache workaround.
