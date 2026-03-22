import httpx
import os
import asyncio

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")


async def send_message(phone, message):
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

    print(f"🚀 WhatsApp START → {phone}")

    # 🔁 Retry mechanism
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json=payload, headers=headers)

            print(f"📤 WhatsApp STATUS → {response.status_code}")

            # ✅ Success
            if response.status_code == 200:
                print(f"✅ WhatsApp SENT → {phone}")
                return response.json()

            # ❌ API error
            else:
                print(f"❌ WhatsApp API ERROR → {response.text}")

        except Exception as e:
            print(f"❌ WhatsApp EXCEPTION (attempt {attempt+1}) → {str(e)}")

        # ⏳ wait before retry
        await asyncio.sleep(1)

    print(f"🔥 WhatsApp FAILED after retries → {phone}")
    return None