"""
Order History API endpoints
"""
from fastapi import APIRouter, HTTPException
from app.db.database import get_db
from app.api.auth import get_current_user

router = APIRouter()


# -----------------------------
# 📜 GET ORDER HISTORY
# -----------------------------
@router.get("/orders")
async def get_order_history(token: str, limit: int = 20, offset: int = 0):
    """Get user's order history"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    orders = await db.fetch("""
        SELECT 
            o.id,
            o.customer_phone,
            o.created_at,
            o.status,
            COUNT(DISTINCT so.id) as store_count,
            SUM(so.total_amount) as total_amount
        FROM orders o
        LEFT JOIN store_orders so ON o.id = so.order_id
        WHERE o.customer_phone = $1
        GROUP BY o.id, o.customer_phone, o.created_at, o.status
        ORDER BY o.created_at DESC
        LIMIT $2 OFFSET $3
    """, user["phone"], limit, offset)
    
    return [dict(order) for order in orders]


# -----------------------------
# 📋 GET ORDER DETAILS
# -----------------------------
@router.get("/orders/{order_id}")
async def get_order_details(order_id: int, token: str):
    """Get detailed information about a specific order"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Get order basic info
    order = await db.fetchrow("""
        SELECT * FROM orders
        WHERE id = $1 AND customer_phone = $2
    """, order_id, user["phone"])
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get store orders
    store_orders = await db.fetch("""
        SELECT 
            so.*,
            s.name as store_name,
            s.phone as store_phone
        FROM store_orders so
        JOIN stores s ON so.store_id = s.id
        WHERE so.order_id = $1
        ORDER BY so.id
    """, order_id)
    
    # Get order items for each store order
    detailed_stores = []
    for so in store_orders:
        items = await db.fetch("""
            SELECT * FROM store_order_items
            WHERE store_order_id = $1
        """, so["id"])
        
        detailed_stores.append({
            "store_order_id": so["id"],
            "store_name": so["store_name"],
            "store_phone": so["store_phone"],
            "status": so["status"],
            "total_amount": float(so["total_amount"]) if so["total_amount"] else 0,
            "items": [dict(item) for item in items]
        })
    
    # Get order events
    events = await db.fetch("""
        SELECT * FROM order_events
        WHERE order_id = $1
        ORDER BY created_at DESC
    """, order_id)
    
    return {
        "order": dict(order),
        "stores": detailed_stores,
        "events": [dict(e) for e in events],
        "total": sum(s["total_amount"] for s in detailed_stores)
    }


# -----------------------------
# 🔄 REORDER
# -----------------------------
@router.post("/orders/{order_id}/reorder")
async def reorder(order_id: int, token: str):
    """Create a new order based on a previous order"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Get original order details
    details = await get_order_details(order_id, token)
    
    # Build search text from order items
    all_items = []
    for store in details["stores"]:
        for item in store["items"]:
            all_items.append(item["product_name"])
    
    search_text = ", ".join(set(all_items))
    
    return {
        "search_text": search_text,
        "message": "Use this search text to find current prices"
    }
