---
id: 0004
title: "Pi TTS — system integration"
kind: enhancement
status: ready-for-agent
slice_type: HITL
blocked_by: ["0002"]
created: 2026-05-03
---

## Parent
`issues/0001-prd-pi-tts.md`

## What to build

Systemd user service for pocket-tts-cli + wire into NixOS config. After this, pocket-tts-cli starts automatically on boot. No manual `serve` command needed.

## Concrete changes

### File to modify: `~/.config/nixos/core/configs/default.nix`
- Add `./../programs/pocket-tts.nix` to imports

### File to modify: `~/.config/nixos/core/programs/pocket-tts.nix`
- Add systemd user service:
  - `pocket-tts-cli serve --host 127.0.0.1 --port 18080 --voice alba`
  - `wantedBy = ["default.target"]`
  - `POCKET_TTS_VOICES_DIR = ~/.cache/pocket-tts/` env var
- Voice cache dir: `~/.cache/pocket-tts/` — persistent across reboots
- `HF_TOKEN` from environment or config

### Verification
- `sudo nixos-rebuild switch`
- `systemctl --user status pocket-tts` shows running
- `curl http://127.0.0.1:18080/health` returns `{"status":"healthy"}`
- Open Pi, `/tts-status` reports healthy without manual start
- Reboot, open Pi, ask question — audio plays

## Acceptance criteria
- [ ] `pocket-tts-cli` starts as systemd user service on boot
- [ ] `systemctl --user status pocket-tts` shows active/running
- [ ] Pi `/tts-status` reports healthy on fresh boot, no manual start
- [ ] Voice cache persists across reboots (models not re-downloaded)
- [ ] `nixos-rebuild switch` succeeds with no errors

## Blocked by
- `issues/0002-tts-skeleton.md` (needs working derivation first)
