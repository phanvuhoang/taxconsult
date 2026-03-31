"""Chạy một lần để alter tables. python3 -m backend.migrations.run_migrations"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from backend.config import DATABASE_URL, DBVNTAX_DATABASE_URL

TAXCONSULT_SQL = """
ALTER TABLE priority_docs
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;
"""

DBVNTAX_SQL = """
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;
"""

async def main():
    # taxconsult DB
    engine1 = create_async_engine(DATABASE_URL)
    async with engine1.begin() as conn:
        await conn.execute(text(TAXCONSULT_SQL))
    print("✅ taxconsult DB migrated")

    # dbvntax DB
    engine2 = create_async_engine(DBVNTAX_DATABASE_URL)
    async with engine2.begin() as conn:
        await conn.execute(text(DBVNTAX_SQL))
    print("✅ dbvntax DB migrated")

asyncio.run(main())
