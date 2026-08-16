"""Payment verify + activate paid orders (Razorpay UPI)."""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.db.database import get_db
from app.api.auth import get_current_user
from app.services.payments import (
    ensure_payment_schema,
    payments_enabled,
    verify_payment_signature,
)
from app.utils.phone import normalize_phone, phone_tail

router = APIRouter(tags=["payments"])


@router.get("/payments/config")
async def payment_config():
    """Public: whether UPI/Razorpay is configured on this environment."""
    return {
        "upi_enabled": payments_enabled(),
        "methods": ["upi", "pay_at_store"] if payments_enabled() else ["pay_at_store"],
    }


async def queue_order_notifications(final_order_id: int, background_tasks: BackgroundTasks, db=None):
    """Send store + customer WhatsApp after payment (or legacy confirm)."""
    from app.services.whatsapp import send_message
    from app.services.order_status import get_track_url
    from app.core.ws_manager import manager
    from app.services.delivery import ensure_delivery_schema

    db = db or await get_db()
    await ensure_delivery_schema(db)
    order = await db.fetchrow("""
        SELECT id, customer_phone, track_token, status, payment_status, payment_method
        FROM final_orders WHERE id = $1
    """, final_order_id)
    if not order:
        return

    pay_at_store = (
        (order.get("payment_method") or "").lower() == "pay_at_store"
        or (order.get("payment_status") or "").upper() == "PAY_AT_STORE"
    )
    pay_label = "PAY AT STORE" if pay_at_store else "PAID ONLINE"

    stores = await db.fetch("""
        SELECT id, store_name, store_phone, status,
               total_amount, created_at, updated_at,
               fulfillment, delivery_fee, delivery_note
        FROM store_orders WHERE final_order_id = $1
        ORDER BY id
    """, final_order_id)

    # Flip held store lines to PENDING
    await db.execute("""
        UPDATE store_orders
        SET status = 'PENDING', updated_at = NOW()
        WHERE final_order_id = $1 AND status = 'AWAITING_PAYMENT'
    """, final_order_id)

    for so in stores:
        items = await db.fetch("""
            SELECT product_name, quantity FROM order_items WHERE store_order_id = $1
        """, so["id"])
        item_text = "\n".join(
            f"{i['product_name']} x{i['quantity'] or 1}" for i in items
        )
        fulfillment = (so.get("fulfillment") or "pickup").lower()
        try:
            dfee = float(so.get("delivery_fee") or 0)
        except (TypeError, ValueError):
            dfee = 0.0
        if fulfillment == "delivery":
            if dfee > 0:
                fulfill_line = f"🚚 STORE DELIVERY · fee ₹{dfee:.0f} (you handle drop)"
            else:
                fulfill_line = "🚚 STORE DELIVERY · FREE (you handle drop)"
            if so.get("delivery_note"):
                fulfill_line += f"\nNote: {so['delivery_note']}"
        else:
            fulfill_line = "🏪 PICKUP at store"

        message = f"""🆕 New Order ({pay_label})

Order ID: {final_order_id}

{fulfill_line}

{item_text}

{"Customer will pay at pickup." if pay_at_store else "Already paid online via Ekkilo."}

Reply:
ACCEPT#{final_order_id} 2h - Accept (ETA 2 hours)
ACCEPT#{final_order_id} 1h - Accept (ETA 1 hour)
DELAY#{final_order_id} 30m busy - Running late
READY#{final_order_id} - Mark ready
REJECT#{final_order_id} - Cannot fulfill
NOSHOW#{final_order_id} - Customer missed pickup
"""
        store_phone = normalize_phone(so["store_phone"])
        row = await db.fetchrow("""
            INSERT INTO whatsapp_messages (phone, message, status, final_order_id)
            VALUES ($1, $2, 'PENDING', $3)
            RETURNING id
        """, store_phone, message, final_order_id)
        background_tasks.add_task(send_message, store_phone, message, row["id"])
        try:
            await manager.broadcast(0, {
                "type": "new_order",
                "final_order_id": final_order_id,
                "store": so["store_name"],
            })
        except Exception:
            pass

    phone = normalize_phone(order["customer_phone"])
    track_url = await get_track_url(final_order_id, db=db)
    summary = []
    for so in stores:
        items = await db.fetch(
            "SELECT product_name FROM order_items WHERE store_order_id = $1", so["id"]
        )
        names = ", ".join(i["product_name"] or "" for i in items)
        summary.append(f"{so['store_name']}: {names}")
    customer_message = f"""🧾 Order Confirmed ({'Pay at store' if pay_at_store else 'Paid'})

Order ID: {final_order_id}

{chr(10).join(summary)}

{"Pay when you pick up." if pay_at_store else "Payment received. Show this when you pick up."}

Track: {track_url}

Commands:
STATUS#{final_order_id}
CANCEL#{final_order_id}

We will notify you when ready 🚀
"""
    row = await db.fetchrow("""
        INSERT INTO whatsapp_messages (phone, message, status, final_order_id)
        VALUES ($1, $2, 'PENDING', $3)
        RETURNING id
    """, phone, customer_message, final_order_id)
    background_tasks.add_task(send_message, phone, customer_message, row["id"])


async def _activate_paid_order(
    db,
    order: dict,
    rz_payment: str,
    rz_order: str,
    background_tasks: BackgroundTasks,
) -> dict:
    """Idempotent: mark PAID, confirm, notify stores/customer once."""
    from app.services.order_status import set_final_order_status

    final_order_id = order["id"]
    if (order.get("payment_status") or "").upper() == "PAID":
        return {
            "status": "already_paid",
            "final_order_id": final_order_id,
            "track_token": order.get("track_token"),
        }

    await db.execute(
        """
        UPDATE final_orders
        SET payment_status = 'PAID',
            payment_method = COALESCE(payment_method, 'upi'),
            payment_id = $2,
            razorpay_order_id = COALESCE(razorpay_order_id, $3),
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND UPPER(COALESCE(payment_status, '')) <> 'PAID'
        """,
        final_order_id,
        rz_payment,
        rz_order,
    )

    # Re-check in case of race
    fresh = await db.fetchrow("SELECT * FROM final_orders WHERE id = $1", final_order_id)
    if (fresh.get("payment_status") or "").upper() != "PAID":
        # Lost race to another writer that didn't set PAID — force once
        await db.execute(
            """
            UPDATE final_orders
            SET payment_status = 'PAID',
                payment_method = COALESCE(payment_method, 'upi'),
                payment_id = COALESCE(payment_id, $2),
                razorpay_order_id = COALESCE(razorpay_order_id, $3),
                paid_at = COALESCE(paid_at, NOW()),
                updated_at = NOW()
            WHERE id = $1
            """,
            final_order_id,
            rz_payment,
            rz_order,
        )
        fresh = await db.fetchrow("SELECT * FROM final_orders WHERE id = $1", final_order_id)

    # Only notify when store lines were still held for payment (idempotent vs webhook+verify)
    awaiting = await db.fetchval(
        """
        SELECT COUNT(*) FROM store_orders
        WHERE final_order_id = $1 AND status = 'AWAITING_PAYMENT'
        """,
        final_order_id,
    )
    await set_final_order_status(final_order_id, "CONFIRMED", db=db)
    if int(awaiting or 0) > 0:
        await queue_order_notifications(final_order_id, background_tasks, db=db)

    return {
        "status": "paid",
        "final_order_id": final_order_id,
        "track_token": (fresh or order).get("track_token"),
    }


async def _mark_payment_failed(
    db,
    order: dict,
    reason: str = None,
    rz_payment: str = None,
) -> dict:
    """
    Mark UPI checkout as failed. Never downgrade PAID.
    Cancels held store lines so they don't look like live orders.
    """
    final_order_id = order["id"]
    pay = (order.get("payment_status") or "").upper()
    if pay == "PAID":
        return {
            "status": "already_paid",
            "final_order_id": final_order_id,
            "track_token": order.get("track_token"),
        }
    if pay == "FAILED":
        return {
            "status": "already_failed",
            "final_order_id": final_order_id,
            "track_token": order.get("track_token"),
        }

    await db.execute(
        """
        UPDATE final_orders
        SET payment_status = 'FAILED',
            status = CASE
              WHEN UPPER(COALESCE(status, '')) IN ('PENDING_PAYMENT', 'CREATED', 'PENDING')
              THEN 'PAYMENT_FAILED'
              ELSE status
            END,
            payment_id = COALESCE(payment_id, $2),
            updated_at = NOW()
        WHERE id = $1
          AND UPPER(COALESCE(payment_status, '')) <> 'PAID'
        """,
        final_order_id,
        rz_payment,
    )
    await db.execute(
        """
        UPDATE store_orders
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE final_order_id = $1 AND status = 'AWAITING_PAYMENT'
        """,
        final_order_id,
    )
    fresh = await db.fetchrow(
        "SELECT payment_status, status, track_token FROM final_orders WHERE id = $1",
        final_order_id,
    )
    print(f"💔 Payment FAILED for order #{final_order_id}: {reason or 'n/a'}")
    return {
        "status": "failed",
        "final_order_id": final_order_id,
        "payment_status": (fresh or {}).get("payment_status") or "FAILED",
        "order_status": (fresh or {}).get("status"),
        "track_token": (fresh or order).get("track_token"),
        "reason": reason,
    }


def _find_order_from_rz_entity(entity: dict):
    notes = entity.get("notes") or {}
    final_order_id = notes.get("final_order_id")
    rz_order = entity.get("order_id") or entity.get("id")
    rz_payment = entity.get("id")
    return final_order_id, rz_order, rz_payment


@router.post("/payments/verify")
async def verify_payment(data: dict, background_tasks: BackgroundTasks, token: str = None):
    """
    Body: final_order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature
    token via query or body.
    """
    if not payments_enabled():
        raise HTTPException(status_code=400, detail="Payments are not configured")

    session_token = token or (data or {}).get("token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Login required")

    db = await get_db()
    await ensure_payment_schema(db)
    user = await get_current_user(session_token, db)

    final_order_id = (data or {}).get("final_order_id")
    rz_order = (data or {}).get("razorpay_order_id")
    rz_payment = (data or {}).get("razorpay_payment_id")
    rz_sig = (data or {}).get("razorpay_signature")
    if not all([final_order_id, rz_order, rz_payment, rz_sig]):
        raise HTTPException(status_code=400, detail="Missing payment fields")

    try:
        final_order_id = int(final_order_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid order id")

    order = await db.fetchrow("SELECT * FROM final_orders WHERE id = $1", final_order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if phone_tail(order["customer_phone"]) != phone_tail(user["phone"]):
        raise HTTPException(status_code=403, detail="Not your order")

    if (order.get("payment_status") or "").upper() == "PAID":
        return {
            "status": "already_paid",
            "final_order_id": final_order_id,
            "track_token": order.get("track_token"),
        }

    if order.get("razorpay_order_id") and order["razorpay_order_id"] != rz_order:
        raise HTTPException(status_code=400, detail="Order id mismatch")

    if not verify_payment_signature(rz_order, rz_payment, rz_sig):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    return await _activate_paid_order(db, dict(order), rz_payment, rz_order, background_tasks)


@router.post("/payments/failed")
async def report_payment_failed(data: dict, token: str = None):
    """
    Client reports Razorpay payment.failed (test: failure@razorpay).
    Body: final_order_id, reason?, razorpay_payment_id?
    """
    session_token = token or (data or {}).get("token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Login required")

    db = await get_db()
    await ensure_payment_schema(db)
    user = await get_current_user(session_token, db)

    final_order_id = (data or {}).get("final_order_id")
    try:
        final_order_id = int(final_order_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid order id")

    order = await db.fetchrow("SELECT * FROM final_orders WHERE id = $1", final_order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if phone_tail(order["customer_phone"]) != phone_tail(user["phone"]):
        raise HTTPException(status_code=403, detail="Not your order")

    return await _mark_payment_failed(
        db,
        dict(order),
        reason=(data or {}).get("reason") or "client_payment_failed",
        rz_payment=(data or {}).get("razorpay_payment_id"),
    )


@router.post("/payments/razorpay-webhook")
async def razorpay_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Razorpay Dashboard → Webhooks
    URL: https://YOUR_HOST/api/payments/razorpay-webhook
    Events: payment.captured, payment.failed (optional: order.paid)
    Secret: RAZORPAY_WEBHOOK_SECRET
    """
    import os
    import hmac
    import hashlib
    import json

    raw = await request.body()
    secret = (os.getenv("RAZORPAY_WEBHOOK_SECRET") or "").strip()
    if secret:
        got = (request.headers.get("X-Razorpay-Signature") or "").strip()
        expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not got or not hmac.compare_digest(expected, got):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = (payload.get("event") or "").strip()
    db = await get_db()
    await ensure_payment_schema(db)

    if event in ("payment.captured", "order.paid"):
        entity = ((payload.get("payload") or {}).get("payment") or {}).get("entity") or {}
        if event == "order.paid":
            entity = ((payload.get("payload") or {}).get("order") or {}).get("entity") or entity
        final_order_id, rz_order, rz_payment = _find_order_from_rz_entity(entity)
        if event == "payment.captured":
            rz_payment = entity.get("id")
            rz_order = entity.get("order_id")

        order = None
        if final_order_id:
            try:
                order = await db.fetchrow(
                    "SELECT * FROM final_orders WHERE id = $1", int(final_order_id)
                )
            except (TypeError, ValueError):
                order = None
        if not order and rz_order:
            order = await db.fetchrow(
                "SELECT * FROM final_orders WHERE razorpay_order_id = $1", rz_order
            )
        if not order:
            return {"status": "order_not_found", "razorpay_order_id": rz_order}

        result = await _activate_paid_order(
            db,
            dict(order),
            str(rz_payment or order.get("payment_id") or ""),
            str(rz_order or order.get("razorpay_order_id") or ""),
            background_tasks,
        )
        return {"status": result.get("status"), "final_order_id": order["id"]}

    if event == "payment.failed":
        entity = ((payload.get("payload") or {}).get("payment") or {}).get("entity") or {}
        final_order_id, rz_order, rz_payment = _find_order_from_rz_entity(entity)
        rz_payment = entity.get("id")
        rz_order = entity.get("order_id")
        err = (entity.get("error_description") or entity.get("error_reason") or "payment.failed")

        order = None
        if final_order_id:
            try:
                order = await db.fetchrow(
                    "SELECT * FROM final_orders WHERE id = $1", int(final_order_id)
                )
            except (TypeError, ValueError):
                order = None
        if not order and rz_order:
            order = await db.fetchrow(
                "SELECT * FROM final_orders WHERE razorpay_order_id = $1", rz_order
            )
        if not order:
            return {"status": "order_not_found", "razorpay_order_id": rz_order}

        result = await _mark_payment_failed(
            db, dict(order), reason=str(err), rz_payment=str(rz_payment or "")
        )
        return {"status": result.get("status"), "final_order_id": order["id"]}

    return {"status": "ignored", "event": event}


@router.get("/payments/status/{final_order_id}")
async def payment_status(final_order_id: int, token: str):
    """Customer poll: did UPI land? Used when Razorpay UI errors after a successful pay."""
    if not token:
        raise HTTPException(status_code=401, detail="Login required")
    db = await get_db()
    await ensure_payment_schema(db)
    user = await get_current_user(token, db)
    order = await db.fetchrow(
        """
        SELECT id, payment_status, payment_method, track_token, status, customer_phone
        FROM final_orders WHERE id = $1
        """,
        final_order_id,
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if phone_tail(order["customer_phone"]) != phone_tail(user["phone"]):
        raise HTTPException(status_code=403, detail="Not your order")
    pay = (order.get("payment_status") or "UNPAID").upper()
    return {
        "final_order_id": order["id"],
        "payment_status": pay,
        "payment_method": order.get("payment_method"),
        "status": order.get("status"),
        "track_token": order.get("track_token"),
        "paid": pay == "PAID",
        "failed": pay == "FAILED",
    }
