"""
Expire abandoned UPI checkouts so Admin UNPAID stays clean
and customers aren't stuck in PENDING_PAYMENT forever.
"""
import os
from app.db.database import get_db


def pending_payment_ttl_minutes() -> int:
    try:
        return max(5, int(os.getenv("PENDING_PAYMENT_TTL_MINUTES", "30")))
    except (TypeError, ValueError):
        return 30


async def expire_abandoned_upi_orders(db=None) -> int:
    """
    Cancel final_orders stuck in PENDING_PAYMENT / payment PENDING
    older than TTL. Store lines were never notified (AWAITING_PAYMENT).
    Returns number of orders expired.
    """
    db = db or await get_db()
    ttl = pending_payment_ttl_minutes()

    try:
        await db.execute(
            "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30)"
        )
    except Exception:
        pass

    rows = await db.fetch(
        f"""
        SELECT id
        FROM final_orders
        WHERE (
            UPPER(COALESCE(status, '')) = 'PENDING_PAYMENT'
            OR UPPER(COALESCE(payment_status, '')) IN ('PENDING', 'UNPAID')
        )
        AND UPPER(COALESCE(payment_status, '')) NOT IN ('PAID', 'PAY_AT_STORE', 'EXPIRED')
        AND created_at < NOW() - INTERVAL '{ttl} minutes'
        ORDER BY id
        LIMIT 50
        """
    )
    if not rows:
        return 0

    expired = 0
    for row in rows:
        oid = row["id"]
        await db.execute(
            """
            UPDATE final_orders
            SET status = 'CANCELLED',
                payment_status = 'EXPIRED',
                updated_at = NOW()
            WHERE id = $1
              AND UPPER(COALESCE(payment_status, '')) NOT IN ('PAID', 'PAY_AT_STORE')
            """,
            oid,
        )
        await db.execute(
            """
            UPDATE store_orders
            SET status = 'CANCELLED', updated_at = NOW()
            WHERE final_order_id = $1
              AND status = 'AWAITING_PAYMENT'
            """,
            oid,
        )
        try:
            await db.execute(
                """
                INSERT INTO final_order_events (final_order_id, status)
                VALUES ($1, 'EXPIRED_PAYMENT')
                """,
                oid,
            )
        except Exception:
            pass
        expired += 1

    return expired
