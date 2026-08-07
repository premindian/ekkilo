from fastapi import APIRouter, HTTPException
from app.db.database import get_db
from app.api.auth import get_current_user
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
            so.store_order_id,
            fo.id as final_order_id,
            fo.customer_phone,
            so.store_items,
            so.status,
            so.created_at
        FROM store_orders so
        JOIN final_orders fo ON so.final_order_id = fo.id
        WHERE so.store_id = $1 
        AND so.status IN ('PENDING', 'ACCEPTED')
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
            so.store_order_id,
            fo.id as final_order_id,
            fo.customer_phone,
            so.store_items,
            so.status,
            so.created_at,
            so.updated_at
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
        query += " ORDER BY so.created_at DESC LIMIT $2 OFFSET $3"
        params.extend([limit, offset])
    
    orders = await db.fetch(query, *params)
    
    return [dict(o) for o in orders]


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
    allowed_statuses = ["ACCEPTED", "READY", "REJECTED"]
    
    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status. Allowed: {allowed_statuses}"
        )
    
    # Update order
    await db.execute("""
        UPDATE store_orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
    """, new_status, order_id)
    
    # Insert event
    await db.execute("""
        INSERT INTO store_order_events (store_order_id, status)
        VALUES ($1, $2)
    """, order_id, new_status)
    
    return {"status": "success", "new_status": new_status}


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
    
    # Daily sales
    daily_sales = await db.fetch("""
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as order_count,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_orders
        FROM store_orders
        WHERE store_id = $1 
        AND created_at >= $2
        GROUP BY DATE(created_at)
        ORDER BY date DESC
    """, store_id, start_date)
    
    # Total summary
    summary = await db.fetchrow("""
        SELECT 
            COUNT(*) as total_orders,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_orders,
            COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_orders
        FROM store_orders
        WHERE store_id = $1 
        AND created_at >= $2
    """, store_id, start_date)
    
    return {
        "period_days": days,
        "summary": dict(summary) if summary else {},
        "daily_sales": [dict(d) for d in daily_sales]
    }
