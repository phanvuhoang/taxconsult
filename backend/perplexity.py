"""Perplexity search helper for internet research.

Fix #3: Site-filtered search — ưu tiên tìm từ nguồn pháp lý VN chính thống
(thuvienphapluat.vn, gdt.gov.vn, mof.gov.vn) thay vì search tổng quát.
"""
import asyncio
import httpx
from backend.config import PERPLEXITY_API_KEY

# Nguồn pháp lý ưu tiên cho thuế VN
TAX_LAW_SITES = [
    "thuvienphapluat.vn",
    "gdt.gov.vn",
    "mof.gov.vn",
    "vbpl.vn",
    "luatvietnam.vn",
]


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
                    "Trả lời bằng tiếng Việt, trích dẫn nguồn cụ thể với số hiệu văn bản đầy đủ. "
                    "Ưu tiên các văn bản pháp luật mới nhất (2024-2026). "
                    "Khi đề cập điều khoản, ghi rõ: Điều X, Khoản Y, [Số hiệu văn bản]."
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


async def perplexity_search_legal(query: str, model: str = "sonar-pro") -> dict:
    """
    Fix #3: Site-filtered legal search — tìm trực tiếp trong các nguồn pháp lý VN.
    Chạy song song 2 queries: (1) site-filtered cho văn bản mới, (2) general research.
    Merge kết quả và deduplicate citations.
    """
    if not PERPLEXITY_API_KEY:
        return {"content": "", "citations": []}

    # Query 1: Site-filtered — tìm văn bản pháp luật mới nhất
    site_filter = " OR ".join(f"site:{s}" for s in TAX_LAW_SITES[:3])
    legal_query = f"({site_filter}) {query} 2024 2025 2026 văn bản pháp luật hiệu lực"

    # Query 2: General research — số liệu, thực tiễn, tin tức
    general_query = query

    async def _search(q: str, sys_msg: str) -> dict:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": q},
            ],
            "max_tokens": 1500,
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
            return {
                "content": data["choices"][0]["message"]["content"],
                "citations": data.get("citations", []),
            }
        except Exception as e:
            return {"content": f"[unavailable: {e}]", "citations": []}

    # Chạy song song
    legal_sys = (
        "Bạn là chuyên gia pháp lý thuế Việt Nam. "
        "Tìm và trích dẫn văn bản pháp luật thuế VN mới nhất (2024-2026). "
        "Ghi đầy đủ: số hiệu, ngày ban hành, điều khoản cụ thể. "
        "Đặc biệt chú ý các thay đổi, sửa đổi, thay thế văn bản cũ."
    )
    general_sys = (
        "Bạn là chuyên gia nghiên cứu kinh tế-thuế Việt Nam. "
        "Cung cấp số liệu thực tế, case studies, thực tiễn áp dụng. "
        "Trả lời bằng tiếng Việt, trích dẫn nguồn cụ thể."
    )

    results = await asyncio.gather(
        _search(legal_query, legal_sys),
        _search(general_query, general_sys),
        return_exceptions=True,
    )

    legal_result = results[0] if not isinstance(results[0], Exception) else {"content": "", "citations": []}
    general_result = results[1] if not isinstance(results[1], Exception) else {"content": "", "citations": []}

    # Merge
    parts = []
    if legal_result.get("content") and "[unavailable" not in legal_result["content"]:
        parts.append(f"[📚 VĂN BẢN PHÁP LUẬT MỚI NHẤT — nguồn: thuvienphapluat, gdt.gov.vn]\n{legal_result['content']}")
    if general_result.get("content") and "[unavailable" not in general_result["content"]:
        parts.append(f"[🔍 NGHIÊN CỨU THỰC TIỄN]\n{general_result['content']}")

    all_citations = list(dict.fromkeys(
        legal_result.get("citations", []) + general_result.get("citations", [])
    ))

    merged_content = "\n\n".join(parts) if parts else "[Perplexity không trả kết quả]"
    if all_citations:
        merged_content += "\n\nNguồn tham khảo:\n" + "\n".join(f"- {c}" for c in all_citations[:15])

    return {"content": merged_content, "citations": all_citations}
