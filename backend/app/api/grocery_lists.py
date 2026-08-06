from fastapi import APIRouter, HTTPException
from app.db.database import get_db
from app.api.auth import get_current_user

router = APIRouter()


# -----------------------------
# 📋 GET USER'S GROCERY LISTS
# -----------------------------
@router.get("/grocery-lists")
async def get_grocery_lists(token: str):
    """Get all grocery lists for user"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    lists = await db.fetch("""
        SELECT 
            gl.*,
            COUNT(gli.id) as item_count
        FROM grocery_lists gl
        LEFT JOIN grocery_list_items gli ON gl.id = gli.list_id
        WHERE gl.user_id = $1
        GROUP BY gl.id
        ORDER BY gl.is_default DESC, gl.created_at DESC
    """, user["id"])
    
    return [dict(l) for l in lists]


# -----------------------------
# 📋 GET SINGLE LIST WITH ITEMS
# -----------------------------
@router.get("/grocery-lists/{list_id}")
async def get_grocery_list(list_id: int, token: str):
    """Get specific grocery list with all items"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Get list details
    list_info = await db.fetchrow("""
        SELECT * FROM grocery_lists
        WHERE id = $1 AND user_id = $2
    """, list_id, user["id"])
    
    if not list_info:
        raise HTTPException(status_code=404, detail="List not found")
    
    # Get list items
    items = await db.fetch("""
        SELECT * FROM grocery_list_items
        WHERE list_id = $1
        ORDER BY product_name
    """, list_id)
    
    return {
        "list": dict(list_info),
        "items": [dict(i) for i in items]
    }


# -----------------------------
# ➕ CREATE GROCERY LIST
# -----------------------------
@router.post("/grocery-lists")
async def create_grocery_list(data: dict, token: str):
    """Create new grocery list"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    name = data.get("name", "My List")
    is_default = data.get("is_default", False)
    
    # If setting as default, unset other defaults
    if is_default:
        await db.execute("""
            UPDATE grocery_lists
            SET is_default = FALSE
            WHERE user_id = $1
        """, user["id"])
    
    # Create list
    new_list = await db.fetchrow("""
        INSERT INTO grocery_lists (user_id, name, is_default)
        VALUES ($1, $2, $3)
        RETURNING *
    """, user["id"], name, is_default)
    
    return dict(new_list)


# -----------------------------
# ✏️ UPDATE GROCERY LIST
# -----------------------------
@router.patch("/grocery-lists/{list_id}")
async def update_grocery_list(list_id: int, data: dict, token: str):
    """Update grocery list name/default status"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Verify ownership
    list_info = await db.fetchrow("""
        SELECT * FROM grocery_lists WHERE id = $1 AND user_id = $2
    """, list_id, user["id"])
    
    if not list_info:
        raise HTTPException(status_code=404, detail="List not found")
    
    name = data.get("name")
    is_default = data.get("is_default")
    
    # If setting as default, unset others
    if is_default:
        await db.execute("""
            UPDATE grocery_lists
            SET is_default = FALSE
            WHERE user_id = $1
        """, user["id"])
    
    await db.execute("""
        UPDATE grocery_lists
        SET name = COALESCE($1, name),
            is_default = COALESCE($2, is_default),
            updated_at = NOW()
        WHERE id = $3
    """, name, is_default, list_id)
    
    return {"status": "updated"}


# -----------------------------
# 🗑️ DELETE GROCERY LIST
# -----------------------------
@router.delete("/grocery-lists/{list_id}")
async def delete_grocery_list(list_id: int, token: str):
    """Delete grocery list"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Verify ownership
    list_info = await db.fetchrow("""
        SELECT * FROM grocery_lists WHERE id = $1 AND user_id = $2
    """, list_id, user["id"])
    
    if not list_info:
        raise HTTPException(status_code=404, detail="List not found")
    
    # Delete list (items will cascade delete)
    await db.execute("""
        DELETE FROM grocery_lists WHERE id = $1
    """, list_id)
    
    return {"status": "deleted"}


# -----------------------------
# ➕ ADD ITEM TO LIST
# -----------------------------
@router.post("/grocery-lists/{list_id}/items")
async def add_list_item(list_id: int, data: dict, token: str):
    """Add item to grocery list"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Verify list ownership
    list_info = await db.fetchrow("""
        SELECT * FROM grocery_lists WHERE id = $1 AND user_id = $2
    """, list_id, user["id"])
    
    if not list_info:
        raise HTTPException(status_code=404, detail="List not found")
    
    product_name = data.get("product_name")
    quantity = data.get("quantity", 1)
    unit = data.get("unit", "unit")
    notes = data.get("notes")
    
    if not product_name:
        raise HTTPException(status_code=400, detail="Product name required")
    
    # Add item
    item = await db.fetchrow("""
        INSERT INTO grocery_list_items (list_id, product_name, quantity, unit, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    """, list_id, product_name, quantity, unit, notes)
    
    return dict(item)


# -----------------------------
# ✏️ UPDATE LIST ITEM
# -----------------------------
@router.patch("/grocery-lists/{list_id}/items/{item_id}")
async def update_list_item(list_id: int, item_id: int, data: dict, token: str):
    """Update grocery list item"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Verify ownership through list
    list_info = await db.fetchrow("""
        SELECT * FROM grocery_lists WHERE id = $1 AND user_id = $2
    """, list_id, user["id"])
    
    if not list_info:
        raise HTTPException(status_code=404, detail="List not found")
    
    product_name = data.get("product_name")
    quantity = data.get("quantity")
    unit = data.get("unit")
    notes = data.get("notes")
    
    await db.execute("""
        UPDATE grocery_list_items
        SET product_name = COALESCE($1, product_name),
            quantity = COALESCE($2, quantity),
            unit = COALESCE($3, unit),
            notes = COALESCE($4, notes),
            updated_at = NOW()
        WHERE id = $5 AND list_id = $6
    """, product_name, quantity, unit, notes, item_id, list_id)
    
    return {"status": "updated"}


# -----------------------------
# 🗑️ DELETE LIST ITEM
# -----------------------------
@router.delete("/grocery-lists/{list_id}/items/{item_id}")
async def delete_list_item(list_id: int, item_id: int, token: str):
    """Delete item from grocery list"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Verify ownership
    list_info = await db.fetchrow("""
        SELECT * FROM grocery_lists WHERE id = $1 AND user_id = $2
    """, list_id, user["id"])
    
    if not list_info:
        raise HTTPException(status_code=404, detail="List not found")
    
    await db.execute("""
        DELETE FROM grocery_list_items
        WHERE id = $1 AND list_id = $2
    """, item_id, list_id)
    
    return {"status": "deleted"}


# -----------------------------
# 🔍 QUICK ORDER FROM LIST
# -----------------------------
@router.post("/grocery-lists/{list_id}/quick-order")
async def quick_order_from_list(list_id: int, token: str):
    """Convert grocery list to search query for quick ordering"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    # Get list items
    items = await db.fetch("""
        SELECT product_name, quantity, unit
        FROM grocery_list_items
        WHERE list_id = $1
    """, list_id)
    
    if not items:
        raise HTTPException(status_code=400, detail="List is empty")
    
    # Build search query
    search_text = ", ".join([
        f"{item['product_name']} {item['quantity']}{item['unit']}"
        for item in items
    ])
    
    return {
        "search_text": search_text,
        "items": [dict(i) for i in items]
    }
