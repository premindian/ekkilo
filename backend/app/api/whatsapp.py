import re
from fastapi import APIRouter, Request

from app.services.whatsapp import send_message
from app.db.database import get_db
from app.core.ws_manager import manager

router = APIRouter()

VERIFY_TOKEN = "Bookofkirana2026"

# Final-order statuses where store can still act
STORE_OPEN_STATUSES = {
    "CREATED",
    "CONFIRMED",
    "ACCEPTED",
    "PROCESSING",
    "PARTIAL",
    "PARTIAL_READY",
}


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", str(phone or ""))


def _phone_tail(phone: str, n: int = 10) -> str:
    d = _digits(phone)
    return d[-n:] if len(d) >= n else d


def _extract_text(msg: dict) -> str:
    """Pull body text from WhatsApp message payloads (text / button)."""
    if not msg:
        return ""
    if msg.get("type") == "text":
        return (msg.get("text") or {}).get("body") or ""
    if msg.get("type") == "button":
        return (msg.get("button") or {}).get("text") or ""
    if msg.get("type") == "interactive":
        interactive = msg.get("interactive") or {}
        if interactive.get("type") == "button_reply":
            return (interactive.get("button_reply") or {}).get("title") or ""
        if interactive.get("type") == "list_reply":
            return (interactive.get("list_reply") or {}).get("title") or ""
    # Fallback for plain payloads
    return (msg.get("text") or {}).get("body") or ""


def _parse_command(text: str):
    """
    Parse ACCEPT#3 / ready #3 / STATUS#12 etc.
    Returns (ACTION, order_id) or (None, None).
    """
    if not text:
        return None, None
    cleaned = " ".join(text.strip().split())
    match = re.match(
        r"^(confirm|cancel|status|accept|ready|reject)\s*#\s*(\d+)\b",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not match:
        return None, None
    return match.group(1).upper(), int(match.group(2))


# -----------------------------------------
# 🔐 VERIFY
# -----------------------------------------
@router.get("/webhook")
async def verify(request: Request):
    params = request.query_params

    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return int(challenge)

    return {"status": "error"}


# -----------------------------------------
# 📩 RECEIVE MESSAGE + STATUS TRACKING
# -----------------------------------------
@router.post("/webhook")
async def receive(req: Request):
    body = await req.json()

    try:
        db = await get_db()

        entry = body.get("entry", [])
        changes = entry[0].get("changes", []) if entry else []
        value = changes[0].get("value", {}) if changes else {}

        # =========================================================
        # 1. DELIVERY STATUS TRACKING + LIVE UPDATE
        # =========================================================
        statuses = value.get("statuses", [])

        if statuses:
            for s in statuses:
                wa_id = s.get("id")
                status = s.get("status")

                print(f"📦 Status update → {status} ({wa_id})")

                if wa_id:
                    await db.execute("""
                        UPDATE whatsapp_messages
                        SET status = $1
                        WHERE whatsapp_message_id = $2
                    """, status.upper(), wa_id)

                    await manager.broadcast(0, {
                        "type": "message_update",
                        "wa_id": wa_id,
                        "status": status.upper()
                    })

            return {"status": "updated"}

        # =========================================================
        # 2. NORMAL MESSAGE FLOW
        # =========================================================
        if "messages" not in value:
            return {"status": "no message"}

        msg = value["messages"][0]
        phone = msg.get("from") or ""
        text = _extract_text(msg).strip()
        phone_tail = _phone_tail(phone)

        print("📩 Incoming:", repr(text), phone)

        if not text:
            return {"status": "ignored_non_text"}

        async def get_final_status(order_id):
            row = await db.fetchrow("""
                SELECT status FROM final_orders
                WHERE id = $1
            """, order_id)
            return row["status"] if row else None

        async def find_store_order(order_id, sender_phone):
            """Match store by last-10 digits of store_orders.phone or stores.phone."""
            tail = _phone_tail(sender_phone)
            if not tail:
                return None
            return await db.fetchrow("""
                SELECT so.id, so.store_name, so.status, so.store_phone
                FROM store_orders so
                LEFT JOIN stores s ON s.id = so.store_id
                WHERE so.final_order_id = $1
                  AND (
                    RIGHT(REGEXP_REPLACE(COALESCE(so.store_phone, ''), '[^0-9]', '', 'g'), 10) = $2
                    OR RIGHT(REGEXP_REPLACE(COALESCE(s.phone, ''), '[^0-9]', '', 'g'), 10) = $2
                  )
                LIMIT 1
            """, order_id, tail)

        # =========================================================
        # WHATSAPP COMMANDS
        # Customer: CANCEL#{id} / STATUS#{id}  (+ CONFIRM#{id} legacy)
        # Store: ACCEPT#{id} / READY#{id} / REJECT#{id}
        # =========================================================
        action, order_id = _parse_command(text)

        if action and order_id is not None:
            current_status = await get_final_status(order_id)

            if not current_status:
                await send_message(phone, f"❌ Order {order_id} not found")
                return {"status": "not_found"}

            # -----------------------------
            # CUSTOMER ACTIONS
            # -----------------------------
            if action == "CONFIRM":
                if current_status != "CREATED":
                    await send_message(phone, f"⚠️ Order {order_id} already processed ({current_status})")
                    return {"status": "ignored"}

                await db.execute("""
                    UPDATE final_orders
                    SET status = 'CONFIRMED', updated_at = NOW()
                    WHERE id = $1
                """, order_id)

                await db.execute("""
                    INSERT INTO final_order_events (final_order_id, status)
                    VALUES ($1, 'CONFIRMED')
                """, order_id)

                await send_message(phone, f"✅ Order {order_id} confirmed")

                pending_messages = await db.fetch("""
                    SELECT id, phone, message
                    FROM whatsapp_messages
                    WHERE phone IN (
                        SELECT store_phone FROM store_orders WHERE final_order_id = $1
                    )
                    AND status = 'PENDING'
                    ORDER BY id
                """, order_id)

                for pending in pending_messages:
                    await send_message(pending["phone"], pending["message"], pending["id"])

                return {"status": "confirmed"}

            if action == "CANCEL":
                if current_status in ["READY", "COMPLETED", "CANCELLED"]:
                    await send_message(
                        phone,
                        f"❌ Cannot cancel Order {order_id} (status: {current_status})"
                    )
                    return {"status": "blocked"}

                await db.execute("""
                    UPDATE final_orders
                    SET status = 'CANCELLED', updated_at = NOW()
                    WHERE id = $1
                """, order_id)

                await db.execute("""
                    INSERT INTO final_order_events (final_order_id, status)
                    VALUES ($1, 'CANCELLED')
                """, order_id)

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
                """, order_id)

                await send_message(phone, f"❌ Order {order_id} cancelled")
                return {"status": "cancelled"}

            if action == "STATUS":
                store_rows = await db.fetch("""
                    SELECT store_name, status
                    FROM store_orders
                    WHERE final_order_id = $1
                    ORDER BY id
                """, order_id)
                if store_rows:
                    lines = "\n".join(
                        f"• {r['store_name']}: {r['status']}" for r in store_rows
                    )
                    await send_message(
                        phone,
                        f"📦 Order {order_id}: {current_status}\n\n{lines}"
                    )
                else:
                    await send_message(phone, f"📦 Order {order_id}: {current_status}")
                return {"status": "status_sent"}

            # -----------------------------
            # STORE ACTIONS
            # -----------------------------
            if action in ("ACCEPT", "READY", "REJECT"):
                if current_status in ("CANCELLED", "COMPLETED", "REJECTED"):
                    await send_message(
                        phone,
                        f"⚠️ Order {order_id} is already {current_status}"
                    )
                    return {"status": "blocked"}

                if current_status not in STORE_OPEN_STATUSES:
                    await send_message(
                        phone,
                        f"⏳ Order {order_id} is not open for store updates "
                        f"(status: {current_status})"
                    )
                    return {"status": "blocked"}

                store_row = await find_store_order(order_id, phone)

                if not store_row:
                    await send_message(
                        phone,
                        f"❌ No store order found for Order {order_id} on this number.\n"
                        f"Make sure this WhatsApp number matches the store phone on file."
                    )
                    return {"status": "store_not_found"}

                store_order_id = store_row["id"]
                store_name = store_row["store_name"]
                store_status = (store_row["status"] or "").upper()

                if action == "ACCEPT":
                    if store_status in ("ACCEPTED", "READY", "COMPLETED"):
                        await send_message(
                            phone,
                            f"ℹ️ Order {order_id} already {store_status}"
                        )
                        return {"status": "already"}

                    if store_status == "REJECTED":
                        await send_message(
                            phone,
                            f"❌ Order {order_id} was already rejected"
                        )
                        return {"status": "blocked"}

                    await db.execute("""
                        UPDATE store_orders
                        SET status = 'ACCEPTED', updated_at = NOW()
                        WHERE id = $1
                    """, store_order_id)

                    await db.execute("""
                        INSERT INTO store_order_events (store_order_id, status)
                        VALUES ($1, 'ACCEPTED')
                    """, store_order_id)

                    await send_message(phone, f"✅ Order {order_id} accepted")

                    from app.services.order_service import update_final_order_status
                    await update_final_order_status(order_id)
                    return {"status": "accepted"}

                if action == "READY":
                    if store_status == "REJECTED":
                        await send_message(
                            phone,
                            f"❌ Cannot mark READY — Order {order_id} was rejected"
                        )
                        return {"status": "blocked"}

                    if store_status in ("READY", "COMPLETED"):
                        await send_message(
                            phone,
                            f"ℹ️ Order {order_id} already {store_status}"
                        )
                        return {"status": "already"}

                    await db.execute("""
                        UPDATE store_orders
                        SET status = 'READY', updated_at = NOW()
                        WHERE id = $1
                    """, store_order_id)

                    await db.execute("""
                        INSERT INTO store_order_events (store_order_id, status)
                        VALUES ($1, 'READY')
                    """, store_order_id)

                    await send_message(phone, f"📦 Order {order_id} marked READY")

                    from app.services.order_service import update_final_order_status
                    final_status, notify_customer = await update_final_order_status(order_id)

                    if notify_customer:
                        customer = await db.fetchrow("""
                            SELECT customer_phone FROM final_orders WHERE id = $1
                        """, order_id)

                        if customer and customer.get("customer_phone"):
                            if final_status == "READY":
                                await send_message(
                                    customer["customer_phone"],
                                    f"🎉 Great news! Your order #{order_id} is READY for pickup at all stores!"
                                )
                            elif final_status in ("PARTIAL", "PARTIAL_READY"):
                                ready_stores = await db.fetch("""
                                    SELECT store_name FROM store_orders
                                    WHERE final_order_id = $1 AND status = 'READY'
                                """, order_id)
                                store_list = ", ".join(s["store_name"] for s in ready_stores)
                                await send_message(
                                    customer["customer_phone"],
                                    f"📦 Order #{order_id} update:\n✅ Ready at: {store_list}\n\nCheck remaining stores for updates."
                                )

                    return {"status": "ready"}

                if action == "REJECT":
                    if store_status in ("READY", "COMPLETED"):
                        await send_message(
                            phone,
                            f"❌ Cannot reject — Order {order_id} is already {store_status}"
                        )
                        return {"status": "blocked"}

                    if store_status == "REJECTED":
                        await send_message(phone, f"ℹ️ Order {order_id} already rejected")
                        return {"status": "already"}

                    await db.execute("""
                        UPDATE store_orders
                        SET status = 'REJECTED', updated_at = NOW()
                        WHERE id = $1
                    """, store_order_id)

                    await db.execute("""
                        INSERT INTO store_order_events (store_order_id, status)
                        VALUES ($1, 'REJECTED')
                    """, store_order_id)

                    await send_message(phone, f"❌ Order {order_id} rejected")

                    from app.services.order_service import update_final_order_status
                    final_status, notify_customer = await update_final_order_status(order_id)

                    if notify_customer:
                        customer = await db.fetchrow("""
                            SELECT customer_phone FROM final_orders WHERE id = $1
                        """, order_id)

                        if customer and customer.get("customer_phone"):
                            if final_status == "REJECTED":
                                await send_message(
                                    customer["customer_phone"],
                                    f"😔 Sorry, order #{order_id} cannot be fulfilled. All stores are unavailable. Please try again later."
                                )
                            elif final_status in ("PARTIAL", "PARTIAL_READY"):
                                await send_message(
                                    customer["customer_phone"],
                                    f"⚠️ Order #{order_id} update:\n{store_name} cannot fulfill their part.\nOther stores are still processing your order."
                                )

                    return {"status": "rejected"}

            # Unknown ACTION#id
            await send_message(
                phone,
                "Unknown command.\n"
                "Customer: STATUS#id | CANCEL#id\n"
                "Store: ACCEPT#id | READY#id | REJECT#id"
            )
            return {"status": "unknown_command"}

        # =========================================================
        # Free-text → redirect to portal (order creation disabled)
        # =========================================================
        await send_message(
            phone,
            "🛒 Please place orders on the Ekkilo app/website:\n"
            "https://ekkilo.onrender.com\n\n"
            "WhatsApp is for order updates only.\n"
            "Customer: STATUS#orderid  |  CANCEL#orderid\n"
            "Store: ACCEPT#orderid  |  READY#orderid  |  REJECT#orderid"
        )
        return {"status": "redirect_to_portal"}

    except Exception as e:
        print("❌ WhatsApp webhook error:", str(e))
        import traceback
        traceback.print_exc()

    return {"status": "ok"}
