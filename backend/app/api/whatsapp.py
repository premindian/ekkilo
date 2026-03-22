from fastapi import APIRouter, Request
from app.services.whatsapp import send_message

from app.core.context import Context
from app.core.engine import Engine
from app.agents.list_parser import ListParser
from app.agents.matcher import Matcher
from app.agents.pricing import Pricing
from app.agents.optimizer import Optimizer

router = APIRouter()


# -----------------------------------------
# 🔐 VERIFY (Meta webhook)
# -----------------------------------------
@router.get("/webhook")
async def verify(request: Request):
    params = request.query_params
    if params.get("hub.mode") == "subscribe":
        return int(params.get("hub.challenge"))
    return {"status": "error"}


# -----------------------------------------
# 📩 RECEIVE MESSAGE
# -----------------------------------------
@router.post("/webhook")
async def receive(req: Request):
    body = await req.json()

    try:
        entry = body["entry"][0]
        changes = entry["changes"][0]
        value = changes["value"]

        if "messages" not in value:
            return {"status": "no message"}

        msg = value["messages"][0]
        phone = msg["from"]
        text = msg["text"]["body"].strip().lower()

        print("📩 Incoming:", text, phone)

        from app.db.database import get_db
        db = await get_db()

        # =========================================================
        # 🔍 HELPERS
        # =========================================================
        async def get_final_status(order_id):
            row = await db.fetchrow(
                """
                SELECT status FROM final_order_events
                WHERE final_order_id = $1
                ORDER BY id DESC LIMIT 1
                """,
                order_id,
            )
            return row["status"] if row else "CREATED"

        async def get_store_statuses(order_id):
            rows = await db.fetch(
                """
                SELECT status FROM store_order_events soe
                JOIN store_orders so ON so.id = soe.store_order_id
                WHERE so.final_order_id = $1
                """,
                order_id,
            )
            return [r["status"] for r in rows]

        # =========================================================
        # 🔥 COMMAND HANDLER
        # =========================================================
        if "#" in text:

            parts = text.split("#")
            action = parts[0].upper()

            try:
                order_id = int(parts[1])
            except:
                return {"status": "invalid"}

            current_status = await get_final_status(order_id)

            # =====================================================
            # 👤 CUSTOMER ACTIONS
            # =====================================================
            if action == "CONFIRM":

                if current_status != "CREATED":
                    await send_message(
                        phone, f"⚠️ Order {order_id} already processed"
                    )
                    return {"status": "ignored"}

                await db.execute(
                    """
                    INSERT INTO final_order_events (final_order_id, status)
                    VALUES ($1, 'CONFIRMED')
                    """,
                    order_id,
                )

                await send_message(phone, f"✅ Order {order_id} confirmed")

                stores = await db.fetch(
                    """
                    SELECT store_phone
                    FROM store_orders
                    WHERE final_order_id = $1
                    """,
                    order_id,
                )

                for s in stores:
                    await send_message(
                        s["store_phone"],
                        f"""✅ Order {order_id} confirmed

Start processing now

Reply:
ACCEPT#{order_id}
READY#{order_id}
""",
                    )

                return {"status": "confirmed"}

            if action == "CANCEL":

                if current_status in ["READY", "COMPLETED"]:
                    await send_message(
                        phone,
                        f"❌ Cannot cancel Order {order_id} (already ready)",
                    )
                    return {"status": "blocked"}

                await db.execute(
                    """
                    INSERT INTO final_order_events (final_order_id, status)
                    VALUES ($1, 'CANCELLED')
                    """,
                    order_id,
                )

                await db.execute(
                    """
                    INSERT INTO store_order_events (store_order_id, status)
                    SELECT id, 'CANCELLED'
                    FROM store_orders
                    WHERE final_order_id = $1
                    """,
                    order_id,
                )

                await send_message(phone, f"❌ Order {order_id} cancelled")

                return {"status": "cancelled"}

            if action == "STATUS":
                await send_message(
                    phone, f"📦 Order {order_id}: {current_status}"
                )
                return {"status": "status_sent"}

            # =====================================================
            # 🏪 STORE ACTIONS
            # =====================================================
            if current_status != "CONFIRMED":
                await send_message(
                    phone,
                    f"⏳ Wait for customer confirmation for Order {order_id}",
                )
                return {"status": "blocked"}

            # -----------------------------------------
            # ACCEPT (FIXED PER STORE)
            # -----------------------------------------
            if action == "ACCEPT":

                store_row = await db.fetchrow(
                    """
                    SELECT id FROM store_orders
                    WHERE final_order_id = $1 AND store_phone = $2
                    """,
                    order_id,
                    phone,
                )

                if not store_row:
                    await send_message(phone, "❌ Store not found for this order")
                    return {"status": "error"}

                store_order_id = store_row["id"]

                await db.execute(
                    """
                    INSERT INTO store_order_events (store_order_id, status)
                    VALUES ($1, 'ACCEPTED')
                    """,
                    store_order_id,
                )

                await send_message(phone, f"✅ Order {order_id} accepted")

                customer = await db.fetchrow(
                    "SELECT customer_phone FROM final_orders WHERE id = $1",
                    order_id,
                )

                if customer:
                    await send_message(
                        customer["customer_phone"],
                        f"👨‍🍳 Order {order_id} is being prepared"
                    )

                return {"status": "accepted"}

            # -----------------------------------------
            # READY (FIXED PER STORE)
            # -----------------------------------------
            if action == "READY":

                store_row = await db.fetchrow(
                    """
                    SELECT id FROM store_orders
                    WHERE final_order_id = $1 AND store_phone = $2
                    """,
                    order_id,
                    phone,
                )

                if not store_row:
                    await send_message(phone, "❌ Store not found for this order")
                    return {"status": "error"}

                store_order_id = store_row["id"]

                status_row = await db.fetchrow(
                    """
                    SELECT status FROM store_order_events
                    WHERE store_order_id = $1
                    ORDER BY id DESC LIMIT 1
                    """,
                    store_order_id,
                )

                if not status_row or status_row["status"] != "ACCEPTED":
                    await send_message(
                        phone,
                        f"⚠️ Accept first: ACCEPT#{order_id}",
                    )
                    return {"status": "blocked"}

                await db.execute(
                    """
                    INSERT INTO store_order_events (store_order_id, status)
                    VALUES ($1, 'READY')
                    """,
                    store_order_id,
                )

                await send_message(phone, f"📦 Order {order_id} READY")

                customer = await db.fetchrow(
                    "SELECT customer_phone FROM final_orders WHERE id = $1",
                    order_id,
                )

                if customer:
                    await send_message(
                        customer["customer_phone"],
                        f"📦 Order {order_id} is ready for pickup"
                    )

                return {"status": "ready"}

        # =========================================================
        # 🔍 NORMAL SEARCH FLOW
        # =========================================================
        context = Context(user_text=text)

        engine = Engine([
            ListParser(),
            Matcher(),
            Pricing(),
            Optimizer(),
        ])

        result = await engine.run(context)
        data = result.data

        message = "🧠 Smart Kirana\n\n"

        for store, items in data.get("optimized_plan", {}).items():
            message += f"🏪 {store}\n"

            for i in items:
                message += f"{i['name']} x{i['packs']} ₹{i['price']}\n"

            message += "\n"

        message += f"💰 Total ₹{data.get('optimized_total', 0)}\n\n"
        message += "Reply:\nCONFIRM#order_id\nCANCEL#order_id"

        await send_message(phone, message)

        return {"status": "search_done"}

    except Exception as e:
        print("❌ Error:", str(e))

    return {"status": "ok"}