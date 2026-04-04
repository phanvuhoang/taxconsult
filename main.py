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
from backend.routes import auth, reports, research, tax_docs, admin, priority_docs, content, references


@asynccontextmanager
async def lifespan(app: FastAPI):
    from sqlalchemy import text
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Auto-migrate new columns (safe — IF NOT EXISTS)
        await conn.execute(text("""
            ALTER TABLE content_jobs
                ADD COLUMN IF NOT EXISTS model_used VARCHAR(100),
                ADD COLUMN IF NOT EXISTS provider_used VARCHAR(50);
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS reference_articles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                title VARCHAR(500) NOT NULL,
                source_url TEXT,
                source_type VARCHAR(20) NOT NULL DEFAULT 'paste',
                content_text TEXT,
                content_html TEXT,
                char_count INTEGER DEFAULT 0,
                tax_types TEXT[] DEFAULT '{}',
                form_type VARCHAR(50),
                tags TEXT[] DEFAULT '{}',
                auto_classified BOOLEAN DEFAULT FALSE,
                gamma_url TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ref_articles_user ON reference_articles(user_id);
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ref_articles_form_type ON reference_articles(form_type);
        """))

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
app.include_router(priority_docs.router)
app.include_router(content.router)
app.include_router(references.router)

# Serve frontend
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index)
