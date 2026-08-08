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
    # ✅ WEB ORDERS AUTO-CONFIRMED
    # -----------------------------
    await db.execute("""
        INSERT INTO final_order_events (final_order_id, status)
        VALUES ($1, 'CONFIRMED')
    """, final_order_id)

    # -----------------------------
    # 📲 STORE MESSAGES
    # -----------------------------
    for store_phone, message in whatsapp_jobs:

        row = await db.fetchrow("""
         INSERT INTO whatsapp_messages (phone, message)
              VALUES ($1, $2)
              RETURNING id
            """, store_phone, message)

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
            """, phone, customer_message)

    msg_id = row["id"]
    print("📤 Queue customer message:", phone)

    background_tasks.add_task(send_message, phone, customer_message, msg_id)

    return {"final_order_id": final_order_id}

# OLD ADMIN & TRACKING ROUTES REMOVED
# All functionality now available in:
# - Admin Portal: /api/admin/orders (with authentication)
# - New Tracking: /api/orders/track (at end of file)

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
    # 🏪 FETCH ALL STORES (not just optimized ones!)
    # -----------------------------
    # Get ALL stores from price_matrix, not just optimized plan
    all_store_names = set()
    for item, options in price_matrix.items():
        for opt in options:
            store_name = opt.get("store")
            if store_name:
                all_store_names.add(store_name)
    
    store_names = list(all_store_names)
    print(f"🏪 ALL STORES from price_matrix: {store_names}")
    print(f"🏪 OPTIMIZED STORES: {list(optimized.keys())}")

    if user_lat and user_lng and store_names:
        rows = await db.fetch("""
            SELECT 
                id,
                name,
                phone,
                lat,
                lng,
                CASE 
                    WHEN lat IS NOT NULL AND lng IS NOT NULL THEN
                        (
                            6371 * acos(
                                cos(radians($1)) * cos(radians(lat)) *
                                cos(radians(lng) - radians($2)) +
                                sin(radians($1)) * sin(radians(lat))
                            )
                        )
                    ELSE NULL
                END AS distance
            FROM stores
            WHERE name = ANY($3)
        """, user_lat, user_lng, store_names)

        store_map = {
            r["name"]: {
                "id": r["id"],
                "phone": r["phone"],
                "lat": r["lat"],
                "lng": r["lng"],
                "distance": float(r["distance"]) if r["distance"] else None
            }
            for r in rows
        }

    else:
        rows = await db.fetch("""
            SELECT id, name, phone, lat, lng 
            FROM stores 
            WHERE name = ANY($1)
        """, store_names)

        store_map = {
            r["name"]: {
                "id": r["id"],
                "phone": r["phone"],
                "lat": r["lat"],
                "lng": r["lng"]
            }
            for r in rows
        }

    # -----------------------------
    # 🏪 BUILD STORE PLAN (Include ALL stores, not just optimized)
    # -----------------------------
    stores = []

    # First, add optimized stores with their optimized items
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
                "phone": p.get("phone"),   # 🔥 IMPORTANT
                "available": p.get("available", True)  # Stock status
            })

            store_total += price

        store_obj = {
            "store": store,
            "store_id": store_data.get("id"),
            "store_phone": store_phone,
            "items": items,
            "total": store_total,
            "is_optimized": True  # Mark as part of optimized plan
        }

        if store_data.get("distance") is not None:
            store_obj["distance"] = round(store_data["distance"], 2)

        stores.append(store_obj)

    # -----------------------------
    # 📍 FILTER BY DISTANCE
    # -----------------------------
    if user_lat and user_lng:
        filtered_stores = [
            s for s in stores
            if "distance" not in s or s["distance"] <= radius
        ]
        # Keep filtered stores only if at least one remains, otherwise keep all
        if filtered_stores:
            stores = filtered_stores

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
    # 🏪 ADD NON-OPTIMIZED STORES (for Manual/Regular/Favorites modes)
    # -----------------------------
    optimized_store_names = set(optimized.keys())
    for store_name in store_names:
        if store_name not in optimized_store_names:
            store_data = store_map.get(store_name, {})
            
            # Get items for this store from store_view
            store_items_data = store_view.get(store_name, {})
            if not store_items_data:
                continue
            
            items = []
            store_total = 0
            
            for item_name, item_data in store_items_data.items():
                price = item_data.get("price", 0)
                items.append({
                    "name": item_name,
                    "packs": item_data.get("packs", 1),
                    "size": item_data.get("size", 1),
                    "unit": item_data.get("unit", ""),
                    "price": price,
                    "phone": item_data.get("phone"),
                    "available": item_data.get("available", True)
                })
                store_total += price
            
            store_obj = {
                "store": store_name,
                "store_id": store_data.get("id"),
                "store_phone": store_data.get("phone"),
                "items": items,
                "total": store_total,
                "is_optimized": False  # Not part of optimized plan
            }
            
            if store_data.get("distance") is not None:
                store_obj["distance"] = round(store_data["distance"], 2)
            
            stores.append(store_obj)
    
    print(f"🏪 TOTAL STORES in response: {len(stores)} (optimized: {len(optimized)}, all: {len(store_names)})")

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
    
# OLD STORE PRODUCT UPDATE ROUTE REMOVED
# Use Store Portal: /api/store/products (PATCH) with authentication

# -----------------------------
#  SEARCH MASTER PRODUCTS CATALOG
# -----------------------------
@router.get("/api/products")
async def search_master_products(search: str = ""):
    from app.db.database import get_db
    db = await get_db()
    
    if search:
        rows = await db.fetch("""
            SELECT id, name, brand, variant, size, unit
            FROM products
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY name
            LIMIT 50
        """, f"%{search}%")
    else:
        rows = await db.fetch("""
            SELECT id, name, brand, variant, size, unit
            FROM products
            ORDER BY name
            LIMIT 50
        """)
    
    return [dict(r) for r in rows]

# OLD PRODUCTS BY STORE ROUTE REMOVED
# Use Store Portal: /api/store/products (GET) with authentication
    
# Note: Webhook endpoint moved to whatsapp.py for better organization
# The /whatsapp/webhook endpoint handles all WhatsApp webhook callbacks



#############################
# CUSTOMER ORDER TRACKING
##############################
@router.get("/api/orders/track")
async def track_order(phone: str = None, order_id: int = None):
    """Track order status by phone or order ID (public endpoint)"""
    from app.db.database import get_db
    db = await get_db()
    
    if not phone and not order_id:
        raise HTTPException(status_code=400, detail="Provide phone or order_id")
    
    if order_id:
        # Track specific order
        order = await db.fetchrow("""
            SELECT fo.id, fo.customer_phone, fo.created_at, fo.status as order_status,
                   COUNT(DISTINCT so.id) as store_count,
                   COUNT(DISTINCT so.id) FILTER (WHERE so.status = 'ACCEPTED') as accepted_count,
                   COUNT(DISTINCT so.id) FILTER (WHERE so.status = 'READY') as ready_count,
                   COALESCE(SUM(so.total_amount), 0) as total_amount
            FROM final_orders fo
            LEFT JOIN store_orders so ON fo.id = so.final_order_id
            WHERE fo.id = $1
            GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status
        """, order_id)
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Get store details
        stores = await db.fetch("""
            SELECT so.id, so.store_name, so.store_phone, so.status,
                   so.total_amount, so.created_at, so.updated_at
            FROM store_orders so
            WHERE so.final_order_id = $1
            ORDER BY so.id
        """, order_id)
        
        # Get items for each store
        stores_with_items = []
        for store in stores:
            items = await db.fetch("""
                SELECT product_name, quantity, price
                FROM order_items
                WHERE store_order_id = $1
            """, store["id"])
            
            stores_with_items.append({
                **dict(store),
                "items": [dict(item) for item in items]
            })
        
        return {
            **dict(order),
            "stores": stores_with_items
        }
    
    elif phone:
        # Get all orders for this customer
        orders = await db.fetch("""
            SELECT fo.id, fo.customer_phone, fo.created_at, fo.status as order_status,
                   COUNT(DISTINCT so.id) as store_count,
                   COUNT(DISTINCT so.id) FILTER (WHERE so.status = 'READY') as ready_count,
                   COALESCE(SUM(so.total_amount), 0) as total_amount
            FROM final_orders fo
            LEFT JOIN store_orders so ON fo.id = so.final_order_id
            WHERE fo.customer_phone = $1
            GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status
            ORDER BY fo.created_at DESC
            LIMIT 20
        """, phone)
        
        return [dict(o) for o in orders]