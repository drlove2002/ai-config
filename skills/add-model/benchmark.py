#!/usr/bin/env python3
"""Benchmark a model from any provider for availability, thinking support, and speed.

Usage:
    python3 benchmark.py <provider> <model_id>
    python3 benchmark.py nvidia-nim deepseek-ai/deepseek-v4-flash
    python3 benchmark.py opencode-zen deepseek-v4-flash-free
"""

import subprocess, json, time, sys, os, re

MODELS_JSON = os.path.expanduser("~/.config/ai/models.json")


def load_providers() -> dict:
    with open(MODELS_JSON) as f:
        return json.load(f).get("providers", {})


def resolve_api_key(raw: str) -> str:
    """Resolve $ENV_VAR or !command apiKey values."""
    if raw.startswith("!"):
        cmd = raw[1:]
        return subprocess.check_output(cmd, shell=True, text=True).strip()
    m = re.match(r'^\$(\w+)$', raw)
    if m:
        return os.environ.get(m.group(1), "")
    return raw


def curl(payload: dict, base_url: str, api_key: str, timeout=60) -> tuple[dict, float]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    for attempt in range(5):
        start = time.time()
        resp = subprocess.run(
            ["curl", "-s", "--max-time", str(timeout), url,
             "-H", f"Authorization: Bearer {api_key}",
             "-H", "Content-Type: application/json",
             "-d", json.dumps(payload)],
            capture_output=True, text=True, timeout=timeout + 10,
        )
        elapsed = time.time() - start
        if not resp.stdout.strip():
            print(f"  (empty response, retry in 5s...)")
            time.sleep(5)
            continue
        try:
            data = json.loads(resp.stdout)
        except json.JSONDecodeError:
            print(f"  (bad JSON, retry in 5s...)")
            time.sleep(5)
            continue
        if isinstance(data, dict) and data.get("status") == 429:
            print(f"  (rate limited, retry in 10s...)")
            time.sleep(10)
            continue
        return data, elapsed
    return {}, elapsed


def test_availability(model: str, base_url: str, api_key: str):
    print(f"  Testing availability...", end=" ")
    sys.stdout.flush()
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "hello"}],
        "max_tokens": 10,
        "stream": False,
    }
    data, elapsed = curl(payload, base_url, api_key, timeout=30)
    if "choices" in data:
        content = data["choices"][0]["message"].get("content")
        if content:
            print(f"OK ({elapsed:.2f}s, content: \"{content.strip()[:40]}\")")
        else:
            print(f"OK ({elapsed:.2f}s, empty content)")
        return True
    else:
        err = data.get("message") or data.get("error", {}).get("message", str(data)[:80])
        print(f"FAILED ({elapsed:.2f}s): {err}")
        return False


THINKING_TESTS = [
    ("enable_thinking (Nemotron)", {"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 1024}),
    ("thinking (DeepSeek/Kimi)", {"chat_template_kwargs": {"thinking": True}, "reasoning_budget": 1024}),
    ("thinking no-budget", {"chat_template_kwargs": {"thinking": True}}),
    ("deepseek format", {"thinking": {"type": "enabled"}, "reasoning_effort": "low"}),
    ("reasoning_effort only", {"reasoning_effort": "low"}),
]


def detect_thinking(model: str, base_url: str, api_key: str) -> tuple[str | None, dict | None]:
    """Returns (style_name, extra_body) or (None, None)."""
    for label, extra in THINKING_TESTS:
        print(f"  Testing {label}...", end=" ")
        sys.stdout.flush()
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "say hi"}],
            "max_tokens": 50,
            "stream": False,
            **extra,
        }
        data, elapsed = curl(payload, base_url, api_key, timeout=30)
        if "choices" in data:
            content = data["choices"][0]["message"].get("content")
            reasoning = data["choices"][0]["message"].get("reasoning_content")
            tokens = data.get("usage", {}).get("completion_tokens", 0)
            has_reasoning = "yes" if reasoning else ("no" if content else "empty")
            print(f"OK ({elapsed:.2f}s, {tokens}tok, reasoning={has_reasoning})")
            return label, extra
        else:
            err = data.get("message") or data.get("error", {}).get("message", str(data)[:80])
            print(f"no ({err})")
    return None, None


def speed_bench(model: str, base_url: str, api_key: str, label: str, extra: dict = None):
    print(f"  {label}:", end=" ")
    sys.stdout.flush()
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Explain how Redis caching works in 100 words."}],
        "max_tokens": 300,
        "stream": False,
    }
    if extra:
        payload.update(extra)

    data, elapsed = curl(payload, base_url, api_key, timeout=60)
    if "choices" not in data:
        print(f"FAILED: {data.get('message', str(data)[:80])}")
        return {"tok": 0, "time": elapsed}

    tokens = data.get("usage", {}).get("completion_tokens", 0)
    tps = round(tokens / elapsed, 1) if tokens and elapsed > 0 else 0
    print(f"{tokens:>3}tok in {elapsed:.2f}s = {tps:.1f} tok/s")
    return {"tok": tokens, "time": elapsed, "tps": tps}


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 benchmark.py <provider> <model_id>")
        print("  python3 benchmark.py nvidia-nim deepseek-ai/deepseek-v4-flash")
        print("  python3 benchmark.py opencode-zen deepseek-v4-flash-free")
        sys.exit(1)

    provider = sys.argv[1]
    model = sys.argv[2]

    # Load provider config
    providers = load_providers()
    if provider not in providers:
        print(f"\n❌ Unknown provider '{provider}'. Available: {list(providers.keys())}")
        sys.exit(1)

    cfg = providers[provider]
    base_url = cfg["baseUrl"]
    api_key_raw = cfg.get("apiKey", "")
    api_key = resolve_api_key(api_key_raw)

    compat = cfg.get("compat", {})

    print(f"\n{'='*50}")
    print(f"  Provider: {provider}")
    print(f"  Model:    {model}")
    print(f"  Base URL: {base_url}")
    print(f"{'='*50}\n")

    # Phase 1: Availability
    print("[1/4] Availability")
    available = test_availability(model, base_url, api_key)
    if not available:
        print("\n  ❌ Model unavailable. Aborting.")
        sys.exit(1)
    print()

    # Phase 2: Thinking support
    print("[2/4] Thinking support")
    thinking_style, thinking_extra = detect_thinking(model, base_url, api_key)
    if thinking_style:
        print(f"  ✅ Thinking: {thinking_style}")
    else:
        print(f"  ℹ️  No thinking support")
    print()

    # Phase 3: Speed benchmark
    print("[3/4] Speed benchmark")
    no_t = speed_bench(model, base_url, api_key, "No thinking")
    has_budget = thinking_extra and "reasoning_budget" in thinking_extra
    if thinking_extra:
        think_t = speed_bench(model, base_url, api_key, "With thinking", thinking_extra)
    else:
        think_t = None
    print()

    # Phase 4: Summary
    print("[4/4] Summary")
    print(f"  {'='*40}")
    print(f"  Provider:         {provider}")
    print(f"  Model:            {model}")
    print(f"  Available:        ✅")
    print(f"  Thinking:         {thinking_style or 'none'}")
    if no_t.get("tps"):
        print(f"  No thinking:      {no_t['tps']:.1f} tok/s  ({no_t['tok']}tok in {no_t['time']:.2f}s)")
    if think_t and think_t.get("tps"):
        print(f"  With thinking:    {think_t['tps']:.1f} tok/s  ({think_t['tok']}tok in {think_t['time']:.2f}s)")

    # Determine compat hints
    compat_hints = {}
    if thinking_style:
        if "enable_thinking" in str(thinking_extra):
            compat_hints["thinkingFormat"] = "qwen-chat-template"
        elif "chat_template_kwargs" in str(thinking_extra):
            compat_hints["needs_extra_body"] = True
        elif "thinking.type" in str(thinking_extra) or "reasoning_effort" in str(thinking_extra):
            compat_hints["thinkingFormat"] = "deepseek"

    ctx = compat.get("contextWindow", 128000)
    print(f"\n  Add to models.json (under provider '{provider}'):")
    compat_str = ""
    if compat_hints.get("thinkingFormat"):
        compat_str = f',\n    "compat": {{\n      "thinkingFormat": "{compat_hints["thinkingFormat"]}"\n    }}'
    elif compat_hints.get("needs_extra_body"):
        compat_str = f',\n    "compat": {{}}'
    print(f'''  {{
    "id": "{model}",
    "name": "TODO",
    "contextWindow": {ctx},
    "maxTokens": 16384,
    "reasoning": {"true" if thinking_style else "false"},
    "input": ["text"]{compat_str}
  }}''')

    if provider == "nvidia-nim" and thinking_style:
        print(f"\n  ℹ️  Also update nvidia-thinking.ts extension NVIDIA_MODELS set")
        if "enable_thinking" in str(thinking_extra):
            print(f"  ℹ️  Add to ENABLE_THINKING_MODELS")
        if not has_budget:
            print(f"  ℹ️  Add to NO_BUDGET_MODELS")

    print()


if __name__ == "__main__":
    main()
