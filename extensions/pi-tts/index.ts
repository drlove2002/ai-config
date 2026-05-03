/**
 * pi-tts — Local text-to-speech extension for Pi
 *
 * Speaks <voice> tagged content from assistant responses using
 * pocket-tts-cli for synthesis and ffplay for audio output.
 *
 * Requires pocket-tts-cli running on localhost:18080.
 * Build: nix build
 * Start: ./result/bin/pocket-tts-cli serve --port 18080 --voice alba
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "ai");
const CONFIG_PATH = join(CONFIG_DIR, "pi-tts.json");

interface TtsConfig {
  voice?: string;
  host?: string;
  port?: number;
  enabled?: boolean;
}

function loadConfig(): TtsConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function saveConfig(config: TtsConfig) {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch { /* ignore */ }
}

const TTS_HOST = "127.0.0.1";
const TTS_PORT = 18080;
const VOICES = ["alba", "marius", "javert", "jean", "fantine", "cosette", "eponine", "azelma"];

// Emotion → temperature/eos mapping for <voice emotion> tags
const EMOTIONS: Record<string, { temp: number; eos?: number }> = {
  happy: { temp: 0.9 },
  excited: { temp: 1.0 },
  calm: { temp: 0.5 },
  sad: { temp: 0.4, eos: -6.0 },
  whisper: { temp: 0.6 },
  angry: { temp: 0.95 },
};

const VOICE_PROMPT = `
## Voice Output

You can speak using <voice> tags. Only tagged content is spoken.

Tags:
<voice>text</voice> — plain speech
<voice><happy>text</happy></voice> — with emotion

Emotions: <happy>, <excited>, <calm>, <sad>, <whisper>, <angry>, <normal>
`;

export default function (pi: ExtensionAPI) {
  const initConfig = loadConfig();
  let enabled = initConfig.enabled ?? true;
  let currentVoice = initConfig.voice ?? "alba";
  const ttsHost = initConfig.host ?? "127.0.0.1";
  const ttsPort = initConfig.port ?? 18080;
  let currentFfplay: ChildProcess | null = null;
  let speakQueue: Promise<void> = Promise.resolve();
  let serverReady = false;

  // Streaming parser state
  let lastFullText = "";
  let parserBuffer = "";
  let voiceBuffer = "";
  let insideVoice = false;
  let speakBuffer = "";
  let currentEmotion: string | null = null;

  // ── Health check & diagnostics ──

  let lastDiagnosis = "";

  async function checkServer(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(`http://${ttsHost}:${ttsPort}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      serverReady = resp.ok;
      if (serverReady) lastDiagnosis = "";
      else lastDiagnosis = `Server returned ${resp.status}`;
      return serverReady;
    } catch (e: any) {
      serverReady = false;
      if (e?.name === "AbortError") {
        lastDiagnosis = `No response on ${ttsHost}:${ttsPort} (timeout)`;
      } else if (e?.code === "ECONNREFUSED") {
        lastDiagnosis = `Nothing listening on ${ttsHost}:${ttsPort}`;
      } else {
        lastDiagnosis = `Can't reach ${ttsHost}:${ttsPort}: ${e?.message || e}`;
      }
      return false;
    }
  }

  function diagnose(): string {
    if (serverReady) return "Server running ✓";
    return lastDiagnosis || `Server not running`;
  }

  // ── Speech ──

  async function speak(text: string, temperature?: number, eosThreshold?: number) {
    const trimmed = text.trim();
    if (!trimmed || !enabled || !serverReady) return;

    // Queue: wait for previous speech to finish, then start new one
    speakQueue = speakQueue.then(() => speakOne(trimmed, temperature, eosThreshold));
    await speakQueue;
  }

  async function speakOne(text: string, temperature?: number, eosThreshold?: number) {
    try {
      const body: Record<string, unknown> = { text, voice: currentVoice };
      if (temperature != null) body.temperature = temperature;
      if (eosThreshold != null) body.eos_threshold = eosThreshold;

      const resp = await fetch(`http://${ttsHost}:${ttsPort}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok || !resp.body) return;

      const ffplay = spawn("ffplay", [
        "-f", "s16le",
        "-ar", "24000",
        "-nodisp",
        "-loglevel", "quiet",
        "-autoexit",
        "-",
      ]);

      currentFfplay = ffplay;

      await new Promise<void>((resolve) => {
        ffplay.on("error", () => resolve());
        ffplay.on("exit", () => resolve());

        const nodeStream = Readable.fromWeb(resp.body as any);
        nodeStream.pipe(ffplay.stdin!);
        nodeStream.on("error", () => {
          ffplay.kill();
          resolve();
        });
      });

    } catch {
      serverReady = false;
    }
  }

  function stopSpeech() {
    if (currentFfplay) {
      currentFfplay.kill();
      currentFfplay = null;
    }
    speakQueue = Promise.resolve();
  }

  // ── Streaming parser ──

  function longestTagPrefix(text: string, tag: string): number {
    const max = Math.min(text.length, tag.length - 1);
    for (let len = max; len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  }

  function flushSpeakBuffer(force = false) {
    if (!speakBuffer.trim()) return;

    const emotion = EMOTIONS[currentEmotion ?? ""];

    if (force) {
      const chunk = speakBuffer;
      speakBuffer = "";
      currentEmotion = null;
      speak(chunk, emotion?.temp, emotion?.eos);
      return;
    }

    // Flush at sentence boundary
    for (let i = 0; i < speakBuffer.length; i++) {
      const ch = speakBuffer[i];
      const next = speakBuffer[i + 1] ?? "";
      if (".!?…".includes(ch) && (!next || /[\s"')\]]/.test(next))) {
        const chunk = speakBuffer.slice(0, i + 1);
        speakBuffer = speakBuffer.slice(i + 1).replace(/^\s+/, "");
        speak(chunk, emotion?.temp, emotion?.eos);
        return;
      }
    }

    // Fallback: flush at word boundary if buffer is long
    if (speakBuffer.length >= 140) {
      const split = speakBuffer.lastIndexOf(" ", 110);
      const idx = split > 60 ? split : 110;
      const chunk = speakBuffer.slice(0, idx);
      speakBuffer = speakBuffer.slice(idx).replace(/^\s+/, "");
      speak(chunk, emotion?.temp, emotion?.eos);
    }
  }

  function streamVoiceText(text: string, forceFlush = false) {
    if (text) speakBuffer += text;
    flushSpeakBuffer(forceFlush);
  }

  function processDelta(delta: string) {
    if (!delta) return;
    parserBuffer += delta;

    while (parserBuffer.length > 0) {
      if (!insideVoice) {
        // Look for <voice> (emotions now go inside as nested tags)
        const openIdx = parserBuffer.indexOf("<voice>");
        if (openIdx >= 0) {
          parserBuffer = parserBuffer.slice(openIdx + "<voice>".length);
          insideVoice = true;
          currentEmotion = null;
          continue;
        }

        // No <voice> found yet — keep partial suffix
        const keep = longestTagPrefix(parserBuffer, "<voice>");
        parserBuffer = keep > 0 ? parserBuffer.slice(-keep) : "";
        return;
      }

      // Inside voice — handle emotion switches and close tag
      // Find the next < tag
      const tagIdx = parserBuffer.indexOf("<");

      // No tags — accumulate all but last char (might be partial <)
      if (tagIdx === -1) {
        const keep = parserBuffer.length > 0 ? 1 : 0;
        voiceBuffer += parserBuffer.slice(0, parserBuffer.length - keep);
        parserBuffer = keep > 0 ? parserBuffer.slice(-keep) : "";
        return;
      }

      // Text before the first tag is clean — accumulate it
      if (tagIdx > 0) {
        voiceBuffer += parserBuffer.slice(0, tagIdx);
        parserBuffer = parserBuffer.slice(tagIdx);
        continue; // re-enter to process the tag
      }

      // At a < — parse the tag
      // </voice> — close
      if (parserBuffer.startsWith("</voice>")) {
        if (voiceBuffer) streamVoiceText(voiceBuffer, true);
        voiceBuffer = "";
        parserBuffer = parserBuffer.slice("</voice>".length);
        insideVoice = false;
        continue;
      }

      // </emotion> — flush accumulated text, strip tag silently
      if (parserBuffer.startsWith("</")) {
        const gtIdx = parserBuffer.indexOf(">");
        if (gtIdx === -1) return; // partial closing tag, wait for more
        if (gtIdx < 30) {
          const word = parserBuffer.slice(2, gtIdx).trim().toLowerCase();
          if (word in EMOTIONS || word === "normal") {
            if (voiceBuffer) streamVoiceText(voiceBuffer, true);
            voiceBuffer = "";
            parserBuffer = parserBuffer.slice(gtIdx + 1);
            continue;
          }
        }
        // Unknown </tag> — treat < as literal text
        voiceBuffer += "<";
        parserBuffer = parserBuffer.slice(1);
        continue;
      }

      // <emotion> — flush accumulated text, switch emotion
      const gtIdx = parserBuffer.indexOf(">");
      if (gtIdx > 1 && gtIdx < 30) {
        const word = parserBuffer.slice(1, gtIdx).trim().toLowerCase();
        if (word in EMOTIONS || word === "normal") {
          if (voiceBuffer) streamVoiceText(voiceBuffer, true);
          voiceBuffer = "";
          currentEmotion = word === "normal" ? null : word;
          parserBuffer = parserBuffer.slice(gtIdx + 1);
          continue;
        }
      }

      // Unknown < or partial tag — treat < as literal
      if (gtIdx === -1) return; // partial tag, wait for more
      voiceBuffer += "<";
      parserBuffer = parserBuffer.slice(1);
    }
  }

  async function processStreamingText(fullText: string) {
    if (!enabled) return;

    if (!serverReady) {
      await checkServer();
      if (!serverReady) return;
    }

    let delta = "";
    if (fullText.startsWith(lastFullText)) {
      delta = fullText.slice(lastFullText.length);
    } else {
      // Stream was rewritten — reset
      parserBuffer = "";
      insideVoice = false;
      speakBuffer = "";
      delta = fullText;
    }

    lastFullText = fullText;
    processDelta(delta);
  }

  function resetStreamingState(flushRemainder = false) {
    if (flushRemainder) {
      if (insideVoice && parserBuffer) {
        streamVoiceText(parserBuffer, true);
      } else {
        flushSpeakBuffer(true);
      }
    }
    lastFullText = "";
    parserBuffer = "";
    insideVoice = false;
    speakBuffer = "";
    currentEmotion = null;
  }

  // ── Hooks ──

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return { systemPrompt: event.systemPrompt + "\n" + VOICE_PROMPT };
  });

  pi.on("session_start", async (_event, ctx) => {
    await checkServer();
    updateStatus(ctx);
    if (!serverReady) {
      ctx.ui.notify(
        `🔇 TTS offline: ${diagnose()}\nStart: pocket-tts-cli serve --port ${ttsPort} --voice ${currentVoice}`,
        "warning"
      );
    }
  });

  pi.on("message_start", async (event) => {
    if (event.message.role === "assistant") {
      resetStreamingState();
      if (!serverReady) await checkServer();
    }
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;

    const textParts = event.message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);

    const fullText = textParts.join(" ");
    await processStreamingText(fullText);
  });

  pi.on("message_end", async (event) => {
    if (event.message.role === "assistant") {
      resetStreamingState(true);
    }
  });

  pi.on("session_shutdown", async () => {
    stopSpeech();
  });

  // ── Status bar helper ──

  function updateStatus(ctx: any) {
    const t = ctx?.ui?.theme;
    const d = (txt: string) => t ? t.fg("dim", txt) : txt;
    const w = (txt: string) => t ? t.fg("warning", txt) : txt;

    let text: string;
    if (!enabled) {
      text = d("tts: off");
    } else if (serverReady) {
      text = d("tts: on");
    } else {
      text = w("tts: down");
    }

    // Try shared status bar first, fall back to built-in setStatus
    const register = (globalThis as any).__statusBarRegister;
    if (register) {
      register("tts", text, 10);
    } else {
      ctx.ui.setStatus("tts", text);
    }
  }

  // ── Commands ──

  pi.registerCommand("tts", {
    description: "Toggle TTS on/off",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      if (!enabled) stopSpeech();
      saveConfig({ voice: currentVoice, host: ttsHost, port: ttsPort, enabled });
      const serverStatus = serverReady ? "server up" : `server down (${diagnose()})`;
      ctx.ui.notify(
        enabled ? `🔊 TTS on (${serverStatus})` : `🔇 TTS off`,
        enabled ? "info" : "warning"
      );
      updateStatus(ctx);
    },
  });

  pi.registerCommand("tts-voice", {
    description: `Change TTS voice (alba, marius, javert, jean, fantine, cosette, eponine, azelma, auto)`,
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify(`Current voice: ${currentVoice}\nAvailable: ${VOICES.join(", ")}`, "info");
        return;
      }
      const voice = args.trim().toLowerCase();
      if (voice === "auto" || VOICES.includes(voice)) {
        currentVoice = voice;
        saveConfig({ voice, host: ttsHost, port: ttsPort, enabled });
        ctx.ui.notify(`🎤 Voice: ${voice} (saved)`, "info");
      } else {
        ctx.ui.notify(`Unknown voice: ${voice}\nAvailable: ${VOICES.join(", ")}`, "warning");
      }
    },
  });

  pi.registerCommand("tts-stop", {
    description: "Stop current speech",
    handler: async (_args, ctx) => {
      stopSpeech();
      resetStreamingState();
      ctx.ui.notify("Speech stopped", "info");
    },
  });

  pi.registerCommand("tts-status", {
    description: "Show TTS status and diagnostics",
    handler: async (_args, ctx) => {
      await checkServer();
      const lines = [
        `Server: ${serverReady ? "✓ running" : "✗ " + diagnose()}`,
        `TTS: ${enabled ? "enabled" : "disabled"}`,
        `Voice: ${currentVoice}`,
        `Endpoint: ${ttsHost}:${ttsPort}`,
      ];
      if (!serverReady) {
        lines.push(`Start: pocket-tts-cli serve --port ${ttsPort} --voice ${currentVoice}`);
      }
      ctx.ui.notify(lines.join("\n"), serverReady ? "info" : "warning");
      updateStatus(ctx);
    },
  });
}
