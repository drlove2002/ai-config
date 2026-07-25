thread_id: 019f6f0b-16b9-79a3-ac7e-5600b0bacea2
updated_at: 2026-07-17T08:39:42+00:00
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/17/rollout-2026-07-17T13-17-05-019f6f0b-16b9-79a3-ac7e-5600b0bacea2.jsonl
cwd: /Users/sudiproy/Projects/worldwide

# Planned and implemented a wwapi SQLite→embedded Turso/Toasty migration, then extended cookie-event archival

Rollout context: Work occurred under `/Users/sudiproy/Projects/worldwide`, primarily in `wwapi` and `wwbot`. The user wanted to replace SQLx/SQLite due to severe locking, use local embedded Turso MVCC (`concurrent_writes()`), support bot-side data inspection, and make archival/backfill safe.

## Task 1: Diagnose SQLite contention and plan Turso/Toasty migration

Outcome: success

Preference signals:
- The user asked to “plan together,” wanted concrete settings, and allowed read-only production inspection -> future architecture work should inspect the real code and operational evidence, then present phased settings and tradeoffs rather than assuming a driver swap is sufficient.
- The user explicitly did not want Turso Cloud by default and only accepted it if clearly better -> prefer self-hosted/local embedded Turso unless replication or multi-host requirements justify Cloud.
- The user wanted wwbot to optionally inspect data via `?eval` -> provide a safe read-only application boundary rather than direct live database access.

Reusable knowledge:
- Production evidence showed the immediate SQLite failure was transaction topology/self-contention, not file size or WAL growth: the DB was about 347 MB, WAL about 4 MB, and writes repeatedly waited 30 seconds before `database is locked`; pool acquisition stalled up to roughly 29 seconds.
- `sync_data` opens an outer transaction, then `sync_user` opens another transaction on another pool connection, while role helpers acquire additional connections. This can make wwapi wait on its own writer lock.
- High-contention paths included `leaderboard_deltas`, `user_roles`, `timers`, and `cookie_candles`; the five-connection pool increased writer contenders without increasing SQLite write capacity.
- Toasty’s local Turso driver supports `.concurrent_writes()`, `PRAGMA journal_mode='mvcc'`, and `BEGIN CONCURRENT`; conflicts surface as retryable serialization failures. Turso Cloud is not required.
- MVCC cannot be combined with Turso multiprocess WAL; `experimental_multiprocess_wal` should remain disabled for the single-process live database.
- The migration plan was saved at `plan/2026-07-16-libsql-toasty-migration.md`.

References:
- Production log snippets included `database is locked`, SQLite code 5, and 30-second slow statements for leaderboard, roles, timers, and cookie candles.
- Initial migration commit: `wwapi eadee69 refactor(db): remove SQLite write contention from persistence`.
- Build race fix: `wwapi 2ef43ac fix(build): prevent concurrent targets from deleting generated code`.

## Task 2: Replace wwapi SQLx persistence with Store/Toasty/Turso and add wwbot inspection/testing workflow

Outcome: success

Reusable knowledge:
- `wwapi` now has a neutral `Store` boundary under `src/core/store/`, a canonical schema at `src/core/store/schema.sql`, Toasty/Turso MVCC setup, importer, retry handling, concurrency/durability tests, and workload benchmarks.
- `migrate.rs` imports a legacy SQLite copy into a new target, checks row counts, runs foreign-key validation, and reopens the target through Turso MVCC. A full local 97 MB rehearsal copy imported successfully with 46,237 users, 1,108,537 leaderboard deltas, 304,138 cookie candles, and related domains.
- The importer test passed: `cargo test --release --test import` -> 1 passed.
- wwbot received bounded read-only `SqlQuery` gRPC inspection and a repeatable beta test harness. Focused validation passed: Ruff and 17 pytest tests.
- Fresh-database market startup was fixed and committed separately as `wwbot b6f29364`; beta workflow as `wwbot 8ee956b4`.

Failures and how to do differently:
- A lint hook found an undefined `coordinator` reference in `mainbot/testing/commands.py`; it was fixed before committing the beta workflow.
- `uv` initially failed due to restricted access to its cache; rerunning with approved elevated access succeeded.

References:
- `wwapi/src/bin/migrate.rs`
- `wwapi/tests/import.rs`
- `wwapi/docs/database.md`
- `wwbot/mainbot/testing/`
- `wwbot/tests/test_testing_framework.py`

## Task 3: Add historical cookie-event backfill and non-blocking production archival

Outcome: partial

Preference signals:
- The user clarified that leaderboard backfill was already migrated and said “I was talking about lb backfeel cookies lb is alredy migrated to archive type” -> future agents should preserve existing leaderboard archival and scope changes only to cookie-event archival when requested.
- The user asked whether the work can run in the background without blocking production -> archival should be cooperative and incremental, not one large startup transaction.

Key steps:
- Added `CookieArchive` and completed-day discovery in `src/core/store/archive.rs`.
- Added `archive_next_completed_cookie_day[_to]` to process one completed day at a time.
- Changed the cookie archival task to loop over one day, sleep two seconds between days, and stop on errors; it runs after wwapi readiness.
- Added a test proving historical completed days are archived once, today remains live, and a second run does no work.
- The historical backfill test passed before the final test rerun: `historical_archive_backfills_completed_days_once ... ok`.

Failures and how to do differently:
- A first production-copy rehearsal created all 61 leaderboard Parquet files but ran too long while processing 1.1 million rows. The user then clarified leaderboard archival should not be changed; the unrelated leaderboard optimization and rehearsal changes were reverted/deleted.
- The final focused test command was aborted by the user while compilation was still running, so the latest cookie archival changes were not fully revalidated after the final incremental/background changes.
- The cookie archival changes were not shown as committed; check `git status` before proceeding.

Reusable knowledge:
- Production systemd already has `WorkingDirectory=/home/admin/wwapi`, so both `./data/cookie_events` and `./data/leaderboard_deltas` resolve consistently under the service directory.
- Cookie-event Parquet files use `./data/cookie_events/YYYY-MM-DD.parquet`.
- Do not alter the existing leaderboard archival implementation unless explicitly requested.

References:
- `wwapi/src/core/store/archive.rs`
- `wwapi/src/core/tasks/cookie.rs`
- `wwapi/tests/store/archive.rs`
- Service unit: `wwapi/script/wwapi.service` with `WorkingDirectory=/home/admin/wwapi`
