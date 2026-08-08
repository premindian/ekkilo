"""
Anti-abuse helpers: phone blocklist + rate limits for OTP and orders.
"""
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
        count = await db.fetchval("""
            SELECT COUNT(*) FROM otp_verifications
            WHERE phone = $1
              AND created_at > NOW() - ($2::text || ' minutes')::interval
        """, phone, str(OTP_WINDOW_MINUTES))
        if (count or 0) >= OTP_MAX_PER_WINDOW:
            raise HTTPException(
                status_code=429,
                detail=f"Too many OTP requests. Try again in {OTP_WINDOW_MINUTES} minutes.",
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
