---
id: 0003
title: "Pi TTS — commands"
kind: enhancement
status: ready-for-agent
slice_type: AFK
blocked_by: ["0002"]
created: 2026-05-03
---

## Parent
`issues/0001-prd-pi-tts.md`

## What to build

Add `/tts`, `/tts-voice`, `/tts-stop`, `/tts-status` commands to the pi-tts extension. No new files — all changes in `~/.pi/extensions/pi-tts/index.ts`.

## Commands

| Command | Behavior |
|---------|----------|
| `/tts` | Toggle on/off. Disabled = don't inject voice prompt + don't play audio. |
| `/tts-voice <name>` | Switch voice. Valid: `alba`, `marius`, `javert`, `jean`, `fantine`, `cosette`, `eponine`, `azelma`, `auto`. No arg → show current voice. |
| `/tts-stop` | Kill current ffplay child process. |
| `/tts-status` | Show server health (`GET /health`), current voice, enabled/disabled state. |

## Implementation notes

- `/tts` toggle: set an `enabled` boolean. When false, `before_agent_start` returns early (no prompt injection). `message_update` handler returns early (no speech).
- `/tts-voice`: store voice name in a variable. Pass to `POST /stream` body.
- `/tts-stop`: track ffplay `ChildProcess`, call `.kill()`. reset streaming parser state.
- `/tts-status`: `fetch` health endpoint, report alongside current settings.
- All commands use `ctx.ui.notify()` for user feedback.
- Add status bar indicator via `ctx.ui.setStatus("tts", ...)` — 🔊 when connected, ⚠️ when server down.

## Acceptance criteria
- [ ] `/tts` disables prompt injection and speech. `/tts` again re-enables.
- [ ] `/tts-voice marius` changes voice. Next response uses marius.
- [ ] `/tts-voice` with no arg shows "Current voice: marius"
- [ ] `/tts-stop` kills audio mid-speech
- [ ] `/tts-status` reports server healthy + current voice
- [ ] Status bar shows 🔊 when pocket-tts-cli is reachable

## Blocked by
- `issues/0002-tts-skeleton.md` (needs working skeleton first)
