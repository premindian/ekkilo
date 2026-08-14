"""Store-managed delivery rules (Ekkilo does not run delivery)."""
from app.db.database import get_db
from app.utils.phone import phone_tail, normalize_phone


async def ensure_delivery_schema(db=None):
    db = db or await get_db()
    await db.execute("""
        CREATE TABLE IF NOT EXISTS store_settings (
            id SERIAL PRIMARY KEY,
            store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
            delivery_radius DECIMAL(10,2) DEFAULT 5.0,
            min_order DECIMAL(10,2) DEFAULT 0,
            is_open BOOLEAN DEFAULT TRUE,
            auto_accept_orders BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    for stmt in (
        "ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS free_delivery_min NUMERIC(12,2) DEFAULT 1500",
        "ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) DEFAULT 0",
        "ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS delivery_notes TEXT",
        "ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS fulfillment VARCHAR(20) DEFAULT 'pickup'",
        "ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) DEFAULT 0",
        "ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_note TEXT",
    ):
        try:
            await db.execute(stmt)
        except Exception:
            pass


def calc_delivery_fee(subtotal: float, settings: dict) -> float:
    """Fee the store charges when customer chooses delivery. 0 if free or not offering."""
    if not settings or not settings.get("delivery_enabled"):
        return 0.0
    try:
        free_min = float(settings.get("free_delivery_min") or 0)
    except (TypeError, ValueError):
        free_min = 0.0
    try:
        fee = float(settings.get("delivery_fee") or 0)
    except (TypeError, ValueError):
        fee = 0.0
    if free_min > 0 and float(subtotal or 0) >= free_min:
        return 0.0
    return max(0.0, fee)


async def delivery_options_for_phones(phones: list, db=None) -> dict:
    """
    Map last-10 phone digits → delivery settings dict.
    """
    db = db or await get_db()
    await ensure_delivery_schema(db)
    out = {}
    tails = []
    for p in phones or []:
        t = phone_tail(normalize_phone(str(p)))
        if t and t not in tails:
            tails.append(t)
    if not tails:
        return out

    rows = await db.fetch(
        """
        SELECT s.id, s.name, s.phone,
               ss.delivery_enabled, ss.free_delivery_min, ss.delivery_fee,
               ss.delivery_notes, ss.delivery_radius, ss.min_order
        FROM stores s
        LEFT JOIN store_settings ss ON ss.store_id = s.id
        WHERE RIGHT(REGEXP_REPLACE(COALESCE(s.phone, ''), '[^0-9]', '', 'g'), 10) = ANY($1::text[])
        """,
        tails,
    )
    for r in rows:
        tail = phone_tail(r["phone"])
        enabled = bool(r["delivery_enabled"]) if r["delivery_enabled"] is not None else False
        out[tail] = {
            "store_id": r["id"],
            "store_name": r["name"],
            "phone": r["phone"],
            "delivery_enabled": enabled,
            "free_delivery_min": float(r["free_delivery_min"] or 0),
            "delivery_fee": float(r["delivery_fee"] or 0),
            "delivery_notes": r["delivery_notes"] or "",
            "delivery_radius_km": float(r["delivery_radius"] or 0) if r["delivery_radius"] is not None else None,
            "min_order": float(r["min_order"] or 0) if r["min_order"] is not None else 0,
        }
    return out
