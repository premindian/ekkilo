import httpx
import os
from app.db.database import get_db

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")


async def send_message(phone, message, msg_id=None):
    db = await get_db()

    url = f"https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages"

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message}
    }

    try:
        print(f"🚀 Sending → {phone}")

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload, headers=headers)

        data = response.json()

        # 🔥 EXTRACT WHATSAPP MESSAGE ID
        wa_id = None
        if "messages" in data:
            wa_id = data["messages"][0].get("id")

        if msg_id:
            await db.execute("""
                UPDATE whatsapp_messages
                SET status = 'SENT',
                    sent_at = NOW(),
                    whatsapp_message_id = $2
                WHERE id = $1
            """, msg_id, wa_id)

    except Exception as e:
        print("❌ WhatsApp ERROR:", str(e))

        if msg_id:
            await db.execute("""
                UPDATE whatsapp_messages
                SET status = 'FAILED',
                    attempts = attempts + 1,
                    last_error = $2
                WHERE id = $1
            """, msg_id, str(e))