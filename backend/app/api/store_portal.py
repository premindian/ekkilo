from fastapi import APIRouter, HTTPException, UploadFile, File
from app.db.database import get_db
from app.api.auth import get_current_user
from app.services.product_images import file_to_data_url, validate_image_url
from app.services.staff_audit import log_staff_action
from datetime import datetime, timedelta

router = APIRouter(prefix="/store", tags=["store-portal"])


# ============================================
# HELPER: Get store from token
# ============================================
async def get_store_from_token(token: str):
    """Verify user is a store owner and return store info"""
    db = await get_db()
    
    # Get current user
    user = await get_current_user(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check if user is a store owner
    user_data = await db.fetchrow("""
        SELECT u.*, s.name as store_name, s.phone as store_phone,
               s.lat, s.lng
        FROM users u
        LEFT JOIN stores s ON u.store_id = s.id
        WHERE u.id = $1 AND u.is_store_owner = TRUE
    """, user["id"])
    
    if not user_data or not user_data["store_id"]:
        raise HTTPException(status_code=403, detail="Not authorized as store owner")
    
    return dict(user_data)


# ============================================
# DASHBOARD - Today's Summary
# ============================================
@router.get("/dashboard")
async def get_store_dashboard(token: str):
    """Get store dashboard with today's stats and pending orders"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    # Today's date range
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get today's stats
    stats = await db.fetchrow("""
        SELECT 
            COUNT(*) as total_orders,
            COUNT(*) FILTER (WHERE status = 'PENDING') as pending_orders,
            COUNT(*) FILTER (WHERE status = 'ACCEPTED') as accepted_orders,
            COUNT(*) FILTER (WHERE status = 'READY') as ready_orders,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_orders
        FROM store_orders
        WHERE store_id = $1 
        AND created_at >= $2
    """, store_id, today_start)
    
    # Get pending orders (need action)
    pending_orders = await db.fetch("""
        SELECT 
            so.id,
            fo.id as final_order_id,
            fo.customer_phone,
            so.store_name,
            so.status,
            so.created_at
        FROM store_orders so
        JOIN final_orders fo ON so.final_order_id = fo.id
        WHERE so.store_id = $1 
        AND so.status IN ('PENDING', 'ACCEPTED')
        AND so.status <> 'AWAITING_PAYMENT'
        ORDER BY so.created_at DESC
        LIMIT 10
    """, store_id)
    
    # Get low stock products
    low_stock = await db.fetch("""
        SELECT 
            p.name as product_name,
            sp.brand,
            sp.variant,
            sp.size,
            sp.unit,
            sp.stock,
            sp.price
        FROM store_products sp
        JOIN products p ON sp.product_id = p.id
        WHERE sp.store_id = $1 
        AND sp.stock < 5
        ORDER BY sp.stock ASC
        LIMIT 10
    """, store_id)
    
    return {
        "store": {
            "id": store_id,
            "name": store_owner["store_name"],
            "phone": store_owner["store_phone"]
        },
        "stats": dict(stats) if stats else {},
        "pending_orders": [dict(o) for o in pending_orders],
        "low_stock_products": [dict(p) for p in low_stock]
    }


# ============================================
# ORDERS - View & Manage
# ============================================
@router.get("/orders")
async def get_store_orders(
    token: str, 
    status: str = None,
    limit: int = 50,
    offset: int = 0
):
    """Get store's orders with optional status filter"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    query = """
        SELECT
            so.id,
            fo.id as final_order_id,
            fo.customer_phone,
            so.store_name,
            so.status,
            so.total_amount,
            so.created_at,
            so.updated_at,
            COALESCE((
                SELECT json_agg(json_build_object(
                    'name', oi.product_name,
                    'quantity', oi.quantity,
                    'packs', oi.quantity,
                    'price', oi.price
                ))
                FROM order_items oi
                WHERE oi.store_order_id = so.id
            ), '[]'::json) as store_items
        FROM store_orders so
        JOIN final_orders fo ON so.final_order_id = fo.id
        WHERE so.store_id = $1
    """
    
    params = [store_id]
    
    if status:
        query += " AND so.status = $2"
        params.append(status.upper())
        query += " ORDER BY so.created_at DESC LIMIT $3 OFFSET $4"
        params.extend([limit, offset])
    else:
        # Hide unpaid held orders from store portal
        query += " AND so.status <> 'AWAITING_PAYMENT'"
        query += " ORDER BY so.created_at DESC LIMIT $2 OFFSET $3"
        params.extend([limit, offset])
    
    orders = await db.fetch(query, *params)
    
    return [dict(o) for o in orders]


@router.get("/orders/{order_id}")
async def get_order_details(order_id: int, token: str):
    """Get detailed information about a specific order"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    # Get order with items
    order = await db.fetchrow("""
        SELECT so.id, so.store_name, so.store_phone, so.status,
               so.total_amount, so.created_at, so.updated_at,
               fo.id as final_order_id, fo.customer_phone
        FROM store_orders so
        JOIN final_orders fo ON so.final_order_id = fo.id
        WHERE so.id = $1 AND so.store_id = $2
    """, order_id, store_id)
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get items
    items = await db.fetch("""
        SELECT product_name, quantity, price
        FROM order_items
        WHERE store_order_id = $1
    """, order_id)
    
    # Get status history
    history = await db.fetch("""
        SELECT status, created_at
        FROM store_order_events
        WHERE store_order_id = $1
        ORDER BY created_at DESC
    """, order_id)
    
    return {
        **dict(order),
        "items": [dict(item) for item in items],
        "history": [dict(h) for h in history]
    }


@router.patch("/orders/{order_id}")
async def update_store_order(order_id: int, data: dict, token: str):
    """Update order status (ACCEPT, READY, etc.)"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    # Verify order belongs to this store
    order = await db.fetchrow("""
        SELECT * FROM store_orders 
        WHERE id = $1 AND store_id = $2
    """, order_id, store_id)
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    new_status = data.get("status", "").upper()
    if new_status in ("NOSHOW", "NO-SHOW"):
        new_status = "NO_SHOW"
    allowed_statuses = ["ACCEPTED", "READY", "REJECTED", "COMPLETED", "DELAY", "NO_SHOW"]
    
    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status. Allowed: {allowed_statuses}"
        )
    
    from app.services.order_status import (
        ensure_order_schema,
        set_store_order_status,
        update_final_order_status,
        notify_customer_status,
        notify_customer_accept,
        apply_store_delay,
        DEFAULT_ETA_MINUTES,
    )

    await ensure_order_schema(db)
    final_order_id = order["final_order_id"]

    # Portal "running late" — use store WhatsApp path with owner phone fallback
    if new_status == "DELAY":
        store_phone = (
            order.get("store_phone")
            or store_owner.get("store_phone")
            or store_owner.get("phone")
        )
        result = await apply_store_delay(
            final_order_id,
            store_phone,
            str(data.get("note") or data.get("eta") or "15m"),
            db=db,
        )
        # If phone match fails, still update this store_order directly
        if not result.get("ok"):
            from app.services.order_status import parse_eta_minutes, format_eta_label, get_track_url
            from app.services.whatsapp import send_message
            from app.utils.phone import normalize_phone

            rest = str(data.get("note") or data.get("eta") or "15m")
            extra = parse_eta_minutes(rest) or 15
            reason = rest if not parse_eta_minutes(rest) else "packing is taking longer than expected"
            from datetime import datetime, timedelta, timezone
            ready_by = datetime.now(timezone.utc) + timedelta(minutes=extra)
            await db.execute("""
                UPDATE store_orders
                SET status = CASE WHEN status = 'PENDING' THEN 'ACCEPTED' ELSE status END,
                    accepted_at = COALESCE(accepted_at, NOW()),
                    ready_by = $2,
                    delay_note = $3,
                    delay_notified_at = NOW(),
                    late_ping_sent_at = NULL,
                    updated_at = NOW()
                WHERE id = $1
            """, order_id, ready_by, reason)
            customer = await db.fetchrow(
                "SELECT customer_phone FROM final_orders WHERE id = $1", final_order_id
            )
            if customer and customer.get("customer_phone"):
                track_url = await get_track_url(final_order_id, db=db)
                await send_message(
                    normalize_phone(customer["customer_phone"]),
                    f"⏳ Order #{final_order_id} update from {order.get('store_name') or 'your store'}:\n"
                    f"{reason}.\n"
                    f"New estimate: about {format_eta_label(extra)} from now.\n\n"
                    f"Track: {track_url}",
                )
            await log_staff_action(
                actor=store_owner,
                action="order.delay",
                entity_type="store_order",
                entity_id=order_id,
                details={"final_order_id": final_order_id, "reason": reason},
                store_id=store_id,
                db=db,
            )
            return {"status": "delayed", "message": f"Customer notified (+{format_eta_label(extra)})"}
        await log_staff_action(
            actor=store_owner,
            action="order.delay",
            entity_type="store_order",
            entity_id=order_id,
            details={"final_order_id": final_order_id},
            store_id=store_id,
            db=db,
        )
        return {"status": "delayed", "message": result.get("message")}

    eta_minutes = data.get("eta_minutes")
    try:
        eta_minutes = int(eta_minutes) if eta_minutes is not None else None
    except (TypeError, ValueError):
        eta_minutes = None

    if new_status == "NO_SHOW":
        current = (order.get("status") or "").upper()
        if current == "NO_SHOW":
            return {"status": "success", "new_status": "NO_SHOW", "final_status": None, "already": True}
        if current != "READY":
            raise HTTPException(
                status_code=400,
                detail=f"NO_SHOW only after READY (current: {current})",
            )

    if new_status == "ACCEPTED":
        await set_store_order_status(
            order_id, new_status, db=db, eta_minutes=eta_minutes or DEFAULT_ETA_MINUTES
        )
    else:
        await set_store_order_status(order_id, new_status, db=db)

    final_status, notify_customer = await update_final_order_status(final_order_id, db=db)

    if new_status == "ACCEPTED":
        try:
            await notify_customer_accept(
                final_order_id,
                order.get("store_name"),
                eta_minutes or DEFAULT_ETA_MINUTES,
                db=db,
            )
        except Exception as e:
            print(f"⚠️ Portal accept notify failed: {e}")
    elif new_status == "NO_SHOW":
        try:
            from app.services.abuse import record_no_show
            from app.services.whatsapp import send_message
            from app.utils.phone import normalize_phone

            customer = await db.fetchrow(
                "SELECT customer_phone FROM final_orders WHERE id = $1", final_order_id
            )
            cust_phone = normalize_phone(customer["customer_phone"]) if customer else None
            trust = {}
            if cust_phone:
                trust = await record_no_show(
                    cust_phone, final_order_id, store_order_id=order_id, db=db
                )
                if trust.get("customer_message"):
                    await send_message(cust_phone, trust["customer_message"])
            await log_staff_action(
                actor=store_owner,
                action="order.no_show",
                entity_type="store_order",
                entity_id=order_id,
                details={"final_order_id": final_order_id, "strikes": trust.get("strikes")},
                store_id=store_id,
                db=db,
            )
            return {
                "status": "success",
                "new_status": new_status,
                "final_status": final_status,
                "strikes": trust.get("strikes"),
                "action": trust.get("action"),
                "message": trust.get("store_message"),
            }
        except Exception as e:
            print(f"⚠️ Portal no-show handling failed: {e}")
    elif notify_customer:
        await notify_customer_status(
            final_order_id,
            final_status,
            store_name=order.get("store_name"),
            db=db,
        )

    await log_staff_action(
        actor=store_owner,
        action=f"order.{new_status.lower()}",
        entity_type="store_order",
        entity_id=order_id,
        details={"final_order_id": final_order_id, "final_status": final_status},
        store_id=store_id,
        db=db,
    )
    return {"status": "success", "new_status": new_status, "final_status": final_status}


# ============================================
# PRODUCTS - View & Manage
# ============================================
@router.get("/products")
async def get_store_products(token: str, search: str = None):
    """Get all products for this store"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    query = """
        SELECT 
            sp.id,
            p.id as product_id,
            p.name as product_name,
            p.image_url,
            sp.brand,
            sp.variant,
            sp.size,
            sp.unit,
            sp.price,
            sp.stock,
            sp.updated_at
        FROM store_products sp
        JOIN products p ON sp.product_id = p.id
        WHERE sp.store_id = $1
    """
    
    params = [store_id]
    
    if search:
        query += " AND LOWER(p.name) LIKE LOWER($2)"
        params.append(f"%{search}%")
    
    query += " ORDER BY p.name"
    
    products = await db.fetch(query, *params)
    
    return [dict(p) for p in products]


@router.patch("/products/{product_id}")
async def update_store_product(product_id: int, data: dict, token: str):
    """Update product price and stock"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    # Verify product belongs to this store
    product = await db.fetchrow("""
        SELECT * FROM store_products 
        WHERE id = $1 AND store_id = $2
    """, product_id, store_id)
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    price = data.get("price")
    stock = data.get("stock")
    
    if price is not None:
        await db.execute("""
            UPDATE store_products
            SET price = $1, updated_at = NOW()
            WHERE id = $2
        """, price, product_id)
    
    if stock is not None:
        await db.execute("""
            UPDATE store_products
            SET stock = $1, updated_at = NOW()
            WHERE id = $2
        """, stock, product_id)

    await log_staff_action(
        actor=store_owner,
        action="store_product.update",
        entity_type="store_product",
        entity_id=product_id,
        details={"price": price, "stock": stock, "master_product_id": product.get("product_id")},
        store_id=store_id,
        db=db,
    )
    
    return {"status": "success"}


@router.post("/products/{product_id}/image")
async def upload_store_product_image(product_id: int, token: str, file: UploadFile = File(...)):
    """Upload catalog photo for a SKU this store sells (updates master products.image_url)."""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    db = await get_db()
    row = await db.fetchrow("""
        SELECT p.id AS master_id
        FROM store_products sp
        JOIN products p ON p.id = sp.product_id
        WHERE sp.id = $1 AND sp.store_id = $2
    """, product_id, store_id)
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    data_url = await file_to_data_url(file)
    await db.execute(
        "UPDATE products SET image_url = $1 WHERE id = $2",
        data_url,
        row["master_id"],
    )
    await log_staff_action(
        actor=store_owner,
        action="product.image_upload",
        entity_type="product",
        entity_id=row["master_id"],
        details={"store_product_id": product_id, "filename": file.filename},
        store_id=store_id,
        db=db,
    )
    return {"status": "success", "has_image": True}


@router.patch("/products/{product_id}/image-url")
async def set_store_product_image_url(product_id: int, data: dict, token: str):
    """Set or clear catalog image via URL for a SKU this store sells."""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    db = await get_db()
    row = await db.fetchrow("""
        SELECT p.id AS master_id
        FROM store_products sp
        JOIN products p ON p.id = sp.product_id
        WHERE sp.id = $1 AND sp.store_id = $2
    """, product_id, store_id)
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    image_url = validate_image_url(data.get("image_url"))
    await db.execute(
        "UPDATE products SET image_url = $1 WHERE id = $2",
        image_url,
        row["master_id"],
    )
    return {"status": "success", "has_image": bool(image_url)}


@router.post("/products")
async def add_store_product(data: dict, token: str):
    """Add new product to store inventory"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    product_id = data.get("product_id")
    price = data.get("price")
    stock = data.get("stock", 0)
    
    if not product_id or not price:
        raise HTTPException(status_code=400, detail="product_id and price required")
    
    # Check if product already exists for this store
    existing = await db.fetchrow("""
        SELECT id FROM store_products 
        WHERE store_id = $1 AND product_id = $2
    """, store_id, product_id)
    
    if existing:
        raise HTTPException(status_code=400, detail="Product already exists in your store")
    
    # Get product details
    product = await db.fetchrow("""
        SELECT * FROM products WHERE id = $1
    """, product_id)
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Add to store
    await db.execute("""
        INSERT INTO store_products (store_id, product_id, brand, variant, size, unit, price, stock, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    """, store_id, product_id, product.get("brand", ""), product.get("variant", ""), 
        product.get("size", 1), product.get("unit", "unit"), price, stock)

    await log_staff_action(
        actor=store_owner,
        action="store_product.add",
        entity_type="product",
        entity_id=product_id,
        details={"price": price, "stock": stock, "name": product.get("name")},
        store_id=store_id,
        db=db,
    )
    
    return {"status": "success"}


@router.delete("/products/{product_id}")
async def remove_store_product(product_id: int, token: str):
    """Remove product from store inventory"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    # Verify product belongs to this store
    product = await db.fetchrow("""
        SELECT * FROM store_products 
        WHERE id = $1 AND store_id = $2
    """, product_id, store_id)
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Delete product
    await db.execute("""
        DELETE FROM store_products WHERE id = $1
    """, product_id)

    await log_staff_action(
        actor=store_owner,
        action="store_product.remove",
        entity_type="store_product",
        entity_id=product_id,
        details={"master_product_id": product.get("product_id")},
        store_id=store_id,
        db=db,
    )
    
    return {"status": "success"}


# ============================================
# SETTINGS - Store Configuration
# ============================================
@router.get("/settings")
async def get_store_settings(token: str):
    """Get store settings and profile"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    from app.services.delivery import ensure_delivery_schema
    await ensure_delivery_schema(db)
    
    # Get store info
    store = await db.fetchrow("""
        SELECT * FROM stores WHERE id = $1
    """, store_id)
    
    settings = await db.fetchrow("""
        SELECT * FROM store_settings WHERE store_id = $1
    """, store_id)
    
    # Get notification settings
    notifications = await db.fetchrow("""
        SELECT * FROM store_notifications WHERE store_id = $1
    """, store_id) if await db.fetchval("SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'store_notifications')") else None
    
    return {
        "store": dict(store) if store else {},
        "settings": dict(settings) if settings else {},
        "notifications": dict(notifications) if notifications else {}
    }


@router.patch("/settings/profile")
async def update_store_profile(data: dict, token: str):
    """Update store profile information"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    name = data.get("name")
    phone = data.get("phone")
    address = data.get("address")
    lat = data.get("lat")
    lng = data.get("lng")
    description = data.get("description")
    open_time = data.get("open_time")
    close_time = data.get("close_time")
    
    await db.execute("""
        UPDATE stores
        SET name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            address = COALESCE($3, address),
            lat = COALESCE($4, lat),
            lng = COALESCE($5, lng),
            description = COALESCE($6, description),
            open_time = COALESCE($7, open_time),
            close_time = COALESCE($8, close_time)
        WHERE id = $9
    """, name, phone, address, lat, lng, description, open_time, close_time, store_id)

    await log_staff_action(
        actor=store_owner,
        action="store.profile_update",
        entity_type="store",
        entity_id=store_id,
        details={k: data.get(k) for k in ("name", "phone", "address", "lat", "lng", "description", "open_time", "close_time") if k in data},
        store_id=store_id,
        db=db,
    )
    
    return {"status": "success"}


@router.patch("/settings/store")
async def update_store_settings(data: dict, token: str):
    """Update store operational settings"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    from app.services.delivery import ensure_delivery_schema
    await ensure_delivery_schema(db)
    
    delivery_radius = data.get("delivery_radius")
    min_order = data.get("min_order")
    is_open = data.get("is_open")
    auto_accept = data.get("auto_accept_orders")
    delivery_enabled = data.get("delivery_enabled")
    free_delivery_min = data.get("free_delivery_min")
    delivery_fee = data.get("delivery_fee")
    delivery_notes = data.get("delivery_notes")
    
    # Upsert settings
    await db.execute("""
        INSERT INTO store_settings (
            store_id, delivery_radius, min_order, is_open, auto_accept_orders,
            delivery_enabled, free_delivery_min, delivery_fee, delivery_notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (store_id) DO UPDATE SET
            delivery_radius = COALESCE($2, store_settings.delivery_radius),
            min_order = COALESCE($3, store_settings.min_order),
            is_open = COALESCE($4, store_settings.is_open),
            auto_accept_orders = COALESCE($5, store_settings.auto_accept_orders),
            delivery_enabled = COALESCE($6, store_settings.delivery_enabled),
            free_delivery_min = COALESCE($7, store_settings.free_delivery_min),
            delivery_fee = COALESCE($8, store_settings.delivery_fee),
            delivery_notes = COALESCE($9, store_settings.delivery_notes),
            updated_at = NOW()
    """, store_id, delivery_radius, min_order, is_open, auto_accept,
        delivery_enabled, free_delivery_min, delivery_fee, delivery_notes)

    await log_staff_action(
        actor=store_owner,
        action="store.settings_update",
        entity_type="store",
        entity_id=store_id,
        details={
            k: data.get(k)
            for k in (
                "delivery_radius", "min_order", "is_open", "auto_accept_orders",
                "delivery_enabled", "free_delivery_min", "delivery_fee", "delivery_notes",
            )
            if k in data
        },
        store_id=store_id,
        db=db,
    )
    
    return {"status": "success"}


@router.patch("/settings/notifications")
async def update_notification_settings(data: dict, token: str):
    """Update notification preferences"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    # Create store_notifications table if doesn't exist
    await db.execute("""
        CREATE TABLE IF NOT EXISTS store_notifications (
            id SERIAL PRIMARY KEY,
            store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
            whatsapp_enabled BOOLEAN DEFAULT TRUE,
            low_stock_alert BOOLEAN DEFAULT TRUE,
            low_stock_threshold INTEGER DEFAULT 5,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    
    whatsapp_enabled = data.get("whatsapp_enabled")
    low_stock_alert = data.get("low_stock_alert")
    low_stock_threshold = data.get("low_stock_threshold")
    
    # Upsert notification settings
    await db.execute("""
        INSERT INTO store_notifications (store_id, whatsapp_enabled, low_stock_alert, low_stock_threshold)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (store_id) DO UPDATE SET
            whatsapp_enabled = COALESCE($2, store_notifications.whatsapp_enabled),
            low_stock_alert = COALESCE($3, store_notifications.low_stock_alert),
            low_stock_threshold = COALESCE($4, store_notifications.low_stock_threshold),
            updated_at = NOW()
    """, store_id, whatsapp_enabled, low_stock_alert, low_stock_threshold)
    
    return {"status": "success"}


# ============================================
# REPORTS - Sales & Analytics
# ============================================
@router.get("/reports/sales")
async def get_sales_report(
    token: str,
    days: int = 7
):
    """Get sales report for last N days"""
    store_owner = await get_store_from_token(token)
    store_id = store_owner["store_id"]
    
    db = await get_db()
    
    start_date = datetime.now() - timedelta(days=days)
    
    # Daily sales with revenue (+ online vs pay-at-store split)
    daily_sales = await db.fetch("""
        SELECT 
            DATE(so.created_at) as date,
            COUNT(*) as orders,
            COALESCE(SUM(so.total_amount), 0) as sales,
            COALESCE(SUM(
                CASE WHEN UPPER(COALESCE(fo.payment_status, '')) = 'PAID'
                THEN so.total_amount ELSE 0 END
            ), 0) as paid_online,
            COALESCE(SUM(
                CASE WHEN UPPER(COALESCE(fo.payment_status, '')) = 'PAY_AT_STORE'
                  OR LOWER(COALESCE(fo.payment_method, '')) = 'pay_at_store'
                THEN so.total_amount ELSE 0 END
            ), 0) as pay_at_store
        FROM store_orders so
        LEFT JOIN final_orders fo ON fo.id = so.final_order_id
        WHERE so.store_id = $1 
        AND so.created_at >= $2
        AND so.status = 'COMPLETED'
        GROUP BY DATE(so.created_at)
        ORDER BY date DESC
    """, store_id, start_date)
    
    # Total summary
    summary = await db.fetchrow("""
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(so.total_amount), 0) as total_sales,
            COALESCE(AVG(so.total_amount), 0) as avg_order,
            COALESCE(SUM(
                CASE WHEN UPPER(COALESCE(fo.payment_status, '')) = 'PAID'
                THEN so.total_amount ELSE 0 END
            ), 0) as paid_online_sales,
            COALESCE(SUM(
                CASE WHEN UPPER(COALESCE(fo.payment_status, '')) = 'PAY_AT_STORE'
                  OR LOWER(COALESCE(fo.payment_method, '')) = 'pay_at_store'
                THEN so.total_amount ELSE 0 END
            ), 0) as pay_at_store_sales,
            COALESCE(SUM(
                CASE WHEN UPPER(COALESCE(fo.payment_status, '')) = 'PAID'
                THEN 1 ELSE 0 END
            ), 0) as paid_online_orders
        FROM store_orders so
        LEFT JOIN final_orders fo ON fo.id = so.final_order_id
        WHERE so.store_id = $1 
        AND so.created_at >= $2
        AND so.status = 'COMPLETED'
    """, store_id, start_date)
    
    # Top products (simplified - using order_items directly)
    top_products = await db.fetch("""
        SELECT 
            oi.product_name,
            SUM(oi.quantity) as quantity,
            COALESCE(SUM(oi.price * oi.quantity), 0) as revenue
        FROM order_items oi
        JOIN store_orders so ON oi.store_order_id = so.id
        WHERE so.store_id = $1 
        AND so.created_at >= $2
        AND so.status = 'COMPLETED'
        GROUP BY oi.product_name
        ORDER BY quantity DESC
        LIMIT 10
    """, store_id, start_date)

    daily = []
    for d in daily_sales:
        row = dict(d)
        for k in ("sales", "paid_online", "pay_at_store"):
            if row.get(k) is not None:
                row[k] = float(row[k])
        if row.get("date") is not None:
            row["date"] = str(row["date"])
        daily.append(row)
    
    return {
        "period_days": days,
        "total_sales": float(summary["total_sales"]) if summary else 0,
        "total_orders": summary["total_orders"] if summary else 0,
        "avg_order": float(summary["avg_order"]) if summary else 0,
        "paid_online_sales": float(summary["paid_online_sales"]) if summary else 0,
        "pay_at_store_sales": float(summary["pay_at_store_sales"]) if summary else 0,
        "paid_online_orders": int(summary["paid_online_orders"] or 0) if summary else 0,
        "settlement_note": (
            "Paid online totals are collected by Ekkilo and settled to your store. "
            "Pay-at-store amounts are collected by you at pickup."
        ),
        "daily_breakdown": daily,
        "top_products": [dict(p) for p in top_products]
    }
