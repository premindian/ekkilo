import re
from fastapi import APIRouter, Request, Response

from app.services.whatsapp import send_message
from app.db.database import get_db
from app.core.ws_manager import manager
from app.services.order_status import (
    ensure_order_schema,
    get_final_status,
    apply_store_action,
    cancel_final_order,
    set_final_order_status,
)
from app.utils.phone import normalize_phone

router = APIRouter()

VERIFY_TOKEN = "Bookofkirana2026"


def _extract_text(msg: dict) -> str:
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
    return (msg.get("text") or {}).get("body") or ""


def _parse_command(text: str):
    if not text:
        return None, None
    # Normalize fullwidth hash and whitespace
    cleaned = (
        text.replace("＃", "#")
        .replace("\u200b", "")
        .replace("\xa0", " ")
    )
    cleaned = " ".join(cleaned.strip().split())
    match = re.match(
        r"^(confirm|cancel|status|accept|ready|reject|complete|completed)\s*#\s*(\d+)\b",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not match:
        return None, None
    return match.group(1).upper(), int(match.group(2))


async def _safe_reply(phone: str, message: str):
    try:
        ok = await send_message(phone, message)
        if not ok:
            print(f"⚠️ Failed to reply to {phone}: {message[:80]}")
        return ok
    except Exception as e:
        print(f"⚠️ Reply exception to {phone}: {e}")
        return False


# -----------------------------------------
# 🔐 VERIFY
# -----------------------------------------
@router.get("/webhook")
async def verify(request: Request):
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN and challenge is not None:
        # Meta expects raw challenge body
        return Response(content=str(challenge), media_type="text/plain")

    return {"status": "error"}


# -----------------------------------------
# 📩 RECEIVE MESSAGE + STATUS TRACKING
# -----------------------------------------
@router.post("/webhook")
async def receive(req: Request):
    body = await req.json()
    print("📨 WEBHOOK PAYLOAD KEYS:", list(body.keys()))

    try:
        db = await get_db()
        await ensure_order_schema(db)

        entry = body.get("entry", [])
        changes = entry[0].get("changes", []) if entry else []
        value = changes[0].get("value", {}) if changes else {}

        # =========================================================
        # 1. DELIVERY STATUS TRACKING
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
                    """, (status or "").upper(), wa_id)
                    await manager.broadcast(0, {
                        "type": "message_update",
                        "wa_id": wa_id,
                        "status": (status or "").upper(),
                    })
            return {"status": "updated"}

        # =========================================================
        # 2. INBOUND MESSAGES
        # =========================================================
        if "messages" not in value:
            return {"status": "no message"}

        msg = value["messages"][0]
        phone = normalize_phone(msg.get("from") or "")
        text = _extract_text(msg).strip()
        print("📩 Incoming:", repr(text), "from", phone)

        if not text:
            return {"status": "ignored_non_text"}

        action, order_id = _parse_command(text)

        if action and order_id is not None:
            try:
                # -------- CUSTOMER: STATUS --------
                if action == "STATUS":
                    current = await get_final_status(order_id, db=db)
                    if not current:
                        await _safe_reply(phone, f"❌ Order {order_id} not found")
                        return {"status": "not_found"}

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
                        await _safe_reply(
                            phone,
                            f"📦 Order {order_id}: {current}\n\n{lines}"
                        )
                    else:
                        await _safe_reply(phone, f"📦 Order {order_id}: {current}")
                    return {"status": "status_sent"}

                # -------- CUSTOMER: CANCEL --------
                if action == "CANCEL":
                    result = await cancel_final_order(order_id, db=db)
                    await _safe_reply(phone, result["message"])
                    return {"status": "cancelled" if result["ok"] else "blocked"}

                # -------- CUSTOMER: CONFIRM (legacy) --------
                if action == "CONFIRM":
                    current = await get_final_status(order_id, db=db)
                    if not current:
                        await _safe_reply(phone, f"❌ Order {order_id} not found")
                        return {"status": "not_found"}
                    if current.upper() != "CREATED":
                        await _safe_reply(
                            phone,
                            f"⚠️ Order {order_id} already processed ({current})"
                        )
                        return {"status": "ignored"}

                    await set_final_order_status(order_id, "CONFIRMED", db=db)
                    await _safe_reply(phone, f"✅ Order {order_id} confirmed")

                    pending_messages = await db.fetch("""
                        SELECT id, phone, message
                        FROM whatsapp_messages
                        WHERE final_order_id = $1
                          AND status = 'PENDING'
                        ORDER BY id
                    """, order_id)
                    # Fallback if final_order_id not set on older rows
                    if not pending_messages:
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

                # -------- STORE: ACCEPT / READY / REJECT / COMPLETE --------
                if action in ("ACCEPT", "READY", "REJECT", "COMPLETE", "COMPLETED"):
                    result = await apply_store_action(order_id, action, phone, db=db)
                    await _safe_reply(phone, result["message"])
                    print(
                        f"🏪 Store action {action}#{order_id} → ok={result.get('ok')} "
                        f"match={result.get('match_mode')} final={result.get('final_status')}"
                    )
                    return {
                        "status": "ok" if result.get("ok") else "error",
                        "action": action,
                        "order_id": order_id,
                        "match_mode": result.get("match_mode"),
                        "final_status": result.get("final_status"),
                    }

                await _safe_reply(
                    phone,
                    "Unknown command.\n"
                    "Customer: STATUS#id | CANCEL#id\n"
                    "Store: ACCEPT#id | READY#id | REJECT#id"
                )
                return {"status": "unknown_command"}

            except Exception as cmd_err:
                print(f"❌ Command error {action}#{order_id}:", cmd_err)
                import traceback
                traceback.print_exc()
                await _safe_reply(
                    phone,
                    f"⚠️ Could not process {action}#{order_id}. "
                    f"Please try again or use the Store Portal."
                )
                return {"status": "command_error", "error": str(cmd_err)}

        # Free-text → portal redirect
        await _safe_reply(
            phone,
            "🛒 Please place orders on Ekkilo:\n"
            "https://ekkilo.onrender.com\n\n"
            "WhatsApp commands:\n"
            "Customer: STATUS#orderid | CANCEL#orderid\n"
            "Store: ACCEPT#orderid | READY#orderid | REJECT#orderid"
        )
        return {"status": "redirect_to_portal"}

    except Exception as e:
        print("❌ WhatsApp webhook error:", str(e))
        import traceback
        traceback.print_exc()

    # Always 200 so Meta does not disable the webhook
    return {"status": "ok"}
