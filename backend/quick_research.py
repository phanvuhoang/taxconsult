"""Quick Research logic — non-streaming AI answer for tax questions."""
import time
from sqlalchemy.ext.asyncio import AsyncSession

from backend.doc_context import (
    get_priority_docs_context, get_relevant_docs, get_relevant_congvan, get_priority_doc_ids
)
from backend.ai_provider import call_ai
from backend.time_period import parse_time_period


QUICK_SYSTEM = (
    "Bạn là chuyên gia thuế Big 4 Việt Nam (30 năm kinh nghiệm), "
    "trả lời câu hỏi thuế thực chiến bằng tiếng Việt."
)

QUICK_PROMPT = """CÂU HỎI: {question}

GIAI ĐOẠN ÁP DỤNG: {time_period_label}
(Chỉ trích dẫn quy định có hiệu lực trong giai đoạn này)

=== VĂN BẢN ƯU TIÊN (admin đã xếp hạng — MỨC 1 = cao nhất) ===
{priority_ctx}

⚠️ QUAN TRỌNG: Ưu tiên dẫn chiếu văn bản MỨC 1 trước, rồi mới đến MỨC 2, MỨC 3.
Chỉ dùng văn bản thấp hơn khi văn bản cao hơn không đủ.

=== VĂN BẢN TỪ DATABASE ===
{doc_context}

=== CÔNG VĂN HƯỚNG DẪN ===
{cv_context}

=== NGUỒN WEB (Perplexity — bổ sung thêm, tổng hợp cùng database) ===
{perplexity_ctx}

YÊU CẦU TRẢ LỜI:
1. Output HTML thuần túy — KHÔNG markdown
2. Mở đầu bằng: tóm tắt câu trả lời 1-2 câu (in đậm, dùng <strong>)
3. Trích dẫn ĐIỀU KHOẢN CỤ THỂ: "theo điểm d, khoản 4, Điều 9, NĐ 320/2025/NĐ-CP..."
   — KHÔNG viết chung chung "theo quy định hiện hành"
4. Nếu quy định THAY ĐỔI theo thời gian → dùng bảng so sánh HTML:
   <table><tr><th>Giai đoạn</th><th>Quy định</th><th>Văn bản áp dụng</th></tr>...</table>
5. Dẫn công văn hướng dẫn nếu có trong dữ liệu
6. Ví dụ số cụ thể khi cần thiết
7. Hồ sơ chứng từ cần thiết (nếu liên quan)
8. Tối đa 800 từ — súc tích, đúng trọng tâm
9. TUYỆT ĐỐI không bịa số hiệu văn bản — chỉ dùng số hiệu có trong dữ liệu
"""


def _extract_keywords(question: str) -> list:
    stopwords = {
        "của", "và", "là", "có", "được", "trong", "cho", "với", "theo", "về",
        "tôi", "bao", "nhiêu", "như", "thế", "nào", "tại", "sao", "khi",
    }
    words = [w.strip("?.,!") for w in question.lower().split()]
    return [w for w in words if len(w) > 3 and w not in stopwords][:5]


async def run_quick_research(
    question: str,
    tax_types: list,
    time_period: str,
    model_tier: str,
    db: AsyncSession,
    dbvntax_db: AsyncSession,
    user_id: int,
) -> dict:
    start = time.time()
    period = parse_time_period(time_period)
    keywords = _extract_keywords(question)

    # Chạy tất cả song song
    from backend.perplexity import perplexity_search
    import asyncio

    priority_ids = await get_priority_doc_ids(db, tax_types)

    results = await asyncio.gather(
        get_priority_docs_context(
            db, dbvntax_db, tax_types,
            time_period_end=period["end_date"],
            time_period_start=period.get("start_date"),
        ),
        get_relevant_docs(
            dbvntax_db, tax_types,
            keywords=keywords,
            time_period_end=period["end_date"],
            include_expired=period["include_expired"],
            exclude_dbvntax_ids=priority_ids if priority_ids else None,
        ),
        get_relevant_congvan(dbvntax_db, tax_types, keywords=keywords),
        perplexity_search(
            f"Quy định thuế Việt Nam: {question} (giai đoạn {time_period or 'hiện tại'})",
            model="sonar",
        ),
        return_exceptions=True,
    )

    priority_ctx = results[0] if not isinstance(results[0], Exception) else ""
    doc_ctx      = results[1] if not isinstance(results[1], Exception) else ""
    cv_ctx       = results[2] if not isinstance(results[2], Exception) else ""
    perplexity_ctx = results[3] if not isinstance(results[3], Exception) else ""

    prompt = QUICK_PROMPT.format(
        question=question,
        time_period_label=period["label"],
        priority_ctx=priority_ctx or "(Không có văn bản ưu tiên)",
        doc_context=doc_ctx or "(Không có văn bản pháp luật liên quan trong database)",
        cv_context=cv_ctx or "(Không có công văn liên quan)",
        perplexity_ctx=perplexity_ctx or "(Không sử dụng Perplexity)",
    )

    result = await call_ai(
        messages=[{"role": "user", "content": prompt}],
        system=QUICK_SYSTEM,
        model_tier=model_tier,
        max_tokens=4096,
    )

    duration_ms = int((time.time() - start) * 1000)

    tax_docs_used = _extract_doc_refs(priority_ctx) + _extract_doc_refs(doc_ctx)
    congvan_used = _extract_cv_refs(cv_ctx)

    # Save to DB
    from backend.models import ResearchSession
    session = ResearchSession(
        user_id=user_id,
        question=question,
        tax_types=tax_types,
        time_period=time_period,
        answer_html=result["content"],
        citations=[],
        model_used=result["model_used"],
        duration_ms=duration_ms,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "id": session.id,
        "question": question,
        "answer_html": result["content"],
        "tax_docs_used": tax_docs_used,
        "congvan_used": congvan_used,
        "model_used": result["model_used"],
        "provider_used": result["provider_used"],
        "duration_ms": duration_ms,
    }


def _extract_doc_refs(ctx: str) -> list:
    if not ctx:
        return []
    import re
    refs = re.findall(r'=== (?:\[ƯU TIÊN\] )?VĂN BẢN: (.+?) ===', ctx)
    return [{"so_hieu": r} for r in refs if r != "N/A"]


def _extract_cv_refs(ctx: str) -> list:
    if not ctx:
        return []
    import re
    refs = re.findall(r'=== CÔNG VĂN: (.+?) ===', ctx)
    return [{"so_hieu": r} for r in refs if r != "N/A"]
