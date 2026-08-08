from app.db.database import get_db
from app.core.ws_manager import manager
from app.utils.phone import normalize_phone
from app.services.order_status import (
    ensure_order_schema,
    update_final_order_status,  # re-export for existing imports
)


async def create_full_order(stores, customer_phone):
    db = await get_db()
    await ensure_order_schema(db)

    whatsapp_jobs = []
    customer_phone = normalize_phone(customer_phone)

    # -----------------------------
    # 🧾 FINAL ORDER - Create with initial status
    # -----------------------------
    final_order = await db.fetchrow("""
        INSERT INTO final_orders (customer_phone, status)
        VALUES ($1, 'CREATED')
        RETURNING id
    """, customer_phone)

    final_order_id = final_order["id"]
    
    # Create initial event
    await db.execute("""
        INSERT INTO final_order_events (final_order_id, status)
        VALUES ($1, 'CREATED')
    """, final_order_id)

    # -----------------------------
    # 🏪 STORE ORDERS
    # -----------------------------
    for store in stores:

        # 📞 EXTRACT STORE PHONE
        store_phone = store.get("store_phone")

        if not store_phone:
            for item in store.get("items", []):
                if item.get("phone"):
                    store_phone = item.get("phone")
                    break

        if not store_phone:
            print("⚠️ No store phone found, skipping:", store.get("store"))
            continue

        store_phone = normalize_phone(store_phone)

        # -----------------------------
        # 🏪 INSERT STORE ORDER
        # -----------------------------
        # Get store_id from stores table (normalize match by last 10 digits)
        from app.utils.phone import phone_tail
        store_record = await db.fetchrow("""
            SELECT id, phone FROM stores
            WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $1
            LIMIT 1
        """, phone_tail(store_phone))
        
        store_id = store_record["id"] if store_record else None
        if store_record and store_record.get("phone"):
            # Prefer canonical store phone from DB
            store_phone = normalize_phone(store_record["phone"])
        
        so = await db.fetchrow("""
            INSERT INTO store_orders (final_order_id, store_name, store_phone, store_id, status)
            VALUES ($1, $2, $3, $4, 'PENDING')
            RETURNING id
        """, final_order_id, store.get("store"), store_phone, store_id)

        store_order_id = so["id"]

        # -----------------------------
        # 📦 ITEMS (+ compute store total)
        # -----------------------------
        store_total = 0.0
        for item in store.get("items", []):
            qty = item.get("qty") or item.get("packs") or item.get("quantity") or 1
            try:
                qty = float(qty)
            except (TypeError, ValueError):
                qty = 1
            price = item.get("price", 0) or 0
            try:
                price = float(price)
            except (TypeError, ValueError):
                price = 0
            store_total += qty * price

            await db.execute("""
                INSERT INTO order_items (store_order_id, product_name, quantity, price)
                VALUES ($1, $2, $3, $4)
            """,
                store_order_id,
                item.get("name"),
                qty,
                price
            )

        # Prefer frontend-provided total when present
        if store.get("total") is not None:
            try:
                store_total = float(store.get("total"))
            except (TypeError, ValueError):
                pass

        await db.execute("""
            UPDATE store_orders
            SET total_amount = $1
            WHERE id = $2
        """, store_total, store_order_id)

        # -----------------------------
        # 📊 EVENT
        # -----------------------------
        await db.execute("""
            INSERT INTO store_order_events (store_order_id, status)
            VALUES ($1, $2)
        """, store_order_id, "PENDING")

        # -----------------------------
        # 📲 MESSAGE
        # -----------------------------
        def _item_qty(i):
            return i.get("qty") or i.get("packs") or i.get("quantity") or 1

        item_text = "\n".join(
            f"{i.get('name')} x{_item_qty(i)}"
            for i in store.get("items", [])
        )

        message = f"""🆕 New Order

Order ID: {final_order_id}

{item_text}

Reply:
ACCEPT#{final_order_id} - Accept order
READY#{final_order_id} - Mark ready
REJECT#{final_order_id} - Cannot fulfill
"""

        whatsapp_jobs.append((store_phone, message))

        # -----------------------------
        # 🔴 ADMIN UPDATE
        # -----------------------------
        await manager.broadcast(0, {
            "type": "new_order",
            "final_order_id": final_order_id,
            "store": store.get("store")
        })

    return final_order_id, whatsapp_jobs