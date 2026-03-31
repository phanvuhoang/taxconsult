"""Chạy một lần để alter tables. python3 -m backend.migrations.run_migrations"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from backend.config import DATABASE_URL, DBVNTAX_DATABASE_URL

TAXCONSULT_SQL = """
ALTER TABLE priority_docs
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE,
  ADD COLUMN IF NOT EXISTS priority_level INTEGER DEFAULT 3;

COMMENT ON COLUMN priority_docs.priority_level IS '1=cao nhất, 5=thấp nhất';
"""

DBVNTAX_SQL = """
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;
"""

REPORT_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS report_jobs (
    id VARCHAR PRIMARY KEY,
    subject VARCHAR,
    user_id INTEGER,
    status VARCHAR DEFAULT 'pending',
    progress_step INTEGER DEFAULT 0,
    progress_total INTEGER DEFAULT 0,
    progress_label VARCHAR DEFAULT '',
    html_content TEXT DEFAULT '',
    error_msg VARCHAR,
    report_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
"""

async def main():
    # taxconsult DB
    engine1 = create_async_engine(DATABASE_URL)
    async with engine1.begin() as conn:
        await conn.execute(text(TAXCONSULT_SQL))
        await conn.execute(text(REPORT_JOBS_SQL))
    print("✅ taxconsult DB migrated")

    # dbvntax DB
    engine2 = create_async_engine(DBVNTAX_DATABASE_URL)
    async with engine2.begin() as conn:
        await conn.execute(text(DBVNTAX_SQL))
    print("✅ dbvntax DB migrated")

asyncio.run(main())
