"""Perplexity search helper for internet research."""
import httpx
from backend.config import PERPLEXITY_API_KEY


async def perplexity_search(query: str, model: str = "sonar") -> dict:
    """
    Search via Perplexity API.
    Returns dict: {"content": str, "citations": list[str]}
    """
    if not PERPLEXITY_API_KEY:
        return {"content": "", "citations": []}

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Bạn là chuyên gia nghiên cứu về luật thuế Việt Nam. "
                    "Trả lời bằng tiếng Việt, trích dẫn nguồn cụ thể."
                ),
            },
            {"role": "user", "content": query},
        ],
        "max_tokens": 2000,
        "return_citations": True,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        content = data["choices"][0]["message"]["content"]
        citations = data.get("citations", [])

        formatted = f"[Kết quả nghiên cứu từ Perplexity ({model})]\n{content}"
        if citations:
            formatted += "\n\nNguồn:\n" + "\n".join(f"- {c}" for c in citations[:10])
        return {"content": formatted, "citations": citations}

    except Exception as e:
        return {"content": f"[Perplexity unavailable: {e}]", "citations": []}
