from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import PlainTextResponse
from app.db.database import get_db
from app.api.auth import get_current_user
from app.services.product_images import file_to_data_url, validate_image_url
from app.services.product_import import build_template_csv, parse_csv_text, import_products, seed_starter_catalog
from app.services.staff_audit import log_staff_action, list_staff_audit_events
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


@router.get("/audit")
async def get_staff_audit(
    token: str,
    action: str = None,
    phone: str = None,
    store_id: int = None,
    date_from: str = None,
    date_to: str = None,
    limit: int = 100,
    offset: int = 0,
):
    """Recent staff actions (admin + store portal)."""
    await check_admin(token)
    events = await list_staff_audit_events(
        limit=limit,
        offset=offset,
        action=action,
        actor_phone=phone,
        store_id=store_id,
        date_from=date_from,
        date_to=date_to,
    )
    return {"events": events, "count": len(events)}


@router.get("/refund-requests")
async def get_refund_requests(
    token: str,
    status: str = None,
    limit: int = 50,
):
    """Customer UPI refund requests awaiting manual processing."""
    await check_admin(token)
    from app.services.refund_requests import list_refund_requests

    rows = await list_refund_requests(limit=limit, status=status)
    return {"requests": rows, "count": len(rows)}


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
            ORDER BY s.id DESC
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
            ORDER BY s.id DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)
    
    return [dict(s) for s in stores]


@router.post("/stores")
async def create_store(data: dict, token: str):
    """Create a new store"""
    from app.utils.phone import normalize_phone

    admin = await check_admin(token)
    
    db = await get_db()
    
    name = (data.get("name") or "").strip()
    phone = normalize_phone(data.get("phone"))
    address = data.get("address")
    lat = data.get("lat")
    lng = data.get("lng")
    
    if not name or not phone:
        raise HTTPException(status_code=400, detail="Name and phone required")

    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Latitude and longitude are required numbers")

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid latitude/longitude range")
    
    await db.execute("ALTER TABLE stores ADD COLUMN IF NOT EXISTS address TEXT")
    await db.execute("ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()")

    store = await db.fetchrow("""
        INSERT INTO stores (name, phone, address, lat, lng)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    """, name, phone, address, lat, lng)

    await log_staff_action(
        actor=admin,
        action="store.create",
        entity_type="store",
        entity_id=store["id"],
        details={"name": name, "phone": phone},
        store_id=store["id"],
        db=db,
    )
    
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

    await log_staff_action(
        actor=admin,
        action="store.update",
        entity_type="store",
        entity_id=store_id,
        details={k: data.get(k) for k in ("name", "phone", "address", "lat", "lng", "is_active") if k in data},
        store_id=store_id,
        db=db,
    )
    
    return {"status": "success"}


# ============================================
# USERS - Management
# ============================================
@router.get("/users")
async def get_all_users(token: str, search: str = None, limit: int = 50, offset: int = 0):
    """Get all users with optional search"""
    admin = await check_admin(token)
    
    db = await get_db()
    from app.services.abuse import ensure_abuse_schema
    await ensure_abuse_schema(db)
    
    if search:
        users = await db.fetch("""
            SELECT u.*, 
                   s.name as store_name,
                   COUNT(DISTINCT fo.id) as total_orders,
                   EXISTS (
                     SELECT 1 FROM blocked_phones bp
                     WHERE bp.phone = u.phone
                        OR RIGHT(REGEXP_REPLACE(COALESCE(bp.phone, ''), '[^0-9]', '', 'g'), 10)
                           = RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 10)
                   ) AS is_blocked
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
                   COUNT(DISTINCT fo.id) as total_orders,
                   EXISTS (
                     SELECT 1 FROM blocked_phones bp
                     WHERE bp.phone = u.phone
                        OR RIGHT(REGEXP_REPLACE(COALESCE(bp.phone, ''), '[^0-9]', '', 'g'), 10)
                           = RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 10)
                   ) AS is_blocked
            FROM users u
            LEFT JOIN stores s ON u.store_id = s.id
            LEFT JOIN final_orders fo ON u.phone = fo.customer_phone
            GROUP BY u.id, s.name
            ORDER BY u.created_at DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)
    
    return [dict(u) for u in users]


@router.post("/users/{user_id}/block")
async def block_user(user_id: int, token: str, data: dict = None):
    """Block a user's phone from ordering / OTP login"""
    admin = await check_admin(token)
    db = await get_db()
    user = await db.fetchrow(
        "SELECT id, phone, name, is_admin FROM users WHERE id = $1", user_id
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user["id"] == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    if user.get("is_admin"):
        admin_count = await db.fetchval(
            "SELECT COUNT(*) FROM users WHERE COALESCE(is_admin, FALSE) = TRUE"
        )
        if int(admin_count or 0) <= 1:
            raise HTTPException(status_code=400, detail="Cannot block the last admin")

    from app.services.abuse import block_phone
    reason = (data or {}).get("reason") or "Blocked by admin"
    phone = await block_phone(user["phone"], reason=reason, blocked_by=admin["id"], db=db)
    await db.execute("DELETE FROM user_sessions WHERE user_id = $1", user_id)
    await log_staff_action(
        actor=admin,
        action="user.block",
        entity_type="user",
        entity_id=user_id,
        details={"phone": phone, "reason": reason},
        db=db,
    )
    return {"status": "blocked", "phone": phone, "user_id": user_id}


@router.post("/users/{user_id}/unblock")
async def unblock_user(user_id: int, token: str):
    """Unblock a user's phone"""
    admin = await check_admin(token)
    db = await get_db()
    user = await db.fetchrow("SELECT id, phone FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from app.services.abuse import unblock_phone
    await unblock_phone(user["phone"], db=db)
    await log_staff_action(
        actor=admin,
        action="user.unblock",
        entity_type="user",
        entity_id=user_id,
        details={"phone": user["phone"]},
        db=db,
    )
    return {"status": "unblocked", "user_id": user_id}


@router.patch("/users/{user_id}")
async def update_user(user_id: int, data: dict, token: str):
    """Update user details (store owner / store link). Admin flag needs dedicated endpoints."""
    admin = await check_admin(token)
    
    db = await get_db()

    target = await db.fetchrow("SELECT id, phone, is_admin FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if "is_admin" in data:
        raise HTTPException(
            status_code=400,
            detail="Use /make-admin or /remove-admin endpoints (password + phone confirmation required)",
        )
    
    is_store_owner = data.get("is_store_owner")
    # Allow explicit null to clear store_id when removing owner
    store_id = data["store_id"] if "store_id" in data else None
    clear_store = "store_id" in data and data["store_id"] is None

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
                store_id = NULL
            WHERE id = $2
        """, is_store_owner, user_id)
    else:
        await db.execute("""
            UPDATE users
            SET is_store_owner = COALESCE($1, is_store_owner),
                store_id = COALESCE($2, store_id)
            WHERE id = $3
        """, is_store_owner, store_id, user_id)
    
    # Create store_owner_details if making user a store owner
    if is_store_owner:
        await db.execute("""
            INSERT INTO store_owner_details (user_id, can_manage_products, can_manage_orders)
            VALUES ($1, true, true)
            ON CONFLICT (user_id) DO NOTHING
        """, user_id)

    await log_staff_action(
        actor=admin,
        action="user.update",
        entity_type="user",
        entity_id=user_id,
        details={k: data.get(k) for k in ("is_store_owner", "store_id") if k in data},
        store_id=data.get("store_id") if "store_id" in data else None,
        db=db,
    )
    
    return {"status": "success"}


def _phone_tail(phone: str) -> str:
    return "".join(c for c in str(phone or "") if c.isdigit())[-10:]


async def _require_admin_password(admin: dict, password: str, db) -> None:
    """Re-auth acting admin with staff password before sensitive admin changes."""
    from app.api.auth import verify_password

    if not password or len(str(password)) < 6:
        raise HTTPException(status_code=400, detail="Your staff password is required")
    row = await db.fetchrow(
        "SELECT password_hash FROM users WHERE id = $1",
        admin["id"],
    )
    if not row or not row.get("password_hash"):
        raise HTTPException(
            status_code=400,
            detail="Set your own Staff Password first (Users → Set Staff Password on your account)",
        )
    if not verify_password(str(password), row["password_hash"]):
        raise HTTPException(status_code=403, detail="Incorrect staff password")


@router.post("/users/{user_id}/make-admin")
async def make_user_admin(user_id: int, data: dict, token: str):
    """
    Promote to admin — requires:
    - acting admin staff password
    - confirm_phone matching target (last 10 digits)
    - confirm_phrase exactly MAKE ADMIN
    """
    admin = await check_admin(token)
    db = await get_db()
    target = await db.fetchrow("SELECT id, phone, is_admin FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["is_admin"]:
        return {"status": "already_admin", "user_id": user_id}

    await _require_admin_password(admin, (data or {}).get("password"), db)

    confirm_phone = _phone_tail((data or {}).get("confirm_phone"))
    if not confirm_phone or confirm_phone != _phone_tail(target["phone"]):
        raise HTTPException(
            status_code=400,
            detail="Type the user's phone number to confirm (last 10 digits must match)",
        )

    phrase = str((data or {}).get("confirm_phrase") or "").strip().upper()
    if phrase != "MAKE ADMIN":
        raise HTTPException(
            status_code=400,
            detail='Type MAKE ADMIN in the confirmation box (exactly)',
        )

    await db.execute(
        "UPDATE users SET is_admin = TRUE, updated_at = NOW() WHERE id = $1",
        user_id,
    )
    await log_staff_action(
        actor=admin,
        action="user.make_admin",
        entity_type="user",
        entity_id=user_id,
        details={"phone": target["phone"], "confirmed": True},
        db=db,
    )
    return {"status": "admin", "user_id": user_id}


@router.post("/users/{user_id}/remove-admin")
async def remove_user_admin(user_id: int, data: dict, token: str):
    """Demote admin — requires staff password + phone confirm + REMOVE ADMIN phrase."""
    admin = await check_admin(token)
    db = await get_db()
    target = await db.fetchrow("SELECT id, phone, is_admin FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not target["is_admin"]:
        return {"status": "not_admin", "user_id": user_id}

    admin_count = int(
        await db.fetchval(
            "SELECT COUNT(*) FROM users WHERE COALESCE(is_admin, FALSE) = TRUE"
        )
        or 0
    )
    if admin_count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the last admin. Promote another admin first, or use break-glass / DB recovery.",
        )

    await _require_admin_password(admin, (data or {}).get("password"), db)

    confirm_phone = _phone_tail((data or {}).get("confirm_phone"))
    if not confirm_phone or confirm_phone != _phone_tail(target["phone"]):
        raise HTTPException(
            status_code=400,
            detail="Type the user's phone number to confirm (last 10 digits must match)",
        )

    phrase = str((data or {}).get("confirm_phrase") or "").strip().upper()
    if phrase != "REMOVE ADMIN":
        raise HTTPException(
            status_code=400,
            detail='Type REMOVE ADMIN in the confirmation box (exactly)',
        )

    # Atomic: only demote if another admin still exists (blocks last-admin + races)
    demoted = await db.fetchrow(
        """
        UPDATE users
        SET is_admin = FALSE, updated_at = NOW()
        WHERE id = $1
          AND COALESCE(is_admin, FALSE) = TRUE
          AND (
            SELECT COUNT(*) FROM users WHERE COALESCE(is_admin, FALSE) = TRUE
          ) > 1
        RETURNING id
        """,
        user_id,
    )
    if not demoted:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the last admin. Promote another admin first, or use break-glass / DB recovery.",
        )

    await db.execute("DELETE FROM user_sessions WHERE user_id = $1", user_id)
    await log_staff_action(
        actor=admin,
        action="user.remove_admin",
        entity_type="user",
        entity_id=user_id,
        details={"phone": target["phone"], "confirmed": True},
        db=db,
    )
    return {"status": "removed", "user_id": user_id}


@router.post("/sessions/revoke-all")
async def revoke_all_sessions(token: str, keep_mine: bool = True):
    """Force everyone to log in again (except optionally the calling admin)."""
    admin = await check_admin(token)
    db = await get_db()
    if keep_mine:
        deleted = await db.fetchval(
            """
            WITH d AS (
              DELETE FROM user_sessions WHERE token IS DISTINCT FROM $1
              RETURNING 1
            )
            SELECT COUNT(*) FROM d
            """,
            token,
        )
    else:
        deleted = await db.fetchval(
            """
            WITH d AS (
              DELETE FROM user_sessions RETURNING 1
            )
            SELECT COUNT(*) FROM d
            """
        )
    await log_staff_action(
        actor=admin,
        action="sessions.revoke_all",
        entity_type="session",
        details={"deleted": int(deleted or 0), "keep_mine": keep_mine},
        db=db,
    )
    return {
        "status": "revoked",
        "deleted": int(deleted or 0),
        "keep_mine": keep_mine,
        "message": (
            "All other sessions cleared. You stay logged in."
            if keep_mine
            else "All sessions cleared. Log in again."
        ),
    }


@router.post("/users/{user_id}/password")
async def set_user_password(user_id: int, data: dict, token: str):
    """Admin sets password for a staff user"""
    admin = await check_admin(token)
    from app.api.auth import hash_password

    password = data.get("password")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    db = await get_db()
    user = await db.fetchrow("SELECT id, is_admin, is_store_owner FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not (user["is_admin"] or user["is_store_owner"]):
        raise HTTPException(status_code=400, detail="User must be admin or store owner first")

    await db.execute("""
        UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2
    """, hash_password(password), user_id)

    await log_staff_action(
        actor=admin,
        action="user.password_set",
        entity_type="user",
        entity_id=user_id,
        details={"note": "password changed (value not logged)"},
        db=db,
    )

    return {"status": "password_set"}


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


@router.get("/products/import-template")
async def download_product_import_template(token: str, samples: bool = True):
    """Download CSV template (optionally with starter kirana SKUs)."""
    await check_admin(token)
    csv_text = build_template_csv(include_samples=samples)
    filename = "ekkilo-products-starter.csv" if samples else "ekkilo-products-template.csv"
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/products/import")
async def import_products_csv(token: str, file: UploadFile = File(...)):
    """Bulk-load master catalog from CSV (skips near-duplicates)."""
    admin = await check_admin(token)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > 2_000_000:
        raise HTTPException(status_code=400, detail="CSV too large (max 2MB)")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    rows, parse_errors = parse_csv_text(text)
    if not rows and parse_errors:
        raise HTTPException(status_code=400, detail="; ".join(parse_errors[:5]))

    db = await get_db()
    result = await import_products(db, rows)
    result["parse_errors"] = parse_errors[:50]
    result["parse_error_count"] = len(parse_errors)
    await log_staff_action(
        actor=admin,
        action="product.import_csv",
        entity_type="catalog",
        details={
            "filename": file.filename,
            "created": result.get("created"),
            "skipped": result.get("skipped"),
            "failed_count": result.get("failed_count"),
            "total_rows": result.get("total_rows"),
        },
        db=db,
    )
    return result


@router.post("/products/seed-starter")
async def seed_starter_products(token: str):
    """One-click: load built-in starter kirana SKUs (skips duplicates)."""
    admin = await check_admin(token)
    db = await get_db()
    result = await seed_starter_catalog(db)
    await log_staff_action(
        actor=admin,
        action="product.seed_starter",
        entity_type="catalog",
        details={
            "created": result.get("created"),
            "skipped": result.get("skipped"),
            "failed_count": result.get("failed_count"),
            "total_rows": result.get("total_rows"),
        },
        db=db,
    )
    return result


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

    await log_staff_action(
        actor=admin,
        action="product.create",
        entity_type="product",
        entity_id=product["id"],
        details={"name": name, "brand": brand, "size": size, "unit": unit},
        db=db,
    )
    
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

    # image_url: omit = leave; "" / null = clear; http(s) or data URL = set
    image_url = data.get("image_url", "__omit__")
    if image_url != "__omit__":
        image_url = validate_image_url(image_url)
        await db.execute("""
            UPDATE products
            SET name = COALESCE($1, name),
                brand = COALESCE($2, brand),
                variant = COALESCE($3, variant),
                size = COALESCE($4, size),
                unit = COALESCE($5, unit),
                image_url = $6
            WHERE id = $7
        """, name, brand, variant, size, unit, image_url, product_id)
    else:
        await db.execute("""
            UPDATE products
            SET name = COALESCE($1, name),
                brand = COALESCE($2, brand),
                variant = COALESCE($3, variant),
                size = COALESCE($4, size),
                unit = COALESCE($5, unit)
            WHERE id = $6
        """, name, brand, variant, size, unit, product_id)

    detail = {k: data.get(k) for k in ("name", "brand", "variant", "size", "unit") if k in data}
    if image_url != "__omit__":
        detail["image_url"] = "set" if image_url else "cleared"
    await log_staff_action(
        actor=admin,
        action="product.update",
        entity_type="product",
        entity_id=product_id,
        details=detail,
        db=db,
    )
    
    return {"status": "success"}


@router.post("/products/{product_id}/image")
async def upload_product_image(product_id: int, token: str, file: UploadFile = File(...)):
    """Upload a product photo (stored as data URL in products.image_url)."""
    admin = await check_admin(token)
    db = await get_db()
    exists = await db.fetchval("SELECT id FROM products WHERE id = $1", product_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Product not found")
    data_url = await file_to_data_url(file)
    await db.execute(
        "UPDATE products SET image_url = $1 WHERE id = $2",
        data_url,
        product_id,
    )
    await log_staff_action(
        actor=admin,
        action="product.image_upload",
        entity_type="product",
        entity_id=product_id,
        details={"filename": file.filename, "bytes": len(data_url)},
        db=db,
    )
    return {"status": "success", "image_url": data_url[:80] + "…", "has_image": True}


@router.delete("/products/{product_id}/image")
async def clear_product_image(product_id: int, token: str):
    """Remove product photo (Shop falls back to placeholder)."""
    admin = await check_admin(token)
    db = await get_db()
    await db.execute("UPDATE products SET image_url = NULL WHERE id = $1", product_id)
    await log_staff_action(
        actor=admin,
        action="product.image_clear",
        entity_type="product",
        entity_id=product_id,
        db=db,
    )
    return {"status": "success"}


@router.delete("/products/{product_id}")
async def delete_product(product_id: int, token: str):
    """Delete product from master catalog"""
    admin = await check_admin(token)
    
    db = await get_db()
    
    await db.execute("DELETE FROM products WHERE id = $1", product_id)
    await log_staff_action(
        actor=admin,
        action="product.delete",
        entity_type="product",
        entity_id=product_id,
        db=db,
    )
    
    return {"status": "success"}


# ============================================
# ORDERS - Platform-wide
# ============================================
@router.get("/orders")
async def get_all_orders(token: str, status: str = None, limit: int = 50, offset: int = 0):
    """Get all orders platform-wide. status=UNPAID filters abandoned UPI checkouts."""
    admin = await check_admin(token)
    
    db = await get_db()
    try:
        await db.execute(
            "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30)"
        )
        await db.execute(
            "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30)"
        )
        await db.execute(
            "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2)"
        )
    except Exception:
        pass

    query = """
        SELECT fo.id, 
               fo.customer_phone,
               fo.created_at,
               fo.status,
               fo.payment_status,
               fo.payment_method,
               fo.track_token,
               COUNT(DISTINCT so.id) as store_count,
               COALESCE(fo.total_amount, SUM(so.total_amount), 0) as total_amount
        FROM final_orders fo
        LEFT JOIN store_orders so ON fo.id = so.final_order_id
    """
    
    params = []
    where = []
    status_key = (status or "").strip().upper()
    if status_key and status_key not in ("ALL", ""):
        if status_key in ("UNPAID", "PENDING_PAYMENT", "PENDING"):
            where.append(
                "(UPPER(COALESCE(fo.status, '')) = 'PENDING_PAYMENT' "
                "OR UPPER(COALESCE(fo.payment_status, '')) IN ('PENDING', 'UNPAID')) "
                "AND UPPER(COALESCE(fo.payment_status, '')) <> 'EXPIRED'"
            )
        elif status_key == "EXPIRED":
            where.append(
                "UPPER(COALESCE(fo.payment_status, '')) = 'EXPIRED'"
            )
        else:
            params.append(status_key)
            where.append(f"fo.status = ${len(params)}")

    if where:
        query += " WHERE " + " AND ".join(where)

    query += """
        GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status,
                 fo.payment_status, fo.payment_method, fo.track_token, fo.total_amount
        ORDER BY fo.created_at DESC
    """
    params.extend([limit, offset])
    query += f" LIMIT ${len(params) - 1} OFFSET ${len(params)}"
    
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
               fo.payment_status, fo.payment_method, fo.track_token,
               COUNT(DISTINCT so.id) as store_count,
               COALESCE(fo.total_amount, SUM(so.total_amount), 0) as total_amount
        FROM final_orders fo
        LEFT JOIN store_orders so ON fo.id = so.final_order_id
        WHERE fo.id = $1
        GROUP BY fo.id, fo.customer_phone, fo.created_at, fo.status,
                 fo.payment_status, fo.payment_method, fo.track_token, fo.total_amount
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

async def ensure_whatsapp_messages_schema(db):
    """Older DBs may be missing timestamp columns — add them idempotently."""
    await db.execute("""
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id SERIAL PRIMARY KEY,
            phone VARCHAR(20) NOT NULL,
            message TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'PENDING',
            whatsapp_message_id VARCHAR(100),
            attempts INTEGER DEFAULT 0,
            last_error TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            sent_at TIMESTAMPTZ,
            delivered_at TIMESTAMPTZ,
            read_at TIMESTAMPTZ
        )
    """)
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING'")
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(100)")
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0")
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS last_error TEXT")
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()")
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ")
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ")
    await db.execute("ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ")
    await db.execute("""
        ALTER TABLE whatsapp_messages
        ADD COLUMN IF NOT EXISTS final_order_id INTEGER
    """)


async def _normalize_whatsapp_statuses(db):
    """Repair null/lowercase/legacy status values so filters & stats work."""
    try:
        await ensure_whatsapp_messages_schema(db)
        await db.execute("""
            UPDATE whatsapp_messages
            SET status = UPPER(BTRIM(status::text))
            WHERE status IS NOT NULL
              AND status::text <> UPPER(BTRIM(status::text))
        """)
        await db.execute("""
            UPDATE whatsapp_messages
            SET status = CASE
                WHEN read_at IS NOT NULL THEN 'READ'
                WHEN delivered_at IS NOT NULL THEN 'DELIVERED'
                WHEN sent_at IS NOT NULL THEN 'SENT'
                WHEN last_error IS NOT NULL THEN 'FAILED'
                ELSE 'PENDING'
            END
            WHERE status IS NULL OR BTRIM(COALESCE(status::text, '')) = ''
        """)
    except Exception as e:
        # Never block the messages list because of a repair query
        print(f"⚠️ WhatsApp status normalize skipped: {e}")


def _serialize_wa_row(row) -> dict:
    d = dict(row)
    for key in ("created_at", "sent_at", "delivered_at", "read_at"):
        val = d.get(key)
        if val is not None and hasattr(val, "isoformat"):
            d[key] = val.isoformat()
        elif key not in d:
            d[key] = None
    if d.get("status") is not None:
        d["status"] = str(d["status"]).strip().upper() or "PENDING"
    else:
        d["status"] = "PENDING"
    return d


@router.get("/whatsapp/messages")
async def get_whatsapp_messages(token: str, phone: str = None, status: str = None, limit: int = 100, offset: int = 0):
    """Get WhatsApp message history (status filtering is done in the admin UI)."""
    await check_admin(token)

    db = await get_db()
    await ensure_whatsapp_messages_schema(db)
    await _normalize_whatsapp_statuses(db)

    # Keep this query simple — complex status expressions were breaking the admin list.
    query = """
        SELECT id, phone, message, status, whatsapp_message_id, attempts, last_error,
               created_at, sent_at, delivered_at, read_at, final_order_id
        FROM whatsapp_messages
        WHERE 1=1
    """
    params = []
    param_count = 1

    if phone:
        query += (
            f" AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)"
            f" = RIGHT(REGEXP_REPLACE(${param_count}::text, '[^0-9]', '', 'g'), 10)"
        )
        params.append(phone)
        param_count += 1

    # Optional server filter (UI usually sends none and filters client-side)
    if status:
        query += f" AND UPPER(COALESCE(status, 'PENDING')) = ${param_count}"
        params.append(status.upper())
        param_count += 1

    query += f" ORDER BY id DESC LIMIT ${param_count} OFFSET ${param_count + 1}"
    params.extend([limit, offset])

    messages = await db.fetch(query, *params)
    return [_serialize_wa_row(m) for m in messages]


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
    await check_admin(token)
    
    db = await get_db()
    await ensure_whatsapp_messages_schema(db)
    await _normalize_whatsapp_statuses(db)
    
    try:
        stats = await db.fetchrow("""
            SELECT 
                COUNT(*) as total_messages,
                COUNT(*) FILTER (
                    WHERE COALESCE(NULLIF(UPPER(BTRIM(status::text)), ''), 'PENDING') = 'SENT'
                ) as sent,
                COUNT(*) FILTER (
                    WHERE COALESCE(NULLIF(UPPER(BTRIM(status::text)), ''), 'PENDING') = 'DELIVERED'
                ) as delivered,
                COUNT(*) FILTER (
                    WHERE COALESCE(NULLIF(UPPER(BTRIM(status::text)), ''), 'PENDING') = 'READ'
                ) as read,
                COUNT(*) FILTER (
                    WHERE COALESCE(NULLIF(UPPER(BTRIM(status::text)), ''), 'PENDING') = 'FAILED'
                ) as failed,
                COUNT(*) FILTER (
                    WHERE COALESCE(NULLIF(UPPER(BTRIM(status::text)), ''), 'PENDING') = 'PENDING'
                ) as pending,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
            FROM whatsapp_messages
        """)

        other = await db.fetch("""
            SELECT COALESCE(NULLIF(UPPER(BTRIM(status::text)), ''), 'PENDING') AS status,
                   COUNT(*) AS count
            FROM whatsapp_messages
            GROUP BY 1
            ORDER BY count DESC
        """)
    except Exception as e:
        print(f"❌ whatsapp/stats failed: {e}")
        total = await db.fetchval("SELECT COUNT(*) FROM whatsapp_messages")
        return {
            "total_messages": int(total or 0),
            "sent": 0,
            "delivered": 0,
            "read": 0,
            "failed": 0,
            "pending": 0,
            "last_24h": 0,
            "by_status": {},
        }
    
    result = {k: int(v or 0) for k, v in dict(stats).items()}
    result["by_status"] = {
        (row["status"] or "PENDING"): int(row["count"] or 0) for row in other
    }
    return result


@router.get("/whatsapp/inbound")
async def get_whatsapp_inbound(token: str, limit: int = 30):
    """Recent inbound Meta webhook events (to diagnose STATUS#/ACCEPT# not firing)."""
    await check_admin(token)
    db = await get_db()

    await db.execute("""
        CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
            id SERIAL PRIMARY KEY,
            kind VARCHAR(40),
            phone VARCHAR(30),
            text TEXT,
            payload JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    rows = await db.fetch("""
        SELECT id, kind, phone, text, created_at
        FROM whatsapp_webhook_events
        ORDER BY id DESC
        LIMIT $1
    """, limit)

    return [dict(r) for r in rows]


@router.post("/whatsapp/subscribe-waba")
async def subscribe_whatsapp_waba(token: str):
    """
    Subscribe this Meta app to the WhatsApp Business Account webhooks.
    Fixes inbound STATUS#/ACCEPT# when UI shows messages subscribed but nothing arrives.
    """
    await check_admin(token)
    from app.services.whatsapp.webhook_setup import ensure_waba_subscribed
    return await ensure_waba_subscribed()


@router.post("/whatsapp/simulate-inbound")
async def simulate_whatsapp_inbound(token: str, data: dict):
    """
    Run a WhatsApp command path without Meta delivering a webhook.
    Body: { "phone": "91...", "text": "STATUS#1" }
    """
    await check_admin(token)
    from app.api.whatsapp import _parse_command
    from app.services.order_status import (
        get_final_status,
        apply_store_action,
        cancel_final_order,
    )
    from app.services.whatsapp import send_message
    from app.utils.phone import normalize_phone
    from app.db.database import get_db

    phone = normalize_phone((data or {}).get("phone") or "")
    text = ((data or {}).get("text") or "STATUS#1").strip()
    action, order_id = _parse_command(text)

    if not action or order_id is None:
        return {"ok": False, "error": f"Could not parse command from: {text}"}

    db = await get_db()

    if action == "STATUS":
        current = await get_final_status(order_id, db=db)
        msg = f"📦 Order {order_id}: {current or 'NOT FOUND'}"
        sent = await send_message(phone, msg) if phone else False
        return {"ok": True, "action": action, "message": msg, "whatsapp_sent": sent}

    if action == "CANCEL":
        result = await cancel_final_order(order_id, db=db)
        sent = await send_message(phone, result["message"]) if phone else False
        return {**result, "action": action, "whatsapp_sent": sent}

    if action in ("ACCEPT", "READY", "REJECT", "COMPLETE", "COMPLETED"):
        result = await apply_store_action(order_id, action, phone, db=db)
        sent = await send_message(phone, result["message"]) if phone else False
        return {**result, "action": action, "whatsapp_sent": sent}

    return {"ok": False, "error": f"Unsupported action {action}"}


# ============================================
# QC BENCHMARKS — weekly Blinkit/Instamart samples
# ============================================
@router.get("/qc-benchmarks")
async def admin_list_qc_benchmarks(token: str, city: str = None):
    await check_admin(token)
    from app.services.qc_benchmark import list_baskets
    rows = await list_baskets(city=city)
    for r in rows:
        if r.get("sampled_on") and hasattr(r["sampled_on"], "isoformat"):
            r["sampled_on"] = r["sampled_on"].isoformat()
        if r.get("created_at") and hasattr(r["created_at"], "isoformat"):
            r["created_at"] = r["created_at"].isoformat()
        r["basket_total"] = float(r.get("basket_total") or 0)
    return rows


@router.get("/qc-benchmarks/{basket_id}")
async def admin_get_qc_benchmark(basket_id: int, token: str):
    await check_admin(token)
    from app.services.qc_benchmark import get_basket
    basket = await get_basket(basket_id)
    if not basket:
        raise HTTPException(status_code=404, detail="Basket not found")
    if basket.get("sampled_on") and hasattr(basket["sampled_on"], "isoformat"):
        basket["sampled_on"] = basket["sampled_on"].isoformat()
    if basket.get("created_at") and hasattr(basket["created_at"], "isoformat"):
        basket["created_at"] = basket["created_at"].isoformat()
    return basket


@router.post("/qc-benchmarks/sanity")
async def admin_qc_sanity_preview(token: str, data: dict):
    """Preview sanity warnings before saving/publishing."""
    await check_admin(token)
    from app.services.qc_benchmark import preview_sanity
    return {
        "warnings": await preview_sanity(
            city=(data or {}).get("city") or "",
            source=(data or {}).get("source") or "typical_qc",
            items=(data or {}).get("items") or [],
            exclude_id=(data or {}).get("exclude_id"),
        )
    }


@router.post("/qc-benchmarks")
async def admin_create_qc_benchmark(token: str, data: dict):
    admin = await check_admin(token)
    from app.services.qc_benchmark import create_basket
    try:
        basket = await create_basket(
            city=(data or {}).get("city"),
            source=(data or {}).get("source") or "typical_qc",
            sampled_on=(data or {}).get("sampled_on"),
            note=(data or {}).get("note"),
            items=(data or {}).get("items") or [],
            created_by=admin["id"],
            proof_url=(data or {}).get("proof_url"),
            proof_note=(data or {}).get("proof_note"),
            status=(data or {}).get("status") or "draft",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return basket


@router.post("/qc-benchmarks/{basket_id}/publish")
async def admin_publish_qc_benchmark(basket_id: int, token: str):
    admin = await check_admin(token)
    from app.services.qc_benchmark import publish_basket
    try:
        basket = await publish_basket(basket_id, published_by=admin["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return basket


@router.post("/qc-benchmarks/{basket_id}/unpublish")
async def admin_unpublish_qc_benchmark(basket_id: int, token: str):
    await check_admin(token)
    from app.services.qc_benchmark import unpublish_basket
    basket = await unpublish_basket(basket_id)
    if not basket:
        raise HTTPException(status_code=404, detail="Basket not found")
    return basket


@router.delete("/qc-benchmarks/{basket_id}")
async def admin_delete_qc_benchmark(basket_id: int, token: str):
    await check_admin(token)
    from app.services.qc_benchmark import delete_basket
    await delete_basket(basket_id)
    return {"status": "deleted", "id": basket_id}
