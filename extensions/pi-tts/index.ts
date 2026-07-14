/**
 * pi-tts — Local text-to-speech extension for Pi
 *
 * Speaks <voice> tagged content from assistant responses using
 * pocket-tts for synthesis and afplay (macOS native) for audio output.
 *
 * Requires pocket-tts running on localhost:18080.
 * Setup: ./setup.sh
 * Start: ./bin/pocket-tts-cli serve --host 127.0.0.1 --port 18080
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

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
const __dirname = dirname(fileURLToPath(import.meta.url));
const TTS_BINARY = join(__dirname, "bin", "pocket-tts-cli");

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
  let ttsServer: ChildProcess | null = null;
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

  // ── Server lifecycle ──

  async function startTtsServer(): Promise<boolean> {
    if (serverReady) return true;
    if (!existsSync(TTS_BINARY)) {
      lastDiagnosis = `Binary not found: ${TTS_BINARY}`;
      return false;
    }

    stopTtsServer();

    let launchFailure = "";
    ttsServer = spawn(TTS_BINARY, [
      "serve",
      "--host", ttsHost,
      "--port", String(ttsPort),
    ], {
      stdio: "ignore",
      detached: false,
    });

    ttsServer.on("error", (err) => {
      launchFailure = `Server spawn failed: ${err.message}`;
      lastDiagnosis = launchFailure;
      ttsServer = null;
      serverReady = false;
    });

    ttsServer.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        launchFailure = `Server exited with code ${code}`;
        lastDiagnosis = launchFailure;
      }
      ttsServer = null;
      serverReady = false;
    });

    // Wait for server to come up (poll up to 5s)
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (launchFailure) return false;
      if (await checkServer()) return true;
    }

    lastDiagnosis = launchFailure || `Server started but not reachable on ${ttsHost}:${ttsPort}`;
    return false;
  }

  function stopTtsServer() {
    if (ttsServer) {
      ttsServer.kill();
      ttsServer = null;
    }
    serverReady = false;
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
      const form = new FormData();
      form.set("text", text);
      if (currentVoice !== "auto") {
        form.set("voice_url", currentVoice);
      }

      const resp = await fetch(`http://${ttsHost}:${ttsPort}/tts`, {
        method: "POST",
        body: form,
      });

      if (!resp.ok || !resp.body) return;

      // Buffer response to a temp file for afplay (macOS native player)
      const chunks: Buffer[] = [];
      const reader = resp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      const audioData = Buffer.concat(chunks);
      const tmpFile = join(tmpdir(), `pi-tts-${Date.now()}.wav`);
      writeFileSync(tmpFile, audioData);

      currentFfplay = spawn("afplay", [tmpFile]);

      await new Promise<void>((resolve) => {
        currentFfplay!.on("error", () => resolve());
        currentFfplay!.on("exit", () => {
          try { unlinkSync(tmpFile); } catch {}
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
    if (!enabled) {
      updateStatus(ctx);
      return;
    }

    await checkServer();
    if (!serverReady) {
      await startTtsServer();
    }
    updateStatus(ctx);
    if (!serverReady) {
      ctx.ui.notify(
        `🔇 TTS offline: ${diagnose()}`,
        "warning"
      );
    }
  });

  pi.on("message_start", async (event) => {
    if (event.message.role === "assistant") {
      resetStreamingState();
      if (enabled && !serverReady) await checkServer();
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
    stopTtsServer();
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
      if (!enabled) {
        stopSpeech();
      } else if (!serverReady) {
        await checkServer();
        if (!serverReady) await startTtsServer();
      }
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
        // Restart server with new voice
        if (enabled) {
          stopSpeech();
          stopTtsServer();
          await startTtsServer();
        }
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
        lines.push(`Start: pocket-tts-cli serve --host ${ttsHost} --port ${ttsPort}`);
      }
      ctx.ui.notify(lines.join("\n"), serverReady ? "info" : "warning");
      updateStatus(ctx);
    },
  });
}
