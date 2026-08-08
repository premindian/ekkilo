import httpx
import os
import re
from fastapi import APIRouter, Request

from app.services.whatsapp import send_message
from app.db.database import get_db
from app.core.ws_manager import manager   # 🔥 ADDED

from app.core.context import Context
from app.core.engine import Engine
from app.agents.list_parser import ListParser
from app.agents.matcher import Matcher
from app.agents.pricing import Pricing
from app.agents.optimizer import Optimizer

router = APIRouter()

VERIFY_TOKEN = "Bookofkirana2026"


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
        # 🔥 1. DELIVERY STATUS TRACKING + LIVE UPDATE
        # =========================================================
        statuses = value.get("statuses", [])

        if statuses:
            for s in statuses:
                wa_id = s.get("id")
                status = s.get("status")

                print(f"📦 Status update → {status} ({wa_id})")

                if wa_id:
                    # ✅ update DB
                    await db.execute("""
                        UPDATE whatsapp_messages
                        SET status = $1
                        WHERE whatsapp_message_id = $2
                    """, status.upper(), wa_id)

                    # 🔥 REAL-TIME BROADCAST (NEW)
                    await manager.broadcast(0, {
                        "type": "message_update",
                        "wa_id": wa_id,
                        "status": status.upper()
                    })

            return {"status": "updated"}

        # =========================================================
        # 🔥 2. NORMAL MESSAGE FLOW
        # =========================================================
        if "messages" not in value:
            return {"status": "no message"}

        msg = value["messages"][0]
        phone = msg["from"]
        text = msg["text"]["body"].strip().lower()

        print("📩 Incoming:", text, phone)

        # -----------------------------
        # HELPERS
        # -----------------------------
        async def get_final_status(order_id):
            row = await db.fetchrow("""
                SELECT status FROM final_order_events
                WHERE final_order_id = $1
                ORDER BY id DESC LIMIT 1
            """, order_id)
            return row["status"] if row else "CREATED"

        async def get_store_statuses(order_id):
            rows = await db.fetch("""
                SELECT status FROM store_order_events soe
                JOIN store_orders so ON so.id = soe.store_order_id
                WHERE so.final_order_id = $1
            """, order_id)
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

            # -----------------------------
            # 👤 CUSTOMER ACTIONS
            # -----------------------------
            if action == "CONFIRM":

                if current_status != "CREATED":
                    await send_message(phone, f"⚠️ Order {order_id} already processed")
                    return {"status": "ignored"}

                # Update final order status
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

                # Send the store messages that were queued during order creation
                pending_messages = await db.fetch("""
                    SELECT id, phone, message
                    FROM whatsapp_messages
                    WHERE phone IN (
                        SELECT store_phone FROM store_orders WHERE final_order_id = $1
                    )
                    AND status = 'PENDING'
                    ORDER BY id
                """, order_id)

                for msg in pending_messages:
                    await send_message(msg["phone"], msg["message"], msg["id"])

                return {"status": "confirmed"}

            if action == "CANCEL":

                if current_status in ["READY", "COMPLETED"]:
                    await send_message(phone, f"❌ Cannot cancel Order {order_id}")
                    return {"status": "blocked"}

                # Update final order status
                await db.execute("""
                    UPDATE final_orders
                    SET status = 'CANCELLED', updated_at = NOW()
                    WHERE id = $1
                """, order_id)
                
                await db.execute("""
                    INSERT INTO final_order_events (final_order_id, status)
                    VALUES ($1, 'CANCELLED')
                """, order_id)

                # Update and insert events for all store orders
                await db.execute("""
                    UPDATE store_orders
                    SET status = 'CANCELLED', updated_at = NOW()
                    WHERE final_order_id = $1
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
                await send_message(phone, f"📦 Order {order_id}: {current_status}")
                return {"status": "status_sent"}

            # -----------------------------
            # 🏪 STORE ACTIONS
            # -----------------------------
            if current_status != "CONFIRMED":
                await send_message(phone, f"⏳ Wait for confirmation")
                return {"status": "blocked"}

            if action == "ACCEPT":

                store_row = await db.fetchrow("""
                    SELECT id FROM store_orders
                    WHERE final_order_id = $1 AND store_phone = $2
                """, order_id, phone)

                if not store_row:
                    return {"status": "error"}

                store_order_id = store_row["id"]

                # Update store order status
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

                # Update final order status based on all stores
                from app.services.order_service import update_final_order_status
                await update_final_order_status(order_id)

                return {"status": "accepted"}

            if action == "READY":

                store_row = await db.fetchrow("""
                    SELECT id, store_name FROM store_orders
                    WHERE final_order_id = $1 AND store_phone = $2
                """, order_id, phone)

                if not store_row:
                    return {"status": "error"}

                store_order_id = store_row["id"]
                store_name = store_row["store_name"]

                # Update store order status
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

                # Update final order status and check if should notify customer
                from app.services.order_service import update_final_order_status
                final_status, notify_customer = await update_final_order_status(order_id)

                # Notify customer if all stores ready or partial fulfillment
                if notify_customer:
                    customer = await db.fetchrow("""
                        SELECT customer_phone FROM final_orders WHERE id = $1
                    """, order_id)
                    
                    if customer:
                        if final_status == 'READY':
                            await send_message(
                                customer["customer_phone"],
                                f"🎉 Great news! Your order #{order_id} is READY for pickup at all stores!"
                            )
                        elif final_status == 'PARTIAL':
                            # Get list of ready stores
                            ready_stores = await db.fetch("""
                                SELECT store_name FROM store_orders
                                WHERE final_order_id = $1 AND status = 'READY'
                            """, order_id)
                            store_list = ", ".join([s["store_name"] for s in ready_stores])
                            await send_message(
                                customer["customer_phone"],
                                f"📦 Order #{order_id} update:\n✅ Ready at: {store_list}\n\nCheck remaining stores for updates."
                            )

                return {"status": "ready"}

            if action == "REJECT":

                store_row = await db.fetchrow("""
                    SELECT id, store_name FROM store_orders
                    WHERE final_order_id = $1 AND store_phone = $2
                """, order_id, phone)

                if not store_row:
                    return {"status": "error"}

                store_order_id = store_row["id"]
                store_name = store_row["store_name"]

                # Update store order status to REJECTED
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

                # Update final order status
                from app.services.order_service import update_final_order_status
                final_status, notify_customer = await update_final_order_status(order_id)

                # Notify customer about rejection
                if notify_customer:
                    customer = await db.fetchrow("""
                        SELECT customer_phone FROM final_orders WHERE id = $1
                    """, order_id)
                    
                    if customer:
                        if final_status == 'REJECTED':
                            await send_message(
                                customer["customer_phone"],
                                f"😔 Sorry, order #{order_id} cannot be fulfilled. All stores are unavailable. Please try again later."
                            )
                        elif final_status == 'PARTIAL':
                            # Some stores still processing
                            await send_message(
                                customer["customer_phone"],
                                f"⚠️ Order #{order_id} update:\n{store_name} cannot fulfill their part.\nOther stores are still processing your order."
                            )

                return {"status": "rejected"}

        # =========================================================
        # 🔍 SEARCH FLOW + CREATE ORDER
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

        optimized_plan = data.get("optimized_plan", {})
        
        if not optimized_plan:
            await send_message(phone, "❌ No products found. Try again!")
            return {"status": "no_results"}

        # 🔥 CREATE ORDER IN DB
        from app.services.order_service import create_full_order
        
        # Build stores payload
        stores_payload = []
        for store_name, products in optimized_plan.items():
            # Get store phone from products
            store_phone = None
            for p in products:
                if p.get("phone"):
                    store_phone = p["phone"]
                    break
            
            # If no phone found, fetch from DB
            if not store_phone:
                store_row = await db.fetchrow("""
                    SELECT phone FROM stores WHERE name = $1
                """, store_name)
                if store_row:
                    store_phone = store_row["phone"]
            
            items = []
            for p in products:
                items.append({
                    "name": p.get("name", ""),
                    "packs": p.get("packs", 1),
                    "size": p.get("size", 1),
                    "unit": p.get("unit", ""),
                    "price": p.get("price", 0),
                    "phone": p.get("phone")
                })
            
            stores_payload.append({
                "store": store_name,
                "store_phone": store_phone,
                "items": items
            })
        
        # Create the order (but don't send to stores yet - wait for CONFIRM)
        final_order_id, whatsapp_jobs = await create_full_order(stores_payload, phone)

        # DON'T send store messages yet - wait for customer to CONFIRM
        # Store the messages are already in whatsapp_messages table via create_full_order

        # Build customer message
        message = "🧠 Smart Kirana Order\n\n"
        message += f"📝 Order ID: {final_order_id}\n\n"

        for store_name, items in optimized_plan.items():
            message += f"🏪 {store_name}\n"

            for i in items:
                message += f"  {i['name']} x{i['packs']} ₹{i['price']}\n"

            message += "\n"

        message += f"💰 Total: ₹{data.get('optimized_total', 0)}\n\n"
        message += f"Reply CONFIRM#{final_order_id} to proceed\n"
        message += f"Or CANCEL#{final_order_id} to cancel"

        await send_message(phone, message)

        return {"status": "order_created", "order_id": final_order_id}

    except Exception as e:
        print("❌ Error:", str(e))

    return {"status": "ok"}