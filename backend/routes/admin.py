from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from backend.database import get_db, get_dbvntax_db
from backend.models import User, Report, ResearchSession, TaxDoc
from backend.auth import require_admin, get_current_user, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""
    role: str = "user"


@router.get("/users")
async def list_users(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/users")
async def create_user(
    body: CreateUserRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists")

    new_user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"id": new_user.id, "email": new_user.email}


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    target.is_active = not target.is_active
    await db.commit()
    return {"id": target.id, "is_active": target.is_active}


@router.get("/dbvntax-sac-thue")
async def dbvntax_sac_thue(
    user: User = Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    sql = """
        SELECT unnest(sac_thue) as sac_thue, COUNT(*) as count
        FROM documents
        GROUP BY sac_thue
        ORDER BY count DESC
    """
    try:
        result = await dbvntax_db.execute(text(sql))
        rows = result.mappings().all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return [{"sac_thue": r["sac_thue"], "count": r["count"]} for r in rows]


@router.get("/stats")
async def get_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    total_reports = (await db.execute(select(func.count(Report.id)))).scalar()
    total_research = (await db.execute(select(func.count(ResearchSession.id)))).scalar()
    total_docs = (await db.execute(select(func.count(TaxDoc.id)))).scalar()
    return {
        "total_users": total_users,
        "total_reports": total_reports,
        "total_research_sessions": total_research,
        "total_tax_docs": total_docs,
    }
