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
        "priority_level": d.priority_level if d.priority_level is not None else 3,
        "sort_order": d.sort_order,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("")
async def list_priority_docs(
    sac_thue: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(PriorityDoc).order_by(PriorityDoc.priority_level, PriorityDoc.sort_order, PriorityDoc.id)
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
    priority_level: Optional[int] = None


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
    if body.priority_level is not None:
        pd.priority_level = max(1, min(5, body.priority_level))

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


@router.get("/suggest/{dbvntax_id}")
async def suggest_priority_metadata(
    dbvntax_id: int,
    user: User = Depends(require_admin),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    """
    Đọc hieu_luc_index từ dbvntax + AI phân tích → trả về suggested metadata.
    """
    import json as _json
    import re

    result = await dbvntax_db.execute(
        text("""
            SELECT so_hieu, ten, loai, co_quan,
                   hieu_luc_tu::text, het_hieu_luc_tu::text,
                   tinh_trang, hieu_luc_index, noi_dung
            FROM documents WHERE id = :id
        """),
        {"id": dbvntax_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    row = dict(row)

    # Step 1: Parse hieu_luc_index (không cần AI)
    hli = row.get("hieu_luc_index") or {}
    if isinstance(hli, str):
        try:
            hli = _json.loads(hli)
        except Exception:
            hli = {}

    suggestion = {
        "hieu_luc_tu": row.get("hieu_luc_tu"),
        "hieu_luc_den": row.get("het_hieu_luc_tu"),
        "thay_the_boi": None,
        "pham_vi_het_hieu_luc": None,
        "ghi_chu_hieu_luc": None,
        "source": "hieu_luc_index",
    }

    thay_the = hli.get("van_ban_thay_the", [])
    if thay_the:
        first = thay_the[0]
        suggestion["thay_the_boi"] = first if isinstance(first, str) else str(first)

    hieu_luc_arr = hli.get("hieu_luc", [])
    if hieu_luc_arr:
        pham_vi_list = [h.get("pham_vi", "") for h in hieu_luc_arr if h.get("pham_vi")]
        if pham_vi_list:
            first_pv = pham_vi_list[0].lower()
            if "toàn bộ" in first_pv or "toan bo" in first_pv:
                suggestion["pham_vi_het_hieu_luc"] = "toan_bo"
            elif any(kw in first_pv for kw in ["một phần", "mot phan", "khoản", "điều", "điểm"]):
                suggestion["pham_vi_het_hieu_luc"] = "mot_phan"

    if hli.get("tom_tat_hieu_luc"):
        suggestion["ghi_chu_hieu_luc"] = hli["tom_tat_hieu_luc"]

    # Step 2: Nếu hieu_luc_index không đủ → dùng AI
    needs_ai = (
        not suggestion["hieu_luc_tu"]
        and not suggestion["hieu_luc_den"]
        and not suggestion["thay_the_boi"]
    )
    if needs_ai and row.get("noi_dung"):
        from backend.doc_context import strip_html_tvpl
        from backend.ai_provider import call_ai

        content_text = strip_html_tvpl(row["noi_dung"])
        content_tail = content_text[-3000:] if len(content_text) > 3000 else content_text

        ai_prompt = f"""Văn bản: {row['so_hieu']} — {row['ten']}
Trạng thái hiện tại: {row.get('tinh_trang', '')}

PHẦN CUỐI VĂN BẢN:
{content_tail}

Hãy trích xuất thông tin hiệu lực và trả về JSON (chỉ JSON, không giải thích):
{{
  "hieu_luc_tu": "YYYY-MM-DD hoặc null",
  "hieu_luc_den": "YYYY-MM-DD hoặc null (null nếu còn hiệu lực)",
  "thay_the_boi": "số hiệu văn bản thay thế hoặc null",
  "pham_vi_het_hieu_luc": "toan_bo hoặc mot_phan hoặc null",
  "ghi_chu_hieu_luc": "tóm tắt ngắn về hiệu lực (tối đa 200 ký tự)"
}}"""

        try:
            ai_result = await call_ai(
                messages=[{"role": "user", "content": ai_prompt}],
                system="Bạn là chuyên gia pháp lý, trích xuất thông tin chính xác từ văn bản luật Việt Nam.",
                model_tier="haiku",
                max_tokens=512,
            )
            json_match = re.search(r'\{.*\}', ai_result["content"], re.DOTALL)
            if json_match:
                ai_data = _json.loads(json_match.group())
                for k in ["hieu_luc_tu", "hieu_luc_den", "thay_the_boi", "pham_vi_het_hieu_luc", "ghi_chu_hieu_luc"]:
                    if ai_data.get(k) and not suggestion.get(k):
                        suggestion[k] = ai_data[k]
                suggestion["source"] = "ai"
        except Exception:
            pass

    return suggestion
