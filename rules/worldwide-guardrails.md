# Worldwide Guardrails — FOLLOW THESE OR STOP

**Source**: session logs (Apr–May 2026). This file lives in `~/.config/ai/rules/` and is auto-injected into every session by the pi-rules extension. Auto-generated sections are refreshed daily via systemd timer.

---

## HARD RULES — Before Any Edit or Plan

### 1. Git history first
Run `git log --oneline -10 -- <file>` on every file you touch. Git tells you what recently changed and why. Skipping this caused 13 corrections across 135 sessions.

### 2. Read the repo AGENTS.md
It's already loaded in context. Re-read it. Every repo has one: wwbot, wwapi, wwpage, wwideas. Skipping this caused 3+ corrections.

### 3. Find all callers before changing any function/class
Run `grep -r "function_name\|ClassName"` across the entire repo. Present a blast-radius summary before proposing changes. This prevents the most common failure: changing one module without knowing 3 others depend on it.

### 4. This workspace root is NOT a git repo
Git repos live inside sub-projects. Always use `git -C <subproject>` or `cd` into it first. This caused 26+ corrections.

### 5. Never without explicit approval
- New gRPC status codes (FAILED_PRECONDITION, etc.)
- Naming convention changes (enum variants, proto fields, class names)
- Error handling semantics or exception type changes
- Deletion or renaming of public functions in utils/, core/, cogs/*/helper.py, events/
- Proto `package` or `service` declaration changes

### 6. Ask when unsure — never assume
When multiple approaches exist, ask. When something is unclear, stop and surface ambiguity. This caused 116+ corrections (user says "don't do that" or "that's wrong").

### 7. Delegate by default — subagent overhead is cheaper than context pollution
Subagent as default, direct work as exception. See orchestrator.md for exact thresholds (LOCK 1 routing table + Context Hygiene).

Quick reference: 1+ unknown file → scout. 2+ files to edit or 30+ lines → worker. 5+ turns on same topic → delegate next step.

### 8. Save plans before moving on
When a discussion produces a durable plan (architecture decisions, refactor phases, process changes), save it to `wwideas/issues/` or the target repo's `issues/` directory immediately — before the conversation moves on and the plan disappears into compacted history. Plans that exist only in chat are lost plans.

### 9. Subagent routing: match the right agent to the task
The routing table is injected into every session by pi-rules.ts. See orchestrator.md for the full decision tree and context hygiene rules.

### 10. Never touch production without explicit approval
- No SSH, deploy, restart, or any mutation of live systems unless the user says to do it
- No testing on production — use TEST=1, local environment, or ask first
- No debug logging in prod binaries — remove before any deploy
- No deploying uncommitted builds
- When in doubt, ask
---

## Integration Hotspots (Reference)

Changes to these files have the highest blast radius. If you touch them, grep for ALL callers before proposing anything.

### Cross-Cog Shared Views
`mainbot/cogs/mod/views/shop_menu.py` — 13 consumers outside the `mod` cog:
- `RoleShopMenu` → core/startup.py, events/scheduler.py, cogs/dev/main.py, cogs/economy/main.py, cogs/economy/views/heist.py, cogs/items/main.py, utils/debug/scan.py
- `GangItemMenu` → core/startup.py, events/scheduler.py, events/gang.py, utils/grpc/server.py, cogs/dev/main.py, cogs/gangs/main.py, cogs/gangs/views/inventory.py, cogs/items/main.py
- `GangUpgrades` → cogs/dev/main.py, cogs/items/main.py
- `NitroShop` → cogs/dev/main.py

### Cross-Cog Helper Leaks
`mainbot/cogs/gangs/helper.py` — 6 external consumers:
- `death_wish_trigger` → core/converter.py, events/_helper/_helper.py, events/_views/gift.py, cogs/economy/views/heist.py
- `gang_thread` → utils/grpc/server.py, cogs/items/helper.py, cogs/mod/views/shop_menu.py
- `remove_gang_member` → events/thread.py
- `filter_gang_name` → cogs/items/helper.py

### Reciprocal/Circular Import Pairs
- `cogs/mod/views/shop_menu.py` ↔ `cogs/gangs/helper.py`
- `cogs/mod/views/shop_menu.py` ↔ `cogs/items/helper.py`
- `cogs/economy/` ↔ `cogs/gangs/`

### gRPC Generated-Type Leaks (Stub types imported directly, bypassing wrappers)
- `mainbot/lib/gang/` types → 25+ non-grpc files (GangClient wrapper exists but is unused)
- `mainbot/lib/scheduler/EventId` → 14 files (wrapper is used, this is acceptable)
- `mainbot/lib/discord/` types → 10 files (no wrapper exists at all)
- `mainbot/lib/perk/` types → 6 files (PerkClient wrapper has zero custom methods)
- `mainbot/lib/user/` types → 15+ files (UserClient has custom methods, but callers still use raw types)

### Scheduler Event Fanout
- `perk_expiry` → events/scheduler.py (ScheduleHandler)
- `bump_reminder` → events/scheduler.py (ScheduleHandler)
- `drop_gift` → events/tasks.py (TaskHandler)
- `gitem_expiry` → events/scheduler.py (ScheduleHandler)
- `gitem_update` → events/gang.py (GangHandler)
- `gang_heist` → events/gang.py (GangHandler)
- `gevent_*` → events/gang.py (GangHandler, dispatched from utils/grpc/server.py)
- `test_timer` → NO LISTENER (dead dispatch)

### Cross-Repo Proto Blast Radius
Changing ANY of these 10 proto packages requires updates in BOTH wwbot AND wwpage:
`common`, `discord`, `gang`, `item`, `leaderboard`, `misc`, `scheduler`, `shop`, `stats`, `user`

After proto changes:
1. Regenerate wwbot stubs: `./scripts/protoc.sh`
2. Regenerate wwpage stubs: `./scripts/proto.sh`
3. Rebuild wwapi: `cargo build` (debug proto regen)
4. Verify all importers in both downstream repos

---

<!-- AUTO:FAILURE_MODES_START -->
## Known Failure Modes (from session analysis)

| # | Pattern | Count | Prevented by rule |
|---|---------|-------|-------------------|
| FM1 | Git history not checked before changes | 51 sessions with pattern | Rule 1 |
| FM2 | Unsafe assumptions (wrong error codes, naming, semantics) | 182 sessions with pattern | Rules 5, 6 |
| FM3 | Agent stops mid-flow on multi-file work | 6 sessions with pattern | Rule 7 (delegate to worker) |
| FM4 | Over-engineering (should be simpler) | 76 sessions with pattern | Rules 6, 7 |
| FM5 | Git commands at workspace root (not a repo) | 20 sessions with pattern | Rule 4 |
| FM6 | AGENTS.md not read before acting | 48 sessions with pattern | Rule 2 |
| FM7 | Edit tool failures (stale anchors, no pre-read) | 45 sessions with pattern | Read before edit |
| FM8 | Circular thinking / open-thinking paralysis | 4 sessions with pattern | No Circular Thinking (orchestrator.md) |
<!-- AUTO:FAILURE_MODES_END -->

---

## Git Layout

```
/data/Projects/worldwide          ← NOT a git repo
├── wwbot/                        ← git repo
├── wwapi/                        ← git repo
├── wwpage/                       ← git repo
└── wwideas/                      ← git repo
```

---

## Toolchain Quick Reference

| Repo | Dev shell | Build/test | Lint/format |
|------|-----------|------------|-------------|
| wwbot | `nix develop -c bash` | `uv run mainbot` | `ruff check mainbot --fix && ruff format mainbot && pyright` |
| wwapi | `nix develop -c bash` | `cargo build --release` / `cargo test --release --test mod` | `cargo clippy && nix develop -c rustfmt --edition 2024 <paths>` |
| wwpage | `nix develop -c bash` | `pnpm build` / `pnpm test` | `pnpm exec tsc --noEmit` |

---

<!-- AUTO:EVOLUTION_META_START -->
## Self-Evolution

This file's auto-generated sections (Failure Modes, this metadata block) are refreshed daily by `update-guardrails.py` triggered via systemd timer. The HARD RULES and Integration Hotspots sections are hand-curated and never overwritten.

**Last analysis**: 2026-06-26 (325 sessions, incremental)
**Run**: `~/.config/ai/scripts/update-guardrails.py`
<!-- AUTO:EVOLUTION_META_END -->
