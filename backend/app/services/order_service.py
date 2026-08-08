from app.db.database import get_db
from app.core.ws_manager import manager


async def update_final_order_status(final_order_id):
    """
    Calculate and update final order status based on all store statuses.
    Returns the new status and whether customer should be notified.
    """
    db = await get_db()
    
    # Get all store order statuses
    stores = await db.fetch("""
        SELECT id, status, store_name, store_phone
        FROM store_orders
        WHERE final_order_id = $1
    """, final_order_id)
    
    if not stores:
        return None, False
    
    statuses = [s["status"] for s in stores]
    store_count = len(stores)
    
    # Calculate final status based on store statuses
    rejected_count = sum(1 for s in statuses if s == 'REJECTED')
    ready_count = sum(1 for s in statuses if s == 'READY')
    accepted_count = sum(1 for s in statuses if s == 'ACCEPTED')
    pending_count = sum(1 for s in statuses if s == 'PENDING')
    
    notify_customer = False
    
    # Determine final status
    if rejected_count == store_count:
        # All stores rejected
        final_status = 'REJECTED'
        notify_customer = True
    elif ready_count == store_count:
        # All stores ready - notify customer!
        final_status = 'READY'
        notify_customer = True
    elif ready_count > 0:
        # Some stores ready
        final_status = 'PARTIAL_READY'
    elif rejected_count > 0 and (ready_count > 0 or accepted_count > 0):
        # Mixed: some rejected, some proceeding
        final_status = 'PARTIAL'
        notify_customer = True  # Let customer know about partial fulfillment
    elif accepted_count == (store_count - rejected_count) and rejected_count > 0:
        # All non-rejected stores have accepted
        final_status = 'PARTIAL'
        notify_customer = True
    elif accepted_count > 0:
        # At least one store accepted
        final_status = 'ACCEPTED'
    elif pending_count == store_count:
        # All still pending
        final_status = 'CONFIRMED'
    else:
        final_status = 'PROCESSING'
    
    # Update final order status
    await db.execute("""
        UPDATE final_orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
    """, final_status, final_order_id)
    
    # Insert event
    await db.execute("""
        INSERT INTO final_order_events (final_order_id, status)
        VALUES ($1, $2)
    """, final_order_id, final_status)
    
    return final_status, notify_customer


async def create_full_order(stores, customer_phone):
    db = await get_db()

    whatsapp_jobs = []

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

        # -----------------------------
        # 🏪 INSERT STORE ORDER
        # -----------------------------
        # Get store_id from stores table
        store_record = await db.fetchrow("""
            SELECT id FROM stores WHERE phone = $1 LIMIT 1
        """, store_phone)
        
        store_id = store_record["id"] if store_record else None
        
        so = await db.fetchrow("""
            INSERT INTO store_orders (final_order_id, store_name, store_phone, store_id, status)
            VALUES ($1, $2, $3, $4, 'PENDING')
            RETURNING id
        """, final_order_id, store.get("store"), store_phone, store_id)

        store_order_id = so["id"]

        # -----------------------------
        # 📦 ITEMS
        # -----------------------------
        for item in store.get("items", []):
            await db.execute("""
                INSERT INTO order_items (store_order_id, product_name, quantity, price)
                VALUES ($1, $2, $3, $4)
            """,
                store_order_id,
                item.get("name"),
                item.get("qty", 1),
                item.get("price", 0)
            )

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
        item_text = "\n".join(
            f"{i.get('name')} x{i.get('qty', 1)}"
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