"""
Shared order status helpers for WhatsApp + web portals.
Ensures schema, updates store/final status, and notifies customers.
"""
import re
import secrets
from datetime import datetime, timedelta, timezone

from app.db.database import get_db
from app.utils.phone import normalize_phone, phone_tail

TRACK_BASE_URL = "https://ekkilo.onrender.com"

# India kirana packing: 1–2 hours is normal. Default 2h before "running late" ping.
DEFAULT_ETA_MINUTES = 120


def new_track_token() -> str:
    """Unguessable token for public track links."""
    return secrets.token_urlsafe(16)


async def ensure_order_schema(db=None):
    """Idempotent schema repair for order status columns/tables."""
    db = db or await get_db()

    await db.execute("""
        ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'CREATED'
    """)
    await db.execute("""
        ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    """)
    await db.execute("""
        ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS track_token TEXT
    """)
    await db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_final_orders_track_token
        ON final_orders (track_token)
        WHERE track_token IS NOT NULL
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'PENDING'
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS store_id INTEGER
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS eta_minutes INTEGER
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS ready_by TIMESTAMPTZ
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delay_note TEXT
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delay_notified_at TIMESTAMPTZ
    """)
    await db.execute("""
        ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS late_ping_sent_at TIMESTAMPTZ
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS final_order_events (
            id SERIAL PRIMARY KEY,
            final_order_id INTEGER REFERENCES final_orders(id) ON DELETE CASCADE,
            status VARCHAR(30) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS store_order_events (
            id SERIAL PRIMARY KEY,
            store_order_id INTEGER REFERENCES store_orders(id) ON DELETE CASCADE,
            status VARCHAR(30) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # Optional link from outbound WhatsApp rows → orders
    await db.execute("""
        ALTER TABLE whatsapp_messages
        ADD COLUMN IF NOT EXISTS final_order_id INTEGER
    """)

    # Backfill missing track tokens for older orders
    missing = await db.fetch("""
        SELECT id FROM final_orders WHERE track_token IS NULL
    """)
    for row in missing:
        await db.execute("""
            UPDATE final_orders SET track_token = $1 WHERE id = $2 AND track_token IS NULL
        """, new_track_token(), row["id"])


async def get_track_url(final_order_id: int, db=None) -> str:
    """Build a private track URL; mint a token if the order is missing one."""
    db = db or await get_db()
    await ensure_order_schema(db)
    row = await db.fetchrow("""
        SELECT track_token FROM final_orders WHERE id = $1
    """, final_order_id)
    if not row:
        return f"{TRACK_BASE_URL}/track"
    token = row["track_token"]
    if not token:
        token = new_track_token()
        await db.execute("""
            UPDATE final_orders SET track_token = $1 WHERE id = $2
        """, token, final_order_id)
    return f"{TRACK_BASE_URL}/track?t={token}"


async def get_final_status(order_id: int, db=None):
    db = db or await get_db()
    row = await db.fetchrow("SELECT status FROM final_orders WHERE id = $1", order_id)
    return row["status"] if row else None


async def find_store_order_for_phone(order_id: int, sender_phone: str, db=None):
    """
    Match inbound WhatsApp sender to a store_order by:
    - store_orders.store_phone
    - stores.phone
    - linked store-owner users.phone
    - single-store fallback (only 1 store on the order)
    """
    db = db or await get_db()
    tail = phone_tail(sender_phone)
    if not tail:
        return None, "invalid_phone"

    row = await db.fetchrow("""
        SELECT so.id, so.store_name, so.status, so.store_phone, so.final_order_id
        FROM store_orders so
        LEFT JOIN stores s ON s.id = so.store_id
        LEFT JOIN users u ON u.store_id = COALESCE(so.store_id, s.id) AND u.is_store_owner = TRUE
        WHERE so.final_order_id = $1
          AND (
            RIGHT(REGEXP_REPLACE(COALESCE(so.store_phone, ''), '[^0-9]', '', 'g'), 10) = $2
            OR RIGHT(REGEXP_REPLACE(COALESCE(s.phone, ''), '[^0-9]', '', 'g'), 10) = $2
            OR RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 10) = $2
          )
        LIMIT 1
    """, order_id, tail)

    if row:
        return row, "matched"

    # Fallback: only one store on this order — allow command (common during testing)
    stores = await db.fetch("""
        SELECT id, store_name, status, store_phone, final_order_id
        FROM store_orders
        WHERE final_order_id = $1
        ORDER BY id
    """, order_id)

    if len(stores) == 1:
        print(f"⚠️ Store phone mismatch for order {order_id}; using single-store fallback for {tail}")
        return stores[0], "single_store_fallback"

    return None, "not_found"


def parse_eta_minutes(text: str):
    """
    Parse ETA from free text after a command.
    Examples: '30m', '30 min', '45mins', '1h', '1.5h', '90'
    Returns int minutes or None.
    """
    if not text:
        return None
    cleaned = " ".join(str(text).strip().lower().split())
    if not cleaned:
        return None

    # 1h / 1.5h / 2 hr
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b", cleaned)
    if m:
        hours = float(m.group(1))
        mins = int(round(hours * 60))
        return mins if mins > 0 else None

    # 30m / 30 min / 45mins / 30 minutes
    m = re.match(r"^(\d+)\s*(m|min|mins|minute|minutes)?\b", cleaned)
    if m:
        mins = int(m.group(1))
        # bare number like "30" = minutes; ignore huge numbers that look like order ids
        if mins <= 0 or mins > 24 * 60:
            return None
        return mins

    return None


def format_eta_label(minutes: int) -> str:
    if minutes is None:
        return ""
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes / 60
    if abs(hours - round(hours)) < 0.05:
        h = int(round(hours))
        return f"{h} hour" if h == 1 else f"{h} hours"
    return f"{hours:.1f} hours".rstrip("0").rstrip(".") + " hours"


async def set_store_order_status(store_order_id: int, status: str, db=None, eta_minutes: int = None):
    db = db or await get_db()
    await ensure_order_schema(db)
    status = status.upper()

    if status == "ACCEPTED":
        mins = int(eta_minutes) if eta_minutes and int(eta_minutes) > 0 else DEFAULT_ETA_MINUTES
        ready_by = datetime.now(timezone.utc) + timedelta(minutes=mins)
        try:
            await db.execute("""
                UPDATE store_orders
                SET status = $1,
                    updated_at = NOW(),
                    accepted_at = COALESCE(accepted_at, NOW()),
                    eta_minutes = $3,
                    ready_by = $4,
                    late_ping_sent_at = NULL
                WHERE id = $2
            """, status, store_order_id, mins, ready_by)
        except Exception as e:
            # Older DB without ETA columns — still accept the order
            print(f"⚠️ ACCEPT with ETA columns failed ({e}); falling back to status-only update")
            await db.execute("""
                UPDATE store_orders
                SET status = $1, updated_at = NOW()
                WHERE id = $2
            """, status, store_order_id)
    else:
        await db.execute("""
            UPDATE store_orders
            SET status = $1, updated_at = NOW()
            WHERE id = $2
        """, status, store_order_id)

    try:
        await db.execute("""
            INSERT INTO store_order_events (store_order_id, status)
            VALUES ($1, $2)
        """, store_order_id, status)
    except Exception as e:
        print(f"⚠️ store_order_events insert skipped: {e}")


async def notify_customer_accept(final_order_id: int, store_name: str, eta_minutes: int, db=None):
    from app.services.whatsapp import send_message

    db = db or await get_db()
    customer = await db.fetchrow(
        "SELECT customer_phone FROM final_orders WHERE id = $1", final_order_id
    )
    if not customer or not customer.get("customer_phone"):
        return
    phone = normalize_phone(customer["customer_phone"])
    track_url = await get_track_url(final_order_id, db=db)
    eta_label = format_eta_label(eta_minutes or DEFAULT_ETA_MINUTES)
    who = store_name or "Your store"
    await send_message(
        phone,
        f"👍 Order #{final_order_id}: {who} accepted your order.\n"
        f"⏳ Expected ready in about {eta_label}.\n\n"
        f"Track: {track_url}",
    )


async def apply_store_delay(order_id: int, sender_phone: str, rest: str = "", db=None):
    """
    Store reports packing delay: DELAY#12 [20m] [reason]
    Extends ready_by and WhatsApps the customer.
    """
    db = db or await get_db()
    await ensure_order_schema(db)

    store_row, match_mode = await find_store_order_for_phone(order_id, sender_phone, db=db)
    if not store_row:
        return {
            "ok": False,
            "message": f"❌ No store order found for Order {order_id} on this WhatsApp number.",
            "match_mode": match_mode,
        }

    store_status = (store_row["status"] or "").upper()
    if store_status in ("READY", "COMPLETED", "REJECTED", "CANCELLED"):
        return {
            "ok": False,
            "message": f"⚠️ Order {order_id} is already {store_status} — cannot mark delayed",
            "match_mode": match_mode,
        }
    if store_status not in ("ACCEPTED", "PENDING", "PROCESSING"):
        # Allow delay even if still PENDING (store hasn't accepted formally)
        pass

    rest = (rest or "").strip()
    extra_mins = parse_eta_minutes(rest)
    # Strip ETA token from reason if present
    reason = rest
    if extra_mins is not None:
        reason = re.sub(
            r"^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?\b[:,\-]?\s*",
            "",
            rest,
            flags=re.IGNORECASE,
        ).strip()
    if not reason:
        reason = "packing is taking longer than expected"
    if extra_mins is None:
        extra_mins = 15

    store_order_id = store_row["id"]
    store_name = store_row["store_name"]

    # If not accepted yet, accept with this ETA; else extend from now
    ready_by = datetime.now(timezone.utc) + timedelta(minutes=extra_mins)
    if store_status != "ACCEPTED":
        await set_store_order_status(store_order_id, "ACCEPTED", db=db, eta_minutes=extra_mins)

    try:
        await db.execute("""
            UPDATE store_orders
            SET ready_by = $2,
                eta_minutes = COALESCE(eta_minutes, 0) + $3,
                delay_note = $4,
                delay_notified_at = NOW(),
                late_ping_sent_at = NULL,
                updated_at = NOW()
            WHERE id = $1
        """, store_order_id, ready_by, extra_mins, reason)
    except Exception as e:
        print(f"⚠️ DELAY column update failed ({e}); setting delay_note only if possible")
        try:
            await db.execute("""
                UPDATE store_orders
                SET delay_note = $2, updated_at = NOW()
                WHERE id = $1
            """, store_order_id, reason)
        except Exception:
            pass

    await update_final_order_status(order_id, db=db)

    from app.services.whatsapp import send_message

    customer = await db.fetchrow(
        "SELECT customer_phone FROM final_orders WHERE id = $1", order_id
    )
    if customer and customer.get("customer_phone"):
        phone = normalize_phone(customer["customer_phone"])
        track_url = await get_track_url(order_id, db=db)
        await send_message(
            phone,
            f"⏳ Order #{order_id} update from {store_name or 'your store'}:\n"
            f"{reason}.\n"
            f"New estimate: about {format_eta_label(extra_mins)} from now.\n\n"
            f"Track: {track_url}",
        )

    return {
        "ok": True,
        "message": (
            f"⏳ Delay noted for Order {order_id}. "
            f"Customer notified (+{format_eta_label(extra_mins)})."
        ),
        "match_mode": match_mode,
        "store_order_id": store_order_id,
    }


async def send_overdue_order_pings(db=None):
    """
    Auto-notify customers when a store's ready_by has passed and order is still packing.
    Returns number of pings sent.
    """
    db = db or await get_db()
    await ensure_order_schema(db)

    rows = await db.fetch("""
        SELECT so.id as store_order_id, so.store_name, so.final_order_id, so.ready_by,
               so.eta_minutes, fo.customer_phone, fo.status as final_status
        FROM store_orders so
        JOIN final_orders fo ON fo.id = so.final_order_id
        WHERE so.status = 'ACCEPTED'
          AND so.ready_by IS NOT NULL
          AND so.ready_by <= NOW()
          AND so.late_ping_sent_at IS NULL
          AND UPPER(COALESCE(fo.status, '')) NOT IN ('READY', 'COMPLETED', 'CANCELLED', 'REJECTED')
        ORDER BY so.ready_by ASC
        LIMIT 30
    """)

    if not rows:
        return 0

    from app.services.whatsapp import send_message

    sent = 0
    for row in rows:
        phone = normalize_phone(row["customer_phone"])
        if not phone:
            continue
        order_id = row["final_order_id"]
        store_name = row["store_name"] or "Your store"
        track_url = await get_track_url(order_id, db=db)
        try:
            ok = await send_message(
                phone,
                f"⏳ Order #{order_id}: {store_name} is still packing your order "
                f"(taking longer than expected).\n"
                f"We'll message you when it's ready.\n\n"
                f"Track: {track_url}",
            )
            await db.execute("""
                UPDATE store_orders
                SET late_ping_sent_at = NOW(),
                    delay_note = COALESCE(delay_note, 'Running late — still packing')
                WHERE id = $1
            """, row["store_order_id"])
            if ok:
                sent += 1
        except Exception as e:
            print(f"⚠️ Late ping failed for order {order_id}: {e}")
    return sent


async def set_final_order_status(final_order_id: int, status: str, db=None):
    db = db or await get_db()
    status = status.upper()

    await db.execute("""
        UPDATE final_orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
    """, status, final_order_id)

    await db.execute("""
        INSERT INTO final_order_events (final_order_id, status)
        VALUES ($1, $2)
    """, final_order_id, status)


async def update_final_order_status(final_order_id: int, db=None):
    """
    Aggregate store statuses into final_orders.status.
    Returns (final_status, notify_customer).
    """
    db = db or await get_db()

    stores = await db.fetch("""
        SELECT id, status, store_name, store_phone
        FROM store_orders
        WHERE final_order_id = $1
    """, final_order_id)

    if not stores:
        return None, False

    statuses = [(s["status"] or "").upper() for s in stores]
    store_count = len(stores)

    rejected_count = sum(1 for s in statuses if s == "REJECTED")
    no_show_count = sum(1 for s in statuses if s == "NO_SHOW")
    completed_count = sum(1 for s in statuses if s == "COMPLETED")
    ready_count = sum(1 for s in statuses if s == "READY")
    accepted_count = sum(1 for s in statuses if s == "ACCEPTED")
    pending_count = sum(1 for s in statuses if s == "PENDING")
    cancelled_count = sum(1 for s in statuses if s == "CANCELLED")
    # NO_SHOW is terminal for that store (like reject) for aggregation
    inactive = rejected_count + cancelled_count + no_show_count
    active_count = store_count - inactive

    notify_customer = False

    if cancelled_count == store_count:
        final_status = "CANCELLED"
        notify_customer = True
    elif no_show_count == store_count:
        final_status = "NO_SHOW"
        notify_customer = True
    elif (rejected_count + no_show_count) == store_count and store_count > 0:
        final_status = "REJECTED" if rejected_count == store_count else "NO_SHOW"
        notify_customer = True
    elif rejected_count == store_count:
        final_status = "REJECTED"
        notify_customer = True
    elif active_count > 0 and completed_count == active_count:
        final_status = "COMPLETED"
        notify_customer = True
    elif active_count > 0 and (ready_count + completed_count) == active_count:
        final_status = "READY"
        notify_customer = True
    elif ready_count > 0 or completed_count > 0:
        final_status = "PARTIAL_READY"
        notify_customer = True
    elif (rejected_count > 0 or no_show_count > 0) and (ready_count > 0 or accepted_count > 0):
        final_status = "PARTIAL"
        notify_customer = True
    elif accepted_count == active_count and (rejected_count > 0 or no_show_count > 0) and active_count > 0:
        final_status = "PARTIAL"
        notify_customer = True
    elif accepted_count > 0:
        final_status = "ACCEPTED"
    elif pending_count == store_count:
        final_status = "CONFIRMED"
    else:
        final_status = "PROCESSING"

    await set_final_order_status(final_order_id, final_status, db=db)
    return final_status, notify_customer


async def notify_customer_status(final_order_id: int, final_status: str, store_name: str = None, db=None):
    """Send customer WhatsApp update for aggregate status changes."""
    from app.services.whatsapp import send_message

    db = db or await get_db()
    customer = await db.fetchrow("""
        SELECT customer_phone FROM final_orders WHERE id = $1
    """, final_order_id)

    if not customer or not customer.get("customer_phone"):
        return

    phone = normalize_phone(customer["customer_phone"])
    status = (final_status or "").upper()
    track_url = await get_track_url(final_order_id, db=db)

    if status == "READY":
        await send_message(
            phone,
            f"🎉 Order #{final_order_id} is READY for pickup!\n\n"
            f"Track: {track_url}"
        )
    elif status == "COMPLETED":
        await send_message(
            phone,
            f"✅ Order #{final_order_id} is complete. Thank you for shopping with Ekkilo!"
        )
    elif status == "REJECTED":
        await send_message(
            phone,
            f"😔 Sorry, order #{final_order_id} cannot be fulfilled. Please try again later."
        )
    elif status == "NO_SHOW":
        # Strike-specific WhatsApp is sent by record_no_show; keep a short fallback.
        await send_message(
            phone,
            f"⚠️ Order #{final_order_id}: store marked this as a missed pickup (no-show)."
        )
    elif status == "CANCELLED":
        await send_message(
            phone,
            f"❌ Order #{final_order_id} has been cancelled."
        )
    elif status == "PARTIAL_READY":
        ready_stores = await db.fetch("""
            SELECT store_name FROM store_orders
            WHERE final_order_id = $1 AND status = 'READY'
            ORDER BY id
        """, final_order_id)
        pending_stores = await db.fetch("""
            SELECT store_name FROM store_orders
            WHERE final_order_id = $1 AND status IN ('PENDING', 'ACCEPTED', 'PROCESSING')
            ORDER BY id
        """, final_order_id)
        ready_list = ", ".join(s["store_name"] for s in ready_stores) or (
            store_name or "a store"
        )
        pending_list = ", ".join(s["store_name"] for s in pending_stores)
        msg = (
            f"📦 Order #{final_order_id} update\n\n"
            f"✅ Ready for pickup: {ready_list}"
        )
        if pending_list:
            msg += f"\n⏳ Still preparing: {pending_list}"
        msg += f"\n\nTrack: {track_url}"
        await send_message(phone, msg)
    elif status == "PARTIAL":
        rejected = store_name or "One store"
        await send_message(
            phone,
            f"⚠️ Order #{final_order_id} update\n\n"
            f"{rejected} cannot fulfill their part.\n"
            f"Other stores are still processing your order.\n\n"
            f"Track: {track_url}"
        )
    elif status == "ACCEPTED":
        who = store_name or "A store"
        await send_message(
            phone,
            f"👍 Order #{final_order_id}: {who} accepted your order.\n\n"
            f"Track: {track_url}"
        )


async def apply_store_action(order_id: int, action: str, sender_phone: str, db=None, eta_minutes: int = None):
    """
    Apply ACCEPT / READY / REJECT / COMPLETED / NO_SHOW from WhatsApp or web.
    Optional eta_minutes on ACCEPT (default DEFAULT_ETA_MINUTES).
    Returns dict: {ok, message, final_status, store_order_id, match_mode}
    """
    db = db or await get_db()
    await ensure_order_schema(db)

    action = action.upper()
    if action in ("NOSHOW", "NO-SHOW"):
        action = "NO_SHOW"
    action_to_status = {
        "ACCEPT": "ACCEPTED",
        "ACCEPTED": "ACCEPTED",
        "READY": "READY",
        "REJECT": "REJECTED",
        "REJECTED": "REJECTED",
        "COMPLETE": "COMPLETED",
        "COMPLETED": "COMPLETED",
        "NO_SHOW": "NO_SHOW",
        "NOSHOW": "NO_SHOW",
    }
    new_status = action_to_status.get(action)
    if not new_status:
        return {"ok": False, "message": f"Unknown store action: {action}"}

    current = await get_final_status(order_id, db=db)
    if not current:
        return {"ok": False, "message": f"❌ Order {order_id} not found"}

    current = current.upper()
    if current in ("CANCELLED", "COMPLETED", "REJECTED", "NO_SHOW"):
        return {
            "ok": False,
            "message": f"⚠️ Order {order_id} is already {current}",
        }

    store_row, match_mode = await find_store_order_for_phone(order_id, sender_phone, db=db)
    if not store_row:
        return {
            "ok": False,
            "message": (
                f"❌ No store order found for Order {order_id} on this WhatsApp number.\n"
                "Use the same phone as the store/owner number in Ekkilo, or update status in Store Portal."
            ),
            "match_mode": match_mode,
        }

    store_order_id = store_row["id"]
    store_name = store_row["store_name"]
    store_status = (store_row["status"] or "").upper()

    if new_status == "ACCEPTED":
        if store_status in ("ACCEPTED", "READY", "COMPLETED"):
            return {
                "ok": True,
                "already": True,
                "message": f"ℹ️ Order {order_id} already {store_status}",
                "final_status": current,
                "store_order_id": store_order_id,
                "match_mode": match_mode,
            }
        if store_status == "REJECTED":
            return {"ok": False, "message": f"❌ Order {order_id} was already rejected"}

    if new_status == "READY":
        if store_status == "REJECTED":
            return {"ok": False, "message": f"❌ Cannot mark READY — Order {order_id} was rejected"}
        if store_status in ("READY", "COMPLETED"):
            return {
                "ok": True,
                "already": True,
                "message": f"ℹ️ Order {order_id} already {store_status}",
                "final_status": current,
                "store_order_id": store_order_id,
                "match_mode": match_mode,
            }

    if new_status == "REJECTED":
        if store_status in ("READY", "COMPLETED", "NO_SHOW"):
            return {"ok": False, "message": f"❌ Cannot reject — Order {order_id} is already {store_status}"}
        if store_status == "REJECTED":
            return {
                "ok": True,
                "already": True,
                "message": f"ℹ️ Order {order_id} already rejected",
                "final_status": current,
                "store_order_id": store_order_id,
                "match_mode": match_mode,
            }

    if new_status == "NO_SHOW":
        if store_status == "NO_SHOW":
            return {
                "ok": True,
                "already": True,
                "message": f"ℹ️ Order {order_id} already marked NO_SHOW",
                "final_status": current,
                "store_order_id": store_order_id,
                "match_mode": match_mode,
            }
        if store_status != "READY":
            return {
                "ok": False,
                "message": (
                    f"❌ NO_SHOW only after READY (current: {store_status}). "
                    f"Mark READY first, then NOSHOW#{order_id} if customer never collected."
                ),
            }

    accept_eta = None
    if new_status == "ACCEPTED":
        accept_eta = int(eta_minutes) if eta_minutes and int(eta_minutes) > 0 else DEFAULT_ETA_MINUTES
        await set_store_order_status(store_order_id, new_status, db=db, eta_minutes=accept_eta)
    else:
        await set_store_order_status(store_order_id, new_status, db=db)

    final_status, notify = await update_final_order_status(order_id, db=db)

    # Always notify customer on ACCEPT (with ETA). Other statuses use aggregate notify flag.
    if new_status == "ACCEPTED":
        try:
            await notify_customer_accept(order_id, store_name, accept_eta, db=db)
        except Exception as e:
            print(f"⚠️ Customer accept notify failed: {e}")
    elif new_status == "NO_SHOW":
        try:
            from app.services.abuse import record_no_show
            from app.services.whatsapp import send_message

            customer = await db.fetchrow(
                "SELECT customer_phone FROM final_orders WHERE id = $1", order_id
            )
            cust_phone = normalize_phone(customer["customer_phone"]) if customer else None
            trust = await record_no_show(
                cust_phone, order_id, store_order_id=store_order_id, db=db
            ) if cust_phone else {}
            if trust.get("customer_message"):
                await send_message(cust_phone, trust["customer_message"])
            elif notify:
                await notify_customer_status(order_id, final_status, store_name=store_name, db=db)
        except Exception as e:
            print(f"⚠️ No-show handling failed: {e}")
    elif notify:
        try:
            await notify_customer_status(order_id, final_status, store_name=store_name, db=db)
        except Exception as e:
            print(f"⚠️ Customer notify failed: {e}")

    label = {
        "ACCEPTED": (
            f"✅ Order {order_id} accepted — ETA {format_eta_label(accept_eta)}. "
            f"Customer notified.\n"
            f"Tip: DELAY#{order_id} 15m busy — if packing runs late"
        ),
        "READY": f"📦 Order {order_id} marked READY",
        "REJECTED": f"❌ Order {order_id} rejected",
        "COMPLETED": f"✅ Order {order_id} completed",
        "NO_SHOW": f"👻 Order {order_id} marked NO_SHOW (customer missed pickup)",
    }.get(new_status, f"✅ Order {order_id} → {new_status}")

    if new_status == "NO_SHOW":
        # Append strike info if we just recorded it above
        try:
            from app.services.abuse import record_no_show
            # Already recorded; fetch summary for store reply
            row = await db.fetchrow(
                "SELECT strike_number, action FROM no_show_events WHERE final_order_id = $1",
                order_id,
            )
            if row:
                label += f"\nCustomer strike {row['strike_number']}/4 ({row['action']})"
        except Exception:
            pass

    if match_mode == "single_store_fallback":
        label += "\n(Note: matched via single-store fallback — update store phone if needed)"

    return {
        "ok": True,
        "message": label,
        "final_status": final_status,
        "store_order_id": store_order_id,
        "store_name": store_name,
        "match_mode": match_mode,
        "eta_minutes": accept_eta,
    }



async def cancel_final_order(order_id: int, db=None, notify_stores: bool = True):
    """Cancel order and optionally WhatsApp-notify each store."""
    from app.services.whatsapp import send_message

    db = db or await get_db()
    await ensure_order_schema(db)

    current = await get_final_status(order_id, db=db)
    if not current:
        return {"ok": False, "message": f"❌ Order {order_id} not found"}

    current = current.upper()
    if current in ("READY", "COMPLETED", "CANCELLED", "NO_SHOW"):
        return {
            "ok": False,
            "message": f"❌ Cannot cancel Order {order_id} (status: {current})",
        }
    # Unpaid / pending payment can always be cancelled by customer

    # Capture store phones before status update
    stores = await db.fetch("""
        SELECT id, store_name, store_phone, status
        FROM store_orders
        WHERE final_order_id = $1
    """, order_id)

    await set_final_order_status(order_id, "CANCELLED", db=db)
    await db.execute("""
        UPDATE store_orders
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE final_order_id = $1
          AND status NOT IN ('COMPLETED', 'REJECTED')
    """, order_id)
    await db.execute("""
        INSERT INTO store_order_events (store_order_id, status)
        SELECT id, 'CANCELLED'
        FROM store_orders
        WHERE final_order_id = $1
          AND status = 'CANCELLED'
    """, order_id)

    notified = []
    if notify_stores:
        for store in stores:
            phone = normalize_phone(store.get("store_phone"))
            if not phone:
                continue
            # Skip stores already finished / rejected
            if (store.get("status") or "").upper() in ("COMPLETED", "REJECTED"):
                continue
            msg = (
                f"❌ Order #{order_id} CANCELLED by customer\n\n"
                f"Store: {store.get('store_name')}\n"
                f"Please do not pack/prepare this order."
            )
            try:
                ok = await send_message(phone, msg)
                if ok:
                    notified.append(phone)
                    # Track outbound cancel notice
                    await db.execute("""
                        INSERT INTO whatsapp_messages (phone, message, status, final_order_id)
                        VALUES ($1, $2, 'SENT', $3)
                    """, phone, msg, order_id)
            except Exception as e:
                print(f"⚠️ Failed to notify store {phone} about cancel: {e}")

    return {
        "ok": True,
        "message": f"❌ Order {order_id} cancelled",
        "stores_notified": notified,
    }
