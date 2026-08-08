from fastapi import APIRouter, HTTPException
from app.db.database import get_db
from app.api.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/admin", tags=["admin-portal"])


# ============================================
# HELPER: Check if user is admin
# ============================================
async def check_admin(token: str):
    """Verify user is an admin"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check if user is admin
    user_data = await db.fetchrow("""
        SELECT * FROM users WHERE id = $1 AND is_admin = TRUE
    """, user["id"])
    
    if not user_data:
        raise HTTPException(status_code=403, detail="Not authorized as admin")
    
    return dict(user_data)


# ============================================
# DASHBOARD - Admin Overview
# ============================================
@router.get("/dashboard")
async def get_admin_dashboard(token: str):
    """Get admin dashboard with platform stats"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    # Total stats
    total_stores = await db.fetchrow("SELECT COUNT(*) as count FROM stores")
    total_users = await db.fetchrow("SELECT COUNT(*) as count FROM users")
    total_orders = await db.fetchrow("SELECT COUNT(*) as count FROM store_orders")
    total_revenue = await db.fetchrow("""
        SELECT COALESCE(SUM(total_amount), 0) as revenue FROM store_orders 
        WHERE status = 'COMPLETED'
    """)
    
    # Today's stats
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_orders = await db.fetchrow("""
        SELECT COUNT(*) as count FROM store_orders WHERE created_at >= $1
    """, today_start)
    today_users = await db.fetchrow("""
        SELECT COUNT(*) as count FROM users WHERE created_at >= $1
    """, today_start)
    today_revenue = await db.fetchrow("""
        SELECT COALESCE(SUM(total_amount), 0) as revenue FROM store_orders 
        WHERE created_at >= $1 AND status = 'COMPLETED'
    """, today_start)
    
    # Top stores (last 30 days)
    top_stores = await db.fetch("""
        SELECT 
            s.name,
            COUNT(so.id) as orders,
            COALESCE(SUM(so.total_amount), 0) as revenue
        FROM stores s
        LEFT JOIN store_orders so ON s.id = so.store_id
        WHERE so.created_at >= NOW() - INTERVAL '30 days'
        AND so.status = 'COMPLETED'
        GROUP BY s.id, s.name
        ORDER BY revenue DESC
        LIMIT 5
    """)
    
    return {
        "total_stores": total_stores["count"] if total_stores else 0,
        "total_users": total_users["count"] if total_users else 0,
        "total_orders": total_orders["count"] if total_orders else 0,
        "total_revenue": float(total_revenue["revenue"]) if total_revenue else 0,
        "today_orders": today_orders["count"] if today_orders else 0,
        "today_users": today_users["count"] if today_users else 0,
        "today_revenue": float(today_revenue["revenue"]) if today_revenue else 0,
        "top_stores": [dict(s) for s in top_stores]
    }


# ============================================
# STORES - Management
# ============================================
@router.get("/stores")
async def get_all_stores(token: str, search: str = None, limit: int = 50, offset: int = 0):
    """Get all stores with optional search"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    if search:
        stores = await db.fetch("""
            SELECT s.*, 
                   COUNT(DISTINCT so.id) as total_orders,
                   COALESCE(SUM(so.total_amount), 0) as total_revenue
            FROM stores s
            LEFT JOIN store_orders so ON s.id = so.store_id
            WHERE LOWER(s.name) LIKE LOWER($1) OR s.phone LIKE $1
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT $2 OFFSET $3
        """, f"%{search}%", limit, offset)
    else:
        stores = await db.fetch("""
            SELECT s.*, 
                   COUNT(DISTINCT so.id) as total_orders,
                   COALESCE(SUM(so.total_amount), 0) as total_revenue
            FROM stores s
            LEFT JOIN store_orders so ON s.id = so.store_id
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)
    
    return [dict(s) for s in stores]


@router.post("/stores")
async def create_store(data: dict, token: str):
    """Create a new store"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    name = data.get("name")
    phone = data.get("phone")
    address = data.get("address")
    lat = data.get("lat")
    lng = data.get("lng")
    
    if not name or not phone:
        raise HTTPException(status_code=400, detail="Name and phone required")
    
    store = await db.fetchrow("""
        INSERT INTO stores (name, phone, address, lat, lng, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
    """, name, phone, address, lat, lng)
    
    return dict(store)


@router.patch("/stores/{store_id}")
async def update_store(store_id: int, data: dict, token: str):
    """Update store details"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    name = data.get("name")
    phone = data.get("phone")
    address = data.get("address")
    lat = data.get("lat")
    lng = data.get("lng")
    is_active = data.get("is_active")
    
    await db.execute("""
        UPDATE stores
        SET name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            address = COALESCE($3, address),
            lat = COALESCE($4, lat),
            lng = COALESCE($5, lng),
            is_active = COALESCE($6, is_active)
        WHERE id = $7
    """, name, phone, address, lat, lng, is_active, store_id)
    
    return {"status": "success"}


# ============================================
# USERS - Management
# ============================================
@router.get("/users")
async def get_all_users(token: str, search: str = None, limit: int = 50, offset: int = 0):
    """Get all users with optional search"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    if search:
        users = await db.fetch("""
            SELECT u.*, 
                   s.name as store_name,
                   COUNT(DISTINCT fo.id) as total_orders
            FROM users u
            LEFT JOIN stores s ON u.store_id = s.id
            LEFT JOIN final_orders fo ON u.phone = fo.customer_phone
            WHERE LOWER(u.name) LIKE LOWER($1) OR u.phone LIKE $1
            GROUP BY u.id, s.name
            ORDER BY u.created_at DESC
            LIMIT $2 OFFSET $3
        """, f"%{search}%", limit, offset)
    else:
        users = await db.fetch("""
            SELECT u.*, 
                   s.name as store_name,
                   COUNT(DISTINCT fo.id) as total_orders
            FROM users u
            LEFT JOIN stores s ON u.store_id = s.id
            LEFT JOIN final_orders fo ON u.phone = fo.customer_phone
            GROUP BY u.id, s.name
            ORDER BY u.created_at DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)
    
    return [dict(u) for u in users]


@router.patch("/users/{user_id}")
async def update_user(user_id: int, data: dict, token: str):
    """Update user details"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    is_store_owner = data.get("is_store_owner")
    # Allow explicit null to clear store_id when removing owner
    store_id = data["store_id"] if "store_id" in data else None
    clear_store = "store_id" in data and data["store_id"] is None
    is_admin = data.get("is_admin")

    if is_store_owner is True and not data.get("store_id") and not clear_store:
        # If becoming owner without existing store, require store_id
        existing = await db.fetchrow("SELECT store_id FROM users WHERE id = $1", user_id)
        if not existing or not existing["store_id"]:
            if not data.get("store_id"):
                raise HTTPException(status_code=400, detail="store_id required when making store owner")
    
    if clear_store:
        await db.execute("""
            UPDATE users
            SET is_store_owner = COALESCE($1, is_store_owner),
                store_id = NULL,
                is_admin = COALESCE($2, is_admin)
            WHERE id = $3
        """, is_store_owner, is_admin, user_id)
    else:
        await db.execute("""
            UPDATE users
            SET is_store_owner = COALESCE($1, is_store_owner),
                store_id = COALESCE($2, store_id),
                is_admin = COALESCE($3, is_admin)
            WHERE id = $4
        """, is_store_owner, store_id, is_admin, user_id)
    
    # Create store_owner_details if making user a store owner
    if is_store_owner:
        await db.execute("""
            INSERT INTO store_owner_details (user_id, can_manage_products, can_manage_orders)
            VALUES ($1, true, true)
            ON CONFLICT (user_id) DO NOTHING
        """, user_id)
    
    return {"status": "success"}


# ============================================
# PRODUCTS - Master Catalog
# ============================================
@router.get("/products")
async def get_all_products(token: str, search: str = None, limit: int = 100, offset: int = 0):
    """Get all products from master catalog"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    if search:
        products = await db.fetch("""
            SELECT * FROM products
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY name
            LIMIT $2 OFFSET $3
        """, f"%{search}%", limit, offset)
    else:
        products = await db.fetch("""
            SELECT * FROM products
            ORDER BY name
            LIMIT $1 OFFSET $2
        """, limit, offset)
    
    return [dict(p) for p in products]


@router.post("/products")
async def create_product(data: dict, token: str):
    """Add new product to master catalog"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    name = data.get("name")
    brand = data.get("brand", "")
    variant = data.get("variant", "")
    size = data.get("size", 1)
    unit = data.get("unit", "unit")
    
    if not name:
        raise HTTPException(status_code=400, detail="Product name required")
    
    product = await db.fetchrow("""
        INSERT INTO products (name, brand, variant, size, unit)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    """, name, brand, variant, size, unit)
    
    return dict(product)


@router.patch("/products/{product_id}")
async def update_product(product_id: int, data: dict, token: str):
    """Update product in master catalog"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    name = data.get("name")
    brand = data.get("brand")
    variant = data.get("variant")
    size = data.get("size")
    unit = data.get("unit")
    
    await db.execute("""
        UPDATE products
        SET name = COALESCE($1, name),
            brand = COALESCE($2, brand),
            variant = COALESCE($3, variant),
            size = COALESCE($4, size),
            unit = COALESCE($5, unit)
        WHERE id = $6
    """, name, brand, variant, size, unit, product_id)
    
    return {"status": "success"}


@router.delete("/products/{product_id}")
async def delete_product(product_id: int, token: str):
    """Delete product from master catalog"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    await db.execute("DELETE FROM products WHERE id = $1", product_id)
    
    return {"status": "success"}


# ============================================
# ORDERS - Platform-wide
# ============================================
@router.get("/orders")
async def get_all_orders(token: str, status: str = None, limit: int = 50, offset: int = 0):
    """Get all orders platform-wide"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    query = """
        SELECT fo.id, 
               fo.customer_phone,
               fo.created_at,
               fo.status,
               COUNT(DISTINCT so.id) as store_count,
               COALESCE(SUM(so.total_amount), 0) as total_amount
        FROM final_orders fo
        LEFT JOIN store_orders so ON fo.id = so.final_order_id
    """
    
    params = []
    if status:
        # Filter by final order status (CREATED/CONFIRMED/READY/etc.)
        query += " WHERE fo.status = $1"
        params.append(status.upper())
        query += " GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status ORDER BY fo.created_at DESC LIMIT $2 OFFSET $3"
        params.extend([limit, offset])
    else:
        query += " GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status ORDER BY fo.created_at DESC LIMIT $1 OFFSET $2"
        params.extend([limit, offset])
    
    orders = await db.fetch(query, *params)
    
    return [dict(o) for o in orders]


@router.get("/orders/{order_id}")
async def get_order_details(order_id: int, token: str):
    """Get detailed information about a specific order"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    # Get order basic info
    order = await db.fetchrow("""
        SELECT fo.id, fo.customer_phone, fo.created_at, fo.status,
               COUNT(DISTINCT so.id) as store_count,
               COALESCE(SUM(so.total_amount), 0) as total_amount
        FROM final_orders fo
        LEFT JOIN store_orders so ON fo.id = so.final_order_id
        WHERE fo.id = $1
        GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status
    """, order_id)
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get store orders with items
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
    
    # Get status history
    history = await db.fetch("""
        SELECT soe.status, soe.created_at, so.store_name
        FROM store_order_events soe
        JOIN store_orders so ON soe.store_order_id = so.id
        WHERE so.final_order_id = $1
        ORDER BY soe.created_at DESC
    """, order_id)
    
    return {
        **dict(order),
        "stores": stores_with_items,
        "history": [dict(h) for h in history]
    }


# ============================================
# WHATSAPP MESSAGES
# ============================================

@router.get("/whatsapp/messages")
async def get_whatsapp_messages(token: str, phone: str = None, status: str = None, limit: int = 100, offset: int = 0):
    """Get WhatsApp message history"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    query = """
        SELECT wm.id, wm.phone, wm.message, wm.status, 
               wm.whatsapp_message_id, wm.attempts, wm.last_error,
               wm.created_at, wm.sent_at, wm.delivered_at, wm.read_at,
               wm.final_order_id,
               fo.customer_phone as order_customer
        FROM whatsapp_messages wm
        LEFT JOIN final_orders fo ON wm.final_order_id = fo.id
        WHERE 1=1
    """
    
    params = []
    param_count = 1
    
    if phone:
        query += f" AND wm.phone = ${param_count}"
        params.append(phone)
        param_count += 1
    
    if status:
        query += f" AND wm.status = ${param_count}"
        params.append(status.upper())
        param_count += 1
    
    query += f" ORDER BY wm.created_at DESC LIMIT ${param_count} OFFSET ${param_count + 1}"
    params.extend([limit, offset])
    
    messages = await db.fetch(query, *params)
    
    return [dict(m) for m in messages]


@router.post("/whatsapp/resend/{message_id}")
async def resend_whatsapp_message(message_id: int, token: str):
    """Manually resend a failed WhatsApp message"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    # Get message details
    msg = await db.fetchrow("""
        SELECT phone, message FROM whatsapp_messages WHERE id = $1
    """, message_id)
    
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Reset status and send
    await db.execute("""
        UPDATE whatsapp_messages 
        SET status = 'PENDING', last_error = NULL 
        WHERE id = $1
    """, message_id)
    
    # Import and call send_message
    from app.services.whatsapp import send_message
    await send_message(msg["phone"], msg["message"], message_id)
    
    return {"message": "Message queued for resend"}


@router.get("/whatsapp/stats")
async def get_whatsapp_stats(token: str):
    """Get WhatsApp messaging statistics"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    stats = await db.fetchrow("""
        SELECT 
            COUNT(*) as total_messages,
            COUNT(*) FILTER (WHERE status = 'SENT') as sent,
            COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
            COUNT(*) FILTER (WHERE status = 'READ') as read,
            COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
            COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
        FROM whatsapp_messages
    """)
    
    return dict(stats)
