"""
Order History API endpoints
"""
from fastapi import APIRouter, HTTPException
from app.db.database import get_db
from app.api.auth import get_current_user
from app.services.order_status import ensure_order_schema

router = APIRouter()


def _normalize_phone(phone: str) -> str:
    if not phone:
        return phone
    return phone if phone.startswith("91") else "91" + phone


async def _build_track_payload(db, order_id: int):
    from datetime import datetime, timezone

    await ensure_order_schema(db)

    try:
        await db.execute("""
            ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30)
        """)
        await db.execute("""
            ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30)
        """)
    except Exception:
        pass

    order = await db.fetchrow("""
        SELECT fo.id, fo.customer_phone, fo.created_at, fo.status as order_status,
               fo.payment_status, fo.payment_method,
               COUNT(DISTINCT so.id) as store_count,
               COUNT(DISTINCT so.id) FILTER (WHERE so.status = 'ACCEPTED') as accepted_count,
               COUNT(DISTINCT so.id) FILTER (WHERE so.status = 'READY') as ready_count,
               COALESCE(SUM(so.total_amount), 0) as total_amount
        FROM final_orders fo
        LEFT JOIN store_orders so ON fo.id = so.final_order_id
        WHERE fo.id = $1
        GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status,
                 fo.payment_status, fo.payment_method
    """, order_id)

    if not order:
        return None

    stores = await db.fetch("""
        SELECT so.id, so.store_name, so.store_phone, so.status,
               so.total_amount, so.created_at, so.updated_at,
               so.accepted_at, so.eta_minutes, so.ready_by,
               so.delay_note, so.delay_notified_at, so.late_ping_sent_at
        FROM store_orders so
        WHERE so.final_order_id = $1
        ORDER BY so.id
    """, order_id)

    now = datetime.now(timezone.utc)
    stores_with_items = []
    for store in stores:
        items = await db.fetch("""
            SELECT product_name, quantity, price
            FROM order_items
            WHERE store_order_id = $1
        """, store["id"])

        accepted_at = store.get("accepted_at")
        ready_by = store.get("ready_by")
        status = (store["status"] or "").upper()
        preparing_minutes = None
        if accepted_at and status == "ACCEPTED":
            aa = accepted_at if accepted_at.tzinfo else accepted_at.replace(tzinfo=timezone.utc)
            preparing_minutes = max(0, int((now - aa).total_seconds() // 60))
        is_delayed = False
        if ready_by and status == "ACCEPTED":
            rb = ready_by if ready_by.tzinfo else ready_by.replace(tzinfo=timezone.utc)
            is_delayed = rb <= now

        stores_with_items.append({
            "id": store["id"],
            "store_name": store["store_name"],
            "store_phone": store["store_phone"],
            "status": store["status"],
            "total_amount": float(store["total_amount"] or 0),
            "created_at": store["created_at"].isoformat() if store["created_at"] else None,
            "accepted_at": accepted_at.isoformat() if accepted_at else None,
            "eta_minutes": int(store["eta_minutes"]) if store.get("eta_minutes") is not None else None,
            "ready_by": ready_by.isoformat() if ready_by else None,
            "delay_note": store.get("delay_note"),
            "preparing_minutes": preparing_minutes,
            "is_delayed": is_delayed,
            "items": [
                {
                    "product_name": item["product_name"],
                    "quantity": float(item["quantity"] or 0),
                    "price": float(item["price"] or 0),
                }
                for item in items
            ],
        })

    any_delayed = any(s.get("is_delayed") for s in stores_with_items)

    return {
        "id": order["id"],
        "customer_phone": order["customer_phone"],
        "created_at": order["created_at"].isoformat() if order["created_at"] else None,
        "order_status": order["order_status"],
        "payment_status": order.get("payment_status"),
        "payment_method": order.get("payment_method"),
        "store_count": int(order["store_count"] or 0),
        "accepted_count": int(order["accepted_count"] or 0),
        "ready_count": int(order["ready_count"] or 0),
        "total_amount": float(order["total_amount"] or 0),
        "has_delay": any_delayed,
        "stores": stores_with_items,
    }


# -----------------------------
# 📜 GET ORDER HISTORY
# -----------------------------
@router.get("/orders")
async def get_order_history(token: str, limit: int = 20, offset: int = 0):
    """Get user's order history from final_orders"""
    db = await get_db()
    await ensure_order_schema(db)
    user = await get_current_user(token, db)
    phone = _normalize_phone(user["phone"])

    orders = await db.fetch("""
        SELECT 
            fo.id,
            fo.customer_phone,
            fo.created_at,
            fo.status,
            fo.track_token,
            COUNT(DISTINCT so.id) as store_count,
            COALESCE(SUM(so.total_amount), 0) as total_amount
        FROM final_orders fo
        LEFT JOIN store_orders so ON fo.id = so.final_order_id
        WHERE fo.customer_phone = $1 OR fo.customer_phone = $2
        GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status, fo.track_token
        ORDER BY fo.created_at DESC
        LIMIT $3 OFFSET $4
    """, phone, user["phone"], limit, offset)

    return [dict(order) for order in orders]


# -----------------------------
# 📦 TRACK ORDER (must be before /orders/{order_id})
# -----------------------------
@router.get("/orders/track")
async def track_order(t: str = None, order_id: int = None, token: str = None):
    """
    Track an order either by:
    - unguessable track token (?t=...), for WhatsApp / shared links
    - order_id + login session token, for the logged-in customer only
    """
    db = await get_db()
    await ensure_order_schema(db)

    if t:
        row = await db.fetchrow("""
            SELECT id FROM final_orders WHERE track_token = $1
        """, t.strip())
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")
        payload = await _build_track_payload(db, row["id"])
        if not payload:
            raise HTTPException(status_code=404, detail="Order not found")
        return payload

    if order_id is not None:
        if not token:
            raise HTTPException(
                status_code=401,
                detail="Login required to track by order ID. Use the private link from WhatsApp.",
            )
        user = await get_current_user(token, db)
        phone = _normalize_phone(user["phone"])
        owned = await db.fetchrow("""
            SELECT id FROM final_orders
            WHERE id = $1 AND (customer_phone = $2 OR customer_phone = $3)
        """, order_id, phone, user["phone"])
        if not owned:
            raise HTTPException(status_code=404, detail="Order not found")
        payload = await _build_track_payload(db, order_id)
        if not payload:
            raise HTTPException(status_code=404, detail="Order not found")
        return payload

    raise HTTPException(
        status_code=400,
        detail="Provide track token (t) or order_id with login token",
    )


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
