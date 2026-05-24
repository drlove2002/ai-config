Patch a UTF-8 text file using `LINE#HASH` anchors copied verbatim from `read`. One call per file; all ops in `edits` array from the same pre-edit read.

Ops: `replace` (pos, optional end for range), `append`/`prepend` (omit pos for EOF/BOF), `replace_text` (oldText/newText, unique match only).

```json
{ "path": "src/main.ts", "edits": [
  { "op": "replace", "pos": "12#MQ", "lines": ["const x = 1;"] }
] }
```

- `lines` is literal file content: no `LINE#HASH:` prefix, no `+`/`-` markers. Match indentation.
- Copy anchors verbatim from `read` — never guess or construct them.

Success returns `--- Anchors A-B ---` with fresh anchors for the changed region (follow-up edits nearby without re-read). Errors like `[E_STALE_ANCHOR]` include `>>> LINE#HASH:` lines ready to copy for retry.
