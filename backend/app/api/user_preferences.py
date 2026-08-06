from fastapi import APIRouter, HTTPException
from app.db.database import get_db
from app.api.auth import get_current_user

router = APIRouter()


# -----------------------------
# ⭐ GET FAVORITE STORES
# -----------------------------
@router.get("/favorites/stores")
async def get_favorite_stores(token: str):
    """Get user's favorite stores"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    favorites = await db.fetch("""
        SELECT 
            ufs.*,
            s.name as store_name,
            s.phone as store_phone,
            s.lat,
            s.lng
        FROM user_favorite_stores ufs
        JOIN stores s ON ufs.store_id = s.id
        WHERE ufs.user_id = $1
        ORDER BY ufs.rank
    """, user["id"])
    
    return [dict(f) for f in favorites]


# -----------------------------
# ➕ ADD FAVORITE STORE
# -----------------------------
@router.post("/favorites/stores")
async def add_favorite_store(data: dict, token: str):
    """Add store to favorites"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    store_id = data.get("store_id")
    rank = data.get("rank", 999)  # Default to end of list
    
    if not store_id:
        raise HTTPException(status_code=400, detail="Store ID required")
    
    # Check if store exists
    store = await db.fetchrow("""
        SELECT * FROM stores WHERE id = $1
    """, store_id)
    
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Add to favorites (or update rank if already exists)
    await db.execute("""
        INSERT INTO user_favorite_stores (user_id, store_id, rank)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, store_id) 
        DO UPDATE SET rank = $3, created_at = NOW()
    """, user["id"], store_id, rank)
    
    return {"status": "added"}


# -----------------------------
# 🗑️ REMOVE FAVORITE STORE
# -----------------------------
@router.delete("/favorites/stores/{store_id}")
async def remove_favorite_store(store_id: int, token: str):
    """Remove store from favorites"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    await db.execute("""
        DELETE FROM user_favorite_stores
        WHERE user_id = $1 AND store_id = $2
    """, user["id"], store_id)
    
    return {"status": "removed"}


# -----------------------------
# 🔄 REORDER FAVORITES
# -----------------------------
@router.patch("/favorites/stores/reorder")
async def reorder_favorite_stores(data: dict, token: str):
    """Reorder favorite stores"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # data should be: {"store_ids": [3, 1, 2]} in desired order
    store_ids = data.get("store_ids", [])
    
    if not store_ids:
        raise HTTPException(status_code=400, detail="Store IDs required")
    
    # Update ranks
    for idx, store_id in enumerate(store_ids, start=1):
        await db.execute("""
            UPDATE user_favorite_stores
            SET rank = $1
            WHERE user_id = $2 AND store_id = $3
        """, idx, user["id"], store_id)
    
    return {"status": "reordered"}


# -----------------------------
# ⚙️ GET USER PREFERENCES
# -----------------------------
@router.get("/preferences")
async def get_preferences(token: str):
    """Get user preferences"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    prefs = await db.fetchrow("""
        SELECT * FROM user_preferences
        WHERE user_id = $1
    """, user["id"])
    
    if not prefs:
        # Create default preferences
        prefs = await db.fetchrow("""
            INSERT INTO user_preferences (user_id)
            VALUES ($1)
            RETURNING *
        """, user["id"])
    
    return dict(prefs)


# -----------------------------
# ⚙️ UPDATE USER PREFERENCES
# -----------------------------
@router.patch("/preferences")
async def update_preferences(data: dict, token: str):
    """Update user preferences"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    show_pictures = data.get("show_product_pictures")
    view_mode = data.get("default_view_mode")
    radius = data.get("default_radius")
    
    await db.execute("""
        UPDATE user_preferences
        SET show_product_pictures = COALESCE($1, show_product_pictures),
            default_view_mode = COALESCE($2, default_view_mode),
            default_radius = COALESCE($3, default_radius),
            updated_at = NOW()
        WHERE user_id = $4
    """, show_pictures, view_mode, radius, user["id"])
    
    return {"status": "updated"}


# -----------------------------
# 📊 GET USER STATS
# -----------------------------
@router.get("/stats")
async def get_user_stats(token: str):
    """Get user statistics"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Get order count
    order_row = await db.fetchrow("""
        SELECT COUNT(*) as count FROM final_orders
        WHERE customer_phone = $1
    """, user["phone"])
    order_count = order_row["count"] if order_row else 0
    
    # Get favorite stores count
    fav_row = await db.fetchrow("""
        SELECT COUNT(*) as count FROM user_favorite_stores
        WHERE user_id = $1
    """, user["id"])
    favorite_count = fav_row["count"] if fav_row else 0
    
    # Get grocery lists count
    list_row = await db.fetchrow("""
        SELECT COUNT(*) as count FROM grocery_lists
        WHERE user_id = $1
    """, user["id"])
    list_count = list_row["count"] if list_row else 0
    
    # Get total savings (compared to single store)
    # This is a simple calculation - can be enhanced
    savings_row = await db.fetchrow("""
        SELECT COALESCE(SUM(
            (SELECT SUM(price) FROM order_items WHERE store_order_id = so.id)
        ), 0) * 0.1 as savings
        FROM store_orders so
        JOIN final_orders fo ON so.final_order_id = fo.id
        WHERE fo.customer_phone = $1
    """, user["phone"])
    total_savings = savings_row["savings"] if savings_row else 0
    
    return {
        "total_orders": order_count or 0,
        "favorite_stores": favorite_count or 0,
        "grocery_lists": list_count or 0,
        "estimated_savings": round(float(total_savings), 2)
    }
