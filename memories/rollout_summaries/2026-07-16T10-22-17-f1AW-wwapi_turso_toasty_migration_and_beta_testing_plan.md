thread_id: 019f6a72-d16a-70b3-b6c5-d39b10f28dae
updated_at: 2026-07-16T18:44:43+00:00
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/16/rollout-2026-07-16T15-52-17-019f6a72-d16a-70b3-b6c5-d39b10f28dae.jsonl
cwd: /Users/sudiproy/Projects/worldwide

# wwapi migrated from SQLx/classic SQLite toward embedded Turso MVCC + Toasty, with a reusable beta validation checklist

Rollout context: Work centered on `/Users/sudiproy/Projects/worldwide/wwapi`, with supporting `wwbot`, `wwpage`, `wwideas`, bundled Toasty/Turso docs, and read-only production inspection over SSH. The user wanted to replace SQLx/SQLite, use `concurrent_writes()`, avoid Turso Cloud unless necessary, support read-only bot inspection, bound leaderboard storage, and create repeatable manual-testing plans.

## Task 1: Investigate SQLite locking and design Turso/Toasty migration

Outcome: success

Preference signals:
- The user explicitly wanted to "totally migrate from sqlx" and use `concurrent_writes()` while discussing the plan together -> future agents should distinguish architecture planning from blindly editing and should surface concrete settings, tradeoffs, and bottlenecks.
- The user wanted `wwbot` to optionally inspect data for `?eval`, but later accepted a read-only design -> default to a read-only inspection boundary, not direct database writes from the bot.
- The user said they did not want Turso Cloud, but were willing to consider it if clearly better -> default to self-hosted embedded Turso and treat Cloud as a later decision trigger.

Key steps:
- Inspected repo instructions, existing migration plans, Toasty docs, Turso source/docs, wwapi SQL usage, schema, tests, and background tasks.
- Found SQLx spread across roughly 30 persistence/test/benchmark files, with major surfaces in bootstrap, user, misc, economy, gang, sync, role, market, and content.
- Read-only SSH inspection showed production `wwapi.service` active, database about 347 MB, WAL about 4 MB, and repeated 30-second waits ending in SQLite code 5 `database is locked`; pool acquisition stalled up to roughly 29 seconds.

Reusable knowledge:
- The demonstrated production issue was transaction topology/self-contention rather than database-file size or an abnormally large WAL.
- `sync_data` opened an outer transaction, then `sync_user` opened nested transactions on other pooled connections; role helpers also acquired fresh connections. With a five-connection pool and one classic SQLite writer, this created severe contention.
- Hot writes involved `leaderboard_deltas`, `user_roles`, `timers`, and `cookie_candles`; logs showed repeated 30-second statement stalls and lock failures.
- Toasty’s Turso driver supports `.concurrent_writes()`, which enables MVCC and makes default transactions use `BEGIN CONCURRENT`; write conflicts surface as serialization failures requiring whole-transaction retries.
- Turso MVCC must not be combined with experimental multiprocess WAL; the docs/tests explicitly reject that combination. The live database should have one owning process.
- Recommended initial settings recorded in the plan: direct `Turso::file(path).concurrent_writes()`, benchmark pool sizes 4/8/16 with 8 as a starting point, 2-second pool wait, 10-second pool creation timeout, 60-second health checks, short transactions, and retries around 5/10/20/40/80 ms.
- Toasty URL configuration cannot enable concurrent writes; construct the Turso driver directly.
- Use Toasty models for ordinary CRUD and typed raw SQL for aggregates, event ledgers, reporting, CTEs, and migration verification. Do not expose Toasty dynamic values outside the persistence boundary.
- Production schema upgrades must not rely on `push_schema()` against a populated file; use reviewed generated migrations or explicit copy/import workflows.

Failures and how to do differently:
- SSH initially failed with `Operation not permitted`; after requesting escalation, read-only inspection succeeded. Future production inspection should explicitly request read-only elevated SSH access when required.
- The first plan draft proposed configurable retention environment variables; the user corrected this and requested fixed constants. Do not add configuration for explicitly fixed policy.

References:
- Migration plan: `/Users/sudiproy/Projects/worldwide/plan/2026-07-16-libsql-toasty-migration.md`
- Production evidence snippets: `database is locked`, SQLite code 5, 30.03-second `leaderboard_deltas`/`user_roles`/`timers` statements, pool acquisition delays.
- Main DB client before migration: `wwapi/src/core/sqlite/client.rs`, with WAL, `synchronous=NORMAL`, `busy_timeout=30s`, and `max_connections=5`.

## Task 2: Implement fixed leaderboard retention, aggregation, and Parquet archive

Outcome: success

Preference signals:
- The user explicitly agreed to: raw deltas 7 days, daily aggregates 14 days, only the latest completed weekly snapshot, and indefinite Parquet cold storage -> preserve these as fixed domain constants, not environment variables.
- The user asked to implement the design and asked whether the database work was then complete -> future agents should clearly separate completed code migration from still-pending production rehearsal/cutover.

Key steps:
- Added `leaderboard_daily`, `leaderboard_weekly`, and `leaderboard_archives` tables.
- Added idempotent compaction with archive catalog tracking, atomic temporary Parquet write then rename, daily aggregation, latest-week replacement, and set-based retention deletes.
- Added aggregate-aware range queries so archived completed days do not double-count with raw boundary data.
- Added startup catch-up and daily UTC compaction scheduling.
- Added external tests in `wwapi/tests/store/leaderboard_archive.rs` and a Criterion benchmark in `wwapi/benches/workload/main.rs`.
- Verified exact retention and idempotent reruns with controlled timestamps.

Reusable knowledge:
- Fixed policy: raw `leaderboard_deltas` = 7 days; daily aggregates = 14 days; weekly table = exactly latest completed week; Parquet archives = indefinite.
- Raw rows are deleted only after Parquet publication and archive-catalog insertion succeed.
- Synthetic 10,000-delta workflow benchmark completed in approximately 1.13–1.17 seconds including database creation, inserts, aggregation, Parquet output, and retention.
- Full serial tests, concurrency tests, durability tests, import tests, integration tests, and clippy with warnings denied passed during the rollout.

Failures and how to do differently:
- Initial archive test failed because `tempfile` was not a dependency and APIs were not implemented yet; replaced it with standard temporary-directory handling and added the APIs incrementally.
- A type mismatch in retention counts was fixed by aligning the result type with Toasty affected-row counts.
- Running `cargo fmt --all` touched/generated protobuf formatting; later formatting was limited to touched handwritten Rust. Avoid broad formatting of generated files unless intentionally required.

References:
- Implementation: `wwapi/src/core/store/leaderboard_archive.rs`
- Query routing: `wwapi/src/core/store/leaderboard.rs`
- Scheduler: `wwapi/src/core/tasks/leaderboard.rs`
- Schema: `wwapi/src/core/store/schema.sql`
- Tests: `wwapi/tests/store/leaderboard_archive.rs`
- Benchmark: `wwapi/benches/workload/main.rs`

## Task 3: Create repeatable beta/manual migration testing checklist

Outcome: success

Preference signals:
- The user asked to "create the plan file for testing" and wanted it to "loop like a checklist" -> provide reusable checklist documents with repeatable loops, evidence fields, failure stop conditions, and final acceptance gates rather than prose-only instructions.
- The user wants validation through beta `wwbot`, beta Discord server, and `wwpage` -> include cross-client checks and restart/reload verification.

Key steps:
- Created a 368-line checklist with 14 loops covering setup, economy, transfers, inventory, gangs, timers, leaderboards, market/cookie events, wwpage reconnect, read-only `?eval`, concurrency, forced termination, archive maintenance, and offline production-copy rehearsal.
- Included a standard loop requiring immediate verification, cross-client verification, reload/reconnect, clean restart, second write, evidence capture, and explicit PASS/FAIL.
- Included stop conditions for lost/duplicated state, partial failures, duplicate timers, client disagreement, lock stalls, retry exhaustion, mutable SQL inspection, premature archive deletion, and production-copy mismatches.

Reusable knowledge:
- Beta testing must use `wwapi/data/wwapi.sqlite`, beta bot, beta Discord server, and local wwpage; never connect beta bot to a production database copy.
- Production-copy rehearsal must use a consistent offline copy imported into a new target, with no writes to the source and no direct second-process access to a live MVCC file.
- The checklist requires at least two beta accounts, one clean restart, three forced-restart tests, cross-checking Discord and website state, and explicit user approval before production cutover.

References:
- Checklist: `/Users/sudiproy/Projects/worldwide/plan/2026-07-16-turso-migration-testing-checklist.md`
- Operational DB docs: `/Users/sudiproy/Projects/worldwide/wwapi/docs/database.md`

## Task 4: Decide how to automate testing with real Discord users

Outcome: partial

Preference signals:
- The user has a main account and a test account and wants actual user-flow automation -> preserve the distinction between real Discord interaction coverage and unsafe user-account automation.

Reusable knowledge:
- Do not automate normal Discord accounts with user tokens, selfbots, Selenium/Playwright login scripts, or automated user messages.
- Safe options are manual-assisted testing (human sends commands; automated verifier checks wwapi state, bot responses, and website state) or a beta/dev-only admin test harness that invokes the same backend methods for selected Discord IDs.
- The proposed test harness was not implemented in this rollout. The next agent should inspect wwbot architecture, design a restricted beta-only harness, and update the checklist.

References:
- Existing eval command: `wwbot/mainbot/cogs/dev/main.py`, around `@command(name="eval", aliases=["exec", "e"], hidden=True)`.
- Existing read-only inspection contract documented in `wwapi/docs/database.md` via `grpc.misc.sql_query(...)`.

## Task 5: Produce handoff context for a new chat

Outcome: success

Key steps:
- Produced a copy-paste context summarizing the migration status, fixed retention policy, validation already completed, remaining production work, safe Discord automation constraints, relevant paths, and workspace rules.

References:
- Handoff context includes migration plan, operational docs, checklist path, benchmark command, remaining production rehearsal/cutover steps, and safe automation recommendation.
