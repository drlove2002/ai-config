#!/usr/bin/env -S npx tsx
/**
 * Test the voice tag parser ↔ TTS pipeline directly from CLI.
 *
 * Usage:
 *   echo '<voice><excited>Hello!</excited><calm>World.</calm></voice>' | ./speak.ts
 *   ./speak.ts '<voice>Just testing</voice>'
 *   ./speak.ts          # reads stdin interactively, then speaks
 */

import { spawn } from "node:child_process";
import { Readable } from "node:stream";

const TTS_HOST = "127.0.0.1";
const TTS_PORT = 18080;

const EMOTIONS: Record<string, { temp: number; eos?: number }> = {
  happy: { temp: 0.9 },
  excited: { temp: 1.0 },
  calm: { temp: 0.5 },
  sad: { temp: 0.4, eos: -6.0 },
  whisper: { temp: 0.6 },
  angry: { temp: 0.95 },
};

interface Segment {
  text: string;
  temperature?: number;
  eosThreshold?: number;
}

// --- Parser (same as index.ts / test-parser.ts) ---

function longestTagPrefix(text: string, tag: string): number {
  for (let i = tag.length; i > 0; i--) {
    if (text.endsWith(tag.slice(0, i))) return i;
  }
  return 0;
}

function parseVoiceTags(input: string): Segment[] {
  const out: Segment[] = [];
  let buf = "";
  let inside = false;
  let emotion: string | null = null;
  let voiceBuf = "";

  function flush() {
    const t = voiceBuf.trim();
    if (t) {
      const s: Segment = { text: t };
      if (emotion) {
        const e = EMOTIONS[emotion];
        s.temperature = e.temp;
        if (e.eos != null) s.eosThreshold = e.eos;
      }
      out.push(s);
    }
    voiceBuf = "";
  }

  function feed(delta: string) {
    buf += delta;
    while (buf.length > 0) {
      if (!inside) {
        const idx = buf.indexOf("<voice>");
        if (idx >= 0) {
          buf = buf.slice(idx + "<voice>".length);
          inside = true;
          emotion = null;
          voiceBuf = "";
          continue;
        }
        const keep = longestTagPrefix(buf, "<voice>");
        buf = keep > 0 ? buf.slice(-keep) : "";
        return;
      }

      const tagIdx = buf.indexOf("<");
      if (tagIdx === -1) {
        const keep = buf.length > 0 ? 1 : 0;
        voiceBuf += buf.slice(0, buf.length - keep);
        buf = keep > 0 ? buf.slice(-keep) : "";
        return;
      }
      if (tagIdx > 0) {
        voiceBuf += buf.slice(0, tagIdx);
        buf = buf.slice(tagIdx);
        continue;
      }

      if (buf.startsWith("</voice>")) {
        flush();
        buf = buf.slice("</voice>".length);
        inside = false;
        continue;
      }

      if (buf.startsWith("</")) {
        const gtIdx = buf.indexOf(">");
        if (gtIdx === -1) return;
        if (gtIdx < 30) {
          const word = buf.slice(2, gtIdx).trim().toLowerCase();
          if (word in EMOTIONS || word === "normal") {
            flush();
            buf = buf.slice(gtIdx + 1);
            continue;
          }
        }
        voiceBuf += "<";
        buf = buf.slice(1);
        continue;
      }

      const gtIdx = buf.indexOf(">");
      if (gtIdx > 1 && gtIdx < 30) {
        const word = buf.slice(1, gtIdx).trim().toLowerCase();
        if (word in EMOTIONS || word === "normal") {
          flush();
          emotion = word === "normal" ? null : word;
          buf = buf.slice(gtIdx + 1);
          continue;
        }
      }

      if (gtIdx === -1) return;
      voiceBuf += "<";
      buf = buf.slice(1);
    }
  }

  for (const ch of input) feed(ch);
  if (voiceBuf) flush();
  return out;
}

// --- TTS pipeline ---

async function checkServer(): Promise<boolean> {
  try {
    const r = await fetch(`http://${TTS_HOST}:${TTS_PORT}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function speakSegment(seg: Segment): Promise<void> {
  const form = new FormData();
  form.set("text", seg.text);
  form.set("voice_url", "alba");

  const resp = await fetch(`http://${TTS_HOST}:${TTS_PORT}/tts`, {
    method: "POST",
    body: form,
  });

  if (!resp.ok || !resp.body) {
    console.error(`TTS failed: ${resp.status} for "${seg.text}"`);
    return;
  }

  const ffplay = spawn("ffplay", [
    "-nodisp",
    "-loglevel", "quiet",
    "-autoexit",
    "-",
  ]);

  await new Promise<void>((resolve) => {
    ffplay.on("error", resolve);
    ffplay.on("exit", resolve);
    const nodeStream = Readable.fromWeb(resp.body as any);
    nodeStream.pipe(ffplay.stdin!);
    ffplay.stdin?.on("error", () => { ffplay.kill(); resolve(); });
    nodeStream.on("error", () => { ffplay.kill(); resolve(); });
  });
}

async function main() {
  const ok = await checkServer();
  if (!ok) {
    console.error("pocket-tts not running on port 18080");
    process.exit(1);
  }

  // Read input
  let input = "";
  if (process.argv.length > 2) {
    input = process.argv.slice(2).join(" ");
  } else if (!process.stdin.isTTY) {
    // Piped input
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    input = Buffer.concat(chunks).toString("utf-8");
  } else {
    // Interactive: type and press Ctrl+D
    console.log("Paste your voice script, then Ctrl+D to speak:");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    input = Buffer.concat(chunks).toString("utf-8");
  }

  if (!input.trim()) {
    console.error("No input");
    process.exit(1);
  }

  const segments = parseVoiceTags(input);
  if (segments.length === 0) {
    console.log("No <voice> segments found in input.");
    process.exit(0);
  }

  console.log(`Speaking ${segments.length} segments:\n`);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const emo = s.temperature ? ` (t=${s.temperature}${s.eosThreshold ? ` eos=${s.eosThreshold}` : ""})` : "";
    console.log(`  [${i + 1}] "${s.text}"${emo}`);
    await speakSegment(s);
  }
  console.log("\nDone.");
}

main().catch(console.error);
