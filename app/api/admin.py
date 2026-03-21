from fastapi import APIRouter
from app.db.database import get_db

router = APIRouter(prefix="/admin", tags=["admin"])


# -----------------------------
# ?? GET ALL ORDERS
# -----------------------------
@router.get("/orders")
async def get_orders():
    db = await get_db()

    orders = await db.fetch("""
        SELECT id, customer_phone, store_name, store_phone,
               items, status, created_at, updated_at
        FROM orders
        ORDER BY created_at DESC
    """)

    return [dict(order) for order in orders]


# -----------------------------
# ?? GET SINGLE ORDER
# -----------------------------
@router.get("/orders/{order_id}")
async def get_order(order_id: int):
    db = await get_db()

    order = await db.fetchrow("""
        SELECT * FROM orders WHERE id = $1
    """, order_id)

    if not order:
        return {"error": "Order not found"}

    return dict(order)


# -----------------------------
# ?? STATS (VERY POWERFUL)
# -----------------------------
@router.get("/stats")
async def get_stats():
    db = await get_db()

    stats = await db.fetchrow("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'CREATED') AS created,
            COUNT(*) FILTER (WHERE status = 'SENT') AS sent,
            COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted,
            COUNT(*) FILTER (WHERE status = 'READY') AS ready
        FROM orders
    """)

    return dict(stats)


# -----------------------------
# ?? UPDATE ORDER STATUS (MANUAL CONTROL)
# -----------------------------
@router.patch("/orders/{order_id}")
async def update_order(order_id: int, data: dict):
    new_status = data.get("status")

    if not new_status:
        return {"error": "Missing status"}

    # ?? ADD HERE
    new_status = new_status.upper()

    allowed = ["CREATED", "SENT", "ACCEPTED", "READY", "COMPLETED"]

    if new_status not in allowed:
        return {"error": f"Invalid status. Allowed: {allowed}"}

    from app.db.database import get_db
    db = await get_db()

    await db.execute("""
        UPDATE orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
    """, new_status, order_id)

    return {"message": f"Order {order_id} updated to {new_status}"}