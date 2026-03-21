from app.services.whatsapp import send_message
from app.db.database import get_db
from app.core.ws_manager import manager


class Dispatcher:
    async def run(self, context):
        print("?? Dispatcher running...")

        plan = context.get("optimized_plan")
        print("?? PLAN:", plan)

        if not plan:
            print("?? No plan found.")
            return context

        db = await get_db()

        order_id = context.order_id
        customer_phone = context.phone

        # fallback (temporary safety)
        if not customer_phone:
            customer_phone = "917981728794"

        store_phones = {
            "storea": "919666448408",
        }

        for store, items in plan.items():
            store_key = store.lower()
            store_phone = store_phones.get(store_key)

            if not store_phone:
                print(f"?? No phone for {store}")
                continue

            if not items:
                print(f"?? No items for {store}")
                continue

            # -----------------------------
            # ? UPDATE EXISTING ORDER (NOT CREATE)
            # -----------------------------
            await db.execute("""
                UPDATE orders
                SET store_name = $1,
                    store_phone = $2,
                    items = $3,
                    status = 'SENT'
                WHERE id = $4
            """,
                store,
                store_phone,
                items,
                order_id
            )

            print(f"? Order updated: {order_id}")

            # -----------------------------
            # ? TIMELINE EVENT
            # -----------------------------
            await db.execute("""
                INSERT INTO order_events (order_id, status)
                VALUES ($1, $2)
            """, order_id, "SENT")

            # -----------------------------
            # ? WEBSOCKET (ORDER-SPECIFIC)
            # -----------------------------
            await manager.broadcast(order_id, {
                "type": "status_update",
                "order_id": order_id,
                "status": "SENT"
            })
            

            print(f"?? Broadcast sent for order {order_id}")

            # -----------------------------
            # ? SEND TO STORE
            # -----------------------------
            message = f"""
?? *New Order*

?? Order ID: {order_id}

?? Items:
{', '.join(items)}

Reply *YES {order_id}* to accept  
Reply *READY {order_id}* when packed
"""

            print("?? Sending to store...")

            await send_message(store_phone, message)

            # -----------------------------
            # ? SEND CONFIRMATION TO CUSTOMER
            # -----------------------------
            if customer_phone:
                await send_message(
                    customer_phone,
                    f"?? Your order {order_id} has been sent to store {store}"
                )

        print("? Dispatch complete.")

        return context