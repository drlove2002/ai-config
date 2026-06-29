---
name: add-model
description: Test availability, benchmark speed, and add a new model to any OpenAI-compatible provider in models.json. Supports NVIDIA NIM, Opencode Zen, Groq, OpenRouter, Cloudflare AI, and other custom providers. Use when user wants to add a new model to any provider, or says "add [model] from [provider]".
---

# Add Model to Provider

Three-phase process: discover → benchmark → configure.

## 1. Provider Info

First identify the provider from `~/.config/ai/models.json`. Each provider has:

```json
"provider-name": {
  "baseUrl": "https://api.example.com/v1",
  "api": "openai-completions",
  "apiKey": "$API_KEY_ENV",
  "compat": { ... },
  "models": [ ... ]
}
```

Key fields needed for testing:
- `baseUrl` — API endpoint
- `apiKey` — env var or shell command (resolve using `source ~/.config/.env`)
- `compat` — thinking format, developer role support, etc.

## 2. Test & Benchmark

Use [benchmark.py](benchmark.py) with provider name and model ID:

```bash
source ~/.config/.env 2>/dev/null
python3 ~/.pi/agent/skills/add-model/benchmark.py <provider> <model_id>
```

This runs:

1. **Availability** — curl to `{baseUrl}/chat/completions` with the model
2. **Thinking detection** — tries known thinking formats:
   - `chat_template_kwargs.enable_thinking` (NVIDIA Nemotron)
   - `chat_template_kwargs.thinking` (NVIDIA DeepSeek/Kimi)
   - `reasoning_effort` (OpenAI-style)
   - `thinking.type` / `reasoning_effort` (DeepSeek API)
   - Default: no thinking
3. **Speed benchmark** — measures tok/s with and without thinking

## 3. Add to Configuration

### models.json (`~/.config/ai/models.json`)

Add model to the provider's `models` array:

```json
{
  "id": "<MODEL_ID>",
  "name": "<Readable Name>",
  "contextWindow": <CTX>,
  "maxTokens": 16384,
  "reasoning": <true/false>,
  "input": ["text"],
  "compat": {}
}
```

### Provider-specific compat

| Provider | Notes |
|----------|-------|
| `nvidia-nim` | Update `nvidia-thinking.ts` extension if model supports reasoning |
| `opencode-zen` | May need `thinkingFormat: "deepseek"` for reasoning models |
| `openrouter-fallback` | Already has many models, add if not listed |
| `cloudflare-ai` | Uses `/accounts/{id}/ai/v1` path |
| `groq` | Simple OpenAI-compatible |

## Checklist

- [ ] Provider identified and base URL confirmed
- [ ] Model responds (availability)
- [ ] Thinking support detected and style identified
- [ ] Speed benchmarked (tok/s) — acceptable threshold >= 10 tok/s
- [ ] Added to `models.json` under correct provider
- [ ] If NVIDIA model with reasoning, updated `nvidia-thinking.ts` extension
- [ ] Verified via `pi --provider <provider> --model "<model_id>:off" -p "hi"`
- [ ] Verified via `pi --provider <provider> --model "<model_id>:high" -p "hi"` (if reasoning)
