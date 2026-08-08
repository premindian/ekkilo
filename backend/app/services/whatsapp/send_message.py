import httpx
import os
from app.db.database import get_db
from app.utils.phone import normalize_phone

WHATSAPP_TOKEN = os.getenv("META_ACCESS_TOKEN") or os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("META_PHONE_NUMBER_ID") or os.getenv("PHONE_NUMBER_ID")


async def send_message(phone, message, msg_id=None) -> bool:
    """
    Send a WhatsApp text message.
    Returns True on success, False on failure.
    """
    to = normalize_phone(phone)
    print(f"🎯 send_message → to={to} (raw={phone}), msg_id={msg_id}")

    if not to:
        print("❌ WhatsApp send aborted: empty phone")
        return False

    if not WHATSAPP_TOKEN or not PHONE_NUMBER_ID:
        print("❌ WhatsApp send aborted: META_ACCESS_TOKEN / META_PHONE_NUMBER_ID missing")
        return False

    db = await get_db()

    url = f"https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": message},
    }

    try:
        print(f"🚀 Sending WhatsApp → {to}")
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(url, json=payload, headers=headers)

        data = response.json()
        print(f"📥 WhatsApp API response ({response.status_code}): {data}")

        if "error" in data or response.status_code != 200:
            error_message = data.get("error", {}).get("message", f"HTTP {response.status_code}")
            print(f"❌ WhatsApp API Error: {error_message}")

            if msg_id:
                await db.execute("""
                    UPDATE whatsapp_messages
                    SET status = 'FAILED',
                        attempts = attempts + 1,
                        last_error = $2
                    WHERE id = $1
                """, msg_id, error_message)
            return False

        wa_id = None
        if "messages" in data:
            wa_id = data["messages"][0].get("id")

        if msg_id:
            if wa_id:
                await db.execute("""
                    UPDATE whatsapp_messages
                    SET status = 'SENT',
                        sent_at = NOW(),
                        whatsapp_message_id = $2
                    WHERE id = $1
                """, msg_id, wa_id)
            else:
                await db.execute("""
                    UPDATE whatsapp_messages
                    SET status = 'FAILED',
                        attempts = attempts + 1,
                        last_error = 'No message ID in response'
                    WHERE id = $1
                """, msg_id)
                return False

        print(f"✅ WhatsApp sent to {to}")
        return True

    except Exception as e:
        print(f"❌ WhatsApp ERROR for {to}:", str(e))
        import traceback
        traceback.print_exc()

        if msg_id:
            await db.execute("""
                UPDATE whatsapp_messages
                SET status = 'FAILED',
                    attempts = attempts + 1,
                    last_error = $2
                WHERE id = $1
            """, msg_id, str(e))
        return False
