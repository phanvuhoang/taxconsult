from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
import io

from backend.database import get_db
from backend.models import Report, User
from backend.auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("")
async def list_reports(
    report_type: str = Query(None),
    skip: int = 0,
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Report).order_by(desc(Report.created_at))
    if user.role != "admin":
        q = q.where(Report.user_id == user.id)
    if report_type:
        q = q.where(Report.report_type == report_type)
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    reports = result.scalars().all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "subject": r.subject,
            "report_type": r.report_type,
            "tax_types": r.tax_types,
            "time_period": r.time_period,
            "model_used": r.model_used,
            "duration_ms": r.duration_ms,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]


@router.get("/{report_id}")
async def get_report(
    report_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user.role != "admin" and report.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "id": report.id,
        "title": report.title,
        "subject": report.subject,
        "report_type": report.report_type,
        "tax_types": report.tax_types,
        "time_period": report.time_period,
        "content_html": report.content_html,
        "citations": report.citations,
        "model_used": report.model_used,
        "duration_ms": report.duration_ms,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@router.delete("/{report_id}")
async def delete_report(
    report_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user.role != "admin" and report.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.delete(report)
    await db.commit()
    return {"ok": True}


@router.get("/{report_id}/export-docx")
async def export_docx(
    report_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user.role != "admin" and report.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    docx_bytes = _html_to_docx(report.content_html or "", report.title)
    filename = f"report_{report_id}.docx"
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _html_to_docx(html: str, title: str) -> bytes:
    """Convert HTML to DOCX using python-docx + BeautifulSoup."""
    from docx import Document
    from docx.shared import Pt
    from bs4 import BeautifulSoup
    import io

    doc = Document()
    doc.add_heading(title, 0)

    soup = BeautifulSoup(html, "html.parser")

    for elem in soup.find_all(["h1", "h2", "h3", "h4", "p", "li", "table"]):
        tag = elem.name
        text = elem.get_text(separator=" ", strip=True)
        if not text:
            continue
        if tag == "h1":
            doc.add_heading(text, level=1)
        elif tag == "h2":
            doc.add_heading(text, level=2)
        elif tag == "h3":
            doc.add_heading(text, level=3)
        elif tag == "h4":
            doc.add_heading(text, level=4)
        elif tag == "li":
            p = doc.add_paragraph(text, style="List Bullet")
        elif tag == "table":
            rows = elem.find_all("tr")
            if not rows:
                continue
            cols = max(len(r.find_all(["td", "th"])) for r in rows)
            if cols == 0:
                continue
            table = doc.add_table(rows=len(rows), cols=cols)
            table.style = "Table Grid"
            for ri, row in enumerate(rows):
                cells = row.find_all(["td", "th"])
                for ci, cell in enumerate(cells):
                    if ci < cols:
                        table.cell(ri, ci).text = cell.get_text(strip=True)
        else:
            doc.add_paragraph(text)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
