import asyncio
from app.db.database import get_db
from app.services.whatsapp import send_message


async def retry_failed_messages():
    print("🚀 Retry worker started")

    while True:
        try:
            db = await get_db()

            rows = await db.fetch("""
                SELECT id, phone, message, attempts
                FROM whatsapp_messages
                WHERE status = 'FAILED'
                AND attempts < 3
                ORDER BY created_at ASC
                LIMIT 20
            """)

            if rows:
                print(f"🔁 Retrying {len(rows)} messages...")

            for row in rows:
                msg_id = row["id"]
                phone = row["phone"]
                message = row["message"]

                print(f"🔁 Retry → {phone} (attempt {row['attempts'] + 1})")

                await send_message(phone, message, msg_id)

        except Exception as e:
            print("❌ Retry worker error:", str(e))

        # ⏱ wait before next retry cycle
        await asyncio.sleep(30)