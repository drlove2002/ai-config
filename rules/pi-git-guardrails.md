# Pi Git Guardrails

The `_pi/*` branches are pi's undo system. Every agent turn auto-commits there. Do not touch them.

## Never

- `git reset --hard` — destroys uncommitted work; **blocked**
- `git reset --mixed` — rewrites working tree; **blocked**
- `git reset` (no flag, defaults to --mixed) — **blocked**
- `git branch -D` or `git branch -d` any `_pi/*` branch
- `git push` any `_pi/*` branch

## Allowed

- `git reset --soft HEAD~1` — uncommit while preserving staged changes
- `git reset --soft` (with explicit flag) — safe; index and working tree untouched
- `git log _pi/<branch>` — inspect commits
- `/revert` and `/land` — user controls these, not you
