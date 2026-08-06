import httpx
import os
from app.db.database import get_db

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")


async def send_message(phone, message, msg_id=None):
    print(f"🎯 Background task started for {phone}, msg_id={msg_id}")
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

        # Check for errors in response
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
            return

        # 🔥 EXTRACT WHATSAPP MESSAGE ID
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
                # No message ID means it didn't send
                await db.execute("""
                    UPDATE whatsapp_messages
                    SET status = 'FAILED',
                        attempts = attempts + 1,
                        last_error = 'No message ID in response'
                    WHERE id = $1
                """, msg_id)

    except Exception as e:
        print(f"❌ WhatsApp ERROR for {phone}:", str(e))
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
    
    print(f"✅ Background task completed for {phone}")