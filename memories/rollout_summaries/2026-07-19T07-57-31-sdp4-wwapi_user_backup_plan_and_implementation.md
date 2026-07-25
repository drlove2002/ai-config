thread_id: 019f7961-5b00-7903-b7f4-9127e2c02476
updated_at: 2026-07-19T10:52:45+00:00
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/19/rollout-2026-07-19T13-27-31-019f7961-5b00-7903-b7f4-9127e2c02476.jsonl
cwd: /Users/sudiproy/Projects/worldwide

# User-backup rollout was discussed, implemented, and left uncommitted for review

Rollout context: In `/Users/sudiproy/Projects/worldwide`, the user asked to pressure-test and lock `plan/0003-prd-wwapi-user-backup.md` before coding, emphasizing simple readable code, production scalability, beta-bot testing on Mac, and user review before commit.

## Task 1: Lock and implement atomic user backups

Outcome: partial

Preference signals:
- The user explicitly required: “discuss → lock the plan → You do all the coding → I’ll read all of the code … if complicated … simplify it … commit only after your approval.” Future work should discuss first, avoid premature edits, and leave changes uncommitted for review.
- The user rejected removing the existing eligibility rule: “keep it. it’s simple yeet works good enough.” The locked rule remains `level() > 10`: eligible users are backed up; level 10 or below are permanently deleted.
- The user rejected a serialized aggregate and normalized child backup tables. They specified one `backup` row with typed scalar columns and JSON columns for usage, roles, inventory, timers, and reputation.
- The user specified that only `expire_at` is needed, not `backed_up_at`, because retention is fixed at one year.
- Reputation policy was locked: an edge is live only when both endpoints are active; the first user entering backup holds the complete edge in its JSON; if the counterpart is also backed up, the edge moves between backup rows; otherwise it returns to live reputation.
- Timer policy was locked around the existing enum integer keys: store complete direct-user timer records in JSON, preserve absolute expiry, and restore only timers still active. Ownership must be determined from `TimerKey`, not JSON text search.
- The user limited scheduler migration scope after rejecting a broad update: only annual usage reset moves to the durable scheduler; daily/weekly resets and other background loops remain unchanged.
- Test and production must use identical code. The beta bot/testing guild on Mac and Worldwide bot/production guild are naturally different deployments; no guild allowlist or beta-specific branch is wanted.

Key steps:
- Audited the PRD, repo guidance, existing tombstone implementation, reputation schema, timer enum, scheduler, wwbot active-data flow, and wwpage protobuf clients.
- Implemented relational `backup` schema with typed user/AFK/profile/email fields, JSON collection fields, `expire_at`, and indexed expiry cleanup. Existing generic `backups` KV table was deliberately left unchanged; rename to `kv` is deferred.
- Added atomic `backup_user_at` and `restore_user_at` flows with retryable transactions, JSON validation, idempotent writes, expiry handling, reputation transfer, and timer extraction/restoration.
- Preserved excluded gang/perk/effect/staff-board semantics. Departure pre-steps remain idempotent but are outside the selected aggregate transaction; cache eviction occurs after successful backup.
- Added restore-before-create behavior, including role lookup restoration for returning users.
- Added bounded reconciliation using database IDs and a wwbot `InactiveUsers` RPC, with a 1,000-operation budget, readiness/error handling, identical test/prod behavior, and metrics logging. The old full `ActiveDataRes.uids` path was deprecated/removed from normal behavior.
- Added durable `TimerKey::UsageReset`, annual UTC reset of active usage and cached usage, retry on reset failure, and year metadata only in backup usage JSON. Active usage schema remains unchanged.
- Added bounded expired-backup cleanup (100 rows/transaction, 30-second limit), shared with `maintain backup-clean`.
- Split large backup implementation into `backup.rs`, `backup/user.rs`, and `backup/reconcile.rs` after readability review.
- Updated protobuf/generated clients in wwapi, wwbot, and wwpage.

Failures and how to do differently:
- Strict repository-wide Clippy did not pass because of 24 existing unrelated lint findings; do not treat this as a clean Clippy validation. Relevant compilation/tests passed via `cargo check --all-targets` and targeted/all-target tests.
- Full wwbot pytest collection failed due to pre-existing missing debug files and polluted imports (`FileNotFoundError` for `mainbot/events/_helper/debug/types.py`, missing `nextcord` symbols, etc.). Focused changed tests, Ruff, and Pyright passed.
- An initial broad scheduler migration proposal was rejected by the user; keep future changes narrowly scoped to explicitly approved work.
- Early implementation attempts made backup logic too large; it was split into focused modules. Future code should preserve this readability standard and avoid clever aggregation.

Reusable knowledge:
- WWAPI uses Toasty/Turso with canonical schema in `src/core/store/schema.sql`; integration tests are under `wwapi/tests`, with serial DB fixtures and cleanup lists that must include new tables.
- Timer variants are defined in `wwapi/src/scheduler/key.rs`; direct-user ownership is now represented by `TimerKey::backup_user_id()`/equivalent exhaustive mapping. Durable timer timestamps are milliseconds, while backup expiry is seconds; restore compares accordingly.
- Generic KV data remains physically in `backups`; do not rename it as part of the user-backup rollout.
- Current deployment/testing state: no commit and no deployment were performed; the user was handed the uncommitted diff for code review.

References:
- PRD: `/Users/sudiproy/Projects/worldwide/plan/0003-prd-wwapi-user-backup.md`
- Backup schema: `/Users/sudiproy/Projects/worldwide/wwapi/src/core/store/schema.sql`
- Backup codec/helpers: `wwapi/src/core/store/backup.rs`
- Atomic operations: `wwapi/src/core/store/backup/user.rs`
- Reconciliation/cleanup: `wwapi/src/core/store/backup/reconcile.rs`
- Departure flow: `wwapi/src/state/user/mod.rs`
- Reconciliation state flow: `wwapi/src/state/misc.rs`
- Timer enum/scheduler: `wwapi/src/scheduler/key.rs`, `handler.rs`, `internal.rs`
- Bot scan/RPC: `wwbot/mainbot/lib/member_scan.py`, `mainbot/utils/grpc/server.py`
- Validation: all 193 WWAPI tests, workload benchmarks, wwpage TypeScript and 159 Vitest tests passed; wwbot focused RPC tests 2 passed; Ruff and Pyright passed.

