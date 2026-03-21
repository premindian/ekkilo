import httpx

from fastapi import APIRouter, Request


router = APIRouter()

WHATSAPP_TOKEN = "EAAaPieVsX88BQw8suZBdkJRSCBEob6qLJYQxFoaYekeQZAJ0tVVXjAZCOBDqLGqyZAacUOOCRZBZCw4KuvzaFzUpR857c4caPUdu2SpcP9pZBghu5ZAIWZCb92SrZCWjDdmKgDZCYdegcZCI3gZCPIgNr2f7v0QrXLaz3idgoLnvBDj4t1gJxtZB9lat4ZAVw0qP8HmZBpGHJl7UMIenabQytl79SmcJvh7ZANWvabMmmXHdugQhSGSAAgOzmddl9ZBc8ZBMZADFpO4svC8j3ektQZAZBZChI97mxoH"
PHONE_NUMBER_ID = "1004119959456848"

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

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)

    print("📤 WhatsApp response:", response.text)

    return response.json()