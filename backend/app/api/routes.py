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
async def create_order(
    data: dict,
    background_tasks: BackgroundTasks,
    request: Request,
    token: str = None,
):
    db = await get_db()

    # Auth required (token via query or body)
    session_token = token or data.get("token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Login required to place an order")

    from app.api.auth import get_current_user
    from app.services.order_status import ensure_order_schema, set_final_order_status
    from app.services.abuse import (
        assert_order_rate_limit,
        assert_can_place_order,
        client_ip,
        record_abuse_event,
    )
    from app.utils.phone import normalize_phone, phone_tail

    user = await get_current_user(session_token, db)
    phone = normalize_phone(user["phone"])

    # Ignore/override client-supplied phone — always use the logged-in user
    body_phone = data.get("phone")
    if body_phone and phone_tail(body_phone) != phone_tail(phone):
        raise HTTPException(status_code=403, detail="Phone does not match logged-in user")

    stores = data.get("stores", [])
    if not stores:
        raise HTTPException(status_code=400, detail="No stores")

    print("🔥 ORDER API HIT")

    from app.services.payments import (
        payments_enabled,
        ensure_payment_schema,
        create_razorpay_order,
        razorpay_key_id,
    )
    from app.services.abuse import assert_first_order_caps, assert_profile_complete
    from app.api.payments import queue_order_notifications

    await ensure_order_schema(db)
    await ensure_payment_schema(db)
    await assert_can_place_order(phone, db=db)
    await assert_profile_complete(user, db=db)
    await assert_first_order_caps(phone, stores, db=db)
    ip = client_ip(request)
    await assert_order_rate_limit(phone, ip=ip, db=db)

    require_pay = payments_enabled()
    result = await create_full_order(stores, phone, awaiting_payment=require_pay)
    final_order_id, track_token, whatsapp_jobs, order_total = result
    await record_abuse_event("order", phone=phone, ip=ip, db=db)

    # -----------------------------
    # 💳 UPI REQUIRED (Razorpay) — stores notified only after pay
    # -----------------------------
    if require_pay:
        try:
            rz = await create_razorpay_order(
                order_total,
                receipt=f"ekkilo_{final_order_id}",
                notes={"final_order_id": str(final_order_id), "phone": phone},
            )
        except Exception as e:
            print(f"❌ Razorpay create failed: {e}")
            raise HTTPException(
                status_code=502,
                detail="Could not start UPI payment. Please try again in a moment.",
            )

        await db.execute("""
            UPDATE final_orders
            SET payment_status = 'PENDING',
                razorpay_order_id = $2,
                total_amount = $3,
                status = 'PENDING_PAYMENT',
                updated_at = NOW()
            WHERE id = $1
        """, final_order_id, rz.get("id"), order_total)

        return {
            "final_order_id": final_order_id,
            "track_token": track_token,
            "payment_required": True,
            "payment": {
                "key_id": razorpay_key_id(),
                "razorpay_order_id": rz.get("id"),
                "amount": rz.get("amount"),  # paise
                "currency": rz.get("currency") or "INR",
                "total_rupees": order_total,
            },
        }

    # -----------------------------
    # Legacy: no Razorpay keys → confirm + notify immediately
    # -----------------------------
    print("⚠️ Payments disabled (no RAZORPAY keys) — confirming order without UPI")
    await set_final_order_status(final_order_id, "CONFIRMED", db=db)
    await db.execute("""
        UPDATE final_orders
        SET payment_status = 'SKIPPED', total_amount = $2, updated_at = NOW()
        WHERE id = $1
    """, final_order_id, order_total)
    await queue_order_notifications(final_order_id, background_tasks, db=db)

    return {
        "final_order_id": final_order_id,
        "track_token": track_token,
        "payment_required": False,
    }

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
            # Use real_price (excludes internal ranking penalties)
            price = p.get("real_price", p.get("price", 0))

            items.append({
                "name": p.get("name", ""),
                "display_name": p.get("display_name") or p.get("name", ""),
                "brand": p.get("brand"),
                "variant": p.get("variant"),
                "preferred_brand": p.get("preferred_brand"),
                "brand_match": p.get("brand_match", True),
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
        total_price = sum(p.get("real_price", p.get("price", 0)) for p in products)
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
            display_price = opt.get("real_price", opt.get("price"))
            comparison[item].append({
                "store": opt.get("store"),
                "price": display_price,
                "packs": opt.get("packs"),
                "size": opt.get("size"),
                "unit": opt.get("unit"),
                "brand": opt.get("brand"),
                "variant": opt.get("variant"),
                "display_name": opt.get("display_name") or opt.get("name"),
                "preferred_brand": opt.get("preferred_brand"),
                "brand_match": opt.get("brand_match", True),
                "is_best": i == 0,
                "savings": highest_price - opt.get("price", 0)
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

            # Rank with internal price (includes brand preference penalties),
            # but expose real_price to the UI.
            rank_price = opt.get("price", 0)
            existing = store_view[store].get(item)
            existing_rank = existing.get("_rank_price", existing.get("price", float("inf"))) if existing else float("inf")

            if item not in store_view[store] or rank_price < existing_rank:
                view_opt = dict(opt)
                view_opt["_rank_price"] = rank_price
                view_opt["price"] = opt.get("real_price", opt.get("price", 0))
                store_view[store][item] = view_opt

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
                price = item_data.get("real_price", item_data.get("price", 0))
                items.append({
                    "name": item_name,
                    "display_name": item_data.get("display_name") or item_name,
                    "brand": item_data.get("brand"),
                    "variant": item_data.get("variant"),
                    "preferred_brand": item_data.get("preferred_brand"),
                    "brand_match": item_data.get("brand_match", True),
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

    # Strip internal ranking keys from store_view before response
    for store_items in store_view.values():
        for item_opt in store_items.values():
            item_opt.pop("_rank_price", None)

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



# Customer order tracking: GET /api/orders/track (see orders.py)
# Access via unguessable ?t=track_token or logged-in ?order_id=&token=