thread_id: 019f7694-98a3-7bd1-a01b-0482d968efe4
updated_at: 2026-07-19T07:47:59+00:00
rollout_path: /Users/sudiproy/.codex/sessions/2026/07/19/rollout-2026-07-19T00-24-37-019f7694-98a3-7bd1-a01b-0482d968efe4.jsonl
cwd: /Users/sudiproy/Projects/worldwide

# Performance investigation evolved into a durable user-backup redesign plan

Rollout context: Work occurred in `/Users/sudiproy/Projects/worldwide`, mainly `wwapi`, on branch `wal-multiprocess`. The user wanted production-like Linux testing before release, with no production mutation or remote push.

## Task 1: Diagnose wwapi archive CPU/RAM failure

Outcome: partial

Preference signals:
- The user asked to “find the causes and fix it one by one,” test before production, and ask when uncertain -> future work should be evidence-driven, incremental, and explicitly distinguish verified causes from hypotheses.
- The user corrected use of Nix and preferred the existing `script/deplay.sh` musl cross-compilation flow -> use `cargo build --release --target x86_64-unknown-linux-musl` / repository deployment tooling rather than assuming Nix.
- The user emphasized that behavior must work on the Linux test box and that production must not be touched without approval -> reproduce on disposable production copies under Linux constraints and do not deploy.

Key steps:
- Read archive, WAL, maintenance, migration, guardrail, and TDD plans; inspected git history and dirty branch state.
- Confirmed the branch was `wal-multiprocess`; experimental changes remained uncommitted in `Cargo.toml`, `src/bin/maintain.rs`, `src/core/store/leaderboard_archive.rs`, and `src/bin/cnt.rs`.
- Reproduced against Linux test-box copies of the ~442 MB production Turso file: ~4.95M leaderboard rows, 80 days, largest day ~123,571 rows.
- Existing store tests passed (`cargo test --release --test store -- leaderboard_archive --nocapture`, 2 tests), but they use tiny in-memory datasets and do not validate production scale.

Reusable knowledge:
- The original 69-minute/664 MB incident was primarily retention, not Parquet writing: evidence showed `unarchived_days=0` while the process still saturated CPU/RAM in retention. Large Turso deletes are the primary blocker.
- The current experimental “streaming” implementation is not truly bounded: it first loads a full day, then loads all paginated batches into `Vec<Vec<DeltaRow>>`, duplicating the day in memory. It also uses OFFSET pagination.
- `unarchived_days` scans/distincts the full multi-million-row table and took about 16 seconds on Linux; a MIN/MAX plus indexed day probes/range strategy completed in roughly 4 seconds in the diagnostic harness.
- Small deletes (~3,814 rows) completed in ~332 ms, while broad deletes and `DELETE ... LIMIT 100000` stalled. The 100k batch size was not validated and is beyond the scale supported by observed Turso behavior; test much smaller batches and measure execute vs commit separately.
- Existing archive handling must preserve archive-before-delete safety. Do not trust arbitrary existing Parquet files without validation; an invalid existing file was accepted by current cookie tests. Do not automatically delete `-wal`/`-tshm` files because they may contain recovery state.
- Turso multiprocess WAL is single-writer/multi-reader. Two writer processes collide on the WAL lock; a proper writer+reader coexistence test was still open.
- Kill-9 recovery failed in both WAL and prior MVCC modes; clean exit/reopen worked. This is a pre-existing Turso recovery risk, not evidence that WAL introduced the problem.
- WAL stress showed roughly 430–520 ops/sec on one disk-backed core, RSS around 38 MB, CPU ≤75%, but severe write contention at 4+ workers.

Failures and how to do differently:
- Do not infer that bounded Arrow batches imply bounded total memory; avoid collecting all batches before writing.
- Do not use large delete batches or broad cutoff deletes without production-sized measurements.
- Do not classify the stale WAL/shm workaround as safe recovery.
- Do not treat tiny `Store::memory()` archive tests as production validation.

References:
- `plan/2026-07-18-wwapi-archive-failure-report.md`
- `plan/2026-07-18-wwapi-wal-measurement-stress-plan.md`
- `plan/2026-07-18-wwapi-wal-stresstest-checklist.md`
- `wwapi/src/core/store/leaderboard_archive.rs`
- `wwapi/src/core/store/archive.rs`
- `wwapi/src/core/store/driver.rs`
- `wwapi/script/wwapi.service`
- Branch commits: `d011d54`, `674d089`, `9fe6ec1`

## Task 2: Design scalable departed-user backup model

Outcome: success

Preference signals:
- The user settled that `updated_at` already means last activity, based on cookie/XP rewards; do not introduce a redundant `last_active_at` field.
- The user chose the terminology `BackupStore`, `BackupUser`, and `backup_user`, and rejected `Dormant*` naming.
- The user decided against a separate database: use the same Turso database for ACID transactions, rename generic `backups` to `kv`, and create a new `backup` table.
- The user explicitly selected backup data: users, usage, AFK, profile settings, user roles, inventory, email, reputation, and timers; exclude gang data, perks, and staff board.
- The user wants inactive members to remain in the active database and wants indexed timestamp-based cleanup for backups older than one year.

Key steps:
- Inspected schema, callers, deletion flow, scheduler payloads, tombstone filters, and existing key/value usage.
- Verified current `backups` is the generic key/value table and `user_backup` is the tombstone table.
- Created the handoff PRD at `/Users/sudiproy/Projects/worldwide/plan/0003-prd-wwapi-user-backup.md`.

Reusable knowledge:
- The proposed design stores one versioned serialized `BackupUser` row per departed user in `backup`, with `user_id`, `data`, `backed_up_at`, `expire_at`, and `schema_version`, plus an index on `expire_at`; generic key/value data moves to `kv`.
- `backup_user` and `restore_user` should be one-transaction, idempotent operations. Sync dirty in-memory state before backup; copy selected state, verify/encode, delete active state, and evict caches only after commit.
- Restore must happen before create-user in the fetch-or-create path, so returning users do not receive blank accounts.
- Reputation is cross-user and needs an explicit policy for edges where one endpoint is active and the other backed up. Timers lack a user column and ownership must be determined by parsing typed `TimerKey` variants, not string matching.
- Normal startup/weekly sync should stop sending all 60k Discord UIDs. Member join/remove events become the common path, with bounded reconciliation only for missed events.
- Keep `user_backup` during a rollback window; remove its filters and drop it only after round-trip, failure-injection, migration, timer/reputation, and production-scale tests pass.

Failures and how to do differently:
- Do not blindly clone the full schema into backup: shared/history tables and cross-user relationships cannot be treated as a personal aggregate.
- Do not assume same-database ACID removes all design risk; timer ownership, reputation edges, cache/scheduler consistency, and excluded gang/perk semantics still require tests.
- Do not begin implementation until the PRD discussion gates are resolved.

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
