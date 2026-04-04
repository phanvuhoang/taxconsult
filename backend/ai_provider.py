"""AI provider abstraction — Claudible (primary, free) + DeepSeek + OpenRouter + Anthropic + OpenAI."""
import httpx
import json
from typing import AsyncGenerator, Optional
from backend.config import (
    CLAUDIBLE_BASE_URL, CLAUDIBLE_API_KEY,
    DEEPSEEK_API_KEY,
    ANTHROPIC_API_KEY, OPENAI_API_KEY,
    OPENROUTER_API_KEY,
    MODEL_MAP, DEFAULT_MODEL_TIER,
)
# qwen2 cũng route qua OpenRouter — dùng cùng _call_openrouter


def resolve_model(model_tier: str) -> str:
    return MODEL_MAP.get(model_tier, MODEL_MAP[DEFAULT_MODEL_TIER])


async def call_ai(
    messages: list,
    system: str = "",
    model_tier: str = None,
    max_tokens: int = 8000,
) -> dict:
    """Non-streaming AI call. Returns dict: content, model_used, provider_used."""
    tier = model_tier or DEFAULT_MODEL_TIER
    model = resolve_model(tier)

    # Route: DeepSeek tiers
    if tier == "deepseek" or "deepseek" in model:
        result = await _call_deepseek(messages, system, model, max_tokens)
        if result:
            return result
        # DeepSeek failed → fall through to Claudible

    # Route: OpenRouter (Qwen and others) — NO fallback nếu key có mà call fail
    if tier in ("qwen", "qwen2") or "openrouter" in model or (model and "/" in model and not model.startswith("claude")):
        if not OPENROUTER_API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY chưa được cấu hình")
        result = await _call_openrouter(messages, system, model, max_tokens)
        if result:
            return result
        raise RuntimeError(f"OpenRouter gọi thất bại cho model {model} — kiểm tra OPENROUTER_API_KEY và tên model")

    # Route: Claudible (Haiku / Sonnet)
    if CLAUDIBLE_API_KEY:
        result = await _call_claudible(messages, system, model, max_tokens)
        if result:
            return result

    # Fallback: Anthropic direct
    if ANTHROPIC_API_KEY:
        result = await _call_anthropic(messages, system, model, max_tokens)
        if result:
            return result

    # Last resort: OpenAI
    if OPENAI_API_KEY:
        return await _call_openai(messages, system, max_tokens)

    raise RuntimeError("No AI provider configured or all providers failed")


async def stream_ai(
    messages: list,
    system: str = "",
    model_tier: str = None,
    max_tokens: int = 8000,
) -> AsyncGenerator[str, None]:
    """Streaming AI call, yields text chunks."""
    tier = model_tier or DEFAULT_MODEL_TIER
    model = resolve_model(tier)

    if tier == "deepseek" or "deepseek" in model:
        if DEEPSEEK_API_KEY:
            async for chunk in _stream_deepseek(messages, system, model, max_tokens):
                yield chunk
            return
        # DeepSeek key missing → fall through

    if tier in ("qwen", "qwen2") or (model and "/" in model and not model.startswith("claude")):
        if not OPENROUTER_API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY chưa được cấu hình")
        async for chunk in _stream_openrouter(messages, system, model, max_tokens):
            yield chunk
        return

    if CLAUDIBLE_API_KEY:
        async for chunk in _stream_claudible(messages, system, model, max_tokens):
            yield chunk
        return

    if ANTHROPIC_API_KEY:
        async for chunk in _stream_anthropic(messages, system, model, max_tokens):
            yield chunk
        return

    raise RuntimeError("No streaming AI provider configured")


# ── Claudible (OpenAI-completions format) ─────────────────────────
async def _call_claudible(messages, system, model, max_tokens) -> Optional[dict]:
    if not CLAUDIBLE_API_KEY:
        return None
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    timeout = 180 if "sonnet" in model or "opus" in model else 120
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                f"{CLAUDIBLE_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {CLAUDIBLE_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens, "messages": oai_messages},
            )
            r.raise_for_status()
            data = r.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model_used": model,
                "provider_used": "claudible",
                "prompt_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                "completion_tokens": data.get("usage", {}).get("completion_tokens", 0),
            }
    except Exception as e:
        print(f"Claudible {model} error: {e}")
        return None


async def _stream_claudible(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    if not CLAUDIBLE_API_KEY:
        return
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream(
                "POST",
                f"{CLAUDIBLE_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {CLAUDIBLE_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens,
                      "messages": oai_messages, "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass
    except Exception as e:
        print(f"Claudible stream {model} error: {e}")


# ── DeepSeek (OpenAI-compatible) ──────────────────────────────────
async def _call_deepseek(messages, system, model, max_tokens) -> Optional[dict]:
    if not DEEPSEEK_API_KEY:
        return None
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens, "messages": oai_messages},
            )
            r.raise_for_status()
            data = r.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model_used": model,
                "provider_used": "deepseek",
                "prompt_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                "completion_tokens": data.get("usage", {}).get("completion_tokens", 0),
            }
    except Exception as e:
        print(f"DeepSeek {model} error: {e}")
        return None


async def _stream_deepseek(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    if not DEEPSEEK_API_KEY:
        return
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream(
                "POST",
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens,
                      "messages": oai_messages, "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass
    except Exception as e:
        print(f"DeepSeek stream {model} error: {e}")


# ── OpenRouter (Qwen and others) ──────────────────────────────────
async def _call_openrouter(messages, system, model, max_tokens) -> Optional[dict]:
    if not OPENROUTER_API_KEY:
        return None
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://taxconsult.gpt4vn.com",
                    "X-Title": "TaxConsult VN",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "messages": oai_messages,
                    # Enable reasoning for Qwen3
                    "extra_body": {"reasoning": {"enabled": True}} if "qwen3" in model.lower() else {},
                },
            )
            r.raise_for_status()
            data = r.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model_used": model,
                "provider_used": "openrouter",
                "prompt_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                "completion_tokens": data.get("usage", {}).get("completion_tokens", 0),
            }
    except Exception as e:
        print(f"OpenRouter {model} error: {e}")
        return None


async def _stream_openrouter(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream(
                "POST",
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://taxconsult.gpt4vn.com",
                    "X-Title": "TaxConsult VN",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "messages": oai_messages,
                    "stream": True,
                    "extra_body": {"reasoning": {"enabled": True}} if "qwen3" in model.lower() else {},
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass
    except Exception as e:
        raise RuntimeError(f"OpenRouter stream error ({model}): {e}")


# ── Anthropic direct (fallback, paid) ─────────────────────────────
async def _call_anthropic(messages, system, model, max_tokens) -> Optional[dict]:
    if not ANTHROPIC_API_KEY:
        return None
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages}
        if system:
            kwargs["system"] = system
        resp = await client.messages.create(**kwargs)
        return {
            "content": resp.content[0].text,
            "model_used": model,
            "provider_used": "anthropic",
            "prompt_tokens": resp.usage.input_tokens,
            "completion_tokens": resp.usage.output_tokens,
        }
    except Exception as e:
        print(f"Anthropic direct {model} error: {e}")
        return None


async def _stream_anthropic(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    if not ANTHROPIC_API_KEY:
        return
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages, "stream": True}
        if system:
            kwargs["system"] = system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as e:
        print(f"Anthropic stream {model} error: {e}")


# ── OpenAI (last resort) ──────────────────────────────────────────
async def _call_openai(messages, system, max_tokens) -> dict:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    resp = await client.chat.completions.create(
        model="gpt-4o-mini", max_tokens=max_tokens, messages=oai_messages
    )
    return {
        "content": resp.choices[0].message.content,
        "model_used": "gpt-4o-mini",
        "provider_used": "openai",
        "prompt_tokens": resp.usage.prompt_tokens,
        "completion_tokens": resp.usage.completion_tokens,
    }
