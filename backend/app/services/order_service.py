from app.db.database import get_db
from app.services.whatsapp import send_message
from app.core.ws_manager import manager


async def create_full_order(stores, customer_phone):
    db = await get_db()

    # -----------------------------
    # 🧾 FINAL ORDER
    # -----------------------------
    final_order = await db.fetchrow("""
        INSERT INTO final_orders (customer_phone)
        VALUES ($1)
        RETURNING id
    """, customer_phone)

    final_order_id = final_order["id"]

    # -----------------------------
    # 🏪 STORE ORDERS
    # -----------------------------
    for store in stores:
        so = await db.fetchrow("""
            INSERT INTO store_orders (final_order_id, store_name, store_phone)
            VALUES ($1, $2, $3)
            RETURNING id
        """, final_order_id, store["store"], store["store_phone"])

        store_order_id = so["id"]

        for item in store.get("items", []):
            await db.execute("""
                INSERT INTO order_items (store_order_id, product_name, quantity, price)
                VALUES ($1, $2, $3, $4)
            """, store_order_id, item["name"], item.get("qty", 1), item.get("price", 0))

        # -----------------------------
        # 📊 EVENT
        # -----------------------------
        await db.execute("""
            INSERT INTO store_order_events (store_order_id, status)
            VALUES ($1, $2)
        """, store_order_id, "SENT")

        # -----------------------------
        # 📲 SEND TO STORE (UPDATED)
        # -----------------------------
        item_text = "\n".join([
            f"{i['name']} x{i.get('qty',1)}"
            for i in store.get("items", [])
        ])

        await send_message(
            store["store_phone"],
            f"""🆕 New Order

Order ID: {final_order_id}

{item_text}

Reply:
READY#{final_order_id}
"""
        )

        # -----------------------------
        # 🔴 ADMIN REALTIME
        # -----------------------------
        await manager.broadcast(0, {
            "type": "new_order",
            "final_order_id": final_order_id,
            "store": store["store"]
        })

    return final_order_id