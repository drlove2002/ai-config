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
- `git -C <repo> log origin/main..HEAD --oneline` (or whatever the upstream branch is).

If the user has **unstaged/dirty changes**, use **Smart Commit Mode**.
If the user has a clean worktree but **many unpushed small commits**, use **Squash Mode**.

## Smart Commit Mode

Goal: Create well-grouped commits based on logical boundaries from a dirty worktree.

1. **Inspect changes:**
   - `git -C <repo> diff`
   - `git -C <repo> diff --staged`
2. **Group files:**
   Group by feature boundary, bug fix, refactor, or paired tests/implementation.
3. **Stage & Commit:**
   - Stage one logical group at a time (`git -C <repo> add <file>`).
   - Create a conventional commit (see format below).

## Squash Mode

Goal: Review and squash unpushed commits into a few high-quality logical commits.

1. **Verify State:** Ensure the worktree is clean.
2. **Soft Reset:** Run `git -C <repo> reset --soft origin/main` to uncommit all unpushed changes while keeping them staged.
3. **Unstage:** Run `git -C <repo> reset HEAD` to unstage everything so you can selectively group them.
4. **Group Changes:** Analyze changes (`git diff --stat`). Group related files together.
5. **Stage & Commit:** Selectively `git -C <repo> add` and commit them logically.

## Commit Message Shape

Use the conventional commit format:

```text
type(scope): short description

- Detailed bullet points for what changed
- Brief explanation of why when useful
```

Valid types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`.

## Guardrails
- **NEVER** use `git add -A` or `git add .` — always add specific files.
- **NEVER** mix unrelated changes in the same commit.
- Read the diffs (`git diff`) before deciding grouping.
- Ensure the original intent of squashed commits is preserved in the new message bodies.

## Output
After committing, output a summary of the new commits created and what each one contains.
