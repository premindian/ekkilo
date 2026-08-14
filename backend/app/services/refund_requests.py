"""Customer UPI refund requests (manual settlement today)."""
from __future__ import annotations

from typing import Any, Optional

from app.db.database import get_db


async def ensure_refund_requests_schema(db=None):
    db = db or await get_db()
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS refund_requests (
            id BIGSERIAL PRIMARY KEY,
            final_order_id INTEGER NOT NULL,
            customer_phone TEXT,
            amount NUMERIC(12, 2),
            reason TEXT,
            status TEXT NOT NULL DEFAULT 'REQUESTED',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (final_order_id)
        )
        """
    )
    await db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_refund_requests_status
        ON refund_requests (status, created_at DESC)
        """
    )


async def create_refund_request(
    *,
    final_order_id: int,
    customer_phone: str,
    amount: Optional[float] = None,
    reason: Optional[str] = None,
    db=None,
) -> dict[str, Any]:
    db = db or await get_db()
    await ensure_refund_requests_schema(db)
    existing = await db.fetchrow(
        "SELECT id, status, created_at FROM refund_requests WHERE final_order_id = $1",
        final_order_id,
    )
    if existing:
        return {
            "ok": True,
            "already": True,
            "id": existing["id"],
            "status": existing["status"],
            "created_at": existing["created_at"].isoformat() if existing["created_at"] else None,
        }
    row = await db.fetchrow(
        """
        INSERT INTO refund_requests (final_order_id, customer_phone, amount, reason, status)
        VALUES ($1, $2, $3, $4, 'REQUESTED')
        RETURNING id, status, created_at
        """,
        final_order_id,
        customer_phone,
        amount,
        (reason or "").strip()[:500] or None,
    )
    return {
        "ok": True,
        "already": False,
        "id": row["id"],
        "status": row["status"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


async def get_refund_for_order(final_order_id: int, db=None) -> Optional[dict[str, Any]]:
    db = db or await get_db()
    await ensure_refund_requests_schema(db)
    row = await db.fetchrow(
        """
        SELECT id, final_order_id, status, amount, reason, created_at
        FROM refund_requests WHERE final_order_id = $1
        """,
        final_order_id,
    )
    if not row:
        return None
    d = dict(row)
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    if d.get("amount") is not None:
        d["amount"] = float(d["amount"])
    return d


async def list_refund_requests(
    *,
    limit: int = 50,
    status: Optional[str] = None,
    db=None,
) -> list[dict[str, Any]]:
    db = db or await get_db()
    await ensure_refund_requests_schema(db)
    limit = max(1, min(int(limit or 50), 200))
    where = ["1=1"]
    params: list[Any] = []
    if status:
        params.append(status.strip().upper())
        where.append(f"status = ${len(params)}")
    params.append(limit)
    rows = await db.fetch(
        f"""
        SELECT r.id, r.final_order_id, r.customer_phone, r.amount, r.reason,
               r.status, r.created_at, fo.total_amount AS order_total
        FROM refund_requests r
        LEFT JOIN final_orders fo ON fo.id = r.final_order_id
        WHERE {' AND '.join(where)}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ${len(params)}
        """,
        *params,
    )
    out = []
    for r in rows:
        d = dict(r)
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat()
        for k in ("amount", "order_total"):
            if d.get(k) is not None:
                d[k] = float(d[k])
        out.append(d)
    return out
