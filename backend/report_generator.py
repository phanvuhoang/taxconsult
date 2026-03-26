"""Full Report generation logic with SSE streaming."""
import asyncio
import json
import time
from typing import AsyncGenerator

from backend.config import DEFAULT_SECTIONS
from backend.doc_context import (
    get_priority_docs_context, get_relevant_docs, get_relevant_congvan, get_priority_doc_ids
)
from backend.ai_provider import stream_ai
from backend.perplexity import perplexity_search
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
    "Bạn là chuyên gia thuế Big 4 Việt Nam (Deloitte/PwC/EY/KPMG) "
    "viết báo cáo phân tích thuế chuyên nghiệp bằng tiếng Việt."
)

SECTION_PROMPT_TAX = """Viết PHẦN: "{section_title}"
Chủ đề phân tích: {subject} ({mode})
Giai đoạn áp dụng: {time_period}

=== VĂN BẢN ƯU TIÊN (admin đã chọn — ưu tiên cao nhất) ===
{priority_context}

=== VĂN BẢN PHÁP LUẬT TỪ DATABASE ===
{tax_docs_context}

=== CÔNG VĂN HƯỚNG DẪN TỪ DATABASE ===
{congvan_context}

=== DỮ LIỆU NGHIÊN CỨU TỪ PERPLEXITY ===
{perplexity_context}

YÊU CẦU TUYỆT ĐỐI:
1. Output HTML thuần túy — bắt đầu bằng <h2>{section_number}. {section_title}</h2>
2. ƯU TIÊN VĂN BẢN ƯU TIÊN hơn mọi nguồn khác
3. Trích dẫn ĐIỀU KHOẢN CỤ THỂ: "theo điểm X, khoản Y, Điều Z, NĐ/TT số..."
4. Nếu quy định thay đổi theo thời gian → bảng so sánh Before/After:
   <table><tr><th>Giai đoạn</th><th>Quy định</th><th>Văn bản</th></tr>...</table>
5. Dẫn công văn cụ thể khi có (số hiệu + nội dung ngắn)
6. KHÔNG trích dẫn văn bản đã hết hiệu lực (trừ khi phân tích lịch sử)
7. KHÔNG bịa số hiệu văn bản
8. Tối thiểu 700 từ
9. Trích dẫn nguồn sau mỗi câu có số liệu: <a href="#" target="_blank">[N]</a>
"""

SECTION_PROMPT_GENERAL = """Viết PHẦN: "{section_title}"
Chủ đề phân tích: {subject} ({mode})
Giai đoạn áp dụng: {time_period}

=== DỮ LIỆU NGHIÊN CỨU TỪ PERPLEXITY ===
{perplexity_context}

YÊU CẦU:
1. Output HTML thuần túy — bắt đầu bằng <h2>{section_number}. {section_title}</h2>
2. Viết chi tiết, có số liệu thực tế
3. Tối thiểu 500 từ
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
    """Gather all context for a single section in parallel."""
    keywords = _quick_keywords(subject)
    perplexity_query = f"Phân tích {section['title']} cho {subject} Việt Nam {period['label']}"

    async def empty():
        return ""

    tasks = [perplexity_search(perplexity_query, sonar_model)]

    if section.get("tax_aware") and dbvntax_db:
        tasks.append(
            get_relevant_docs(
                dbvntax_db, tax_types, keywords=keywords,
                time_period_end=period["end_date"],
                include_expired=period["include_expired"],
                exclude_dbvntax_ids=exclude_dbvntax_ids,
            )
        )
        tasks.append(get_relevant_congvan(dbvntax_db, tax_types, keywords=keywords))
    else:
        tasks.append(empty())
        tasks.append(empty())

    results = await asyncio.gather(*tasks, return_exceptions=True)

    perp_ctx = results[0] if not isinstance(results[0], Exception) else ""
    doc_ctx = results[1] if not isinstance(results[1], Exception) else ""
    cv_ctx = results[2] if not isinstance(results[2], Exception) else ""

    return {"perplexity": perp_ctx, "docs": doc_ctx, "congvan": cv_ctx}


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
