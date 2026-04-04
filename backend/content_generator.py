"""content_generator.py — Generate content jobs (scenario/analysis/press/advice)."""
import asyncio
import re
import httpx
from backend.ai_provider import call_ai
from backend.doc_context import get_relevant_docs_semantic, get_relevant_congvan
from backend.perplexity import perplexity_search, perplexity_search_legal

SYSTEM = (
    "Bạn là chuyên gia thuế Big 4 Việt Nam với 30 năm kinh nghiệm. "
    "Viết bằng tiếng Việt, trích dẫn điều khoản cụ thể (số hiệu, điều, khoản). "
    "Chỉ dùng văn bản pháp luật được cung cấp, không bịa số hiệu văn bản."
)


async def _fetch_url_text(url: str) -> str:
    """Fetch URL content, return plain text max 3000 chars."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, follow_redirects=True,
                                 headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            text = re.sub(r'<[^>]+>', ' ', r.text)
            text = re.sub(r'\s+', ' ', text).strip()
            return text[:3000]
    except Exception:
        return ""


async def _build_style_context(style_refs: list) -> str:
    """Fetch up to 5 style reference URLs, return as context string."""
    if not style_refs:
        return ""
    tasks = [_fetch_url_text(url) for url in style_refs[:5] if url.startswith("http")]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    parts = []
    for url, text in zip(style_refs[:5], results):
        if isinstance(text, str) and text:
            parts.append(f"--- Bài mẫu từ {url} ---\n{text}")
    return "\n\n".join(parts)


def _build_prompt(content_type: str, subject: str, doc_ctx: str, perp_ctx: str,
                  style_ctx: str, client_name: str = "", company_name: str = "") -> str:
    """Build prompt theo content_type."""

    base = f"""════════════════════════════════════════
VĂN BẢN PHÁP LUẬT (nguồn: dbvntax — ưu tiên cao nhất)
════════════════════════════════════════
{doc_ctx or "(không có văn bản liên quan)"}

════════════════════════════════════════
NGUỒN BỔ SUNG (Perplexity, internet)
════════════════════════════════════════
{perp_ctx or "(không có)"}
"""
    if style_ctx:
        base += f"""
════════════════════════════════════════
BÀI MẪU THAM KHẢO PHONG CÁCH
════════════════════════════════════════
{style_ctx}
"""

    HTML_RULES = """
HTML FORMATTING RULES (BẮT BUỘC tuân theo):
- Mỗi đoạn văn: bọc trong <p>...</p>
- Danh sách: dùng <ul><li>...</li></ul> hoặc <ol><li>...</li></ol>
- KHÔNG viết "- item" hay "• item" dạng plain text
- Mỗi <li> phải là câu/đoạn đầy đủ ý nghĩa, không dùng fragment
- Sau mỗi <h2> hoặc <h3> phải có <p> hoặc <ul> ngay
"""

    if content_type == "scenario":
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Phân tích tình huống thuế sau
════════════════════════════════════════
{subject}

Output HTML. Cấu trúc:
<h2>1. Phân tích tình huống</h2>
<h2>2. Căn cứ pháp lý</h2>
[trích dẫn cụ thể: "theo khoản X Điều Y <strong>Luật/NĐ/TT số ABC</strong>"]
<h2>3. Hướng xử lý</h2>
<h2>4. Lưu ý quan trọng</h2>
Tối thiểu 600 từ. Không bịa số hiệu văn bản.
{HTML_RULES}"""
    elif content_type == "analysis":
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Bài phân tích chuyên sâu về
════════════════════════════════════════
{subject}

Output HTML. Cấu trúc:
<h2>I. Căn cứ pháp lý</h2>
<h2>II. Phân tích chi tiết</h2>
[mỗi luận điểm có trích dẫn điều khoản cụ thể]
<h2>III. Ví dụ thực tế</h2>
<h2>IV. Lưu ý quan trọng</h2>
<h2>V. Kết luận</h2>
Tối thiểu 1200 từ.
{HTML_RULES}"""
    elif content_type == "press":
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Bài viết báo về chủ đề
════════════════════════════════════════
{subject}

Phong cách báo chí: storytelling, ngôn ngữ gần gũi, mở đầu bằng câu chuyện thực tế.
Output HTML. Cấu trúc:
<h2>[Lead — câu chuyện mở đầu]</h2>
<h2>[Phần 1 — quy định liên quan, giải thích đơn giản]</h2>
<h2>[Phần 2 — ví dụ, số liệu]</h2>
<h2>Kết luận & Khuyến nghị</h2>
800-1500 từ. Giọng thân thiện, không hàn lâm.
{HTML_RULES}"""
    elif content_type == "advice":
        addressee = client_name or "Quý khách hàng"
        if company_name:
            addressee += f" — {company_name}"
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Thư tư vấn thuế chuyên nghiệp
════════════════════════════════════════
Kính gửi: {addressee}
Nội dung tư vấn: {subject}

Output HTML. Cấu trúc:
<h2>I. Vấn đề được tư vấn</h2>
<h2>II. Căn cứ pháp lý</h2>
[trích dẫn điều khoản cụ thể]
<h2>III. Ý kiến tư vấn</h2>
<h2>IV. Khuyến nghị</h2>
<p><em>Lưu ý: Thư tư vấn dựa trên quy định pháp luật hiện hành...</em></p>
1-2 trang A4 (600-1000 từ), giọng văn chuyên nghiệp.
{HTML_RULES}"""
    return base + f"\nYêu cầu: {subject}\nOutput HTML.\n{HTML_RULES}"


async def run_content_job(
    job_id: str,
    content_type: str,
    subject: str,
    tax_types: list,
    model_tier: str,
    style_refs: list,
    client_name: str,
    company_name: str,
):
    """Background task — opens own DB sessions, generates content, updates ContentJob."""
    from backend.database import AsyncSessionLocal, DbvntaxSession
    from backend.models import ContentJob

    async with AsyncSessionLocal() as db:
        async with DbvntaxSession() as dbvntax_db:

            async def _update(step, total, label, status="running", html=None, error=None,
                              citations=None, model_used=None, provider_used=None):
                job = await db.get(ContentJob, job_id)
                if not job:
                    return
                job.progress_step = step
                job.progress_total = total
                job.progress_label = label
                job.status = status
                if html is not None:
                    job.content_html = html
                if error is not None:
                    job.error_msg = error
                if citations is not None:
                    job.citations = citations
                if model_used is not None:
                    job.model_used = model_used
                if provider_used is not None:
                    job.provider_used = provider_used
                await db.commit()

            try:
                await _update(1, 3, "Đang tìm kiếm văn bản pháp luật liên quan...")

                query = f"{subject} {' '.join(tax_types)}"
                tasks = [
                    get_relevant_docs_semantic(dbvntax_db, query, tax_types, top_k=5),
                    get_relevant_congvan(dbvntax_db, tax_types,
                                        keywords=[w for w in subject.lower().split() if len(w) > 2][:5]),
                    (perplexity_search_legal(f"{subject} Việt Nam 2024 2025 2026") if tax_types
                     else perplexity_search(subject)),
                    _build_style_context(style_refs),
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                doc_ctx = results[0] if not isinstance(results[0], Exception) else ""
                cv_ctx = results[1] if not isinstance(results[1], Exception) else ""
                perp_result = results[2] if not isinstance(results[2], Exception) else {"content": "", "citations": []}
                style_ctx = results[3] if not isinstance(results[3], Exception) else ""

                perp_ctx = perp_result.get("content", "") if isinstance(perp_result, dict) else (perp_result or "")
                citations = perp_result.get("citations", []) if isinstance(perp_result, dict) else []

                full_doc_ctx = "\n\n".join(x for x in [doc_ctx, cv_ctx] if x)

                await _update(2, 3, "Đang tạo nội dung với AI...")

                prompt = _build_prompt(content_type, subject, full_doc_ctx, perp_ctx,
                                       style_ctx, client_name, company_name)

                result = await call_ai(
                    messages=[{"role": "user", "content": prompt}],
                    system=SYSTEM,
                    model_tier=model_tier,
                    max_tokens=6000,
                )
                html = result.get("content", "")
                if not html.startswith("<"):
                    html = re.sub(r'^```html?\n?', '', html)
                    html = re.sub(r'\n?```$', '', html)

                model_used_str = result.get("model_used", model_tier)
                provider_used_str = result.get("provider_used", "")

                await _update(3, 3, "Hoàn thành!", status="done", html=html, citations=citations,
                              model_used=model_used_str, provider_used=provider_used_str)

            except Exception as e:
                await _update(0, 3, "", status="error", error=str(e))
