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
    store_id = data.get("store_id")
    is_admin = data.get("is_admin")
    
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
        query += " WHERE so.status = $1"
        params.append(status.upper())
        query += " GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status ORDER BY fo.created_at DESC LIMIT $2 OFFSET $3"
        params.extend([limit, offset])
    else:
        query += " GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status ORDER BY fo.created_at DESC LIMIT $1 OFFSET $2"
        params.extend([limit, offset])
    
    orders = await db.fetch(query, *params)
    
    return [dict(o) for o in orders]
