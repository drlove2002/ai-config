---
name: commit
description: Automate the workflow of grouping unstaged changes or squashing unpushed commits into logical, high-quality conventional commits. Use to clean up git history, create smart commits from a dirty worktree, or squash many small commits.
---

# Git History & Smart Commits

Use this skill when the user wants to commit a dirty worktree logically, or clean up existing unpushed commits before a PR.

## 0. Discover Git Repos

The workspace root may not be a git repo (it may contain multiple sub-projects). Never assume `git` at the root works. Check the current directory first, then scan for nested repos sorted by recent activity:

```bash
# First: check if PWD itself is a git repo
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  repo="$PWD"
  ts=$(git -C "$repo" log -1 --format="%at" 2>/dev/null || echo "0")
  dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l)
  echo "DIRECT|$ts|$repo|$dirty"
fi

# Then: scan for nested git repos
find "$PWD" -maxdepth 3 -name ".git" -not -path "*/node_modules/*" -type d 2>/dev/null | while read g; do
  repo="$(dirname "$g")"
  # Skip if it's the same as PWD (already handled above)
  [ "$repo" = "$PWD" ] && continue
  ts=$(git -C "$repo" log -1 --format="%at" 2>/dev/null || echo "0")
  dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l)
  echo "$ts|$repo|$dirty"
done | sort -t'|' -k1 -rn | while IFS='|' read ts repo dirty; do
  echo "--- $repo ($dirty dirty) ---"
  git -C "$repo" status --short
  echo "Recent commits:"
  git -C "$repo" log --oneline -3 2>/dev/null
  echo ""
done
```

**After running:**
- If only one repo has changes, proceed with that repo automatically.
- If multiple repos have changes, present the list to the user and ask which one to commit.
- If no repo has changes, tell the user and stop.
- All subsequent `git` commands must use `git -C <repo_path> ...` or `cd <repo_path>` first.

## 1. Determine Mode

With the target repo determined, look at its git state:
- `git -C <repo> status`
- `git -C <repo> log origin/main..HEAD --oneline` (to see unpushed commits — for reference only, never push)

If the user has **unstaged/dirty changes**, use **Smart Commit Mode**.
If the user has a clean worktree but **many unpushed small commits**, use **Squash Mode**.

## Smart Commit Mode

Goal: Create well-grouped commits based on logical boundaries from a dirty worktree.

1. **Inspect changes:**
   - `git -C <repo> status --short`
   - `git -C <repo> diff --stat`
   - `git -C <repo> diff --staged --stat`
   - `git -C <repo> diff`
   - `git -C <repo> diff --staged`
2. **Normalize the index before grouping:**
   - Read `git status --short` carefully. First-column letters mean the change is already staged.
   - If any unrelated changes are staged, run `git -C <repo> restore --staged :/` before staging logical groups. This clears the index without touching the worktree.
   - Verify with `git -C <repo> diff --staged --stat`; it should be empty before you start staging the first logical group unless the whole staged set belongs in commit 1.
3. **Group files:**
   Group by feature boundary, bug fix, refactor, or paired tests/implementation.
4. **Stage & Commit:**
   - Stage one logical group at a time (`git -C <repo> add <file>`).
   - Before every commit, verify scope with `git -C <repo> diff --staged --name-status` and `git -C <repo> diff --staged --stat`.
   - If extra files appear, stop and run `git -C <repo> restore --staged :/`, then restage only the intended group.
   - Create a conventional commit (see format below).

## Hunk-Level Commit Mode

Goal: When the same file contains unrelated changes that should land in different commits, use selective patch application instead of file-level staging.

**Only use this when a single file has two or more logically unrelated changes.** Default to file-level staging otherwise.

1. **Inspect hunks:**
   `git -C <repo> diff <file>` — review the full diff of the affected file. Use default context (`-U3`); never use `-U0` or `-U1` (too bare to anchor).
2. **Identify hunk boundaries:**
   Each hunk starts with `@@ -start,len +start,len @@`. Use these markers to split the diff into separate patch files. If two unrelated changes appear in the **same hunk**, they are too close together for `git apply` to separate. Either commit them together with a clear message, or ask the user to reorder the file first.
3. **Create curated patch files:**
   Write the target hunks (including their `@@` headers and trailing context) into `/tmp/patch-<n>.diff`. Use `write` tool; never hand-construct patch headers.
4. **Stage via apply:**
   - `git -C <repo> apply --cached /tmp/patch-1.diff` — stages only those hunks
   - Verify with `git -C <repo> diff --staged` and `git -C <repo> diff`
5. **Commit:** Create a conventional commit for this logical group.
6. **Repeat** with remaining patches until the file is clean, then clean up `/tmp/patch-*.diff`.

**Critical rule:** Every patch must apply cleanly. If `git apply --cached` fails, the hunks are overlapping or stale — re-extract them from a fresh `git diff`. Never force-apply with `--reject`. Changes that appear in the same hunk are inseparable; do not fight git to split them.

## Squash Mode

Goal: Review and squash unpushed commits into a few high-quality logical commits.

1. **Verify State:** Ensure the worktree is clean.
2. **Identify unpushed commits:** `git -C <repo> log origin/main..HEAD --oneline` to see what's unreachable from upstream.
3. **Propose plan:** Tell the user which commits you'd squash into which groups, and ask for approval before moving `HEAD`.
4. **Soft reset:** After approval, run `git -C <repo> reset --soft origin/main`. Soft reset preserves file contents and stages the squashed diff.
5. **Normalize index:** Run `git -C <repo> restore --staged :/` to clear the index, then proceed to stage and commit logical groups.

## Bad Local Commit Recovery

Use this when the last local commit accidentally mixed unrelated staged changes.

1. Inspect the bad commit: `git -C <repo> show --name-status --stat HEAD`.
2. If the commit should be split and has not been pushed, ask for approval to uncommit it.
3. After approval, run `git -C <repo> reset --soft HEAD~1`.
4. Run `git -C <repo> restore --staged :/` so all changes return to the worktree unstaged.
5. Re-enter Smart Commit Mode and create logical commits one group at a time.

## Commit Message Shape

Use the conventional commit format. Every commit has a title (the first line) and an optional body and footer.

### Title: The WHY (≤72 chars)

The title must answer: **what problem does this solve?** It describes the motivation, the bug being fixed, the user-facing gap being closed. It is NOT a diff summary — do not describe what files changed or what code was written.

```text
type(scope): why we are making this change
```

| Pattern | Bad (describes what) | Good (describes why) |
|---------|---------------------|---------------------|
| Bug fix | `fix(auth): update token validation` | `fix(auth): prevent session expiry during active use` |
| Feature | `feat(shop): add pagination component` | `feat(shop): let users browse items without scrolling lag` |
| Refactor | `refactor(db): extract connection pool` | `refactor(db): stop connection leaks under concurrent load` |
| Style | `style: run formatter on all files` | `style: enforce consistent formatting after config change` |
| Chore | `chore: update dependencies` | `chore: patch CVE-2024-XYZ in transitive dep` |

**Test your title**: if someone reads only the title in `git log --oneline`, do they understand the intent? If the title reads like a file manifest, rewrite it.

### Body: The WHAT (optional but encouraged)

List what changed — files, functions, logic. Group by theme if multiple areas were touched.

```text
- Moved token refresh out of request hot-path into background poller
- Added `last_activity` column to sessions table
- Updated auth middleware to check cached validity before refresh
```

### Footer: References (optional)

```text
Fixes #42
Closes PROJ-123
```

### Full example

```text
fix(auth): prevent session expiry during active use

The token refresh was blocking every authenticated request, causing
p95 latency spikes of 2s when tokens were near expiry. Moving refresh
to a background poller keeps the user session alive without blocking.

- Extracted token refresh from request middleware into background task
- Added RefreshScheduler that runs every 5 minutes for active sessions
- Cached validity checks skip refresh when token has >10min remaining

Fixes #184
```

Valid types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`.

## Guardrails
- **NEVER** use `git add -A` or `git add .` — always add specific files (or specific hunks via `git apply --cached`).
- **NEVER** use `git add -p` — it's interactive and cannot be driven programmatically. Use `git apply --cached` with curated patches instead.
- **NEVER** commit without checking `git diff --staged --name-status` first.
- **NEVER** assume `git add <file>` narrows the commit. If unrelated files are already staged, clear the index first with `git restore --staged :/`.
- **NEVER** mix unrelated changes in the same commit. If unrelated changes exist in the same file, always use Hunk-Level Commit Mode.
- **NEVER push.** Not remotely, not interactively, not as part of any workflow. Commits are local only. If the user wants to push, they do it themselves.
- Read `git diff` before deciding grouping. For hunk-level commits, verify with `git diff --staged` before each commit.
- `git reset --soft` is allowed only for approved local history cleanup; it preserves the index and worktree. Destructive reset forms remain blocked.
- When `git apply --cached` fails, re-extract hunks from a fresh `git diff` — never force-apply.
- Ensure the original intent of squashed commits is preserved in the new message bodies.

## Output
After committing, output a summary of the new commits created and what each one contains. Do not ask about pushing or offer to push.
