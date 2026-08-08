"""
Shared order status helpers for WhatsApp + web portals.
Ensures schema, updates store/final status, and notifies customers.
"""
from app.db.database import get_db
from app.utils.phone import normalize_phone, phone_tail


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


async def set_store_order_status(store_order_id: int, status: str, db=None):
    db = db or await get_db()
    status = status.upper()

    await db.execute("""
        UPDATE store_orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
    """, status, store_order_id)

    await db.execute("""
        INSERT INTO store_order_events (store_order_id, status)
        VALUES ($1, $2)
    """, store_order_id, status)


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
    completed_count = sum(1 for s in statuses if s == "COMPLETED")
    ready_count = sum(1 for s in statuses if s == "READY")
    accepted_count = sum(1 for s in statuses if s == "ACCEPTED")
    pending_count = sum(1 for s in statuses if s == "PENDING")
    cancelled_count = sum(1 for s in statuses if s == "CANCELLED")
    active_count = store_count - rejected_count - cancelled_count

    notify_customer = False

    if cancelled_count == store_count:
        final_status = "CANCELLED"
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
    elif rejected_count > 0 and (ready_count > 0 or accepted_count > 0):
        final_status = "PARTIAL"
        notify_customer = True
    elif accepted_count == active_count and rejected_count > 0 and active_count > 0:
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

    if status == "READY":
        await send_message(
            phone,
            f"🎉 Great news! Your order #{final_order_id} is READY for pickup!"
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
    elif status == "CANCELLED":
        await send_message(
            phone,
            f"❌ Order #{final_order_id} has been cancelled."
        )
    elif status in ("PARTIAL", "PARTIAL_READY"):
        ready_stores = await db.fetch("""
            SELECT store_name FROM store_orders
            WHERE final_order_id = $1 AND status IN ('READY', 'ACCEPTED', 'COMPLETED')
        """, final_order_id)
        store_list = ", ".join(s["store_name"] for s in ready_stores) or "remaining stores"
        note = f"\n{store_name} update." if store_name else ""
        await send_message(
            phone,
            f"📦 Order #{final_order_id} update:{note}\nProceeding with: {store_list}"
        )


async def apply_store_action(order_id: int, action: str, sender_phone: str, db=None):
    """
    Apply ACCEPT / READY / REJECT / COMPLETED from WhatsApp or web.
    Returns dict: {ok, message, final_status, store_order_id, match_mode}
    """
    db = db or await get_db()
    await ensure_order_schema(db)

    action = action.upper()
    action_to_status = {
        "ACCEPT": "ACCEPTED",
        "ACCEPTED": "ACCEPTED",
        "READY": "READY",
        "REJECT": "REJECTED",
        "REJECTED": "REJECTED",
        "COMPLETE": "COMPLETED",
        "COMPLETED": "COMPLETED",
    }
    new_status = action_to_status.get(action)
    if not new_status:
        return {"ok": False, "message": f"Unknown store action: {action}"}

    current = await get_final_status(order_id, db=db)
    if not current:
        return {"ok": False, "message": f"❌ Order {order_id} not found"}

    current = current.upper()
    if current in ("CANCELLED", "COMPLETED", "REJECTED"):
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
        if store_status in ("READY", "COMPLETED"):
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

    await set_store_order_status(store_order_id, new_status, db=db)
    final_status, notify = await update_final_order_status(order_id, db=db)

    if notify:
        try:
            await notify_customer_status(order_id, final_status, store_name=store_name, db=db)
        except Exception as e:
            print(f"⚠️ Customer notify failed: {e}")

    label = {
        "ACCEPTED": f"✅ Order {order_id} accepted",
        "READY": f"📦 Order {order_id} marked READY",
        "REJECTED": f"❌ Order {order_id} rejected",
        "COMPLETED": f"✅ Order {order_id} completed",
    }.get(new_status, f"✅ Order {order_id} → {new_status}")

    if match_mode == "single_store_fallback":
        label += "\n(Note: matched via single-store fallback — update store phone if needed)"

    return {
        "ok": True,
        "message": label,
        "final_status": final_status,
        "store_order_id": store_order_id,
        "store_name": store_name,
        "match_mode": match_mode,
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
    if current in ("READY", "COMPLETED", "CANCELLED"):
        return {
            "ok": False,
            "message": f"❌ Cannot cancel Order {order_id} (status: {current})",
        }

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
