import asyncpg
import os

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:$Aman@localhost:5432/kirana")

pool = None


async def get_db():
    global pool
    if not pool:
        pool = await asyncpg.create_pool(DB_URL)
    return pool