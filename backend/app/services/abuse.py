"""
Anti-abuse helpers: phone blocklist + rate limits for OTP and orders.

No-show ladder (soft — not a harsh 2-strike ban):
  1st no-show → warning only
  2nd        → 48h cool-down
  3rd        → 7-day cool-down
  4th+       → blocked (admin can unblock)
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request
from app.db.database import get_db
from app.utils.phone import normalize_phone, phone_tail

# Tunable limits
OTP_MAX_PER_WINDOW = 3
OTP_WINDOW_MINUTES = 10

ORDER_MAX_PER_PHONE = 3
ORDER_PHONE_WINDOW_MINUTES = 15

ORDER_MAX_PER_IP = 5
ORDER_IP_WINDOW_MINUTES = 60

# Soft no-show ladder
NO_SHOW_COOLDOWN_2_HOURS = 48
NO_SHOW_COOLDOWN_3_HOURS = 24 * 7
NO_SHOW_BLOCK_AT = 4


async def ensure_abuse_schema(db=None):
    db = db or await get_db()
    await db.execute("""
        CREATE TABLE IF NOT EXISTS blocked_phones (
            phone TEXT PRIMARY KEY,
            reason TEXT,
            blocked_by INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS abuse_events (
            id SERIAL PRIMARY KEY,
            event_type VARCHAR(30) NOT NULL,
            phone TEXT,
            ip TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_abuse_events_type_phone_time
        ON abuse_events (event_type, phone, created_at DESC)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_abuse_events_type_ip_time
        ON abuse_events (event_type, ip, created_at DESC)
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS customer_trust (
            phone TEXT PRIMARY KEY,
            no_show_count INTEGER NOT NULL DEFAULT 0,
            cooldown_until TIMESTAMPTZ,
            last_no_show_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS no_show_events (
            id SERIAL PRIMARY KEY,
            phone TEXT NOT NULL,
            final_order_id INTEGER NOT NULL UNIQUE,
            store_order_id INTEGER,
            strike_number INTEGER,
            action VARCHAR(30),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)


def client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def is_phone_blocked(phone: str, db=None) -> bool:
    db = db or await get_db()
    await ensure_abuse_schema(db)
    phone = normalize_phone(phone)
    if not phone:
        return False
    tail = phone_tail(phone)
    row = await db.fetchrow("""
        SELECT 1 FROM blocked_phones
        WHERE phone = $1
           OR RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2
        LIMIT 1
    """, phone, tail)
    return bool(row)


async def assert_phone_not_blocked(phone: str, db=None):
    try:
        blocked = await is_phone_blocked(phone, db=db)
    except Exception as e:
        print(f"⚠️ Blocklist check skipped: {e}")
        return
    if blocked:
        raise HTTPException(
            status_code=403,
            detail="This phone number is blocked from ordering. Contact support if this is a mistake.",
        )


async def get_trust_row(phone: str, db=None):
    db = db or await get_db()
    await ensure_abuse_schema(db)
    phone = normalize_phone(phone)
    if not phone:
        return None
    return await db.fetchrow("SELECT * FROM customer_trust WHERE phone = $1", phone)


async def assert_can_place_order(phone: str, db=None):
    """Blocklist + no-show cool-down gate before placing an order."""
    await assert_phone_not_blocked(phone, db=db)
    try:
        db = db or await get_db()
        await ensure_abuse_schema(db)
        phone = normalize_phone(phone)
        row = await get_trust_row(phone, db=db)
        if not row or not row.get("cooldown_until"):
            return
        until = row["cooldown_until"]
        now = datetime.now(timezone.utc)
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        if until > now:
            hours = max(1, int((until - now).total_seconds() // 3600))
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Ordering paused after missed pickups. "
                    f"You can order again in about {hours} hour(s). "
                    f"Please collect ready orders on time."
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"⚠️ Cool-down check skipped: {e}")


async def block_phone(phone: str, reason: str = None, blocked_by: int = None, db=None):
    db = db or await get_db()
    await ensure_abuse_schema(db)
    phone = normalize_phone(phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone")
    await db.execute("""
        INSERT INTO blocked_phones (phone, reason, blocked_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (phone) DO UPDATE
        SET reason = EXCLUDED.reason,
            blocked_by = EXCLUDED.blocked_by,
            created_at = NOW()
    """, phone, reason, blocked_by)
    return phone


async def unblock_phone(phone: str, db=None):
    db = db or await get_db()
    await ensure_abuse_schema(db)
    phone = normalize_phone(phone)
    tail = phone_tail(phone)
    await db.execute("""
        DELETE FROM blocked_phones
        WHERE phone = $1
           OR RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2
    """, phone, tail)
    # Forgive cool-down / reset strike counter on admin unblock
    await db.execute("""
        UPDATE customer_trust
        SET no_show_count = 0,
            cooldown_until = NULL,
            updated_at = NOW()
        WHERE phone = $1
           OR RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2
    """, phone, tail)


async def record_no_show(
    phone: str,
    final_order_id: int,
    store_order_id: int = None,
    db=None,
):
    """
    Record a missed pickup. One strike per final_order_id.
    Returns {already, strikes, action, cooldown_until, customer_message, store_message}
    """
    db = db or await get_db()
    await ensure_abuse_schema(db)
    phone = normalize_phone(phone)
    if not phone or not final_order_id:
        return {"already": False, "strikes": 0, "action": "none"}

    existing = await db.fetchrow(
        "SELECT id, strike_number, action FROM no_show_events WHERE final_order_id = $1",
        final_order_id,
    )
    if existing:
        return {
            "already": True,
            "strikes": existing["strike_number"] or 0,
            "action": existing["action"] or "none",
            "customer_message": None,
            "store_message": "ℹ️ No-show already recorded for this order",
        }

    trust = await get_trust_row(phone, db=db)
    strikes = int(trust["no_show_count"] if trust else 0) + 1
    now = datetime.now(timezone.utc)
    cooldown_until = None
    action = "warn"

    if strikes == 1:
        action = "warn"
        customer_message = (
            f"⚠️ Missed pickup for order #{final_order_id}.\n\n"
            f"Please collect orders when they're marked READY. "
            f"This is a friendly reminder — no ban yet."
        )
    elif strikes == 2:
        action = "cooldown_48h"
        cooldown_until = now + timedelta(hours=NO_SHOW_COOLDOWN_2_HOURS)
        customer_message = (
            f"⚠️ Second missed pickup (order #{final_order_id}).\n\n"
            f"Ordering is paused for 48 hours so kiranas aren't left packing for no-shows. "
            f"You can order again after that."
        )
    elif strikes == 3:
        action = "cooldown_7d"
        cooldown_until = now + timedelta(hours=NO_SHOW_COOLDOWN_3_HOURS)
        customer_message = (
            f"⚠️ Third missed pickup (order #{final_order_id}).\n\n"
            f"Ordering is paused for 7 days. Please only place orders you can collect."
        )
    else:
        action = "blocked"
        await block_phone(
            phone,
            reason=f"Repeated no-shows ({strikes}) — last order #{final_order_id}",
            db=db,
        )
        customer_message = (
            f"🚫 Repeated missed pickups (order #{final_order_id}).\n\n"
            f"Ordering is blocked on this number. Contact Ekkilo support if this was a mistake."
        )

    await db.execute("""
        INSERT INTO customer_trust (phone, no_show_count, cooldown_until, last_no_show_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (phone) DO UPDATE
        SET no_show_count = $2,
            cooldown_until = $3,
            last_no_show_at = $4,
            updated_at = NOW()
    """, phone, strikes, cooldown_until, now)

    await db.execute("""
        INSERT INTO no_show_events (phone, final_order_id, store_order_id, strike_number, action)
        VALUES ($1, $2, $3, $4, $5)
    """, phone, final_order_id, store_order_id, strikes, action)

    await record_abuse_event("no_show", phone=phone, db=db)

    store_message = f"📝 No-show recorded (customer strike {strikes}/4 — {action})"
    return {
        "already": False,
        "strikes": strikes,
        "action": action,
        "cooldown_until": cooldown_until,
        "customer_message": customer_message,
        "store_message": store_message,
    }


async def record_abuse_event(event_type: str, phone: str = None, ip: str = None, db=None):
    db = db or await get_db()
    await ensure_abuse_schema(db)
    await db.execute("""
        INSERT INTO abuse_events (event_type, phone, ip)
        VALUES ($1, $2, $3)
    """, event_type, normalize_phone(phone) if phone else None, ip)


async def assert_otp_rate_limit(phone: str, db=None):
    """Max OTP_MAX_PER_WINDOW OTP sends per phone in OTP_WINDOW_MINUTES."""
    try:
        db = db or await get_db()
        phone = normalize_phone(phone)
        tail = phone_tail(phone)
        count = await db.fetchval("""
            SELECT COUNT(*) FROM otp_verifications
            WHERE (
                phone = $1
                OR RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2
            )
              AND created_at > NOW() - ($3::text || ' minutes')::interval
        """, phone, tail, str(OTP_WINDOW_MINUTES))
        if (count or 0) >= OTP_MAX_PER_WINDOW:
            raise HTTPException(
                status_code=429,
                detail=f"Too many OTP requests for this number. Wait {OTP_WINDOW_MINUTES} minutes, then try once.",
            )
    except HTTPException:
        raise
    except Exception as e:
        # Don't brick login if rate-limit SQL fails
        print(f"⚠️ OTP rate limit check skipped: {e}")


async def assert_order_rate_limit(phone: str, ip: str = None, db=None):
    """
    Max ORDER_MAX_PER_PHONE orders / 15 min per phone,
    and ORDER_MAX_PER_IP orders / hour per IP.
    """
    try:
        db = db or await get_db()
        await ensure_abuse_schema(db)
        phone = normalize_phone(phone)
        tail = phone_tail(phone)

        phone_count = await db.fetchval("""
            SELECT COUNT(*) FROM final_orders
            WHERE (
                customer_phone = $1
                OR RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 10) = $2
            )
            AND created_at > NOW() - ($3::text || ' minutes')::interval
        """, phone, tail, str(ORDER_PHONE_WINDOW_MINUTES))

        if (phone_count or 0) >= ORDER_MAX_PER_PHONE:
            raise HTTPException(
                status_code=429,
                detail=f"Too many orders from this number. Please wait {ORDER_PHONE_WINDOW_MINUTES} minutes.",
            )

        if ip and ip != "unknown":
            ip_count = await db.fetchval("""
                SELECT COUNT(*) FROM abuse_events
                WHERE event_type = 'order'
                  AND ip = $1
                  AND created_at > NOW() - ($2::text || ' minutes')::interval
            """, ip, str(ORDER_IP_WINDOW_MINUTES))
            if (ip_count or 0) >= ORDER_MAX_PER_IP:
                raise HTTPException(
                    status_code=429,
                    detail="Too many orders from this network. Please try again later.",
                )
    except HTTPException:
        raise
    except Exception as e:
        print(f"⚠️ Order rate limit check skipped: {e}")
