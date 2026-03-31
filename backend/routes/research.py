import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db, get_dbvntax_db
from backend.models import User
from backend.auth import get_current_user
from backend.quick_research import run_quick_research
from backend.report_generator import (
    create_job, get_job, generate_full_report, DEFAULT_SECTIONS
)
from backend.config import DEFAULT_SECTIONS as CONFIG_SECTIONS

router = APIRouter(prefix="/api/research", tags=["research"])


class QuickResearchRequest(BaseModel):
    question: str
    tax_types: List[str] = ["TNDN", "GTGT"]
    time_period: Optional[str] = None
    model_tier: str = "haiku"


class FullReportRequest(BaseModel):
    subject: str
    mode: str = "ngành"  # "ngành" | "công ty"
    tax_types: List[str] = ["TNDN", "GTGT"]
    time_period: Optional[str] = None
    model_tier: str = "fast"
    sonar_model: str = "sonar"  # "sonar" | "sonar-pro"
    sections: Optional[List[dict]] = None


@router.post("/quick")
async def quick_research(
    body: QuickResearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")

    result = await run_quick_research(
        question=body.question,
        tax_types=body.tax_types,
        time_period=body.time_period or "",
        model_tier=body.model_tier,
        db=db,
        dbvntax_db=dbvntax_db,
        user_id=user.id,
    )
    return result


@router.post("/full")
async def start_full_report(
    body: FullReportRequest,
    user: User = Depends(get_current_user),
):
    if not body.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")

    job_id = str(uuid.uuid4())
    sections = body.sections if body.sections else CONFIG_SECTIONS
    create_job(job_id, {
        "subject": body.subject,
        "mode": body.mode,
        "tax_types": body.tax_types,
        "time_period": body.time_period or "",
        "model_tier": body.model_tier,
        "sonar_model": body.sonar_model,
        "sections": sections,
        "user_id": user.id,
    })
    return {"job_id": job_id}


@router.get("/full/{job_id}/stream")
async def stream_full_report(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    params = job["params"]

    async def event_stream():
        async for event in generate_full_report(
            job_id=job_id,
            subject=params["subject"],
            report_type_mode=params["mode"],
            tax_types=params["tax_types"],
            time_period=params["time_period"],
            model_tier=params["model_tier"],
            sonar_model=params["sonar_model"],
            sections_config=params["sections"],
            db=db,
            dbvntax_db=dbvntax_db,
            user_id=params["user_id"],
        ):
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/full/{job_id}/status")
async def job_status(job_id: str, user: User = Depends(get_current_user)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job_id,
        "status": job["status"],
        "sections_done": job["sections_done"],
        "error": job["error"],
    }


@router.get("/history")
async def research_history(
    skip: int = 0,
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select, desc
    from backend.models import ResearchSession
    q = (
        select(ResearchSession)
        .where(ResearchSession.user_id == user.id)
        .order_by(desc(ResearchSession.created_at))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(q)
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "question": s.question,
            "tax_types": s.tax_types,
            "time_period": s.time_period,
            "model_used": s.model_used,
            "duration_ms": s.duration_ms,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.get("/history/{session_id}")
async def get_research_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from backend.models import ResearchSession
    result = await db.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Not found")
    if session.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "id": session.id,
        "question": session.question,
        "tax_types": session.tax_types,
        "time_period": session.time_period,
        "answer_html": session.answer_html,
        "citations": session.citations,
        "model_used": session.model_used,
        "duration_ms": session.duration_ms,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


@router.delete("/history/{session_id}")
async def delete_research_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from backend.models import ResearchSession
    session = await db.get(ResearchSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Not found")
    if session.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.delete(session)
    await db.commit()
    return {"ok": True}
