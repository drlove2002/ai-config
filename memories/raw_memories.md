# Raw Memories

Merged stage-1 raw memories (stable ascending thread-id order):

## Thread `019f69e1-da72-7640-a9ba-ebb433a3bab8`
updated_at: 2026-07-16T07:52:38+00:00
cwd: /Users/sudiproy/.config/ai
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T13-13-57-019f69e1-da72-7640-a9ba-ebb433a3bab8.jsonl
rollout_summary_file: 2026-07-16T07-43-57-DbWo-autonomy_first_orchestration_home_relative_worldwide_plan.md

description: Updated Pi orchestration so the main agent owns work by default, with optional subagents, and moved Worldwide plan/issue paths to $HOME/Projects/worldwide/plan/.
task: change orchestrator delegation policy and Worldwide plan paths
task_group: ai-config-orchestration
 task_outcome: success
cwd: /Users/sudiproy/.config/ai
keywords: pi-rules, orchestrator, subagent, autonomy-first, worldwide-guardrails, wwideas, plan-path, Path.home, PYTHONPYCACHEPREFIX

### Task 1: Make main agent self-sufficient

task: remove forced subagent routing thresholds from the active orchestration prompt and supporting rules
task_group: orchestration-policy
task_outcome: success

Preference signals:
- The user said: “I need main to be self sufficient and only use subagent when needed.” Similar tasks should keep the main agent responsible for inspection, planning, implementation, and verification; delegation should be optional and justified by concrete parallelism, specialist capability, context isolation, or explicit user request.

Reusable knowledge:
- `extensions/pi-rules.ts` injects the active identity/routing block into the system prompt on every turn. Mandatory routing was duplicated in `rules/orchestrator.md`, `AGENTS.md`, and `rules/worldwide-guardrails.md`; all were updated to avoid threshold-triggered delegation.
- Plan approval, no-guessing, safety locks, and verification requirements were retained while removing forced scout → planner → worker → reviewer flows and the “5+ turns” trigger.
- The final orchestration policy says the main agent owns integration and final verification; subagent findings must be validated before reliance.

Failures and how to do differently:
- The rollout encountered a large pre-existing dirty worktree with many unrelated staged/unstaged changes. Do not treat the full status/diff as belonging to this task; preserve unrelated changes and inspect only intended files.

References:
- Files changed: `extensions/pi-rules.ts`, `rules/orchestrator.md`, `AGENTS.md`, `rules/worldwide-guardrails.md`.
- Validation command: `git diff --check` passed.

### Task 2: Move Worldwide plan and issue storage

task: replace stale wwideas and Linux-specific Worldwide paths
task_group: path-configuration
 task_outcome: success

Preference signals:
- The user corrected the proposed `/data/Projects/worldwide/plan/` path: “it lives in $HOME/Projects/worldwide”. Future references should use `$HOME/Projects/worldwide`, especially `$HOME/Projects/worldwide/plan/` for plans, issues, and postmortems.

Reusable knowledge:
- Updated `rules/worldwide-guardrails.md` and `skills/recover/SKILL.md` to use `$HOME/Projects/worldwide/plan/`.
- Updated `memories/nextjs-guidelines.md` from `/data/Projects/worldwide/wwpage/...` to `$HOME/Projects/worldwide/wwpage/...`.
- Updated `scripts/update-guardrails.py` to derive `WORLDWIDE_DIR = Path.home() / "Projects/worldwide"`, construct the session key dynamically, and avoid the old `--data-Projects-worldwide--` assumption.

Failures and how to do differently:
- The first `python3 -m py_compile scripts/update-guardrails.py` failed with a restricted-cache `PermissionError`; rerun with `PYTHONPYCACHEPREFIX=/tmp/ai-pycache`.

References:
- Successful syntax check: `env PYTHONPYCACHEPREFIX=/tmp/ai-pycache python3 -m py_compile scripts/update-guardrails.py`.
- Final consistency search found no affected references to `/data/Projects/worldwide` or `wwideas/issues/`.

## Thread `019f69ec-a06f-7f03-a160-cfb2e4d388ee`
updated_at: 2026-07-16T12:42:44+00:00
cwd: /Users/sudiproy/Projects/worldwide
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T13-25-43-019f69ec-a06f-7f03-a160-cfb2e4d388ee.jsonl
rollout_summary_file: 2026-07-16T07-55-43-Ol42-redis_removal_reputation_leaderboard_and_sqlite_lock.md

---
description: Cross-repo Redis-removal work, reputation leaderboard UI, and production SQLite migration-lock handling; key lesson is approval-gated read-only planning and correct production host verification.
task: cross-repo Redis removal and deployment-safe SQLite migration
task_group: worldwide/wwapi-wwbot-wwpage
task_outcome: partial
cwd: /Users/sudiproy/Projects/worldwide
keywords: Redis removal, gang_targets, DeathWishExpiry, GrappleHeist, ConsumeDeathWish, RepLeaderboard, ww2, _sqlx_migrations, database is locked, deplay.sh
---

### Task 1: Part 4 Redis-removal planning
task: plan migration of gang-item Redis state
task_group: wwapi/wwbot migration planning
task_outcome: partial

Preference signals:
- The user said “Part 4 planning only,” “Preserve it completely,” and “Wait for explicit approval before any edits” -> similar migration investigations should remain read-only until approval.
- The user required `git status --short` in every repo and `git log --oneline -10 -- <file>` before candidate-file discussion -> preserve this exact reconnaissance workflow.

Reusable knowledge:
- Existing uncommitted Part-4 draft touched `wwapi/src/state/gitem.rs`, `src/core/sqlite/gang_effect.rs`, `src/models/gang_effect.rs`, scheduler APIs/handlers/keys, migrations, and wwbot gang helpers/heists.
- Locked design separates DeathWish state (`death_wish`, `death_wish_remaining`, `ConsumeDeathWish`, `DeathWishExpiry`) from generic `gang_targets`; Grapple stake persists in `GrappleHeist` timer payload.
- Snap must remove DeathWish effects but not Grapple; Dream and Grapple use the Rust target cache; startup hydration and user/gang deletion cleanup are required.

Failures and how to do differently:
- Reconnaissance was extensive but the requested final planning report was not produced before the thread moved on. Stop after evidence gathering and present the blast radius, package order, risks, and verification plan.

References:
- Issue: `wwideas/issues/2026-07-12-wwapi-remove-redis.md`
- Key APIs: `GangService.ConsumeDeathWish`, `GangTargetActive`, `TimerKey::GrappleHeist`, `TimerKey::DeathWishExpiry`

### Task 2: Reputation leaderboard and responsive selector
task: add reputation leaderboard and make tab grid responsive
task_group: wwpage leaderboard UI
task_outcome: success

Reusable knowledge:
- Reputation UI was wired through existing `RepLeaderboard` gRPC and a new `rep` websocket room/broadcast path.
- Selector was changed to a consistent 3-column grid, fixing desktop gaps while retaining small-screen compact labels.
- Validation passed: `pnpm exec tsc --noEmit`; 159 Vitest tests; `cargo check --all-targets`; Rust formatting.

References:
- Commit: `78e9756 feat(leaderboard): make reputation rankings visible on the web`
- Main layout: `wwpage/src/app/(home)/leaderboard/view.tsx`

### Task 3: Production SQLite lock handling
task: remove production `_sqlx_migrations` and investigate migration lock
task_group: wwapi deployment operations
task_outcome: success

Preference signals:
- When the assistant proposed changing deployment ordering, the user said “no revert it” -> do not retain workflow-script changes without explicit approval.

Reusable knowledge:
- Correct production target is SSH alias `ww2`, database `/var/lib/wwapi/wwapi.sqlite`.
- Approved operation succeeded: `before=1 after=0` after `DROP TABLE IF EXISTS _sqlx_migrations`; no service restart.
- `script/deplay.sh` runs migrate before restarting wwapi, allowing the live process to hold SQLite locks. Error observed: `database is locked` after the 30-second busy timeout.

Failures and how to do differently:
- Earlier commands used SSH alias `ww` and returned no useful output; verify host identity before production operations.
- The proposed stop-before-migrate deployment change was reverted on request; leave `script/deplay.sh` unchanged unless explicitly asked.

References:
- Exact successful pattern: `ssh ww2 "python3 -c '... DROP TABLE IF EXISTS _sqlx_migrations ... print(f\"before={before} after={after}\")'"`
- Error: `SqliteError { code: 5, message: "database is locked" }`

## Thread `019f6a72-d16a-70b3-b6c5-d39b10f28dae`
updated_at: 2026-07-16T18:44:43+00:00
cwd: /Users/sudiproy/Projects/worldwide
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T15-52-17-019f6a72-d16a-70b3-b6c5-d39b10f28dae.jsonl
rollout_summary_file: 2026-07-16T10-22-17-f1AW-wwapi_turso_toasty_migration_and_beta_testing_plan.md

description: Investigated and implemented wwapi’s SQLx/classic SQLite to embedded Turso MVCC + Toasty migration plan, bounded leaderboard retention, and created a loop-based beta validation checklist; production cutover and Discord test-harness automation remain pending.
task: migrate wwapi persistence to Toasty/Turso MVCC and validate through wwbot/wwpage
 task_group: worldwide-database-migration
 task_outcome: partial
cwd: /Users/sudiproy/Projects/worldwide
keywords: wwapi, Toasty, Turso, MVCC, concurrent_writes, SQLx, SQLite, database-locked, leaderboard_deltas, Parquet, retention, wwbot, wwpage, beta-testing

### Task 1: Diagnose and plan persistence migration
task: identify SQLite/SQLx bottlenecks and define Toasty/Turso migration
 task_group: wwapi-database
 task_outcome: success

Preference signals:
- The user asked to "totally migrate from sqlx", use `concurrent_writes()`, plan together, and explain settings -> future responses should provide evidence-based architecture options and concrete settings before edits.
- The user preferred self-hosted Turso and was only conditionally open to Turso Cloud -> default to embedded/local Turso; treat Cloud as a separate later decision.
- The user wanted wwbot data inspection but accepted a read-only boundary -> never make direct bot access a normal live-database writer.

Reusable knowledge:
- Production SSH evidence showed a ~347 MB DB and ~4 MB WAL, but repeated 30-second SQLite code 5 `database is locked` failures on leaderboard deltas, user roles, timers, and cookie candles; pool acquisition stalled up to ~29 seconds. The main issue is transaction topology/self-contention, not file size.
- `sync_data` opened an outer transaction, then `sync_user` opened another transaction on another pooled connection for each user; role helpers also checked out fresh connections. The old pool had 5 connections while classic SQLite has one writer.
- Toasty Turso `.concurrent_writes()` enables MVCC and `BEGIN CONCURRENT`; serialization failures must retry the complete transaction. Do not combine MVCC with experimental multiprocess WAL.
- Starting settings documented in the plan: benchmark pool sizes 4/8/16 with 8 as initial, 2-second pool wait, 10-second creation timeout, 60-second health check, short transactions, whole-transaction retries.
- Use Toasty models for ordinary CRUD and typed raw SQL for ledgers/aggregates/reporting; do not expose dynamic Toasty values outside Store.

Failures and how to do differently:
- Initial SSH access failed with `Operation not permitted`; read-only elevated SSH was required.
- Do not propose retention environment variables when the user explicitly requested fixed policy.

References:
- `/Users/sudiproy/Projects/worldwide/plan/2026-07-16-libsql-toasty-migration.md`
- Error strings: `database is locked`, `SqliteError { code: 5 }`, `slow statement`, `slow_acquire_threshold_secs=2.0`

### Task 2: Implement leaderboard retention/archive
task: add fixed-retention leaderboard compaction and Parquet cold storage
 task_group: wwapi-leaderboard-maintenance
 task_outcome: success

Preference signals:
- User-approved fixed policy: raw deltas 7 days, daily aggregates 14 days, only latest completed weekly snapshot, Parquet indefinite -> encode constants; no `WWAPI_LB_*` environment variables.

Reusable knowledge:
- Added `leaderboard_daily`, `leaderboard_weekly`, and `leaderboard_archives` to `src/core/store/schema.sql`.
- Compaction writes Zstd Parquet atomically via temporary file + rename, records archive completion, aggregates completed days, refreshes the latest week, then deletes retained raw/daily rows with set-based SQL.
- Archive catalog prevents duplicate processing and ensures raw data is not deleted before successful archival.
- Added `src/core/store/leaderboard_archive.rs`, `src/core/tasks/leaderboard.rs`, external tests in `tests/store/leaderboard_archive.rs`, and a Criterion benchmark in `benches/workload/main.rs`.
- Full serial tests, concurrency, durability, import, integration, and clippy with `-D warnings` passed. Synthetic 10k-delta workflow measured about 1.13–1.17 seconds.

Failures and how to do differently:
- First archive test was red because missing APIs and an unavailable `tempfile` dependency; standard temp directories and incremental implementation fixed it.
- Broad `cargo fmt --all` reports generated protobuf differences; format touched handwritten files selectively.

References:
- `cargo test --all -- --test-threads=1`
- `cargo bench --bench store_workload`
- `wwapi/src/core/store/leaderboard_archive.rs`
- `wwapi/tests/store/leaderboard_archive.rs`
- `wwapi/benches/workload/main.rs`

### Task 3: Create beta verification checklist
task: create loop-based manual/integration testing plan
 task_group: migration-acceptance-testing
 task_outcome: success

Preference signals:
- User asked for a plan file that should "loop like a checklist" -> use repeatable loops with evidence capture and explicit stop conditions.

Reusable knowledge:
- Checklist path: `/Users/sudiproy/Projects/worldwide/plan/2026-07-16-turso-migration-testing-checklist.md`.
- It covers beta setup, economy, transfers, inventory, gangs, timers, leaderboards, market, wwpage reconnect, read-only `?eval`, concurrency, forced restarts, archive maintenance, and offline production-copy rehearsal.
- Acceptance requires two beta users, clean and forced restart tests, no lock/retry failures, Discord/website agreement, read-only SQL enforcement, production-copy verification, rollback artifacts, and explicit approval.

References:
- Operational DB workflow: `/Users/sudiproy/Projects/worldwide/wwapi/docs/database.md`
- Beta DB path: `wwapi/data/wwapi.sqlite`

### Task 4: Automate real-user Discord testing safely
task: design safe automation around two real Discord accounts
 task_group: wwbot-test-harness
 task_outcome: partial

Preference signals:
- User wants actual main/test Discord users involved in automated testing -> preserve real Discord interaction coverage while automating verification rather than logging in as users.

Reusable knowledge:
- Do not use user tokens, selfbots, Selenium/Playwright user-account login, or automated messages from normal Discord accounts.
- Safe design: manual-assisted mode where the user sends commands and a verifier checks wwapi/wwbot/wwpage state; or a beta/dev-only admin test harness that invokes the same backend methods for chosen Discord IDs.
- This harness was proposed but not implemented. Next work should inspect `wwbot/mainbot/cogs/dev/main.py` and add strict beta-only/admin-only safeguards if proceeding.

References:
- Existing command: `@command(name="eval", aliases=["exec", "e"], hidden=True)` in `wwbot/mainbot/cogs/dev/main.py`.
- Read-only query example: `await grpc.misc.sql_query("SELECT user_id, jar, vault FROM users ORDER BY jar DESC LIMIT 20")`.

## Thread `019f6c3f-4b18-7c42-8fbe-1ac0aa8da4a8`
updated_at: 2026-07-17T07:56:22+00:00
cwd: /Users/sudiproy/Projects/worldwide
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/17/rollout-2026-07-17T00-15-15-019f6c3f-4b18-7c42-8fbe-1ac0aa8da4a8.jsonl
rollout_summary_file: 2026-07-16T18-45-15-Ebji-wwbot_three_bot_e2e_runner_teardown_handoff.md

description: Partial implementation of wwbot’s three-bot Discord E2E runner; persistent session stack and teardown isolation were implemented and verified, but exhaustive command coverage remains incomplete.
task: implement-and-verify-wwbot-discord-e2e-runner
 task_group: wwbot testing framework
 task_outcome: partial
 cwd: /Users/sudiproy/Projects/worldwide/wwbot
 keywords: Discord E2E, TEST=1, beta guild 1497942123981439038, CommandStack, teardown, SchedulerClient.delete_timers, UserService.Delete, Textual TUI, resumable sessions, .test-runs

### Task 1: Persistent runner lifecycle and teardown

task: reuse one three-bot/wwapi stack and shared test DB per session with verified teardown
task_group: wwbot testing framework
task_outcome: partial

Preference signals:
- The user said: "don't restart the bot throughour the whole process" and "don't do fresh db start, use teardown approch." Similar future runs should keep one long-lived stack/database per session and teardown owned state between scenarios.
- The user said: "finish the testinf framework with thatever with have. we'll continue it later" -> provide an honest milestone with remaining work clearly marked, not a false claim of exhaustive completion.

Reusable knowledge:
- `CommandStack` in `mainbot/testing/commands.py` keeps one `Launcher` and coordinator alive; reports can use different command roots while the stack uses `session/stack`.
- `Session.pending()` must include `PENDING`, `FAIL`, `BLOCKED`, and `ABORTED` so blocked/failed scenarios can resume.
- Teardown uses typed scheduler deletion and `UserService.Delete`, then verifies actor rows and timers are absent through read-only SQL/TTL checks.
- Beta guild ID is `1497942123981439038`; wwapi listens on `127.0.0.1:50051`, and wwbot’s callback gRPC server uses `127.0.0.1:50052`.

Failures and how to do differently:
- The earlier per-command fresh DB/restart design was rejected by the user; do not restore it.
- `update_goal(status="complete")` failed because the thread had no goal; no goal-system completion was actually recorded.

References:
- `mainbot/testing/commands.py`, `launcher.py`, `session.py`, `tui.py`.
- Live shared-stack smoke: session `20260717T075303Z-6ad706f3`; report `20260717T075334Z-21dabfd9`; report included `state teardown: PASS` with actor rows/timers absent.
- Validation command results: `14 passed`; Ruff, Pyright, `bash -n scripts/e2e.sh`, and `git diff --check` passed.

### Task 2: Player command coverage

task: implement typed command scenarios and evidence for available player commands
task_group: Discord command E2E coverage
 task_outcome: partial

Reusable knowledge:
- Live-passed scenarios include `tip`, `ping`, `msg`/aliases, `pfp`/aliases, `banner`, `cooldown`/`cd`, `level`/`lvl`, `rep`, `rep +`, `rep -`, `rep lb`, and `ganghelp`/aliases.
- Reputation writes require checking state deltas, restart persistence, second-write behavior, and Reputation-thread artifacts.
- `pfp` requires level 48 or a qualifying role; use a temporary role fixture and ownership journal cleanup.
- `$work` is channel-restricted and must use an allowed scenario channel.

Failures and how to do differently:
- The framework is not exhaustive. Economy commands (`work`, `daily`, `weekly`, `rob`, `request`, `send`, `deposit`, `withdraw`, etc.), games, actions, gangs, and shop commands remain mostly `TODO` or provisional `AUTOMATING` in the checklist.

References:
- Authoritative status file: `plan/2026-07-17-wwbot-player-command-testing-checklist.md`.
- Representative evidence: `20260717T073346Z-e047bffe` (`rep +`), `20260717T073501Z-0384389c` (`rep -`), `20260717T073616Z-e089898e` (`rep lb`), `20260717T073735Z-3dfe5c19` (`ganghelp`).

## Thread `019f6f0b-16b9-79a3-ac7e-5600b0bacea2`
updated_at: 2026-07-17T08:39:42+00:00
cwd: /Users/sudiproy/Projects/worldwide
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/17/rollout-2026-07-17T13-17-05-019f6f0b-16b9-79a3-ac7e-5600b0bacea2.jsonl
rollout_summary_file: 2026-07-17T07-47-05-EYqC-wwapi_turso_toasty_migration_cookie_archive_backfill.md

---
description: Migrated wwapi persistence from SQLx/SQLite to local embedded Turso/Toasty MVCC, diagnosed SQLite self-locking, and added incremental cookie-event historical archival; final archival changes remain uncommitted/unverified.
task: migrate wwapi persistence to Toasty/Turso and backfill cookie-event Parquet archives
task_group: worldwide database migration and archival
 task_outcome: partial
cwd: /Users/sudiproy/Projects/worldwide/wwapi
keywords: wwapi, sqlx, sqlite, turso, toasty, concurrent_writes, MVCC, BEGIN CONCURRENT, database-is-locked, migrate.rs, cookie_events, parquet, leaderboard_deltas
---

### Task 1: Diagnose and migrate persistence
task: replace SQLx SQLite stack with Store/Toasty/Turso MVCC
task_group: wwapi database migration
task_outcome: success

Preference signals:
- The user wanted a collaborative plan with concrete settings and read-only production evidence -> inspect code, docs, and production logs before recommending migration topology.
- The user preferred not to use Turso Cloud unless necessary -> default to local embedded Turso.
- The user wanted wwbot data inspection without direct unsafe DB access -> use a bounded read-only wwapi/gRPC boundary.

Reusable knowledge:
- Production SQLite locking was caused primarily by nested/overlapping transactions and multiple pool contenders, not the 347 MB file or 4 MB WAL. `sync_data` opened an outer transaction, `sync_user` opened another connection transaction, and role helpers checked out more connections.
- Logs showed repeated 30-second waits and SQLite code 5 for `leaderboard_deltas`, `user_roles`, `timers`, and `cookie_candles`.
- Local Toasty Turso uses `.concurrent_writes()` for MVCC/`BEGIN CONCURRENT`; serialization conflicts require transaction-level retries. Do not enable multiprocess WAL with MVCC.
- `migrate.rs` imports a legacy SQLite file into a fresh target, checks row counts and foreign keys, and reopens through Turso. Full local rehearsal imported 46,237 users, 1,108,537 leaderboard deltas, and 304,138 cookie candles successfully.

Failures and how to do differently:
- Treat this as a transaction-topology problem first; a driver replacement alone will not fix self-contention.

References:
- Plan: `plan/2026-07-16-libsql-toasty-migration.md`
- Commits: `eadee69`, `2ef43ac`
- Import test: `cargo test --release --test import`

### Task 2: Incremental cookie-event archival
 task: backfill completed cookie-event days and run archival cooperatively in production
 task_group: wwapi cookie archive
 task_outcome: partial

Preference signals:
- The user explicitly narrowed scope: leaderboard archival was already migrated; only cookie-event backfill was wanted.
- The user asked for background execution that does not block other production work -> process one completed day per pass with a delay.

Reusable knowledge:
- `script/wwapi.service` already sets `WorkingDirectory=/home/admin/wwapi`; relative archive paths resolve under `/home/admin/wwapi/data/`.
- Cookie archive path is `./data/cookie_events/YYYY-MM-DD.parquet`.
- Added `archive_next_completed_cookie_day[_to]` and changed the task to archive one day, sleep two seconds, then continue; errors stop the current pass without taking down wwapi.
- Added a test for historical backfill, leaving today’s events live and making a second run a no-op. The earlier version passed, but the final incremental version’s test run was aborted during compilation.

Failures and how to do differently:
- Do not modify `src/core/store/leaderboard_archive.rs` or add a broad production rehearsal when the request is specifically about cookie events; those changes were reverted after user correction.
- Before claiming completion, rerun `rustfmt` and `cargo test --release --test store archive::` and inspect `git status`; the final cookie changes were not shown committed.

References:
- Files: `src/core/store/archive.rs`, `src/core/tasks/cookie.rs`, `tests/store/archive.rs`
- Prior passing test: `historical_archive_backfills_completed_days_once`
- Final test attempt: `cargo test --release --test store archive::` was aborted while compiling.

## Thread `019f7694-98a3-7bd1-a01b-0482d968efe4`
updated_at: 2026-07-19T07:47:59+00:00
cwd: /Users/sudiproy/Projects/worldwide
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/19/rollout-2026-07-19T00-24-37-019f7694-98a3-7bd1-a01b-0482d968efe4.jsonl
rollout_summary_file: 2026-07-18T18-54-37-QFXS-wwapi_archive_investigation_and_user_backup_prd.md

---
description: Linux archive investigation found retention and unbounded startup/tombstone handling as the durable bottlenecks; user approved a same-database serialized BackupUser design and handoff PRD
 task: investigate wwapi archive performance and design scalable user backup lifecycle
task_group: worldwide/wwapi-performance-and-storage-design
task_outcome: partial
cwd: /Users/sudiproy/Projects/worldwide
keywords: wwapi, turso, wal, leaderboard_archive, retention_delete, parquet, user_backup, BackupUser, backup, kv, updated_at, TimerKey, reputation
---

### Task 1: Archive performance investigation

task: diagnose Linux CPU/RAM/time failure in wwapi leaderboard archiving
task_group: wwapi archive and Turso performance
task_outcome: partial

Preference signals:
- User asked to find causes and fix them one by one before production -> future investigations should measure each hypothesis and preserve Linux/test-box evidence.
- User corrected Nix usage and preferred existing musl flow -> use `cargo build --release --target x86_64-unknown-linux-musl` and existing deployment scripts.
- User said not to touch production or push -> use disposable production copies and keep changes uncommitted until validated.

Reusable knowledge:
- Primary confirmed incident path is retention deletion, not Parquet writing: original run had `unarchived_days=0` yet still saturated CPU/RAM in retention.
- `leaderboard_archive.rs` experimental streaming is false streaming: full-day `Vec` plus `Vec<Vec<DeltaRow>>`; avoid collecting all pages.
- `unarchived_days` full-table DISTINCT scan took ~16s on a 4.95M-row Linux copy; MIN/MAX plus indexed day probes took ~4s.
- ~3,814-row delete completed in ~332ms; broad deletes and `LIMIT 100000` stalled. Test smaller batches and execute/commit timing.
- Do not delete `-wal`/`-tshm` automatically; recovery state may be lost. Validate existing Parquet before deleting source rows.
- WAL is single-writer/multi-reader; kill-9 reopen failure exists in both WAL and MVCC and remains an open production risk.

Failures and how to do differently:
- Tiny in-memory archive tests passed but are not scale evidence.
- Large delete batches and broad cutoff deletes were not validated and caused hangs.
- The archive fix remained uncommitted and incomplete; do not claim production readiness.

References:
- `plan/2026-07-18-wwapi-archive-failure-report.md`
- `plan/2026-07-18-wwapi-wal-stresstest-checklist.md`
- `wwapi/src/core/store/leaderboard_archive.rs`
- `wwapi/src/core/store/archive.rs`
- `wwapi/src/core/store/driver.rs`
- `cargo test --release --test store -- leaderboard_archive --nocapture`

### Task 2: Scalable user backup design

task: replace 60k UID tombstone reconciliation with atomic same-database BackupUser snapshots
task_group: wwapi user lifecycle and storage design
task_outcome: success

Preference signals:
- User confirmed `updated_at` is the activity marker; retain its name and semantics.
- User chose `BackupStore`, `BackupUser`, `backup_user`; do not use DormantStore/DormantUser/depart_user.
- User chose one database for ACID, rename generic `backups` to `kv`, and create `backup` for serialized user snapshots.
- User selected users, usage, afk, profile_settings, user_roles, inventory, email, reputation, timers; exclude gang data, perks, staff_board, and keep inactive members active.
- User wants indexed expiry cleanup for backups older than one year.

Reusable knowledge:
- Proposed schema: `backup(user_id PRIMARY KEY, data, backed_up_at, expire_at, schema_version)` plus `backup_expire_at_idx`; migrate existing generic `backups` rows to `kv`.
- `backup_user`/`restore_user` must be atomic and idempotent; restore before create-user; evict caches only after commit.
- Reputation needs explicit cross-user edge handling. Timers require typed `TimerKey` ownership classification because `timers` has no user column.
- Replace full Discord UID snapshots with join/remove events plus bounded reconciliation for missed events.
- Keep `user_backup` compatibility during rollback; remove filters/drop it only after tests and production-scale validation.

References:
- `plan/0003-prd-wwapi-user-backup.md`
- `wwapi/src/core/store/schema.sql`
- `wwapi/src/core/store/user.rs`
- `wwapi/src/core/store/backup.rs`
- `wwapi/src/core/store/kv.rs`
- `wwapi/src/core/store/bootstrap.rs`
- `wwapi/src/state/user/mod.rs`
- `wwapi/src/state/misc.rs`
- `wwapi/src/scheduler/key.rs`
- `wwideas/issues/0002-bootstrap-hydration-scale.md`

## Thread `019f7961-5b00-7903-b7f4-9127e2c02476`
updated_at: 2026-07-19T10:52:45+00:00
cwd: /Users/sudiproy/Projects/worldwide
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/19/rollout-2026-07-19T13-27-31-019f7961-5b00-7903-b7f4-9127e2c02476.jsonl
rollout_summary_file: 2026-07-19T07-57-31-sdp4-wwapi_user_backup_plan_and_implementation.md

description: Implemented and tested an uncommitted WWAPI atomic user-backup system after extensive PRD grilling; major durable decisions and review constraints were locked by the user.
task: atomic-user-backup-and-bounded-reconciliation
task_group: /Users/sudiproy/Projects/worldwide
task_outcome: partial
cwd: /Users/sudiproy/Projects/worldwide
keywords: wwapi, backup, restore, user_backup, Turso, Toasty, TimerKey, reputation, reconciliation, annual-usage-reset, wwbot, protobuf, level-greater-than-10

### Task 1: Atomic user backup and rollout implementation

task: atomic-user-backup-and-bounded-reconciliation
task_group: WWAPI/wwbot cross-repo rollout
task_outcome: partial

Preference signals:
- The user required discussion and plan lock before coding, then full implementation by the agent, followed by manual readability review and only later commit: “I’ll read all of the code … if complicated … simplify it … commit only after your approval.”
- The user explicitly retained the `level() > 10` eligibility rule; level 10 or below is permanent deletion, level 11+ is backed up.
- The user rejected a single serialized aggregate and normalized backup child tables. Preferred one `backup` row with typed scalar columns and JSON columns for usage, roles, inventory, timers, and reputation.
- The user requested only `expire_at`; no `backed_up_at` or KV year marker. Usage year belongs only inside backup JSON; active usage schema stays unchanged.
- The user approved identical code in beta/testing and production, with no environment-specific behavior.
- The user narrowed scheduler work to annual usage reset only; daily/weekly resets and unrelated background loops remain as-is.

Reusable knowledge:
- New physical table is singular `backup`; existing generic KV table `backups` remains untouched and its rename to `kv` is deferred.
- Atomic methods are in `wwapi/src/core/store/backup/user.rs`; JSON/data helpers are in `backup.rs`; reconciliation and cleanup are in `backup/reconcile.rs`.
- Reputation edges are stored in exactly one place: live `reputation` only when both endpoints are active; otherwise the first backup holder’s JSON owns the edge and restore may transfer it to the counterpart backup row.
- Timers are classified through the exhaustive `TimerKey` enum mapping, with complete `{event_id,payload,expires_at}` records stored in JSON. Restore filters expired timers using absolute expiry.
- Annual usage reset is represented by durable `TimerKey::UsageReset`; active usage table is not changed, and reset refreshes cached users.
- Reconciliation uses WWAPI database IDs plus a bounded wwbot inactive-member RPC, with a maximum 1,000 operations per run and identical test/prod behavior.
- New backup cleanup is bounded to 100 expired rows per transaction and a 30-second budget; manual `maintain backup-clean` uses the same store operation.

Failures and how to do differently:
- Do not broaden the task into migrating every clock/background loop; the user explicitly rejected that scope.
- Do not remove the `level() > 10` rule.
- Do not rename the generic `backups` KV table during this rollout.
- Keep backup code split into focused modules; the first large implementation was later split for readability.
- Strict `cargo clippy --all-targets -- -D warnings` remains blocked by unrelated repository lint debt. Full wwbot pytest collection also has pre-existing import/missing-file failures; report targeted validation separately.

References:
- `/Users/sudiproy/Projects/worldwide/plan/0003-prd-wwapi-user-backup.md`
- `wwapi/src/core/store/schema.sql`: `backup` table and `backup_expire_at_idx`
- `wwapi/src/core/store/backup.rs`, `backup/user.rs`, `backup/reconcile.rs`
- `wwapi/src/state/user/mod.rs`, `wwapi/src/state/misc.rs`
- `wwapi/src/scheduler/key.rs`, `handler.rs`, `internal.rs`
- Validation evidence: `cargo test --all-targets` passed; 193 WWAPI tests and workload benchmarks passed; wwpage `tsc` and 159 Vitest tests passed; wwbot Ruff, Pyright, and 2 focused RPC tests passed.
- No commit or deployment was performed; changes were left for user review.

## Thread `019f85e1-4dae-7dd3-84f9-13b7366f81c6`
updated_at: 2026-07-21T19:07:26+00:00
cwd: /Users/sudiproy/Projects/worldwide
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/21/rollout-2026-07-21T23-42-43-019f85e1-4dae-7dd3-84f9-13b7366f81c6.jsonl
rollout_summary_file: 2026-07-21T18-12-43-O1am-wwpage_weekly_role_badge_shared_roster_refactor.md

---
description: Implemented weekly role-time badges for Speakers and Chatters using existing wwapi timestamps, then consolidated both pages into shared roster components and corrected newest-first ordering.
task: weekly-role-since-badge-and-roster-refactor
task_group: worldwide/wwpage roster UI
 task_outcome: success
cwd: /Users/sudiproy/Projects/worldwide/wwpage
keywords: wwapi, wwpage, granted_at, roleSince, GetRoleMembersByKinds, CSS Modules, roster, Speakers, Chatters, Vitest, Next.js
---

### Task 1: Backend timestamp tracing and data mapping

task: consume wwapi role assignment timestamps in wwpage
task_group: role roster data flow
task_outcome: success

Preference signals:
- The user said “we need to discuss the change first” and asked to verify the correct folder/data path -> inspect contracts and present the implementation plan before editing.
- The user asked for modular, readable code with no unnecessary additions -> prefer one shared data mapping path and small focused modules.

Reusable knowledge:
- `wwapi` already stores assignment timestamps in `user_roles.granted_at`, maintains timestamp-aware `role_roster`, and exposes `granted_at` via `GetRoleMembersByKinds`.
- `wwpage/src/lib/role-list.ts` previously discarded `grantedAt`; this is the correct frontend boundary for retaining it.
- `grantedAt` is Unix seconds, so map with `new Date(Number(grantedAt) * 1000).toISOString()`.
- Invalid/nonpositive timestamps are rejected; do not invent fallback timestamps.

Failures and how to do differently:
- No wwapi/protobuf changes were necessary. Avoid duplicating backend timestamp logic in page-specific data loaders.

References:
- `wwapi/proto/role/service.proto`: `RoleMemberWithKind.granted_at = 2`.
- `wwapi/src/grpc_server/role.rs`.
- `wwpage/src/lib/role-list.ts`.

### Task 2: Shared badge and roster UI consolidation

task: add weekly role badge and reusable roster components
task_group: wwpage shared UI
 task_outcome: success

Preference signals:
- The user approved a focused plan, then requested “reuse as much code as you can” and fewer total lines -> consolidate shared card/page/badge logic rather than maintain separate SpeakerCard and ChatterCard copies.
- The user approved replacing CSS-in-TS with a CSS file -> use colocated CSS Modules for static shared styling.

Reusable knowledge:
- Shared implementation lives under `src/components/roster/`: `Badge.tsx`, `Card.tsx`, `Page.tsx`, and `roster.module.css`.
- Route files retain only metadata and configuration for role order, tracked IDs, title, icon, accent, summary, empty state, and data loader.
- Runtime colors and animation delay remain inline/CSS variables; static styling belongs in `roster.module.css`.
- `formatWeeklyElapsed` supports weekly boundaries and returns `stale` at 7+ days; production stale values log `stale roleSince`, member ID, and timestamp.
- At the minimum 170px card width, initial geometry testing found badge/avatar overlap. Shared content top padding was increased from `16px` to `28px`; final measurement showed no overlap, tooltip downward, and tooltip inside the card.

Failures and how to do differently:
- Early production builds hung in the restricted environment; rerunning with elevated permissions completed successfully.
- Browser page data could not load without local gRPC services (`ECONNREFUSED 127.0.0.1:50051/50052`), so distinguish infrastructure warnings from compile/type failures.

References:
- `src/components/roster/roster.module.css`
- `src/components/roster/Card.tsx`
- `src/components/roster/Page.tsx`
- `src/components/roster/Badge.tsx`
- `pnpm test`: 30 files, 169 tests passed before ordering test.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm build`: passed with only expected local gRPC warnings.

### Task 3: Newest-first role ordering

task: order roster cards by role assignment time descending
task_group: roster display ordering
 task_outcome: success

Preference signals:
- The user corrected that “the latest should be at left top and the older towards right bottom” -> verify frontend ordering against the intended grid direction.

Reusable knowledge:
- `wwapi` returns members ascending by `granted_at`; the frontend must reverse this for the desired visual order.
- Sort once in shared `getRoleListData`, not separately in Speakers and Chatters.
- Existing role-priority deduplication remains unchanged.

References:
- `src/lib/role-list.ts`: `members.sort((a, b) => b.roleSince.localeCompare(a.roleSince));`
- `src/lib/role-list.test.ts`: backend timestamps `[100, 200]` produce IDs `[2, 1]`.
- Final verification: `pnpm test` -> 31 files, 170 tests passed; TypeScript passed.

