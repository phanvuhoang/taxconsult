import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select

from backend.database import engine, AsyncSessionLocal
from backend.models import Base, User
from backend.auth import hash_password
from backend.config import APP_PASSWORD
from backend.routes import auth, reports, research, tax_docs, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create admin user if no users exist
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        existing = result.scalars().first()
        if not existing:
            admin_user = User(
                email="admin@taxconsult.local",
                password_hash=hash_password(APP_PASSWORD or "admin123"),
                full_name="Admin",
                role="admin",
            )
            db.add(admin_user)
            await db.commit()
            print("Created admin user: admin@taxconsult.local")

    yield


app = FastAPI(title="TaxConsult API", lifespan=lifespan)

# API routes
app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(research.router)
app.include_router(tax_docs.router)
app.include_router(admin.router)

# Serve frontend
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index)
