# Task Group: worldwide/wwpage weekly role badges and shared roster UI

scope: Trace existing WWAPI role timestamps, add role-age presentation, and keep Speakers/Chatters on one readable shared UI path.
applies_to: cwd=/Users/sudiproy/Projects/worldwide/wwpage; reuse_rule=reuse the data-flow and component boundaries for the same WWPAGE roster surfaces; re-check current route configuration and service contracts before changing other role pages.

## Task 1: Weekly role-since badge, shared roster refactor, and newest-first ordering

### rollout_summary_files

- rollout_summaries/2026-07-21T18-12-43-O1am-wwpage_weekly_role_badge_shared_roster_refactor.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/21/rollout-2026-07-21T23-42-43-019f85e1-4dae-7dd3-84f9-13b7366f81c6.jsonl, updated_at=2026-07-21T19:07:26+00:00, thread_id=019f85e1-4dae-7dd3-84f9-13b7366f81c6, implemented and verified)

### keywords

- wwpage, granted_at, GetRoleMembersByKinds, role-list.ts, roleSince, Speakers, Chatters, src/components/roster, roster.module.css, formatWeeklyElapsed, newest-first

## User preferences

- When changing WWPAGE data/UI, the user said “we need to discuss the change first” and asked to verify the correct folder and how `wwapi` receives the data -> inspect the contract and present the focused plan before editing. [Task 1]
- The user requested “moduler,” “very easy to read,” “don’t add unnecessary code,” and “reuse as much code as you can” -> consolidate common behavior in small shared modules instead of parallel route copies. [Task 1]
- For roster grids, the user corrected that “the latest should be at left top and the older towards right bottom” -> test the visual order against the backend order. [Task 1]

## Reusable knowledge

- WWAPI already persists `user_roles.granted_at`, carries it through `role_roster`, and exposes `RoleMemberWithKind.granted_at` from `GetRoleMembersByKinds`; `wwpage/src/lib/role-list.ts` must retain it. Convert Unix seconds with `new Date(Number(grantedAt) * 1000).toISOString()` and reject invalid/nonpositive values rather than inventing a fallback. [Task 1]
- WWAPI returns role members ascending by `granted_at`; sort once in shared `getRoleListData` by descending `roleSince` so newer cards start at the top left while role-priority deduplication remains unchanged. [Task 1]
- Shared UI lives in `src/components/roster/Badge.tsx`, `Card.tsx`, `Page.tsx`, and `roster.module.css`. Keep route files to metadata/configuration and data loaders. Put static styling in CSS Modules; retain runtime colors and animation delay as inline/CSS variables. [Task 1]
- `formatWeeklyElapsed` returns `stale` at 7+ days. Production logging records `stale roleSince`, member ID, and timestamp. At a 170px card width, use the corrected 28px content top padding so badge and avatar do not overlap. [Task 1]

## Failures and how to do differently

- Symptom: page-specific loaders duplicate timestamp logic. Cause: treating a frontend mapping omission as a backend/protobuf gap. Fix: trace `role-list.ts` first; no WWAPI or protobuf changes were needed. [Task 1]
- Symptom: browser data load reports `ECONNREFUSED 127.0.0.1:50051/50052`. Cause: local gRPC services are absent. Fix: separate that infrastructure warning from `pnpm test`, `pnpm exec tsc --noEmit`, and build evidence; final checks reached 170 tests, TypeScript, and `pnpm build`. [Task 1]

# Task Group: worldwide/wwapi user backup and bounded reconciliation

scope: Design, implement, validate, and review the atomic departed-user backup lifecycle in WWAPI and its wwbot/wwpage integration.
applies_to: cwd=/Users/sudiproy/Projects/worldwide; reuse_rule=reuse locked product rules and validation boundaries for this checkout's backup work; re-check the uncommitted implementation and current schema before changing it.

## Task 1: Lock and implement atomic user backups, left uncommitted for review

### rollout_summary_files

- rollout_summaries/2026-07-19T07-57-31-sdp4-wwapi_user_backup_plan_and_implementation.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/19/rollout-2026-07-19T13-27-31-019f7961-5b00-7903-b7f4-9127e2c02476.jsonl, updated_at=2026-07-19T10:52:45+00:00, thread_id=019f7961-5b00-7903-b7f4-9127e2c02476, implementation and targeted validation)
- rollout_summaries/2026-07-18T18-54-37-QFXS-wwapi_archive_investigation_and_user_backup_prd.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/19/rollout-2026-07-19T00-24-37-019f7694-98a3-7bd1-a01b-0482d968efe4.jsonl, updated_at=2026-07-19T07:47:59+00:00, thread_id=019f7694-98a3-7bd1-a01b-0482d968efe4, PRD evidence superseded where the later implementation differs)

### keywords

- wwapi, backup, backup_user_at, restore_user_at, backup/user.rs, backup/reconcile.rs, backup_expire_at_idx, TimerKey::UsageReset, InactiveUsers, level() > 10, reputation, 1000 operations

## User preferences

- For substantial WWAPI work, the user required: “discuss → lock the plan → You do all the coding → I’ll read all of the code … if complicated … simplify it … commit only after your approval.” Lock design before edits, leave work uncommitted for readability review, and do not deploy or commit early. [Task 1]
- Preserve the simple eligibility policy: “keep it. it’s simple yeet works good enough.” `level() > 10` backs a user up; level 10 or below receives permanent deletion. [Task 1]
- Use one `backup` row with typed scalar columns and JSON for usage, roles, inventory, timers, and reputation; do not replace it with one opaque aggregate or normalized child backup tables. Keep only `expire_at`; active usage schema stays unchanged. [Task 1]
- Keep test and production on identical code, with no beta-only guild allowlist. Limit scheduler migration to annual usage reset; daily/weekly resets and unrelated loops remain unchanged. [Task 1]

## Reusable knowledge

- The current physical table is singular `backup` with `expire_at` and `backup_expire_at_idx`; generic KV remains physically in `backups`. The earlier `backups` to `kv` proposal was deferred by the later locked implementation. [Task 1]
- Atomic store work splits across `wwapi/src/core/store/backup.rs`, `backup/user.rs`, and `backup/reconcile.rs`. Back up and restore in retryable transactions, validate JSON, evict caches after commit, and restore before create-user so returning users do not receive blank accounts. [Task 1]
- A reputation edge remains live only when both endpoints stay active. Otherwise the first backup holder owns the complete edge in JSON; a second backup can move ownership, and restore returns it to live reputation when appropriate. [Task 1]
- Timer ownership needs exhaustive `TimerKey` classification through `backup_user_id()` or equivalent, never string/JSON matching. Store complete `{event_id,payload,expires_at}` records; timer timestamps use milliseconds while backup expiry uses seconds, and restore filters absolute-expired timers. [Task 1]
- Reconciliation combines WWAPI database IDs with wwbot `InactiveUsers` RPC and caps each run at 1,000 operations. Expired cleanup handles 100 rows per transaction for up to 30 seconds; `maintain backup-clean` shares that store operation. `TimerKey::UsageReset` handles annual UTC reset and refreshes cached users. [Task 1]
- Targeted evidence passed: 193 WWAPI tests and workload benchmarks, WWPAGE TypeScript plus 159 Vitest tests, and wwbot Ruff, Pyright, and two focused RPC tests. No commit or deployment occurred. [Task 1]

## Failures and how to do differently

- Symptom: migration scope expands into every clock/background loop. Cause: treating backup as a scheduler rewrite. Fix: retain annual usage reset only unless the user expands scope. [Task 1]
- Symptom: backup logic becomes hard to review. Cause: a large aggregate implementation. Fix: preserve the focused `backup.rs`, `backup/user.rs`, and `backup/reconcile.rs` split. [Task 1]
- Symptom: repository-wide validation appears red. Cause: unrelated Clippy debt and pre-existing wwbot pytest import/file failures. Fix: report them separately and cite `cargo check --all-targets`, relevant cargo tests, Ruff, Pyright, and focused RPC tests. [Task 1]

# Task Group: worldwide/wwapi archive and Turso performance investigation

scope: Diagnose production-scale WWAPI leaderboard archiving, retention, and Turso WAL behavior on Linux test copies.
applies_to: cwd=/Users/sudiproy/Projects/worldwide; reuse_rule=reuse measurement and safety shields for this checkout's archive path; re-measure any delete or recovery change on a disposable production-sized Linux copy.

## Task 1: Diagnose archive CPU/RAM failure and retention bottlenecks

### rollout_summary_files

- rollout_summaries/2026-07-18T18-54-37-QFXS-wwapi_archive_investigation_and_user_backup_prd.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/19/rollout-2026-07-19T00-24-37-019f7694-98a3-7bd1-a01b-0482d968efe4.jsonl, updated_at=2026-07-19T07:47:59+00:00, thread_id=019f7694-98a3-7bd1-a01b-0482d968efe4, partial investigation)

### keywords

- wwapi, Turso, WAL, leaderboard_archive.rs, retention_delete, unarchived_days, Vec<Vec<DeltaRow>>, OFFSET pagination, Parquet, -wal, -tshm, x86_64-unknown-linux-musl, DELETE LIMIT 100000

## User preferences

- For production-scale failures, the user asked to “find the causes and fix it one by one,” test before production, and ask when uncertain -> measure each hypothesis and distinguish confirmed causes from open risks. [Task 1]
- The user preferred the existing musl/deployment flow over assumed Nix: use `cargo build --release --target x86_64-unknown-linux-musl` and repository tooling. Do not touch production or push without approval. [Task 1]

## Reusable knowledge

- The 69-minute/664-MB incident primarily came from retention: `unarchived_days=0` while CPU/RAM remained saturated. Large Turso deletes form the confirmed bottleneck, not Parquet writing. [Task 1]
- The experimental streaming path does not bound memory: it loads a full day and then all paginated batches into `Vec<Vec<DeltaRow>>` with OFFSET pagination. Stream/write each batch rather than collecting pages. [Task 1]
- On a Linux copy with about 4.95M leaderboard rows, full-table DISTINCT `unarchived_days` took about 16 seconds; MIN/MAX plus indexed probes/range took about 4 seconds. A roughly 3,814-row delete took about 332 ms; broad cutoff deletes and `DELETE ... LIMIT 100000` stalled. Measure execute and commit separately with much smaller batches. [Task 1]
- Preserve archive-before-delete safety and validate existing Parquet before deleting source rows. WAL stays single-writer/multi-reader; clean exit/reopen worked, while kill-9 recovery failed in WAL and prior MVCC modes, an open pre-existing Turso risk. [Task 1]

## Failures and how to do differently

- Tiny `Store::memory()` tests and bounded Arrow batches do not prove production-scale boundedness. Test the actual Linux path on a disposable production-sized copy. [Task 1]
- Do not automatically delete `-wal` or `-tshm`; they can carry recovery state. Do not call a stale WAL/shm workaround safe recovery. [Task 1]
- The archive fix stayed incomplete and uncommitted. Do not claim production readiness before retention, writer/reader coexistence, recovery, and Parquet-validity validation pass. [Task 1]

# Task Group: worldwide/wwapi Toasty-Turso migration and cookie archival

scope: Migrate WWAPI persistence from SQLx/classic SQLite to local embedded Turso/Toasty MVCC and run safe incremental archive maintenance.
applies_to: cwd=/Users/sudiproy/Projects/worldwide/wwapi; reuse_rule=reuse driver, transaction, and archive constraints for this WWAPI checkout; re-check migration/cutover state before treating the rollout as production-complete.

## Task 1: Diagnose SQLite self-locking and migrate to Toasty/Turso MVCC

### rollout_summary_files

- rollout_summaries/2026-07-17T07-47-05-EYqC-wwapi_turso_toasty_migration_cookie_archive_backfill.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/17/rollout-2026-07-17T13-17-05-019f6f0b-16b9-79a3-ac7e-5600b0bacea2.jsonl, updated_at=2026-07-17T08:39:42+00:00, thread_id=019f6f0b-16b9-79a3-ac7e-5600b0bacea2, migration rehearsal succeeded)
- rollout_summaries/2026-07-16T10-22-17-f1AW-wwapi_turso_toasty_migration_and_beta_testing_plan.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T15-52-17-019f6a72-d16a-70b3-b6c5-d39b10f28dae.jsonl, updated_at=2026-07-16T18:44:43+00:00, thread_id=019f6a72-d16a-70b3-b6c5-d39b10f28dae, design and checklist)

### keywords

- wwapi, SQLx, SQLite, Toasty, Turso, concurrent_writes, MVCC, BEGIN CONCURRENT, database is locked, migrate.rs, sync_data, sync_user, transaction retries

## Task 2: Backfill cookie-event Parquet archives one completed day at a time

### rollout_summary_files

- rollout_summaries/2026-07-17T07-47-05-EYqC-wwapi_turso_toasty_migration_cookie_archive_backfill.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/17/rollout-2026-07-17T13-17-05-019f6f0b-16b9-79a3-ac7e-5600b0bacea2.jsonl, updated_at=2026-07-17T08:39:42+00:00, thread_id=019f6f0b-16b9-79a3-ac7e-5600b0bacea2, final archive change remained unverified)

### keywords

- cookie_events, archive_next_completed_cookie_day, archive_next_completed_cookie_day_to, data/cookie_events, parquet, src/core/store/archive.rs, src/core/tasks/cookie.rs, historical_archive_backfills_completed_days_once

## User preferences

- The user asked to “totally migrate from sqlx,” use `concurrent_writes()`, plan together, and explain settings -> provide evidence-backed architecture choices and concrete settings before edits. [Task 1]
- Default to self-hosted embedded Turso; treat Turso Cloud as a later decision. Keep wwbot inspection behind a bounded read-only WWAPI/gRPC boundary. [Task 1]
- For cookie archives, the user narrowed scope to cookie-event backfill and requested background work that does not block production -> process one completed day per pass with a delay. [Task 2]

## Reusable knowledge

- The lock issue came from transaction topology/self-contention: `sync_data` opened an outer transaction, `sync_user` used another pooled connection, and role helpers acquired more connections. Logs showed 30-second waits and SQLite code 5 on `leaderboard_deltas`, `user_roles`, `timers`, and `cookie_candles`; the 347-MB DB and 4-MB WAL were not the primary cause. [Task 1]
- Use `Turso::file(path).concurrent_writes()` for MVCC/`BEGIN CONCURRENT`, keep transactions short, and retry the whole transaction on serialization conflict. Do not combine MVCC with experimental multiprocess WAL. Toasty models cover normal CRUD; typed raw SQL handles ledgers, aggregates, reporting, CTEs, and migration verification. [Task 1]
- `migrate.rs` imports a legacy SQLite file to a fresh target, validates row counts and foreign keys, then reopens through Turso. A local rehearsal imported 46,237 users, 1,108,537 leaderboard deltas, and 304,138 cookie candles. [Task 1]
- Cookie archives resolve under `/home/admin/wwapi/data/` in production because `script/wwapi.service` sets `WorkingDirectory=/home/admin/wwapi`. Archive paths follow `./data/cookie_events/YYYY-MM-DD.parquet`; archive one completed day, sleep two seconds, and let errors stop only the current pass. [Task 2]

## Failures and how to do differently

- Treat locking as a transaction-topology problem first; a driver swap alone cannot fix self-contention. Do not rely on `push_schema()` against a populated file. [Task 1]
- Do not modify `src/core/store/leaderboard_archive.rs` or add broad production rehearsal when the request targets cookie events. Before completion claims, rerun `rustfmt`, `cargo test --release --test store archive::`, and inspect `git status`; the final incremental cookie version had an aborted test run and no confirmed commit. [Task 2]

# Task Group: worldwide/wwbot three-bot Discord E2E runner

scope: Maintain the partial long-lived three-bot Discord E2E framework, session teardown, and honest command-coverage handoffs.
applies_to: cwd=/Users/sudiproy/Projects/worldwide/wwbot; reuse_rule=reuse the session stack and teardown model for beta E2E work; do not imply exhaustive command coverage from this partial runner.

## Task 1: Persistent runner lifecycle, teardown, and initial player-command coverage

### rollout_summary_files

- rollout_summaries/2026-07-16T18-45-15-Ebji-wwbot_three_bot_e2e_runner_teardown_handoff.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/17/rollout-2026-07-17T00-15-15-019f6c3f-4b18-7c42-8fbe-1ac0aa8da4a8.jsonl, updated_at=2026-07-17T07:56:22+00:00, thread_id=019f6c3f-4b18-7c42-8fbe-1ac0aa8da4a8, partial framework and verified teardown)

### keywords

- Discord E2E, TEST=1, beta guild 1497942123981439038, CommandStack, Session.pending, teardown, SchedulerClient.delete_timers, UserService.Delete, Textual TUI, .test-runs, e2e.sh

## User preferences

- The user said “don't restart the bot throughour the whole process” and “don't do fresh db start, use teardown approch” -> keep one long-lived three-bot/WWAPI stack and shared DB per session; tear down owned state between scenarios. [Task 1]
- The user said “finish the testinf framework with thatever with have. we'll continue it later” -> hand off a clear milestone and remaining coverage, not an exhaustive-completion claim. [Task 1]

## Reusable knowledge

- `CommandStack` in `mainbot/testing/commands.py` keeps one `Launcher` and coordinator alive; reports can use different command roots while the stack uses `session/stack`. `Session.pending()` includes `PENDING`, `FAIL`, `BLOCKED`, and `ABORTED` so scenarios resume. [Task 1]
- Teardown calls typed scheduler deletion plus `UserService.Delete`, then checks actor rows and timers through read-only SQL/TTL checks. Beta guild ID: `1497942123981439038`; WWAPI gRPC: `127.0.0.1:50051`; callback server: `127.0.0.1:50052`. [Task 1]
- Live-passed scenarios include `tip`, `ping`, `msg` aliases, `pfp` aliases, `banner`, `cooldown`/`cd`, `level`/`lvl`, `rep`, `rep +`, `rep -`, `rep lb`, and `ganghelp` aliases. `$work` needs an allowed scenario channel; `pfp` needs level 48 or a temporary qualifying-role fixture with cleanup. [Task 1]

## Failures and how to do differently

- The per-command fresh DB/restart design was rejected. Do not restore it. Economy, games, actions, gangs, and shop scenarios remained mostly `TODO` or `AUTOMATING`; consult `plan/2026-07-17-wwbot-player-command-testing-checklist.md`. [Task 1]
- `update_goal(status="complete")` failed because this thread had no goal. Do not claim goal-system completion from that call. [Task 1]

# Task Group: worldwide cross-repo Redis removal, leaderboard UI, and deployment lock handling

scope: Plan Redis-state migration across WWAPI/wwbot, trace WWPAGE reputation leaderboard integration, and handle approved production SQLite operations safely.
applies_to: cwd=/Users/sudiproy/Projects/worldwide; reuse_rule=use planning and production safeguards across the Worldwide repos, but verify current commits, host aliases, and deployment scripts before acting.

## Task 1: Part 4 gang-item Redis-removal planning

### rollout_summary_files

- rollout_summaries/2026-07-16T07-55-43-Ol42-redis_removal_reputation_leaderboard_and_sqlite_lock.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T13-25-43-019f69ec-a06f-7f03-a160-cfb2e4d388ee.jsonl, updated_at=2026-07-16T12:42:44+00:00, thread_id=019f69ec-a06f-7f03-a160-cfb2e4d388ee, planning remained partial)

### keywords

- Redis removal, gang_targets, death_wish, death_wish_remaining, ConsumeDeathWish, DeathWishExpiry, GrappleHeist, GangTargetActive, Snap, Dream

## Task 2: Reputation leaderboard and responsive selector

### rollout_summary_files

- rollout_summaries/2026-07-16T07-55-43-Ol42-redis_removal_reputation_leaderboard_and_sqlite_lock.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T13-25-43-019f69ec-a06f-7f03-a160-cfb2e4d388ee.jsonl, updated_at=2026-07-16T12:42:44+00:00, thread_id=019f69ec-a06f-7f03-a160-cfb2e4d388ee, implemented in commit 78e9756)

### keywords

- RepLeaderboard, rep websocket room, leaderboard/view.tsx, 3-column grid, 78e9756, pnpm exec tsc --noEmit, Vitest

## Task 3: Production SQLite migration-lock handling

### rollout_summary_files

- rollout_summaries/2026-07-16T07-55-43-Ol42-redis_removal_reputation_leaderboard_and_sqlite_lock.md (cwd=/Users/sudiproy/Projects/worldwide, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T13-25-43-019f69ec-a06f-7f03-a160-cfb2e4d388ee.jsonl, updated_at=2026-07-16T12:42:44+00:00, thread_id=019f69ec-a06f-7f03-a160-cfb2e4d388ee, approved operation completed)

### keywords

- ww2, /var/lib/wwapi/wwapi.sqlite, _sqlx_migrations, database is locked, SqliteError code 5, deplay.sh, before=1 after=0

## User preferences

- For migration planning, the user said “Part 4 planning only,” “Preserve it completely,” and “Wait for explicit approval before any edits.” Run `git status --short` in each repo and `git log --oneline -10 -- <file>` before candidate-file discussion. [Task 1]
- When a deployment-order change was proposed, the user said “no revert it” -> do not retain workflow-script changes without explicit approval. [Task 3]

## Reusable knowledge

- DeathWish state splits into `death_wish`/`death_wish_remaining`, `ConsumeDeathWish`, and `DeathWishExpiry`; Grapple stake stays in `GrappleHeist` timer payload. Snap removes DeathWish but not Grapple; Dream and Grapple use the Rust target cache. Include startup hydration and user/gang deletion cleanup in the blast radius. [Task 1]
- The reputation UI used existing `RepLeaderboard` gRPC plus a `rep` websocket room/broadcast. A consistent 3-column selector fixed desktop gaps while retaining small-screen labels; validation passed TypeScript, 159 Vitest tests, `cargo check --all-targets`, and Rust formatting. [Task 2]
- The correct production target was SSH alias `ww2`, database `/var/lib/wwapi/wwapi.sqlite`. The user-approved `_sqlx_migrations` drop ended `before=1 after=0` without restart. `script/deplay.sh` migrates before restarting WWAPI, which allowed a live SQLite lock after the 30-second busy timeout. [Task 3]

## Failures and how to do differently

- Reconnaissance did not deliver the requested final blast-radius/numbered plan before the thread moved on. Stop after evidence gathering and present package order, risks, and verification plan. [Task 1]
- Do not assume SSH alias `ww` or change `script/deplay.sh` to stop-before-migrate. Verify host identity first and leave deployment ordering unchanged unless the user asks. [Task 3]

# Task Group: ai-config autonomy-first orchestration and Worldwide paths

scope: Maintain the active Pi orchestration prompt and portable Worldwide plan/issue paths in the shared AI configuration.
applies_to: cwd=/Users/sudiproy/.config/ai; reuse_rule=reuse these policy/path conventions for this configuration checkout; inspect the active injected prompt and current docs/scripts before editing.

## Task 1: Make the main agent self-sufficient and move Worldwide plan storage

### rollout_summary_files

- rollout_summaries/2026-07-16T07-43-57-DbWo-autonomy_first_orchestration_home_relative_worldwide_plan.md (cwd=/Users/sudiproy/.config/ai, rollout_path=/Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T13-13-57-019f69e1-da72-7640-a9ba-ebb433a3bab8.jsonl, updated_at=2026-07-16T07:52:38+00:00, thread_id=019f69e1-da72-7640-a9ba-ebb433a3bab8, completed)

### keywords

- pi-rules, extensions/pi-rules.ts, orchestrator, subagent, autonomy-first, worldwide-guardrails, $HOME/Projects/worldwide/plan, Path.home, PYTHONPYCACHEPREFIX

## User preferences

- The user said: “I need main to be self sufficient and only use subagent when needed.” Keep the main agent responsible for inspection, planning, implementation, integration, and verification; delegate only for concrete parallelism, specialist capability, context isolation, or explicit request. [Task 1]
- The user corrected the path: “it lives in $HOME/Projects/worldwide.” Use `$HOME/Projects/worldwide/plan/` for plans, issues, and postmortems. [Task 1]

## Reusable knowledge

- `extensions/pi-rules.ts` injects active identity/routing into every turn. Align it with `rules/orchestrator.md`, `AGENTS.md`, and `rules/worldwide-guardrails.md`; changing documentation alone does not alter routing. Preserve approval, no-guessing, safety, and verification rules while removing threshold-driven delegation. [Task 1]
- `scripts/update-guardrails.py` derives `WORLDWIDE_DIR = Path.home() / "Projects/worldwide"` and computes its session key dynamically. A consistency search found no affected `/data/Projects/worldwide` or `wwideas/issues/` references. [Task 1]

## Failures and how to do differently

- A large pre-existing dirty worktree contained unrelated changes. Do not attribute the full diff to the task; inspect intended files only. [Task 1]
- Symptom: `python3 -m py_compile scripts/update-guardrails.py` raises restricted-cache `PermissionError`. Fix: `env PYTHONPYCACHEPREFIX=/tmp/ai-pycache python3 -m py_compile scripts/update-guardrails.py`. [Task 1]
