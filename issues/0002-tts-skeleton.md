---
id: 0002
title: "Pi TTS — end-to-end skeleton"
kind: enhancement
status: ready-for-agent
slice_type: AFK
blocked_by: []
created: 2026-05-03
---

## Parent
`issues/0001-prd-pi-tts.md`

## What to build

Nix derivation for `pocket-tts-cli` + minimal Pi extension that speaks `<voice>` content. Hardcoded alba voice. No commands yet.

## Concrete details

### Part A — Nix derivation
File: `~/.config/nixos/core/programs/pocket-tts.nix`

- Build `pocket-tts-cli` from `github:swairshah/pocket-tts` (`main` branch)
- `--no-default-features` (CPU-only, no CUDA, no Metal, no web-ui)
- Expose binary as `pocket-tts-cli`
- Set `POCKET_TTS_VOICES_DIR` env var to a persistent cache (`~/.cache/pocket-tts/`)
- `HF_TOKEN` support via env var (optional, for model downloads)

### Part B — Pi extension
Dir: `~/.pi/extensions/pi-tts/`

`package.json`:
```json
{
  "name": "pi-tts",
  "version": "0.1.0",
  "main": "index.ts",
  "type": "module",
  "pi": { "extensions": ["./index.ts"] },
  "peerDependencies": { "@mariozechner/pi-coding-agent": ">=0.1.0" }
}
```

`index.ts`:
- `before_agent_start` hook: inject voice prompt into system prompt (uses `<voice>` tags, 1-3 sentence summaries, don't read code verbatim)
- `message_update` hook: streaming parser — state machine tracking inside/outside `<voice>`, flushes on `</voice>` close or sentence-ending punctuation
- `message_end` hook: flush any remaining `<voice>` text
- On flush: `POST http://127.0.0.1:18080/stream` with `{"text":"...","voice":"alba"}`
- Pipe response body to `ffplay -f s16le -ar 24000 -ac 1 -nodisp -loglevel quiet -autoexit -`
- Single ffplay process — kill previous before starting new

### Part C — Verify
Run `pocket-tts-cli serve --port 18080` manually. Open Pi, ask a question. Verify `<voice>` content plays audibly through speakers.

## Acceptance criteria
- [ ] `pocket-tts-cli serve` starts, `GET /health` returns `{"status":"healthy"}`
- [ ] Pi session includes voice prompt in system prompt (visible via `/debug prompt`)
- [ ] Asking Pi "what time is it?" produces audio response from speakers
- [ ] Two `<voice>` segments in one response play sequentially

## Blocked by
- None
