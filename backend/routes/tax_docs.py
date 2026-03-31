import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.database import get_db, get_dbvntax_db
from backend.models import TaxDoc, User
from backend.auth import get_current_user, require_admin
from backend.doc_context import strip_html_tvpl

router = APIRouter(prefix="/api/tax-docs", tags=["tax-docs"])


@router.get("")
async def list_tax_docs(
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import or_, func
    q = select(TaxDoc).order_by(desc(TaxDoc.created_at))
    if search:
        q = q.where(
            or_(
                TaxDoc.so_hieu.ilike(f"%{search}%"),
                TaxDoc.ten.ilike(f"%{search}%"),
            )
        )
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    docs = result.scalars().all()
    return [
        {
            "id": d.id,
            "so_hieu": d.so_hieu,
            "ten": d.ten,
            "loai": d.loai,
            "co_quan": d.co_quan,
            "ngay_ban_hanh": d.ngay_ban_hanh.isoformat() if d.ngay_ban_hanh else None,
            "hieu_luc_tu": d.hieu_luc_tu.isoformat() if d.hieu_luc_tu else None,
            "het_hieu_luc_tu": d.het_hieu_luc_tu.isoformat() if d.het_hieu_luc_tu else None,
            "tinh_trang": d.tinh_trang,
            "tax_types": d.tax_types,
            "source": d.source,
            "dbvntax_id": d.dbvntax_id,
            "has_content": bool(d.content_html or d.content_text),
            "link_tvpl": d.link_tvpl,
        }
        for d in docs
    ]


@router.post("/upload")
async def upload_tax_doc(
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "txt":
        text = content.decode("utf-8", errors="replace")
    elif ext == "docx":
        text = _extract_docx(content)
    elif ext == "pdf":
        text = _extract_pdf(content)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .txt, .docx, or .pdf")

    # Try to parse so_hieu from filename
    so_hieu = filename.rsplit(".", 1)[0] if "." in filename else filename

    doc = TaxDoc(
        so_hieu=so_hieu,
        ten=filename,
        source="upload",
        content_text=text,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {"id": doc.id, "so_hieu": doc.so_hieu, "ten": doc.ten, "chars": len(text)}


class ImportFromDbvntaxRequest(BaseModel):
    dbvntax_id: int


@router.post("/import-from-dbvntax")
async def import_from_dbvntax(
    body: ImportFromDbvntaxRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    from sqlalchemy import text
    result = await dbvntax_db.execute(
        text(
            "SELECT id, so_hieu, ten, loai, co_quan, "
            "ngay_ban_hanh::text, hieu_luc_tu::text, het_hieu_luc_tu::text, "
            "tinh_trang, noi_dung, link_tvpl "
            "FROM documents WHERE id = :id"
        ),
        {"id": body.dbvntax_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found in dbvntax")

    row = dict(row)
    content_text = strip_html_tvpl(row.get("noi_dung") or "")

    # Check if already imported
    existing = await db.execute(
        select(TaxDoc).where(TaxDoc.dbvntax_id == body.dbvntax_id)
    )
    existing_doc = existing.scalar_one_or_none()
    if existing_doc:
        raise HTTPException(status_code=409, detail="Already imported")

    from datetime import date
    def parse_date(s):
        if not s:
            return None
        try:
            return date.fromisoformat(s)
        except Exception:
            return None

    doc = TaxDoc(
        so_hieu=row.get("so_hieu"),
        ten=row.get("ten") or "",
        loai=row.get("loai"),
        co_quan=row.get("co_quan"),
        ngay_ban_hanh=parse_date(row.get("ngay_ban_hanh")),
        hieu_luc_tu=parse_date(row.get("hieu_luc_tu")),
        het_hieu_luc_tu=parse_date(row.get("het_hieu_luc_tu")),
        tinh_trang=row.get("tinh_trang") or "con_hieu_luc",
        content_text=content_text,
        content_html=row.get("noi_dung"),
        source="dbvntax",
        dbvntax_id=body.dbvntax_id,
        link_tvpl=row.get("link_tvpl"),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {"id": doc.id, "so_hieu": doc.so_hieu, "ten": doc.ten}


@router.get("/content/{doc_id}")
async def get_tax_doc_content(
    doc_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TaxDoc).where(TaxDoc.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": doc.id,
        "so_hieu": doc.so_hieu,
        "ten": doc.ten,
        "noi_dung_html": doc.content_html,
        "link_tvpl": doc.link_tvpl,
    }


@router.delete("/{doc_id}")
async def delete_tax_doc(
    doc_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TaxDoc).where(TaxDoc.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(doc)
    await db.commit()
    return {"ok": True}


@router.get("/dbvntax")
async def list_dbvntax_docs(
    sac_thue: Optional[str] = Query(None),
    loai: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    """List văn bản từ dbvntax — grouped by sắc thuế."""
    from sqlalchemy import text as sql_text
    filters = ["1=1"]
    params = {}
    if sac_thue:
        filters.append(":sac_thue = ANY(sac_thue)")
        params["sac_thue"] = sac_thue
    if loai:
        filters.append("doc_type = :loai")
        params["loai"] = loai
    if search:
        filters.append("(ten ILIKE :search OR so_hieu ILIKE :search)")
        params["search"] = f"%{search}%"
    where = " AND ".join(filters)
    params["offset"] = (page - 1) * limit
    params["limit"] = limit

    rows = await dbvntax_db.execute(sql_text(f"""
        SELECT id, so_hieu, ten, doc_type as loai, sac_thue,
               ngay_ban_hanh::text, importance, tinh_trang
        FROM documents
        WHERE {where}
        ORDER BY importance ASC NULLS LAST, ngay_ban_hanh DESC NULLS LAST
        OFFSET :offset LIMIT :limit
    """), params)
    docs = [dict(r) for r in rows.mappings()]

    count_params = {k: v for k, v in params.items() if k not in ("offset", "limit")}
    cnt = await dbvntax_db.execute(sql_text(f"""
        SELECT COUNT(*) FROM documents WHERE {where}
    """), count_params)
    total = cnt.scalar()

    return {"docs": docs, "total": total, "page": page}


@router.get("/search-dbvntax")
async def search_dbvntax(
    q: str = Query(..., min_length=2),
    user: User = Depends(require_admin),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    from sqlalchemy import text
    result = await dbvntax_db.execute(
        text(
            "SELECT id, so_hieu, ten, loai, co_quan, ngay_ban_hanh::text, tinh_trang "
            "FROM documents "
            "WHERE so_hieu ILIKE :q OR ten ILIKE :q "
            "ORDER BY ngay_ban_hanh DESC NULLS LAST LIMIT 20"
        ),
        {"q": f"%{q}%"},
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.get("/dbvntax-browse")
async def browse_dbvntax(
    sac_thue: str = Query(...),
    loai: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    from sqlalchemy import text
    # Build SQL with literal array to avoid asyncpg binding issues
    sac_thue_literal = sac_thue.replace("'", "''")
    where = f"sac_thue && ARRAY['{sac_thue_literal}']::varchar[]"
    params = {}
    if loai:
        where += " AND loai = :loai"
        params["loai"] = loai
    sql = f"""
        SELECT id, so_hieu, ten, loai, co_quan,
               ngay_ban_hanh::text, hieu_luc_tu::text, het_hieu_luc_tu::text,
               tinh_trang, link_tvpl, importance
        FROM documents
        WHERE {where}
        ORDER BY ngay_ban_hanh DESC NULLS LAST
        LIMIT 100
    """
    try:
        result = await dbvntax_db.execute(text(sql), params)
        rows = result.mappings().all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return [dict(r) for r in rows]


@router.get("/dbvntax-content/{doc_id}")
async def get_dbvntax_content(
    doc_id: int,
    user: User = Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    from sqlalchemy import text
    result = await dbvntax_db.execute(
        text("SELECT id, so_hieu, ten, noi_dung FROM documents WHERE id = :id"),
        {"id": doc_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    row = dict(row)
    return {
        "id": row["id"],
        "so_hieu": row.get("so_hieu"),
        "ten": row.get("ten"),
        "noi_dung_html": row.get("noi_dung") or "",
    }


def _extract_docx(content: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_pdf(content: bytes) -> str:
    from pdfminer.high_level import extract_text
    return extract_text(io.BytesIO(content))
