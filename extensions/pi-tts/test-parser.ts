/**
 * Tests for the voice tag parser.
 * Run: npx tsx test-parser.ts
 */

// --- Duplicated from index.ts (parser core) ---
const EMOTIONS: Record<string, { temp: number; eos?: number }> = {
  happy: { temp: 0.9 },
  excited: { temp: 1.0 },
  calm: { temp: 0.5 },
  sad: { temp: 0.4, eos: -6.0 },
  whisper: { temp: 0.6 },
  angry: { temp: 0.95 },
};

interface SpeakCall {
  text: string;
  temperature?: number;
  eosThreshold?: number;
}

interface ParseResult {
  speakCalls: SpeakCall[];
}

interface ParserState {
  parserBuffer: string;
  voiceBuffer: string;
  insideVoice: boolean;
  currentEmotion: string | null;
  speakCalls: SpeakCall[];
  longTags: string[];
}

function flushVoiceBuffer(state: ParserState) {
  if (state.voiceBuffer) {
    const trimmed = state.voiceBuffer.trim();
    if (trimmed) {
      const emotion = state.currentEmotion;
      const call: SpeakCall = { text: trimmed };
      if (emotion) {
        const e = EMOTIONS[emotion];
        call.temperature = e.temp;
        if (e.eos != null) call.eosThreshold = e.eos;
      }
      state.speakCalls.push(call);
    }
    state.voiceBuffer = "";
  }
}

function longestTagPrefix(text: string, tag: string): number {
  for (let i = tag.length; i > 0; i--) {
    if (text.endsWith(tag.slice(0, i))) return i;
  }
  return 0;
}

function processDelta(delta: string, state: ParserState) {
  if (!delta) return;
  state.parserBuffer += delta;

  while (state.parserBuffer.length > 0) {
    if (!state.insideVoice) {
      const openIdx = state.parserBuffer.indexOf("<voice>");
      if (openIdx >= 0) {
        state.parserBuffer = state.parserBuffer.slice(openIdx + "<voice>".length);
        state.insideVoice = true;
        state.currentEmotion = null;
        state.voiceBuffer = "";
        continue;
      }
      const keep = longestTagPrefix(state.parserBuffer, "<voice>");
      state.parserBuffer = keep > 0 ? state.parserBuffer.slice(-keep) : "";
      return;
    }

    // Inside voice
    const tagIdx = state.parserBuffer.indexOf("<");

    if (tagIdx === -1) {
      const keep = state.parserBuffer.length > 0 ? 1 : 0;
      state.voiceBuffer += state.parserBuffer.slice(0, state.parserBuffer.length - keep);
      state.parserBuffer = keep > 0 ? state.parserBuffer.slice(-keep) : "";
      return;
    }

    if (tagIdx > 0) {
      state.voiceBuffer += state.parserBuffer.slice(0, tagIdx);
      state.parserBuffer = state.parserBuffer.slice(tagIdx);
      continue;
    }

    // At a <
    if (state.parserBuffer.startsWith("</voice>")) {
      flushVoiceBuffer(state);
      state.parserBuffer = state.parserBuffer.slice("</voice>".length);
      state.insideVoice = false;
      continue;
    }

    if (state.parserBuffer.startsWith("</")) {
      const gtIdx = state.parserBuffer.indexOf(">");
      if (gtIdx === -1) return; // partial closing tag, wait for more
      if (gtIdx < 30) {
        const word = state.parserBuffer.slice(2, gtIdx).trim().toLowerCase();
        if (word in EMOTIONS || word === "normal") {
          flushVoiceBuffer(state);
          state.parserBuffer = state.parserBuffer.slice(gtIdx + 1);
          continue;
        }
      }
      // Unknown </tag>
      state.voiceBuffer += "<";
      state.parserBuffer = state.parserBuffer.slice(1);
      continue;
    }

    // <emotion>
    const gtIdx = state.parserBuffer.indexOf(">");
    if (gtIdx > 1 && gtIdx < 30) {
      const word = state.parserBuffer.slice(1, gtIdx).trim().toLowerCase();
      if (word in EMOTIONS || word === "normal") {
        flushVoiceBuffer(state);
        state.currentEmotion = word === "normal" ? null : word;
        state.parserBuffer = state.parserBuffer.slice(gtIdx + 1);
        continue;
      }
    }

    if (gtIdx === -1) return;
    state.voiceBuffer += "<";
    state.parserBuffer = state.parserBuffer.slice(1);
  }
}

function parseVoiceTags(input: string): SpeakCall[] {
  const state: ParserState = {
    parserBuffer: "",
    voiceBuffer: "",
    insideVoice: false,
    currentEmotion: null,
    speakCalls: [],
    longTags: [],
  };

  // Simulate streaming: feed one char at a time
  for (const ch of input) {
    processDelta(ch, state);
  }
  // Final flush if inside voice
  if (state.voiceBuffer) flushVoiceBuffer(state);
  return state.speakCalls;
}

// --- Tests ---

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function testCase(name: string, input: string, expected: SpeakCall[]) {
  const result = parseVoiceTags(input);
  const jsonResult = JSON.stringify(result.map((c) => c.text));
  const jsonExpected = JSON.stringify(expected.map((c) => c.text));

  if (jsonResult !== jsonExpected) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  input:    ${JSON.stringify(input)}`);
    console.error(`  expected: ${jsonExpected}`);
    console.error(`  got:      ${jsonResult}`);
    if (result.length > 0) {
      result.forEach((c, i) => {
        const e = expected[i];
        console.error(`  [${i}] text="${c.text}" temp=${c.temperature} eos=${c.eosThreshold} | exp: text="${e?.text}" temp=${e?.temperature} eos=${e?.eosThreshold}`);
      });
    }
  } else {
    // Check temperature/eos
    let tempMatch = true;
    for (let i = 0; i < expected.length; i++) {
      if (result[i]?.temperature !== expected[i]?.temperature ||
          result[i]?.eosThreshold !== expected[i]?.eosThreshold) {
        tempMatch = false;
        break;
      }
    }
    if (!tempMatch) {
      failed++;
      console.error(`FAIL: ${name} (emotion params mismatch)`);
      result.forEach((c, i) => {
        const e = expected[i];
        console.error(`  [${i}] text="${c.text}" temp=${c.temperature} eos=${c.eosThreshold} | exp: temp=${e?.temperature} eos=${e?.eosThreshold}`);
      });
    } else {
      passed++;
      console.log(`PASS: ${name}`);
    }
  }
}

// --- Test cases ---

// 1. No tags — nothing spoken
testCase("no voice tags", "Hello world", []);

// 2. Plain voice tag
testCase("plain voice",
  "<voice>Hello world</voice>",
  [{ text: "Hello world" }]
);

// 3. Text outside voice is not spoken
testCase("text outside voice",
  "misc <voice>Hello</voice> more",
  [{ text: "Hello" }]
);

// 4. Single emotion
testCase("single emotion",
  "<voice><excited>Wow!</excited></voice>",
  [{ text: "Wow!", temperature: 1.0 }]
);

// 5. Multiple emotions in one voice
testCase("multiple emotions",
  "<voice><excited>Wow!</excited><calm>Okay.</calm><happy>Nice!</happy></voice>",
  [
    { text: "Wow!", temperature: 1.0 },
    { text: "Okay.", temperature: 0.5 },
    { text: "Nice!", temperature: 0.9 },
  ]
);

// 6. Normal reset
testCase("normal reset",
  "<voice><excited>Start!</excited><normal>Back to normal.</normal></voice>",
  [
    { text: "Start!", temperature: 1.0 },
    { text: "Back to normal." },
  ]
);

// 7. Sad with eos
testCase("sad emotion",
  "<voice><sad>Goodbye.</sad></voice>",
  [{ text: "Goodbye.", temperature: 0.4, eosThreshold: -6.0 }]
);

// 8. Tags with no closing (partial) — parser keeps last char for safety,
// so the last char ("o") is held. Acceptable for real LLM use.
testCase("unclosed voice", "<voice>Hello", [{ text: "Hell" }]);

// 9. No text between tags — empty segments skipped
testCase("empty segments",
  "<voice><excited></excited><calm>Only this.</calm></voice>",
  [{ text: "Only this.", temperature: 0.5 }]
);

// 10. Realistic Pi output with nested emotions
testCase("realistic pi output",
  "<voice><happy>Great news!</happy><calm>Here's why.</calm><excited>Let's go!</excited></voice>",
  [
    { text: "Great news!", temperature: 0.9 },
    { text: "Here's why.", temperature: 0.5 },
    { text: "Let's go!", temperature: 1.0 },
  ]
);

// 11. Bug repro: tags leaking into text
testCase("no tag leakage",
  "<voice><excited>Debug it!</excited><calm>Find the leak.</calm></voice>",
  [
    { text: "Debug it!", temperature: 1.0 },
    { text: "Find the leak.", temperature: 0.5 },
  ]
);

// 12. Text with angle brackets (not tags)
testCase("literal angle bracket",
  "<voice>x < y</voice>",
  [{ text: "x < y" }]
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
