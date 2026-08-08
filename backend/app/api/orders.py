"""
Order History API endpoints
"""
from fastapi import APIRouter, HTTPException
from app.db.database import get_db
from app.api.auth import get_current_user

router = APIRouter()


def _normalize_phone(phone: str) -> str:
    if not phone:
        return phone
    return phone if phone.startswith("91") else "91" + phone


# -----------------------------
# 📜 GET ORDER HISTORY
# -----------------------------
@router.get("/orders")
async def get_order_history(token: str, limit: int = 20, offset: int = 0):
    """Get user's order history from final_orders"""
    db = await get_db()
    user = await get_current_user(token, db)
    phone = _normalize_phone(user["phone"])

    orders = await db.fetch("""
        SELECT 
            fo.id,
            fo.customer_phone,
            fo.created_at,
            fo.status,
            COUNT(DISTINCT so.id) as store_count,
            COALESCE(SUM(so.total_amount), 0) as total_amount
        FROM final_orders fo
        LEFT JOIN store_orders so ON fo.id = so.final_order_id
        WHERE fo.customer_phone = $1 OR fo.customer_phone = $2
        GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status
        ORDER BY fo.created_at DESC
        LIMIT $3 OFFSET $4
    """, phone, user["phone"], limit, offset)

    return [dict(order) for order in orders]


# -----------------------------
# 📋 GET ORDER DETAILS
# -----------------------------
@router.get("/orders/{order_id}")
async def get_order_details(order_id: int, token: str):
    """Get detailed information about a specific order"""
    db = await get_db()
    user = await get_current_user(token, db)
    phone = _normalize_phone(user["phone"])

    order = await db.fetchrow("""
        SELECT * FROM final_orders
        WHERE id = $1 AND (customer_phone = $2 OR customer_phone = $3)
    """, order_id, phone, user["phone"])

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    store_orders = await db.fetch("""
        SELECT 
            so.id,
            so.store_name,
            so.store_phone,
            so.status,
            so.total_amount,
            so.created_at,
            so.updated_at
        FROM store_orders so
        WHERE so.final_order_id = $1
        ORDER BY so.id
    """, order_id)

    detailed_stores = []
    for so in store_orders:
        items = await db.fetch("""
            SELECT product_name, quantity, price
            FROM order_items
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

    events = await db.fetch("""
        SELECT status, created_at
        FROM final_order_events
        WHERE final_order_id = $1
        ORDER BY created_at DESC
    """, order_id)

    return {
        "order": dict(order),
        "stores": detailed_stores,
        "events": [dict(e) for e in events],
        "total": sum(s["total_amount"] for s in detailed_stores)
    }


# -----------------------------
# ❌ CANCEL ORDER (web)
# -----------------------------
@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: int, token: str):
    """Cancel an order from the customer web portal"""
    db = await get_db()
    user = await get_current_user(token, db)
    phone = _normalize_phone(user["phone"])

    order = await db.fetchrow("""
        SELECT id, status FROM final_orders
        WHERE id = $1 AND (customer_phone = $2 OR customer_phone = $3)
    """, order_id, phone, user["phone"])

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order["status"] in ("READY", "COMPLETED", "CANCELLED"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel order in status {order['status']}"
        )

    from app.services.order_status import cancel_final_order

    result = await cancel_final_order(order_id, db=db)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])

    # Best-effort WhatsApp notify
    try:
        from app.services.whatsapp import send_message
        await send_message(phone, result["message"])
    except Exception:
        pass

    return {"status": "cancelled", "order_id": order_id}


# -----------------------------
# 🔄 REORDER
# -----------------------------
@router.post("/orders/{order_id}/reorder")
async def reorder(order_id: int, token: str):
    """Create a new order based on a previous order"""
    details = await get_order_details(order_id, token)

    all_items = []
    for store in details["stores"]:
        for item in store["items"]:
            all_items.append(item["product_name"])

    search_text = ", ".join(set(all_items))

    return {
        "search_text": search_text,
        "message": "Use this search text to find current prices"
    }
