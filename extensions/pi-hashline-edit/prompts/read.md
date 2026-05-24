Read a UTF-8 text file. Each line is `LINE#HASH:content` — copy anchors verbatim into `edit`.

Use `offset`/`limit` to page through. Cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}. When truncated, the tail gives the next `offset`.

Images return as attachments. Binary files and directories are rejected.
