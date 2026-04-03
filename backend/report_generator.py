"""Full Report generation logic with SSE streaming."""
import asyncio
import json
import time
from typing import AsyncGenerator

from backend.config import DEFAULT_SECTIONS
from backend.doc_context import (
    get_priority_docs_context, get_relevant_docs, get_relevant_congvan,
    get_relevant_docs_semantic, get_priority_doc_ids,
)
from backend.ai_provider import stream_ai, call_ai
from backend.perplexity import perplexity_search, perplexity_search_legal
from backend.time_period import parse_time_period

# In-memory job store (use Redis in production)
_jobs: dict = {}


def create_job(job_id: str, params: dict):
    _jobs[job_id] = {
        "status": "pending",
        "params": params,
        "sections_done": [],
        "html": "",
        "error": None,
    }


def get_job(job_id: str) -> dict:
    return _jobs.get(job_id)


SECTION_SYSTEM = (
    "Bạn là chuyên gia thuế Big 4 Việt Nam (Deloitte/PwC/EY/KPMG) với 30 năm kinh nghiệm. "
    "Khi viết báo cáo, bạn LUÔN LUÔN ưu tiên văn bản pháp luật được cung cấp hơn kiến thức "
    "được huấn luyện. Nếu có mâu thuẫn giữa văn bản cung cấp và kiến thức nội tại, "
    "BẮT BUỘC theo văn bản được cung cấp. Tuyệt đối không bịa số hiệu văn bản."
)

# ── Fix #1: Citation-First Prompting ─────────────────────────────────────────
# Bắt model trích dẫn điều khoản CỤ THỂ trước, rồi mới viết phân tích dựa trên đó.
# Kỹ thuật này ép model "commit" với nguồn trước khi viết → giảm hallucination.

SECTION_PROMPT_TAX = """Viết PHẦN: "{section_title}"
Chủ đề phân tích: {subject} ({mode})
Giai đoạn áp dụng: {time_period}

════════════════════════════════════════════════════════
VĂN BẢN PHÁP LUẬT — ĐÂY LÀ NGUỒN DUY NHẤT BẠN ĐƯỢC DÙNG
(Không dùng kiến thức nội tại nếu mâu thuẫn với các văn bản dưới đây)
════════════════════════════════════════════════════════

{priority_context}

{tax_docs_context}

{congvan_context}

════════════════════════════════════════════════════════
NGUỒN BỔ SUNG (thông tin thực tế, tin tức, số liệu thị trường)
════════════════════════════════════════════════════════

{perplexity_context}

════════════════════════════════════════════════════════
HƯỚNG DẪN VIẾT — ĐỌC KỸ TRƯỚC KHI VIẾT
════════════════════════════════════════════════════════

BƯỚC 1 — TRÍCH DẪN (làm nội bộ, không xuất ra):
Trước khi viết, hãy xác định TẤT CẢ điều khoản trong văn bản trên liên quan đến "{section_title}".
Ghi nhớ: [Số hiệu VB] → Điều X, Khoản Y, Điểm Z: <nội dung chính xác>

BƯỚC 2 — VIẾT PHÂN TÍCH dựa trên điều khoản đã xác định ở Bước 1:

YÊU CẦU BẮT BUỘC:
1. Output HTML thuần túy — bắt đầu bằng <h2>{section_number}. {section_title}</h2>
2. Mỗi luận điểm PHẢI có trích dẫn điều khoản cụ thể ngay trong câu:
   "theo khoản X Điều Y <strong>Luật/NĐ/TT số ABC</strong>" — không ghi chung chung
3. Nếu quy định thay đổi theo thời gian → PHẢI dùng bảng so sánh:
   <table><tr><th>Giai đoạn</th><th>Quy định</th><th>Căn cứ pháp lý</th></tr>...</table>
4. Công văn hướng dẫn → trích số hiệu + tóm tắt nội dung hướng dẫn
5. ⛔ NGHIÊM CẤM trích dẫn văn bản KHÔNG CÓ trong danh sách trên (dù biết từ training)
6. ⛔ NGHIÊM CẤM dùng mốc thời gian/số liệu từ training nếu mâu thuẫn với văn bản cung cấp
7. Văn bản đã hết hiệu lực → chỉ đề cập khi so sánh lịch sử, phải ghi rõ ⚠️ đã hết hiệu lực
8. Tối thiểu 700 từ — đi sâu vào từng điều khoản, không viết chung chung
"""

SECTION_PROMPT_GENERAL = """Viết PHẦN: "{section_title}"
Chủ đề phân tích: {subject} ({mode})
Giai đoạn áp dụng: {time_period}

════════════════════════════════════════════════════════
THÔNG TIN NGHIÊN CỨU
════════════════════════════════════════════════════════

{perplexity_context}

════════════════════════════════════════════════════════
YÊU CẦU
════════════════════════════════════════════════════════

1. Output HTML thuần túy — bắt đầu bằng <h2>{section_number}. {section_title}</h2>
2. Viết chi tiết, có số liệu thực tế từ nguồn nghiên cứu
3. Trích dẫn nguồn cụ thể sau mỗi số liệu/luận điểm quan trọng
4. Tối thiểu 500 từ
"""


def _quick_keywords(subject: str) -> list:
    words = subject.lower().split()
    return [w for w in words if len(w) > 2][:5]


async def _gather_section_context(
    section: dict,
    subject: str,
    tax_types: list,
    period: dict,
    dbvntax_db,
    sonar_model: str,
    exclude_dbvntax_ids: list = None,
) -> dict:
    """
    Gather all context for a single section in parallel.
    Fix #2: semantic RAG — dùng pgvector cosine search thay vì keyword dump.
    Fix #3: site-filtered Perplexity — tìm văn bản pháp luật mới nhất từ nguồn chính thống.
    """
    # Build semantic query combining section title + subject
    semantic_query = f"{section['title']} {subject} {' '.join(tax_types)}"
    perplexity_query = f"{section['title']}: {subject} Việt Nam {period['label']}"

    async def empty():
        return ""

    # Fix #3: dùng perplexity_search_legal cho tax-aware sections
    if section.get("tax_aware"):
        perp_task = perplexity_search_legal(perplexity_query, sonar_model)
    else:
        perp_task = perplexity_search(perplexity_query, sonar_model)

    tasks = [perp_task]

    if section.get("tax_aware") and dbvntax_db:
        # Fix #2: semantic search thay vì keyword dump
        tasks.append(
            get_relevant_docs_semantic(
                dbvntax_db,
                query=semantic_query,
                tax_types=tax_types,
                top_k=5,
                time_period_end=period["end_date"],
                exclude_dbvntax_ids=exclude_dbvntax_ids,
            )
        )
        tasks.append(get_relevant_congvan(dbvntax_db, tax_types,
                                          keywords=[w for w in subject.lower().split() if len(w) > 2][:5]))
    else:
        tasks.append(empty())
        tasks.append(empty())

    results = await asyncio.gather(*tasks, return_exceptions=True)

    perp_result = results[0] if not isinstance(results[0], Exception) else {"content": "", "citations": []}
    if isinstance(perp_result, dict):
        perp_ctx = perp_result.get("content", "")
        citations = perp_result.get("citations", [])
    else:
        perp_ctx = perp_result or ""
        citations = []

    doc_ctx = results[1] if not isinstance(results[1], Exception) else ""
    cv_ctx = results[2] if not isinstance(results[2], Exception) else ""

    return {"perplexity": perp_ctx, "docs": doc_ctx, "congvan": cv_ctx, "citations": citations}


async def generate_full_report(
    job_id: str,
    subject: str,
    report_type_mode: str,
    tax_types: list,
    time_period: str,
    model_tier: str,
    sonar_model: str,
    sections_config: list,
    db,
    dbvntax_db,
    user_id: int,
) -> AsyncGenerator[str, None]:
    """
    Generate full report, yielding SSE events.
    Each event: data: {type, ...}\n\n
    """
    job = _jobs.get(job_id, {})
    job["status"] = "running"

    period = parse_time_period(time_period)
    enabled_sections = [s for s in sections_config if s.get("enabled", True)]
    total = len(enabled_sections)

    yield _sse({"type": "start", "total_sections": total, "subject": subject})

    full_html = f"<h1>Báo cáo Phân tích Thuế: {subject}</h1>\n"
    full_html += f"<p><em>Giai đoạn: {period['label']} | Sắc thuế: {', '.join(tax_types)}</em></p>\n"

    start_time = time.time()

    # Phase 0: fetch priority docs context once (shared across all sections)
    yield _sse({"type": "phase", "message": "Đang thu thập dữ liệu..."})
    priority_ctx = ""
    exclude_ids = []
    try:
        priority_ctx = await get_priority_docs_context(
            db, dbvntax_db, tax_types,
            time_period_end=period["end_date"],
            time_period_start=period.get("start_date"),
        )
        exclude_ids = await get_priority_doc_ids(db, tax_types)
    except Exception:
        pass

    # Phase 1: gather all contexts in parallel
    context_tasks = [
        _gather_section_context(
            sec, subject, tax_types, period, dbvntax_db, sonar_model,
            exclude_dbvntax_ids=exclude_ids if exclude_ids else None,
        )
        for sec in enabled_sections
    ]
    all_contexts = await asyncio.gather(*context_tasks, return_exceptions=True)

    # Phase 2: generate each section sequentially (streaming)
    for idx, (section, ctx) in enumerate(zip(enabled_sections, all_contexts)):
        if isinstance(ctx, Exception):
            ctx = {"perplexity": "", "docs": "", "congvan": ""}

        yield _sse({
            "type": "section_start",
            "section_id": section["id"],
            "section_title": section["title"],
            "index": idx + 1,
            "total": total,
        })

        section_number = idx + 1
        if section.get("tax_aware"):
            prompt = SECTION_PROMPT_TAX.format(
                section_title=section["title"],
                section_number=section_number,
                subject=subject,
                mode=report_type_mode,
                time_period=period["label"],
                priority_context=priority_ctx or "(Không có văn bản ưu tiên)",
                tax_docs_context=ctx["docs"] or "(Không có dữ liệu)",
                congvan_context=ctx["congvan"] or "(Không có dữ liệu)",
                perplexity_context=ctx["perplexity"] or "(Không có dữ liệu)",
            )
        else:
            prompt = SECTION_PROMPT_GENERAL.format(
                section_title=section["title"],
                section_number=section_number,
                subject=subject,
                mode=report_type_mode,
                time_period=period["label"],
                perplexity_context=ctx["perplexity"] or "(Không có dữ liệu)",
            )

        section_html = ""
        async for chunk in stream_ai(
            messages=[{"role": "user", "content": prompt}],
            system=SECTION_SYSTEM,
            model_tier=model_tier,
            max_tokens=8192,
        ):
            section_html += chunk
            yield _sse({"type": "chunk", "section_id": section["id"], "text": chunk})

        full_html += section_html + "\n"
        job["sections_done"].append(section["id"])
        yield _sse({"type": "section_done", "section_id": section["id"]})

    # Save report to DB
    from backend.models import Report
    duration_ms = int((time.time() - start_time) * 1000)
    report = Report(
        user_id=user_id,
        title=f"Phân tích thuế: {subject}",
        subject=subject,
        report_type="full",
        tax_types=tax_types,
        time_period=time_period,
        content_html=full_html,
        citations=[],
        model_used=model_tier,
        duration_ms=duration_ms,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    job["status"] = "done"
    job["html"] = full_html

    yield _sse({
        "type": "done",
        "report_id": report.id,
        "duration_ms": duration_ms,
    })


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
