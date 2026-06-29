import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// --- Token bucket rate limiter (40 RPM, burstable) ---
const MAX_TOKENS = 40;
const REFILL_MS = 1500; // 1 token per 1.5s = 40/min
let tokens = MAX_TOKENS;
let lastRefill = Date.now();

async function acquireToken(): Promise<void> {
  while (true) {
    const now = Date.now();
    const elapsed = now - lastRefill;
    const gained = Math.floor(elapsed / REFILL_MS);
    if (gained > 0) {
      tokens = Math.min(MAX_TOKENS, tokens + gained);
      lastRefill = now - (elapsed % REFILL_MS);
    }

    if (tokens > 0) {
      tokens--;
      return;
    }

    // No tokens — wait for next refill
    await new Promise((r) => setTimeout(r, REFILL_MS));
  }
}

// --- Thinking config ---
const BUDGET_MAP: Record<string, number> = {
  low: 1024,
  medium: 4096,
  high: 8192,
  xhigh: 16384,
};

const NVIDIA_MODELS = new Set([
  "deepseek-ai/deepseek-v4-flash",
  "deepseek-ai/deepseek-v4-pro",
  "moonshotai/kimi-k2.6",
  "nvidia/nemotron-3-super-120b-a12b",
]);

const NO_BUDGET_MODELS = new Set<string>();

const ENABLE_THINKING_MODELS = new Set([
  "nvidia/nemotron-3-super-120b-a12b",
]);

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", async (event) => {
    const payload = event.payload as Record<string, unknown>;
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.model !== "string") return;

    const modelId = payload.model as string;
    if (!NVIDIA_MODELS.has(modelId)) return;

    // Rate limit: max 40 RPM across all NVIDIA NIM models
    await acquireToken();

    const level = pi.getThinkingLevel() as ThinkingLevel;
    if (level === "off") return;

    const newPayload = { ...payload };

    const kwargs: Record<string, unknown> = {};
    if (ENABLE_THINKING_MODELS.has(modelId)) {
      kwargs.enable_thinking = true;
    } else {
      kwargs.thinking = true;
    }

    newPayload.chat_template_kwargs = {
      ...(typeof payload.chat_template_kwargs === "object" && payload.chat_template_kwargs !== null
        ? (payload.chat_template_kwargs as Record<string, unknown>)
        : {}),
      ...kwargs,
    };

    if (!NO_BUDGET_MODELS.has(modelId)) {
      const budget = BUDGET_MAP[level];
      if (budget) {
        newPayload.reasoning_budget = budget;
      }
    }

    return newPayload;
  });
}
