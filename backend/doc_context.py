"""
doc_context.py — Pull and format tax document context from dbvntax DB
for injection into AI prompts.

Fix #2: Chunked RAG via pgvector cosine similarity search.
Thay vì dump toàn bộ docs → chỉ inject top-K chunks liên quan nhất.
"""
import json
import re
import httpx
from bs4 import BeautifulSoup

SAC_THUE_MAP = {
    "TNDN": ["TNDN"],
    "GTGT": ["GTGT"],
    "TNCN": ["TNCN"],
    "TTDB": ["TTDB"],
    "FCT": ["FCT", "NHA_THAU"],
    "TP": ["CHUYEN_GIA"],
    "HKD": ["HKD"],
    "QLT": ["QLT"],
    "XNK": ["XNK"],
}

MAX_DOC_CHARS = 15000
MAX_CV_CHARS = 6000
MAX_DOCS = 5
MAX_CVS = 8


def strip_html_tvpl(html: str) -> str:
    """Strip TVPL HTML → clean plain text for AI injection."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["script", "style", "ins", "iframe", "noscript"]):
        tag.decompose()
    for tag in soup.find_all(id=["hdsdcondau", "NoiDungChiaSe", "GgADS"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def format_doc_for_context(doc: dict, include_content: bool = True) -> str:
    """Format a document record as context block for AI prompt."""
    lines = [
        f"=== VĂN BẢN: {doc.get('so_hieu', 'N/A')} ===",
        f"Tên: {doc.get('ten', '')}",
        f"Loại: {doc.get('loai', '')} | Cơ quan: {doc.get('co_quan', '')}",
        f"Ban hành: {doc.get('ngay_ban_hanh', '')} | Hiệu lực từ: {doc.get('hieu_luc_tu', '')}",
    ]
    if doc.get("het_hieu_luc_tu"):
        lines.append(f"⚠️ HẾT HIỆU LỰC từ: {doc['het_hieu_luc_tu']}")
    elif doc.get("tinh_trang") == "con_hieu_luc":
        lines.append("✅ Trạng thái: Còn hiệu lực")

    hli = doc.get("hieu_luc_index") or {}
    if isinstance(hli, str):
        try:
            hli = json.loads(hli)
        except Exception:
            hli = {}

    replaced_by = hli.get("van_ban_thay_the", [])
    amended_by = hli.get("van_ban_sua_doi", [])
    if replaced_by:
        lines.append(f"🔄 Thay thế bởi: {', '.join(replaced_by)}")
    if amended_by:
        lines.append(f"✏️ Sửa đổi bởi: {', '.join(amended_by)}")
    if hli.get("tom_tat_hieu_luc"):
        lines.append(f"📋 Tóm tắt hiệu lực: {hli['tom_tat_hieu_luc']}")

    if include_content and doc.get("noi_dung"):
        content = strip_html_tvpl(doc["noi_dung"])
        if len(content) > MAX_DOC_CHARS:
            content = content[:MAX_DOC_CHARS] + "\n...[nội dung tiếp theo, đã cắt bớt]"
        lines.append(f"\nNỘI DUNG:\n{content}")

    lines.append("=" * 50)
    return "\n".join(lines)


def format_cv_for_context(cv: dict) -> str:
    """Format a cong_van record as context block."""
    lines = [
        f"=== CÔNG VĂN: {cv.get('so_hieu', 'N/A')} ===",
        f"Tiêu đề: {cv.get('ten', '')}",
        f"Cơ quan: {cv.get('co_quan', '')} | Ngày: {cv.get('ngay_ban_hanh', '')}",
    ]
    if cv.get("noi_dung_day_du"):
        content = strip_html_tvpl(cv["noi_dung_day_du"])
        if len(content) > MAX_CV_CHARS:
            content = content[:MAX_CV_CHARS] + "\n...[cắt bớt]"
        lines.append(f"\nNỘI DUNG:\n{content}")
    lines.append("=" * 50)
    return "\n".join(lines)


async def get_priority_docs_context(
    db,
    dbvntax_db,
    tax_types: list,
    time_period_end: str = None,
    time_period_start: str = None,
    include_partial: bool = True,
) -> str:
    """
    Pull priority docs (admin-curated) from taxconsult DB, fetch content from dbvntax,
    format as high-priority context block for AI prompts.
    Returns (context_str, list_of_dbvntax_ids)
    """
    from sqlalchemy import text, select

    # Build filter on priority_docs
    from backend.models import PriorityDoc

    sac_thue_values = []
    for tt in tax_types:
        sac_thue_values.extend(SAC_THUE_MAP.get(tt, [tt]))

    q = select(PriorityDoc).order_by(PriorityDoc.sort_order, PriorityDoc.id)
    result = await db.execute(q)
    all_pds = result.scalars().all()

    # Filter by sac_thue match
    filtered = []
    for pd in all_pds:
        pd_sac = pd.sac_thue or []
        if any(s in pd_sac for s in sac_thue_values) or not sac_thue_values:
            filtered.append(pd)

    # Filter by time period
    if time_period_end or time_period_start:
        from datetime import date
        def parse_d(s):
            try:
                return date.fromisoformat(s) if s else None
            except Exception:
                return None
        end_d = parse_d(time_period_end)
        start_d = parse_d(time_period_start)
        kept = []
        for pd in filtered:
            # VB phải có hiệu lực trước hoặc trong giai đoạn
            if end_d and pd.hieu_luc_tu and pd.hieu_luc_tu > end_d:
                continue
            # VB chưa hết hạn trước giai đoạn bắt đầu
            if start_d and pd.hieu_luc_den and pd.hieu_luc_den < start_d:
                continue
            kept.append(pd)
        filtered = kept

    if not filtered:
        return ""

    # Sort by priority_level ASC (1=cao nhất trước)
    filtered.sort(key=lambda x: (x.priority_level or 3, x.sort_order or 0, x.id))

    # Max chars per level
    MAX_CHARS_PER_LEVEL = {1: 3000, 2: 2000, 3: 1500, 4: 800, 5: 0}
    LEVEL_LABEL = {
        1: "⭐⭐⭐ ƯU TIÊN CAO NHẤT",
        2: "⭐⭐ ƯU TIÊN CAO",
        3: "⭐ THAM KHẢO",
        4: "THẤP",
        5: "BỎ QUA",
    }

    parts = ["## VĂN BẢN ƯU TIÊN (admin đã chọn — MỨC 1 = cao nhất)\n"]
    for pd in filtered:
        level = pd.priority_level if pd.priority_level is not None else 3
        max_chars = MAX_CHARS_PER_LEVEL.get(level, 1500)
        if max_chars == 0:
            continue
        level_label = LEVEL_LABEL.get(level, "THAM KHẢO")

        # Fetch noi_dung from dbvntax
        try:
            row = await dbvntax_db.execute(
                text("SELECT noi_dung FROM documents WHERE id = :id"),
                {"id": pd.dbvntax_id},
            )
            noi_dung_row = row.one_or_none()
            noi_dung_html = noi_dung_row[0] if noi_dung_row else ""
        except Exception:
            noi_dung_html = ""

        lines = [
            f"=== [{level_label}] VĂN BẢN: {pd.so_hieu or 'N/A'} ===",
            f"Tên: {pd.ten}",
            f"Loại: {pd.loai or ''} | Cơ quan: {pd.co_quan or ''}",
            f"Hiệu lực: {pd.hieu_luc_tu or ''} → {pd.hieu_luc_den or 'nay'}",
        ]
        if pd.thay_the_boi:
            scope = f" ({pd.pham_vi_het_hieu_luc})" if pd.pham_vi_het_hieu_luc else ""
            lines.append(f"⚠️ Bị thay thế bởi: {pd.thay_the_boi}{scope}")
        if pd.ghi_chu_hieu_luc:
            lines.append(f"📋 Ghi chú: {pd.ghi_chu_hieu_luc}")
        if pd.link_tvpl:
            lines.append(f"LINK: {pd.link_tvpl}")
        if noi_dung_html:
            content = strip_html_tvpl(noi_dung_html)
            content = content[:max_chars]
            if len(strip_html_tvpl(noi_dung_html)) > max_chars:
                content += "\n...[nội dung tiếp theo, đã cắt bớt]"
            lines.append(f"\nNỘI DUNG:\n{content}")
        lines.append("=" * 50)
        parts.append("\n".join(lines))

    return "\n".join(parts)


async def get_relevant_docs(
    dbvntax_db,
    tax_types: list,
    keywords: list = None,
    time_period_end: str = None,
    include_expired: bool = False,
    exclude_dbvntax_ids: list = None,
) -> str:
    """
    Query dbvntax for relevant documents and format as context string.
    """
    from sqlalchemy import text

    sac_thue_values = []
    for tt in tax_types:
        sac_thue_values.extend(SAC_THUE_MAP.get(tt, [tt]))

    if not sac_thue_values:
        return ""

    conditions = ["d.sac_thue && ARRAY[:sac_thue]::varchar[]"]
    params = {"sac_thue": sac_thue_values, "limit": MAX_DOCS}

    if not include_expired:
        conditions.append("(d.het_hieu_luc_tu IS NULL OR d.het_hieu_luc_tu > now())")

    if time_period_end:
        conditions.append("(d.hieu_luc_tu IS NULL OR d.hieu_luc_tu <= :period_end)")
        params["period_end"] = time_period_end

    if exclude_dbvntax_ids:
        conditions.append("d.id != ALL(:exclude_ids)")
        params["exclude_ids"] = exclude_dbvntax_ids

    if keywords:
        conditions.append(
            "to_tsvector('simple', COALESCE(d.ten,'') || ' ' || COALESCE(d.noi_dung,'')) "
            "@@ plainto_tsquery('simple', :keywords)"
        )
        params["keywords"] = " ".join(keywords)

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT d.id, d.so_hieu, d.ten, d.loai, d.co_quan,
               d.ngay_ban_hanh::text, d.hieu_luc_tu::text, d.het_hieu_luc_tu::text,
               d.tinh_trang, d.noi_dung, d.hieu_luc_index, d.link_tvpl
        FROM documents d
        WHERE {where_clause}
        ORDER BY d.importance ASC, d.ngay_ban_hanh DESC
        LIMIT :limit
    """

    try:
        result = await dbvntax_db.execute(text(sql), params)
        rows = result.mappings().all()
    except Exception:
        return ""

    if not rows:
        return ""

    parts = ["## VĂN BẢN PHÁP LUẬT LIÊN QUAN (nguồn: dbvntax)\n"]
    for row in rows:
        parts.append(format_doc_for_context(dict(row)))

    return "\n".join(parts)


async def get_relevant_congvan(
    dbvntax_db,
    tax_types: list,
    keywords: list = None,
    limit: int = MAX_CVS,
) -> str:
    """Query dbvntax for relevant công văn and format as context string."""
    from sqlalchemy import text

    sac_thue_values = []
    for tt in tax_types:
        sac_thue_values.extend(SAC_THUE_MAP.get(tt, [tt]))

    if not sac_thue_values:
        return ""

    conditions = ["cv.sac_thue && ARRAY[:sac_thue]::varchar[]"]
    params = {"sac_thue": sac_thue_values, "limit": limit}

    if keywords:
        conditions.append(
            "to_tsvector('simple', COALESCE(cv.ten,'') || ' ' || COALESCE(cv.noi_dung_day_du,'')) "
            "@@ plainto_tsquery('simple', :keywords)"
        )
        params["keywords"] = " ".join(keywords)

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT cv.id, cv.so_hieu, cv.ten, cv.co_quan,
               cv.ngay_ban_hanh::text, cv.noi_dung_day_du, cv.link_nguon
        FROM cong_van cv
        WHERE {where_clause}
        ORDER BY cv.ngay_ban_hanh DESC NULLS LAST
        LIMIT :limit
    """

    try:
        result = await dbvntax_db.execute(text(sql), params)
        rows = result.mappings().all()
    except Exception:
        return ""

    if not rows:
        return ""

    parts = ["## CÔNG VĂN HƯỚNG DẪN LIÊN QUAN (nguồn: dbvntax)\n"]
    for row in rows:
        parts.append(format_cv_for_context(dict(row)))

    return "\n".join(parts)


async def verify_legal_refs_db(html: str, dbvntax_db) -> str:
    """
    Find all legal ref numbers in HTML, check against dbvntax documents table.
    Mark expired ones with warning, add hiệu lực info as tooltip.
    """
    from sqlalchemy import text

    LEGAL_REF_PATTERN = re.compile(
        r'\b(\d{1,3}/\d{4}/(?:QH\d*|NĐ-CP|TT-BTC|TT|NQ|QĐ|CT|PL|UBTVQH)\w*)\b'
    )
    refs = list(set(LEGAL_REF_PATTERN.findall(html)))
    if not refs:
        return html

    sql = """
        SELECT so_hieu, tinh_trang, het_hieu_luc_tu, hieu_luc_index
        FROM documents
        WHERE so_hieu = ANY(:refs)
    """
    try:
        result = await dbvntax_db.execute(text(sql), {"refs": refs})
        db_docs = {row["so_hieu"]: row for row in result.mappings()}
    except Exception:
        return html

    for ref in refs:
        doc = db_docs.get(ref)
        if doc and doc["tinh_trang"] not in ("con_hieu_luc",):
            html = html.replace(
                ref,
                f'<span title="⚠️ Văn bản này đã hết hiệu lực" '
                f'style="background:#fff3cd;border-bottom:2px solid #f59e0b;cursor:help">'
                f'⚠️ {ref}</span>'
            )
        elif not doc:
            html = html.replace(
                ref,
                f'<span title="Chưa xác minh được trong database" '
                f'style="border-bottom:1px dashed #9ca3af;cursor:help">'
                f'{ref}</span>'
            )

    return html


async def get_anchor_context(tax_types: list, time_period: str) -> str:
    """
    Wrapper: lấy toàn bộ anchor docs từ dbvntax và format thành context string.
    Dùng cho background job — tự mở sessions riêng.
    """
    from backend.time_period import parse_period_string
    from backend.database import AsyncSessionLocal, DbvntaxSession

    start, end, _use_current = parse_period_string(time_period)

    async with AsyncSessionLocal() as tc_db:
        async with DbvntaxSession() as dbvntax_db:
            priority_ctx = await get_priority_docs_context(
                tc_db, dbvntax_db, tax_types,
                time_period_end=end,
                time_period_start=start,
            )
            docs_ctx = await get_relevant_docs(dbvntax_db, tax_types, time_period_end=end)
            cv_ctx = await get_relevant_congvan(dbvntax_db, tax_types)

    parts = [p for p in [priority_ctx, docs_ctx, cv_ctx] if p]
    return "\n\n".join(parts)


async def get_priority_doc_ids(db, tax_types: list) -> list:
    """Return list of dbvntax_ids for all priority docs (used to exclude from get_relevant_docs)."""
    from sqlalchemy import select
    from backend.models import PriorityDoc

    result = await db.execute(select(PriorityDoc.dbvntax_id))
    return list(result.scalars().all())


# ── Fix #2: Semantic RAG via pgvector ────────────────────────────────────────

async def _get_openai_embedding(text: str) -> list | None:
    """Get OpenAI text-embedding-3-small vector for a query string."""
    from backend.config import OPENAI_API_KEY
    if not OPENAI_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": "text-embedding-3-small", "input": text[:8000]},
            )
            r.raise_for_status()
            return r.json()["data"][0]["embedding"]
    except Exception as e:
        print(f"[embedding] error: {e}")
        return None


async def get_relevant_docs_semantic(
    dbvntax_db,
    query: str,
    tax_types: list,
    top_k: int = 5,
    time_period_end: str = None,
    exclude_dbvntax_ids: list = None,
) -> str:
    """
    Fix #2: Semantic RAG — embed query → pgvector cosine search → top-K chunks.
    Fallback về full-text search nếu không có embedding.
    """
    from sqlalchemy import text

    vector = await _get_openai_embedding(query)

    sac_thue_values = []
    for tt in tax_types:
        sac_thue_values.extend(SAC_THUE_MAP.get(tt, [tt]))

    if vector is not None:
        # pgvector cosine similarity: <=> operator (1 - cosine_similarity)
        conditions = ["embedding IS NOT NULL"]
        params: dict = {"top_k": top_k, "vector": str(vector)}
        if sac_thue_values:
            conditions.append("sac_thue && ARRAY[:sac_thue]::varchar[]")
            params["sac_thue"] = sac_thue_values
        if time_period_end:
            conditions.append("(hieu_luc_tu IS NULL OR hieu_luc_tu <= :period_end)")
            params["period_end"] = time_period_end
        if exclude_dbvntax_ids:
            conditions.append("id != ALL(:exclude_ids)")
            params["exclude_ids"] = exclude_dbvntax_ids
        # Only active docs
        conditions.append("(het_hieu_luc_tu IS NULL OR het_hieu_luc_tu > now())")

        where = " AND ".join(conditions)
        sql = f"""
            SELECT id, so_hieu, ten, loai, co_quan,
                   ngay_ban_hanh::text, hieu_luc_tu::text, het_hieu_luc_tu::text,
                   tinh_trang, noi_dung, hieu_luc_index, link_tvpl,
                   1 - (embedding <=> :vector::vector) AS similarity
            FROM documents
            WHERE {where}
            ORDER BY embedding <=> :vector::vector
            LIMIT :top_k
        """
        try:
            result = await dbvntax_db.execute(text(sql), params)
            rows = result.mappings().all()
            if rows:
                parts = [f"## VĂN BẢN PHÁP LUẬT LIÊN QUAN — Semantic Search (top {top_k})\n"
                         f"(Đã chọn theo độ liên quan với: \"{query[:80]}\")\n"]
                for row in rows:
                    d = dict(row)
                    sim = d.pop("similarity", 0)
                    label = f"similarity={sim:.2f}" if sim else ""
                    parts.append(f"<!-- {label} -->\n" + format_doc_for_context(d))
                return "\n".join(parts)
        except Exception as e:
            print(f"[semantic_search] pgvector error: {e}")
            # Fall through to keyword search

    # Fallback: full-text keyword search (existing logic)
    keywords = [w for w in query.lower().split() if len(w) > 2][:5]
    return await get_relevant_docs(
        dbvntax_db, tax_types, keywords=keywords,
        time_period_end=time_period_end,
        exclude_dbvntax_ids=exclude_dbvntax_ids,
    )
