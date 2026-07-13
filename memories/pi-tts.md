# pi-tts Extension (voice output)

Local TTS for pi via the `pi-tts` extension at `~/.config/ai/extensions/pi-tts/`.

## Backend: Pocket TTS (permanent uv-managed install)

- **Pocket TTS** is the TTS backend. The extension auto-spawns `bin/pocket-tts-cli
  serve` on session start; speech uses the macOS native `afplay` player.
- Pocket TTS installs into a **permanent uv virtualenv** at `extensions/pi-tts/.venv`
  (created by `extensions/pi-tts/setup.sh`). Not `uvx`, not nix.
- The venv is gitignored; a generated wrapper `extensions/pi-tts/bin/pocket-tts-cli`
  execs `.venv/bin/pocket-tts "$@"`. The wrapper is also gitignored.
- Pinned package: `pocket-tts==2.1.0`.
- Voices: alba, marius, javert, jean, fantine, cosette, eponine, azelma, auto.

## Config (`~/.config/ai/pi-tts.json`)

- Keys: `enabled`, `voice`, `host`, `port`.
- `pi-tts.json` sets `voice="alba"`, `host="127.0.0.1"`, `port=18080`, `enabled=false`.
- Effective default voice: read from `pi-tts.json`. If the config file is absent,
  the extension falls back to `"alba"` (see `extensions/pi-tts/index.ts`).

## Installation / repair

```bash
extensions/pi-tts/setup.sh
```

Requires `uv`. Creates the venv, installs the pinned package, builds the wrapper,
and verifies with `--help`. Idempotent: re-running repairs the install.

## Emotion handling

- `<emotion>` tags map to Pocket TTS temperature / eos thresholds:
  happy→0.9, excited→1.0, calm→0.5, sad→0.4/eos -6.0, whisper→0.6, angry→0.95.
- Inline non-verbal tags render natively: `[sigh]`, `[laughter]`, `[surprise-oh]`,
  `[question-ah]`, `[dissatisfaction-hnn]`, `[confirmation-en]`, etc.

## Reload gotcha

- pi extensions load at session start, no hot-reload. After editing
  `extensions/pi-tts/*`, **restart pi** (quit + reopen) for changes to take effect.
  A session's pi PID/start time persists across edits until restarted.

## Commands

- `tts` — toggle on/off
- `tts-voice <name>` — change voice (alba/marius/javert/jean/fantine/cosette/eponine/azelma/auto)
- `tts-stop` — stop current speech
- `tts-status` — show status + diagnostics
