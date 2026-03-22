from app.db.database import get_db
import json

async def get_state(phone):
    db = await get_db()

    row = await db.fetchrow(
        "SELECT step, data FROM user_state WHERE phone=$1",
        phone
    )

    if not row:
        return {"step": "search", "data": {}}

    return {
        "step": row["step"],
        "data": row["data"] or {}
    }


async def set_state(phone, step, data=None):
    db = await get_db()

    await db.execute("""
        INSERT INTO user_state (phone, step, data)
        VALUES ($1, $2, $3)
        ON CONFLICT (phone)
        DO UPDATE SET step=$2, data=$3, updated_at=NOW()
    """, phone, step, json.dumps(data or {}))