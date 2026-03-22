import asyncpg
import os

_pool = None

class DB:
    def __init__(self, pool):
        self.pool = pool

    async def fetch(self, query, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def execute(self, query, *args):
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)


async def get_db():
    global _pool

    if _pool is None:
        DATABASE_URL = os.getenv("DATABASE_URL")

        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=5
        )

    return DB(_pool)