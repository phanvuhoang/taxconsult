from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from backend.database import get_db, get_dbvntax_db
from backend.models import PriorityDoc, User
from backend.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/priority-docs", tags=["priority-docs"])


def _parse_date(s) -> Optional[date]:
    if not s:
        return None
    if isinstance(s, date):
        return s
    try:
        return date.fromisoformat(str(s))
    except Exception:
        return None


def _serialize(d: PriorityDoc) -> dict:
    return {
        "id": d.id,
        "dbvntax_id": d.dbvntax_id,
        "so_hieu": d.so_hieu,
        "ten": d.ten,
        "loai": d.loai,
        "co_quan": d.co_quan,
        "sac_thue": d.sac_thue,
        "hieu_luc_tu": d.hieu_luc_tu.isoformat() if d.hieu_luc_tu else None,
        "hieu_luc_den": d.hieu_luc_den.isoformat() if d.hieu_luc_den else None,
        "thay_the_boi": d.thay_the_boi,
        "pham_vi_het_hieu_luc": d.pham_vi_het_hieu_luc,
        "ghi_chu_hieu_luc": d.ghi_chu_hieu_luc,
        "link_tvpl": d.link_tvpl,
        "sort_order": d.sort_order,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("")
async def list_priority_docs(
    sac_thue: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(PriorityDoc).order_by(PriorityDoc.sort_order, PriorityDoc.id)
    if sac_thue:
        q = q.where(PriorityDoc.sac_thue.any(sac_thue))
    result = await db.execute(q)
    docs = result.scalars().all()
    return [_serialize(d) for d in docs]


class AddPriorityDocRequest(BaseModel):
    dbvntax_id: int
    hieu_luc_tu: Optional[str] = None
    hieu_luc_den: Optional[str] = None
    thay_the_boi: Optional[str] = None
    pham_vi_het_hieu_luc: Optional[str] = None
    ghi_chu_hieu_luc: Optional[str] = None
    sort_order: int = 0


@router.post("")
async def add_priority_doc(
    body: AddPriorityDocRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    # Check duplicate
    existing = await db.execute(
        select(PriorityDoc).where(PriorityDoc.dbvntax_id == body.dbvntax_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Văn bản này đã có trong danh sách ưu tiên")

    # Fetch from dbvntax
    row = await dbvntax_db.execute(
        text(
            "SELECT id, so_hieu, ten, loai, co_quan, sac_thue, "
            "hieu_luc_tu::text, link_tvpl "
            "FROM documents WHERE id = :id"
        ),
        {"id": body.dbvntax_id},
    )
    doc = row.mappings().one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản trong dbvntax")
    doc = dict(doc)

    pd = PriorityDoc(
        dbvntax_id=body.dbvntax_id,
        so_hieu=doc.get("so_hieu"),
        ten=doc.get("ten") or "",
        loai=doc.get("loai"),
        co_quan=doc.get("co_quan"),
        sac_thue=doc.get("sac_thue") or [],
        hieu_luc_tu=_parse_date(body.hieu_luc_tu or doc.get("hieu_luc_tu")),
        hieu_luc_den=_parse_date(body.hieu_luc_den),
        thay_the_boi=body.thay_the_boi,
        pham_vi_het_hieu_luc=body.pham_vi_het_hieu_luc,
        ghi_chu_hieu_luc=body.ghi_chu_hieu_luc,
        link_tvpl=doc.get("link_tvpl"),
        sort_order=body.sort_order,
    )
    db.add(pd)
    await db.commit()
    await db.refresh(pd)
    return _serialize(pd)


class UpdatePriorityDocRequest(BaseModel):
    hieu_luc_tu: Optional[str] = None
    hieu_luc_den: Optional[str] = None
    thay_the_boi: Optional[str] = None
    pham_vi_het_hieu_luc: Optional[str] = None
    ghi_chu_hieu_luc: Optional[str] = None
    sort_order: Optional[int] = None


@router.patch("/{doc_id}")
async def update_priority_doc(
    doc_id: int,
    body: UpdatePriorityDocRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PriorityDoc).where(PriorityDoc.id == doc_id))
    pd = result.scalar_one_or_none()
    if not pd:
        raise HTTPException(status_code=404, detail="Not found")

    if body.hieu_luc_tu is not None:
        pd.hieu_luc_tu = _parse_date(body.hieu_luc_tu)
    if body.hieu_luc_den is not None:
        pd.hieu_luc_den = _parse_date(body.hieu_luc_den) if body.hieu_luc_den else None
    if body.thay_the_boi is not None:
        pd.thay_the_boi = body.thay_the_boi or None
    if body.pham_vi_het_hieu_luc is not None:
        pd.pham_vi_het_hieu_luc = body.pham_vi_het_hieu_luc or None
    if body.ghi_chu_hieu_luc is not None:
        pd.ghi_chu_hieu_luc = body.ghi_chu_hieu_luc or None
    if body.sort_order is not None:
        pd.sort_order = body.sort_order

    await db.commit()
    await db.refresh(pd)
    return _serialize(pd)


@router.delete("/{doc_id}")
async def delete_priority_doc(
    doc_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PriorityDoc).where(PriorityDoc.id == doc_id))
    pd = result.scalar_one_or_none()
    if not pd:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(pd)
    await db.commit()
    return {"ok": True}


@router.get("/content/{dbvntax_id}")
async def get_priority_doc_content(
    dbvntax_id: int,
    user: User = Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    row = await dbvntax_db.execute(
        text("SELECT id, so_hieu, ten, noi_dung FROM documents WHERE id = :id"),
        {"id": dbvntax_id},
    )
    doc = row.mappings().one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc = dict(doc)
    return {
        "so_hieu": doc.get("so_hieu"),
        "ten": doc.get("ten"),
        "noi_dung_html": doc.get("noi_dung") or "",
    }
