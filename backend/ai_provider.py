"""AI call abstraction — Anthropic primary, Claudible fallback, OpenAI last resort."""
import httpx
from typing import AsyncGenerator, Optional
from backend.config import (
    ANTHROPIC_API_KEY, CLAUDIBLE_BASE_URL, CLAUDIBLE_API_KEY,
    OPENAI_API_KEY, MODEL_MAP
)


def resolve_model(model_tier: str) -> str:
    return MODEL_MAP.get(model_tier, MODEL_MAP["fast"])


async def call_ai(
    messages: list,
    system: str = "",
    model_tier: str = "fast",
    max_tokens: int = 4096,
) -> dict:
    """
    Non-streaming AI call. Returns dict with keys:
      content, model_used, provider_used, prompt_tokens, completion_tokens
    """
    model = resolve_model(model_tier)

    # Try Anthropic first
    if ANTHROPIC_API_KEY:
        try:
            return await _call_anthropic(messages, system, model, max_tokens)
        except Exception:
            pass

    # Fallback: Claudible
    if CLAUDIBLE_API_KEY:
        try:
            return await _call_claudible(messages, system, model, max_tokens)
        except Exception:
            pass

    # Last resort: OpenAI
    if OPENAI_API_KEY:
        return await _call_openai(messages, system, model, max_tokens)

    raise RuntimeError("No AI provider configured")


async def stream_ai(
    messages: list,
    system: str = "",
    model_tier: str = "fast",
    max_tokens: int = 8192,
) -> AsyncGenerator[str, None]:
    """Streaming AI call, yields text chunks."""
    model = resolve_model(model_tier)

    if ANTHROPIC_API_KEY:
        try:
            async for chunk in _stream_anthropic(messages, system, model, max_tokens):
                yield chunk
            return
        except Exception:
            pass

    if CLAUDIBLE_API_KEY:
        async for chunk in _stream_claudible(messages, system, model, max_tokens):
            yield chunk
        return

    raise RuntimeError("No streaming AI provider configured")


async def _call_anthropic(messages, system, model, max_tokens) -> dict:
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


async def _call_claudible(messages, system, model, max_tokens) -> dict:
    payload = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        payload["system"] = system
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{CLAUDIBLE_BASE_URL}/messages",
            headers={"x-api-key": CLAUDIBLE_API_KEY, "anthropic-version": "2023-06-01"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
    return {
        "content": data["content"][0]["text"],
        "model_used": model,
        "provider_used": "claudible",
        "prompt_tokens": data.get("usage", {}).get("input_tokens", 0),
        "completion_tokens": data.get("usage", {}).get("output_tokens", 0),
    }


async def _call_openai(messages, system, model, max_tokens) -> dict:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    # Map Claude model to GPT fallback
    oai_model = "gpt-4o" if "opus" in model else "gpt-4o-mini"
    resp = await client.chat.completions.create(
        model=oai_model, max_tokens=max_tokens, messages=oai_messages
    )
    return {
        "content": resp.choices[0].message.content,
        "model_used": oai_model,
        "provider_used": "openai",
        "prompt_tokens": resp.usage.prompt_tokens,
        "completion_tokens": resp.usage.completion_tokens,
    }


async def _stream_anthropic(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages, "stream": True}
    if system:
        kwargs["system"] = system
    async with client.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text


async def _stream_claudible(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    payload = {"model": model, "max_tokens": max_tokens, "messages": messages, "stream": True}
    if system:
        payload["system"] = system
    async with httpx.AsyncClient(timeout=600) as client:
        async with client.stream(
            "POST",
            f"{CLAUDIBLE_BASE_URL}/messages",
            headers={"x-api-key": CLAUDIBLE_API_KEY, "anthropic-version": "2023-06-01"},
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    import json
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        if data.get("type") == "content_block_delta":
                            yield data["delta"].get("text", "")
                    except Exception:
                        pass
