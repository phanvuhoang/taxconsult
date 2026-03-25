"""
doc_context.py — Pull and format tax document context from dbvntax DB
for injection into AI prompts.
"""
import json
import re
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


async def get_relevant_docs(
    dbvntax_db,
    tax_types: list,
    keywords: list = None,
    time_period_end: str = None,
    include_expired: bool = False,
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
