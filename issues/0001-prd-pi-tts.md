---
id: 0001
title: "PRD: Pi TTS — local text-to-speech for NixOS"
kind: prd
status: needs-triage
blocked_by: []
created: 2026-05-03
---

## Problem Statement

Pi has no voice output on NixOS/Linux. The existing pi-talk extension requires Loqui.app, a macOS-only Swift application that provides a local TCP broker. Without the broker (port 18081), pi-talk cannot queue or play speech.

The TTS engine itself (pocket-tts-cli, Rust) is cross-platform and runs fine headless — but no Nix package exists for it, and no Pi extension speaks directly to its HTTP API.

## Solution

A custom Pi extension (`pi-tts`) that talks directly to pocket-tts-cli's HTTP `/stream` endpoint and plays audio through ffplay on PipeWire. pocket-tts-cli is packaged as a Nix derivation with a systemd user service.

```
LLM streams <voice>...</voice>  →  pi-tts extracts voice text
  →  HTTP POST /stream to pocket-tts-cli (:18080)
  →  raw PCM chunks piped to ffplay
  →  audio out via PipeWire
```

## User Stories

1. As a Pi user, I want the agent to speak its responses aloud using `<voice>` tags, so I can listen while doing other things.
2. As a Pi user, I want to toggle TTS on/off, so I can silence it when I don't want audio.
3. As a Pi user, I want to switch between available voices, so I can pick one I like.
4. As a Pi user, I want TTS to start automatically when my system boots, so I don't have to start the server manually.

## Implementation Decisions

### TTS engine (Nix package)
- **Source**: `github:swairshah/pocket-tts` fork
- **Binary**: `pocket-tts-cli`
- **Build**: `cargo build --release --no-default-features` (CPU-only, no CUDA, no Metal, no web-ui)
- **Nix file**: `~/.config/nixos/core/programs/pocket-tts.nix` — new derivation
- **Service**: systemd user service, auto-starts `pocket-tts-cli serve --host 127.0.0.1 --port 18080 --voice alba`
- **Env vars**: `POCKET_TTS_VOICES_DIR` pointing to a persistent cache dir; `HF_TOKEN` for model downloads
- **Voices**: alba, marius, javert, jean, fantine, cosette, eponine, azelma (auto-downloaded from HuggingFace `kyutai/pocket-tts-without-voice-cloning`)
- **Import**: add `./core/programs/pocket-tts.nix` to `~/.config/nixos/core/configs/default.nix`

### HTTP API (pocket-tts-cli)
- **Endpoint**: `POST /stream` at `http://127.0.0.1:18080/stream`
- **Request**: JSON — `{"text": "...", "voice": "alba", "temperature": 0.7}`
- **Response**: `application/octet-stream` — raw 16-bit signed little-endian PCM, mono, 24000 Hz, chunked transfer encoding
- **Health**: `GET /health` returns `{"status": "healthy", "version": "0.6.2"}`

### Pi extension (`pi-tts`)
- **Dir**: `~/.pi/extensions/pi-tts/`
- **Files**: `index.ts` (main code), `package.json` (pi metadata)
- **Prompt injection**: `before_agent_start` hook appends voice prompt teaching LLM to use `<voice>` tags
- **Streaming parser**: state machine with `parserBuffer`, `insideVoice` flag, `speakBuffer` — flushes on `</voice>` close or sentence-ending punctuation (`.!?…`)
- **Speech**: HTTP POST `/stream` to pocket-tts-cli, pipe response body to ffplay

### Audio playback
- **Command**: `ffplay -f s16le -ar 24000 -ac 1 -nodisp -loglevel quiet -autoexit -`
- **Input**: raw PCM from stdin (piped from HTTP response body)
- **Concurrency**: single ffplay child process. New `<voice>` segment kills previous ffplay before starting new one.
- **No file artifacts**: PCM never written to disk.

### Commands
| Command | Behavior |
|---------|----------|
| `/tts` | Toggle on/off — disables prompt injection + playback |
| `/tts-voice <name>` | Switch voice (`alba`, `marius`, `javert`, `jean`, `fantine`, `cosette`, `eponine`, `azelma`, `auto`) |
| `/tts-stop` | Kill current ffplay process |
| `/tts-status` | Report server health, current voice, enabled/muted state |

### Dependencies
- `ffmpeg-full` — already in `environment.systemPackages` (`core/programs/default.nix:32`)
- PipeWire — already enabled (`core/configs/audio.nix`)
- `pocket-tts-cli` — new Nix derivation
- Nothing else. No new system packages needed beyond pocket-tts-cli.

## Testing Decisions

- Manual end-to-end: start a Pi session, ask a question, verify `<voice>` content plays audibly.
- Toggle tests: `/tts` disables prompt injection and playback. `/tts` again re-enables.
- Voice switch: `/tts-voice marius` changes the voice parameter on the next request.
- Cleanup: `/tts-stop` kills the running ffplay process.
- Server health: `/tts-status` reports if pocket-tts-cli is running and responsive.

## Out of Scope

- Voice input (microphone → text → Pi). This is output-only.
- macOS Loqui.app / broker compatibility.
- Multiple voice prompt styles (succinct vs verbose).
- External app integration (inbox watcher).
- GPU acceleration (CUDA). CPU-only for now.
- Audio device selection beyond PipeWire default.
