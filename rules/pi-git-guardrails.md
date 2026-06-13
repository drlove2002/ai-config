# Pi Git Guardrails

The `_pi/*` branches are pi's undo system. Every agent turn auto-commits there. Do not touch them.

## Never

- `git reset --hard` — destroys uncommitted work
- `git reset --soft` — rewrites history; equally destructive
- `git reset` — any form, on any repo, without explicit user approval
- `git branch -D` or `git branch -d` any `_pi/*` branch
- `git push` any `_pi/*` branch

## Safe

- `git log _pi/<branch>` — inspect commits
- `/revert` and `/land` — user controls these, not you
