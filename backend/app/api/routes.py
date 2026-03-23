from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from app.services.whatsapp import send_message
from app.services.order_service import create_full_order
from fastapi import BackgroundTasks
from app.services.whatsapp import send_message
from app.db.database import get_db
import asyncio

router = APIRouter()

VERIFY_TOKEN = "Bookofkirana2026"


# -----------------------------
# ?? CREATE ORDER
# -----------------------------
@router.post("/order")
async def create_order(data: dict, background_tasks: BackgroundTasks):
    db = await get_db()

    phone = data.get("phone")

    if not phone:
        return {"error": "Customer phone missing"}

    stores = data.get("stores", [])

    if not stores:
        return {"error": "No stores"}

    print("🔥 ORDER API HIT")

    # -----------------------------
    # 🧾 CREATE ORDER
    # -----------------------------
    final_order_id, whatsapp_jobs = await create_full_order(stores, phone)

    # -----------------------------
    # 📲 STORE MESSAGES
    # -----------------------------
    for store_phone, message in whatsapp_jobs:

        row = await db.fetchrow("""
         INSERT INTO whatsapp_messages (phone, message)
              VALUES ($1, $2)
              RETURNING id
            """, phone, message)

        msg_id = row["id"]

        print("📤 Queue store message:", store_phone)

        background_tasks.add_task(send_message, store_phone, message, msg_id)

    # -----------------------------
    # 📲 CUSTOMER MESSAGE
    # -----------------------------
    summary = []

    for store in stores:
        items = ", ".join(
            i.get("name", "") for i in store.get("items", [])
        )
        summary.append(f"{store.get('store')}: {items}")

    summary_text = "\n".join(summary)

    customer_message = f"""🧾 Order Confirmed

Order ID: {final_order_id}

{summary_text}

We will notify you when ready 🚀
"""

    row = await db.fetchrow("""
        INSERT INTO whatsapp_messages (phone, message)
              VALUES ($1, $2)
              RETURNING id
            """, phone, message)

    msg_id = row["id"]
    print("📤 Queue customer message:", phone)

    background_tasks.add_task(send_message, phone, customer_message, msg_id)

    return {"final_order_id": final_order_id}

# -----------------------------
# ?? ADMIN STORE ORDERS
# -----------------------------
@router.get("/admin/store-orders")
async def get_store_orders():
    from app.db.database import get_db
    db = await get_db()

    rows = await db.fetch("""
        SELECT 
            so.id,
            so.store_name,
            so.store_phone,
            so.status,
            fo.customer_phone,
            fo.id as final_order_id,
            so.created_at
        FROM store_orders so
        JOIN final_orders fo ON so.final_order_id = fo.id
        ORDER BY so.id DESC
        LIMIT 50
    """)

    return [
        {
            "id": r["id"],
            "final_order_id": r["final_order_id"],
            "store": r["store_name"],
            "phone": r["store_phone"],
            "status": r["status"],
            "customer": r["customer_phone"],
            "created_at": str(r["created_at"])
        }
        for r in rows
    ]


# -----------------------------
# ?? TRACK ORDER
# -----------------------------
@router.get("/track/{final_order_id}")
async def track_final_order(final_order_id: int):
    from app.db.database import get_db
    db = await get_db()

    rows = await db.fetch("""
        SELECT store_name, status
        FROM store_orders
        WHERE final_order_id = $1
    """, final_order_id)

    return {
        "final_order_id": final_order_id,
        "stores": [
            {"store": r["store_name"], "status": r["status"]}
            for r in rows
        ]
    }

# -----------------------------
# ?? FINAL TIMELINE (ADD THIS)
# -----------------------------
@router.get("/track/{final_order_id}/timeline")
async def get_final_timeline(final_order_id: int):
    from app.db.database import get_db
    db = await get_db()

    rows = await db.fetch("""
        SELECT 
            so.store_name,
            e.status,
            e.created_at
        FROM store_orders so
        JOIN store_order_events e 
            ON so.id = e.store_order_id
        WHERE so.final_order_id = $1
        ORDER BY e.created_at ASC
    """, final_order_id)

    return [
        {
            "store": r["store_name"],
            "status": r["status"],
            "time": str(r["created_at"])
        }
        for r in rows
    ]

# -----------------------------
# 🔍 SEARCH PRODUCTS (FINAL WITH STORE VIEW)
# -----------------------------
@router.post("/search")
async def search_products(data: dict):
    from app.core.context import Context
    from app.core.engine import Engine
    from app.agents.list_parser import ListParser
    from app.agents.matcher import Matcher
    from app.agents.pricing import Pricing
    from app.agents.optimizer import Optimizer
    from app.db.database import get_db

    # -----------------------------
    # 📍 INPUTS
    # -----------------------------
    text = data.get("text")
    user_lat = data.get("lat")
    user_lng = data.get("lng")
    radius = data.get("radius", 5)

    if not text:
        return {
            "stores": [],
            "total": 0,
            "savings": 0,
            "comparison": {},
            "store_view": {}
        }

    # -----------------------------
    # 🧠 ENGINE
    # -----------------------------
    context = Context(user_text=text)

    engine = Engine([
        ListParser(),
        Matcher(),
        Pricing(),
        Optimizer()
    ])

    result = await engine.run(context)
    data = result.data

    optimized = data.get("optimized_plan", {})
    optimized_total = data.get("optimized_total", 0)
    price_matrix = data.get("price_matrix", {})

    db = await get_db()

    # -----------------------------
    # 🏪 FETCH STORES
    # -----------------------------
    store_names = list(optimized.keys())

    if user_lat and user_lng and store_names:
        rows = await db.fetch("""
            SELECT 
                name,
                phone,
                lat,
                lng,
                (
                    6371 * acos(
                        cos(radians($1)) * cos(radians(lat)) *
                        cos(radians(lng) - radians($2)) +
                        sin(radians($1)) * sin(radians(lat))
                    )
                ) AS distance
            FROM stores
            WHERE name = ANY($3)
        """, user_lat, user_lng, store_names)

        store_map = {
            r["name"]: {
                "phone": r["phone"],
                "lat": r["lat"],
                "lng": r["lng"],
                "distance": float(r["distance"]) if r["distance"] else None
            }
            for r in rows
        }

    else:
        rows = await db.fetch("""
            SELECT name, phone, lat, lng 
            FROM stores 
            WHERE name = ANY($1)
        """, store_names)

        store_map = {
            r["name"]: {
                "phone": r["phone"],
                "lat": r["lat"],
                "lng": r["lng"]
            }
            for r in rows
        }

    # -----------------------------
    # 🏪 BUILD STORE PLAN
    # -----------------------------
    stores = []

    for store, products in optimized.items():

        store_data = store_map.get(store, {})

        # 🔥 CRITICAL: store phone
        store_phone = store_data.get("phone")

        # fallback from items
        if not store_phone:
            for p in products:
                if p.get("phone"):
                    store_phone = p.get("phone")
                    break

        store_total = 0
        items = []

        for p in products:
            price = p.get("price", 0)

            items.append({
                "name": p.get("name", ""),
                "packs": p.get("packs", 1),
                "size": p.get("size", 1),
                "unit": p.get("unit", ""),
                "price": price,
                "phone": p.get("phone")   # 🔥 IMPORTANT
            })

            store_total += price

        store_obj = {
            "store": store,
            "store_phone": store_phone,   # 🔥 CRITICAL FIX
            "items": items,
            "total": store_total
        }

        if store_data.get("distance") is not None:
            store_obj["distance"] = round(store_data["distance"], 2)

        stores.append(store_obj)

    # -----------------------------
    # 📍 FILTER BY DISTANCE
    # -----------------------------
    if user_lat and user_lng:
        stores = [
            s for s in stores
            if "distance" not in s or s["distance"] <= radius
        ]

    # -----------------------------
    # 🧠 HYBRID RANKING
    # -----------------------------
    total_items = len(price_matrix.keys()) or 1

    max_price = max([s["total"] for s in stores], default=1)
    max_distance = max([s.get("distance", 0) for s in stores], default=1)

    for s in stores:
        price_score = s["total"] / max_price if max_price else 0

        distance = s.get("distance", max_distance)
        distance_score = distance / max_distance if max_distance else 0

        available_items = len(s.get("items", []))
        availability_ratio = available_items / total_items

        s["score"] = (
            (0.6 * price_score) +
            (0.3 * distance_score) -
            (0.4 * availability_ratio)
        )

    stores = sorted(stores, key=lambda x: x["score"])[:5]

    # -----------------------------
    # 🤖 REASONS
    # -----------------------------
    for i, s in enumerate(stores):

        reasons = []

        if i == 0:
            reasons.append("Lowest overall cost")

        if s.get("distance") is not None:
            if s["distance"] <= 3:
                reasons.append(f"Very close ({s['distance']} km)")
            elif s["distance"] <= radius:
                reasons.append(f"Within {radius} km")

        available_items = len(s.get("items", []))

        if available_items == total_items:
            reasons.append("All items available")
        elif available_items > 0:
            reasons.append(f"{available_items}/{total_items} items available")

        if i > 0:
            diff = round(s["total"] - stores[0]["total"], 2)
            if diff > 0:
                reasons.append(f"₹{diff} costlier than best")

        s["reason"] = reasons

    # -----------------------------
    # 💰 SAVINGS
    # -----------------------------
    single_store_total = float("inf")

    for store, products in optimized.items():
        total_price = sum(p.get("price", 0) for p in products)
        single_store_total = min(single_store_total, total_price)

    if single_store_total == float("inf"):
        single_store_total = optimized_total

    savings = max(0, single_store_total - optimized_total)

    # -----------------------------
    # ⭐ BEST STORE
    # -----------------------------
    best_store_name = stores[0]["store"] if stores else None

    for s in stores:
        s["is_best"] = (s["store"] == best_store_name)

    # -----------------------------
    # 🔍 COMPARISON
    # -----------------------------
    comparison = {}

    for item, options in price_matrix.items():
        if not options:
            continue

        best_per_store = {}

        for opt in options:
            store = opt.get("store")

            if store not in best_per_store or opt["price"] < best_per_store[store]["price"]:
                best_per_store[store] = opt

        sorted_opts = sorted(best_per_store.values(), key=lambda x: x["price"])
        highest_price = max(o["price"] for o in sorted_opts)

        comparison[item] = []

        for i, opt in enumerate(sorted_opts):
            comparison[item].append({
                "store": opt.get("store"),
                "price": opt.get("price"),
                "packs": opt.get("packs"),
                "size": opt.get("size"),
                "unit": opt.get("unit"),
                "is_best": i == 0,
                "savings": highest_price - opt.get("price")
            })

    # -----------------------------
    # 🏪 STORE VIEW
    # -----------------------------
    store_view = {}

    for item, options in price_matrix.items():
        for opt in options:
            store = opt.get("store")

            if store not in store_view:
                store_view[store] = {}

            if (
                item not in store_view[store] or
                opt["price"] < store_view[store][item]["price"]
            ):
                store_view[store][item] = opt

    # -----------------------------
    # ✅ FINAL RESPONSE
    # -----------------------------
    return {
        "stores": stores,
        "total": optimized_total,
        "savings": savings,
        "comparison": comparison,
        "store_view": store_view
    }
    
# -----------------------------
#  PRODUCT UPDATE
# -----------------------------
@router.post("/store/products/update")
async def update_product(data: dict):
    from app.db.database import get_db
    db = await get_db()

    # 🔥 SAFE EXTRACTION
    store_id = data.get("store_id")
    product_id = data.get("product_id")
    brand = data.get("brand")
    variant = data.get("variant")
    size = data.get("size")
    price = data.get("price")
    stock = data.get("stock", 1)

    print("🧠 UPDATE PAYLOAD:", data)

    # ❌ FAIL FAST (IMPORTANT)
    if not store_id or not product_id:
        return {"error": "Missing store_id or product_id"}

    await db.execute("""
        UPDATE store_products
        SET price = $1,
            stock = $2,
            updated_at = NOW()
        WHERE store_id = $3
        AND product_id = $4
        AND brand IS NOT DISTINCT FROM $5
        AND variant IS NOT DISTINCT FROM $6
        AND size IS NOT DISTINCT FROM $7
    """,
        price,
        stock,
        store_id,
        product_id,
        brand,
        variant,
        size
    )

    return {"status": "ok"}

# -----------------------------
#  PRODUCT listing by store
# -----------------------------
@router.get("/store/products")
async def get_store_products(store_id: int):
    from app.db.database import get_db
    db = await get_db()

    rows = await db.fetch("""
        SELECT 
            pr.id as product_id,
            pr.name,
            sp.brand,
            sp.variant,
            sp.size,
            sp.unit,
            sp.price,
            sp.stock
        FROM store_products sp
        JOIN products pr ON sp.product_id = pr.id
        WHERE sp.store_id = $1
        ORDER BY pr.name
    """, store_id)

    return [dict(r) for r in rows]
    
# -----------------------------
# ?? WHATSAPP WEBHOOK
# -----------------------------
@router.post("/webhook")
async def whatsapp_webhook(data: dict):
    print("?? Incoming webhook:", data)

    try:
        from app.core.ws_manager import manager
        from app.db.database import get_db
        import re

        db = await get_db()

        entry = data.get("entry", [])
        changes = entry[0].get("changes", []) if entry else []
        value = changes[0].get("value", {}) if changes else {}
        messages = value.get("messages", [])

        if not messages:
            return {"status": "no message"}

        message = messages[0]
        text = message.get("text", {}).get("body", "").strip().lower()
        phone = message.get("from")

        match = re.search(r"\d+", text)
        if not match:
            return {"status": "invalid"}

        final_order_id = int(match.group())

        # FIND STORE ORDER
        row = await db.fetchrow("""
            SELECT id FROM store_orders
            WHERE final_order_id = $1 AND store_phone = $2
        """, final_order_id, phone)

        if not row:
            return {"status": "store not found"}

        store_order_id = row["id"]

        # STATUS
        if text.startswith("yes"):
            status = "ACCEPTED"
        elif text.startswith("ready"):
            status = "READY"
        else:
            return {"status": "ignored"}

        # UPDATE STORE
        await db.execute("""
            UPDATE store_orders
            SET status = $1, updated_at = NOW()
            WHERE id = $2
        """, status, store_order_id)

        await db.execute("""
            INSERT INTO store_order_events (store_order_id, status)
            VALUES ($1, $2)
        """, store_order_id, status)

        # GET CUSTOMER
        row = await db.fetchrow("""
            SELECT fo.customer_phone
            FROM store_orders so
            JOIN final_orders fo ON so.final_order_id = fo.id
            WHERE so.id = $1
        """, store_order_id)

        customer_phone = row["customer_phone"]

        # SEND CUSTOMER MESSAGE
        if status == "ACCEPTED":
            await send_message(customer_phone, f"? Order #{final_order_id} accepted")

        if status == "READY":
            await send_message(customer_phone, f"?? Order #{final_order_id} READY for pickup")

        # FINAL STATUS
        statuses = await db.fetch("""
            SELECT status FROM store_orders WHERE final_order_id = $1
        """, final_order_id)

        status_list = [s["status"] for s in statuses]

        if all(s == "READY" for s in status_list):
            final_status = "READY"
        elif any(s == "READY" for s in status_list):
            final_status = "PARTIAL_READY"
        elif all(s == "ACCEPTED" for s in status_list):
            final_status = "ACCEPTED"
        else:
            final_status = "PROCESSING"

        await db.execute("""
            UPDATE final_orders
            SET status = $1
            WHERE id = $2
        """, final_status, final_order_id)

        # ?? REALTIME UPDATE
        await manager.broadcast(0, {
            "type": "status_update",
            "final_order_id": final_order_id,
            "status": final_status
        })

    except Exception as e:
        print("?? Webhook error:", e)

    return {"status": "ok"}

#############
# Admin Messages for WhatsApp Messages
##############
@router.get("/admin/messages")
async def get_whatsapp_messages():
    from app.db.database import get_db
    db = await get_db()

    rows = await db.fetch("""
        SELECT 
            id,
            phone,
            message,
            status,
            attempts,
            created_at,
            sent_at
        FROM whatsapp_messages
        ORDER BY id DESC
        LIMIT 100
    """)

    return [dict(r) for r in rows]

#############
# Admin Retry Messages from Admin
##############
@router.post("/admin/retry-message/{msg_id}")
async def retry_message(msg_id: int):
    from app.db.database import get_db
    from app.services.whatsapp import send_message

    db = await get_db()

    row = await db.fetchrow("""
        SELECT phone, message
        FROM whatsapp_messages
        WHERE id = $1
    """, msg_id)

    if not row:
        return {"error": "Message not found"}

    await send_message(row["phone"], row["message"], msg_id)

    return {"status": "retry_sent"}

#############################
# Admin Message Analytics
##############################
@router.get("/admin/message-analytics")
async def message_analytics():
    from app.db.database import get_db
    db = await get_db()

    rows = await db.fetch("""
        SELECT status, COUNT(*) as count
        FROM whatsapp_messages
        GROUP BY status
    """)

    stats = {r["status"]: r["count"] for r in rows}

    total = sum(stats.values()) or 1

    return {
        "total": total,
        "sent": stats.get("SENT", 0),
        "delivered": stats.get("DELIVERED", 0),
        "read": stats.get("READ", 0),
        "failed": stats.get("FAILED", 0),
        "delivery_rate": round(stats.get("DELIVERED", 0) * 100 / total, 2),
        "read_rate": round(stats.get("READ", 0) * 100 / total, 2),
        "failure_rate": round(stats.get("FAILED", 0) * 100 / total, 2)
    }

#############################
# Admin Store Performance
##############################
@router.get("/admin/store-performance")
async def store_performance():
    from app.db.database import get_db
    db = await get_db()

    rows = await db.fetch("""
        SELECT 
            so.store_name,
            COUNT(*) as total_orders
        FROM store_orders so
        GROUP BY so.store_name
        ORDER BY total_orders DESC
    """)

    return [dict(r) for r in rows]