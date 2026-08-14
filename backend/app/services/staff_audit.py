"""Lightweight staff audit trail (admin + store portal actions)."""
from __future__ import annotations

import json
from typing import Any, Optional, Union

from app.db.database import get_db

EntityId = Optional[Union[int, str]]


async def ensure_staff_audit_schema(db=None):
    db = db or await get_db()
    await db.execute("""
        CREATE TABLE IF NOT EXISTS staff_audit_events (
            id BIGSERIAL PRIMARY KEY,
            actor_user_id INTEGER,
            actor_phone TEXT,
            actor_role TEXT NOT NULL,
            store_id INTEGER,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            details JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_staff_audit_created
        ON staff_audit_events (created_at DESC)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_staff_audit_actor
        ON staff_audit_events (actor_user_id, created_at DESC)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_staff_audit_action
        ON staff_audit_events (action, created_at DESC)
    """)


def _role_from_actor(actor: Optional[dict]) -> str:
    if not actor:
        return "unknown"
    if actor.get("is_admin"):
        return "admin"
    if actor.get("is_store_owner"):
        return "store"
    return "staff"


async def log_staff_action(
    *,
    actor: Optional[dict],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: EntityId = None,
    details: Optional[dict] = None,
    store_id: Optional[int] = None,
    db=None,
) -> None:
    """Append-only audit row. Never raises to callers."""
    try:
        db = db or await get_db()
        await ensure_staff_audit_schema(db)
        payload = None
        if details is not None:
            try:
                payload = json.dumps(details, default=str)
            except Exception:
                payload = json.dumps({"raw": str(details)})
        await db.execute(
            """
            INSERT INTO staff_audit_events (
                actor_user_id, actor_phone, actor_role, store_id,
                action, entity_type, entity_id, details
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            """,
            (actor or {}).get("id"),
            str((actor or {}).get("phone") or "") or None,
            _role_from_actor(actor),
            store_id or (actor or {}).get("store_id"),
            action,
            entity_type,
            str(entity_id) if entity_id is not None else None,
            payload if payload is not None else None,
        )
    except Exception as e:
        print(f"⚠️ staff audit log failed ({action}): {e}")


async def list_staff_audit_events(
    *,
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    actor_phone: Optional[str] = None,
    store_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db=None,
) -> list[dict[str, Any]]:
    db = db or await get_db()
    await ensure_staff_audit_schema(db)
    limit = max(1, min(int(limit or 100), 500))
    offset = max(0, int(offset or 0))
    where = ["1=1"]
    params: list[Any] = []
    if action:
        params.append(f"%{action.strip()}%")
        where.append(f"action ILIKE ${len(params)}")
    if actor_phone:
        tail = "".join(c for c in str(actor_phone) if c.isdigit())[-10:]
        if tail:
            params.append(f"%{tail}%")
            where.append(f"COALESCE(actor_phone, '') LIKE ${len(params)}")
    if store_id is not None:
        try:
            sid = int(store_id)
            params.append(sid)
            where.append(f"store_id = ${len(params)}")
        except (TypeError, ValueError):
            pass
    if date_from:
        params.append(str(date_from).strip()[:32])
        where.append(f"created_at >= ${len(params)}::timestamptz")
    if date_to:
        # Inclusive end-of-day if date-only (YYYY-MM-DD)
        raw = str(date_to).strip()[:32]
        if len(raw) <= 10:
            raw = f"{raw}T23:59:59.999Z"
        params.append(raw)
        where.append(f"created_at <= ${len(params)}::timestamptz")
    params.append(limit)
    lim_i = len(params)
    params.append(offset)
    off_i = len(params)
    rows = await db.fetch(
        f"""
        SELECT id, actor_user_id, actor_phone, actor_role, store_id,
               action, entity_type, entity_id, details, created_at
        FROM staff_audit_events
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC, id DESC
        LIMIT ${lim_i} OFFSET ${off_i}
        """,
        *params,
    )
    out = []
    for r in rows:
        d = dict(r)
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat()
        # asyncpg may already return dict for jsonb
        if isinstance(d.get("details"), str):
            try:
                d["details"] = json.loads(d["details"])
            except Exception:
                pass
        out.append(d)
    return out
