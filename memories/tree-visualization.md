# Tree Visualization

View a project's file layout quickly:

```
eza -T --git-ignore -L 3 <path>
exa -T -L 3 src
```

- `-T` — tree view
- `-L <N>` — depth limit
- `--git-ignore` — skip `.gitignore` entries (omit if no `.gitignore` or want full tree)
