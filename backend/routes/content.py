"""routes/content.py — Content generation endpoints."""
import asyncio
import datetime
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models import User, ContentJob
from backend.auth import get_current_user
from backend.content_generator import run_content_job

router = APIRouter(prefix="/api/content", tags=["content"])


class ContentRequest(BaseModel):
    content_type: str   # 'scenario' | 'analysis' | 'press' | 'advice'
    subject: str
    tax_types: List[str] = []
    time_period: Optional[str] = None
    model_tier: str = "deepseek"
    client_name: Optional[str] = ""
    company_name: Optional[str] = ""
    style_refs: Optional[List[str]] = []


@router.post("/start")
async def start_content(
    body: ContentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")
    valid_types = ("scenario", "analysis", "press", "advice")
    if body.content_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"content_type must be one of {valid_types}")

    job_id = str(uuid.uuid4())
    job = ContentJob(
        id=job_id,
        user_id=user.id,
        content_type=body.content_type,
        subject=body.subject,
        tax_types=body.tax_types,
        time_period=body.time_period,
        model_tier=body.model_tier,
        client_name=body.client_name or "",
        company_name=body.company_name or "",
        style_refs=body.style_refs or [],
        status="pending",
        progress_step=0,
        progress_total=3,
    )
    db.add(job)
    await db.commit()

    asyncio.create_task(run_content_job(
        job_id=job_id,
        content_type=body.content_type,
        subject=body.subject,
        tax_types=body.tax_types,
        model_tier=body.model_tier,
        style_refs=body.style_refs or [],
        client_name=body.client_name or "",
        company_name=body.company_name or "",
    ))

    return {"job_id": job_id}


@router.get("/job/{job_id}")
async def get_content_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(ContentJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Auto-timeout >30 min
    if job.status in ("running", "pending") and job.created_at:
        age = (datetime.datetime.utcnow() - job.created_at).total_seconds() / 60
        if age > 30:
            job.status = "error"
            job.error_msg = "Timeout (>30 phút). Vui lòng thử lại."
            await db.commit()
    return {
        "status": job.status,
        "content_type": job.content_type,
        "subject": job.subject,
        "progress_step": job.progress_step,
        "progress_total": job.progress_total,
        "progress_label": job.progress_label,
        "content_html": job.content_html,
        "error_msg": job.error_msg,
        "citations": job.citations or [],
        "gamma_url": job.gamma_url,
        "gamma_status": job.gamma_status,
    }


@router.post("/job/{job_id}/cancel")
async def cancel_content_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(ContentJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Not found")
    if job.status in ("done", "error"):
        return {"ok": True}
    job.status = "error"
    job.error_msg = "Huỷ bởi người dùng"
    await db.commit()
    return {"ok": True}


@router.get("/history")
async def list_content_history(
    content_type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(ContentJob).where(
        ContentJob.user_id == user.id,
        ContentJob.status == "done",
    ).order_by(ContentJob.created_at.desc()).limit(30)
    if content_type:
        q = q.where(ContentJob.content_type == content_type)
    result = await db.execute(q)
    jobs = result.scalars().all()
    return [
        {
            "id": j.id,
            "content_type": j.content_type,
            "subject": j.subject[:100],
            "created_at": j.created_at.strftime("%d/%m/%Y %H:%M") if j.created_at else "",
            "gamma_url": j.gamma_url,
        }
        for j in jobs
    ]


@router.post("/job/{job_id}/gamma")
async def request_gamma(
    job_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Gamma slide creation on demand."""
    import os
    import httpx as _httpx
    job = await db.get(ContentJob, job_id)
    if not job or job.status != "done" or not job.content_html:
        raise HTTPException(status_code=400, detail="Job chưa hoàn thành")

    gamma_key = os.getenv("GAMMA_API_KEY", "")
    if not gamma_key:
        raise HTTPException(status_code=400, detail="GAMMA_API_KEY chưa cấu hình")

    num_cards = body.get("num_slides", 10)
    job.gamma_status = "processing"
    await db.commit()

    try:
        async with _httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.gamma.app/v1/presentations",
                headers={"Authorization": f"Bearer {gamma_key}",
                         "Content-Type": "application/json"},
                json={"title": job.subject[:100],
                      "markdown": job.content_html[:50000],
                      "numCards": num_cards},
            )
            r.raise_for_status()
            data = r.json()
        job.gamma_url = data.get("url", "")
        job.gamma_status = "done"
        await db.commit()
        return {"gamma_url": job.gamma_url}
    except Exception as e:
        job.gamma_status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Gamma error: {e}")


@router.get("/job/{job_id}/export-docx")
async def export_content_docx(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from backend.routes.reports import _html_to_docx
    job = await db.get(ContentJob, job_id)
    if not job or not job.content_html:
        raise HTTPException(status_code=404, detail="Not found")
    docx_bytes = _html_to_docx(job.content_html, job.subject)
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="content_{job_id[:8]}.docx"'},
    )
