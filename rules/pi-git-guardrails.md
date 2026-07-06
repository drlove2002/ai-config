# Pi Git Guardrails

Protect the working tree and index while still allowing safe local history cleanup.

## Never

- `git reset --hard` — destroys uncommitted work; **blocked**
- `git reset --mixed` — rewrites the index and can lose staging intent; **blocked**
- `git reset` (no flag, defaults to --mixed) — **blocked**
- `git reset HEAD` — mixed reset spelling; **blocked**
- `git push` without explicit user approval

## Allowed

- `git reset --soft HEAD~1` — uncommit while preserving staged changes and working tree files
- `git reset --soft <ref>` — safe for approved local history cleanup; index and working tree stay intact
- `git restore --staged :/` — clear the index before staging logical commit groups
- `git restore --staged <path>` — unstage specific paths without touching file contents
