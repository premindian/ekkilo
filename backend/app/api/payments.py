"""Payment verify + activate paid orders (Razorpay UPI)."""
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.db.database import get_db
from app.api.auth import get_current_user
from app.services.payments import (
    ensure_payment_schema,
    payments_enabled,
    verify_payment_signature,
)
from app.utils.phone import normalize_phone, phone_tail

router = APIRouter(tags=["payments"])


async def queue_order_notifications(final_order_id: int, background_tasks: BackgroundTasks, db=None):
    """Send store + customer WhatsApp after payment (or legacy confirm)."""
    from app.services.whatsapp import send_message
    from app.services.order_status import get_track_url
    from app.core.ws_manager import manager

    db = db or await get_db()
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
        SELECT id, store_name, store_phone, status
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
        message = f"""🆕 New Order ({pay_label})

Order ID: {final_order_id}

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

    from app.services.order_status import set_final_order_status

    await db.execute("""
        UPDATE final_orders
        SET payment_status = 'PAID',
            payment_method = COALESCE(payment_method, 'upi'),
            payment_id = $2,
            razorpay_order_id = COALESCE(razorpay_order_id, $3),
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
    """, final_order_id, rz_payment, rz_order)

    await set_final_order_status(final_order_id, "CONFIRMED", db=db)
    await queue_order_notifications(final_order_id, background_tasks, db=db)

    return {
        "status": "paid",
        "final_order_id": final_order_id,
        "track_token": order.get("track_token"),
    }
