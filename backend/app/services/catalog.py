"""
Product catalog for Blinkit-style browse (categories + optional images).
"""
from decimal import Decimal

from app.db.database import get_db

CATEGORIES = [
    ("all", "All", "🛒", 0),
    ("vegetables-fruits", "Vegetables & Fruits", "🥬", 10),
    ("dairy", "Dairy & Eggs", "🥛", 20),
    ("staples", "Rice, Atta & Dal", "🌾", 30),
    ("oils", "Oils & Ghee", "🫙", 40),
    ("spices", "Spices & Masala", "🌶️", 50),
    ("snacks", "Snacks & Namkeen", "🍿", 60),
    ("bakery", "Bakery & Biscuits", "🍪", 70),
    ("beverages", "Drinks & Juices", "🥤", 80),
    ("personal-care", "Personal Care", "🧴", 90),
    ("household", "Household", "🧹", 100),
]

# keyword → category slug (first match wins; longer keywords first)
CATEGORY_KEYWORDS = [
    ("green chilli", "vegetables-fruits"),
    ("coriander", "vegetables-fruits"),
    ("tomato", "vegetables-fruits"),
    ("potato", "vegetables-fruits"),
    ("onion", "vegetables-fruits"),
    ("banana", "vegetables-fruits"),
    ("apple", "vegetables-fruits"),
    ("vegetable", "vegetables-fruits"),
    ("fruit", "vegetables-fruits"),
    ("mirchi", "vegetables-fruits"),
    ("milk", "dairy"),
    ("curd", "dairy"),
    ("paneer", "dairy"),
    ("butter", "dairy"),
    ("egg", "dairy"),
    ("ghee", "oils"),
    ("oil", "oils"),
    ("atta", "staples"),
    ("flour", "staples"),
    ("rice", "staples"),
    ("dal", "staples"),
    ("dhal", "staples"),
    ("sugar", "staples"),
    ("salt", "staples"),
    ("wheat", "staples"),
    ("masala", "spices"),
    ("spice", "spices"),
    ("turmeric", "spices"),
    ("chilli powder", "spices"),
    ("jeera", "spices"),
    ("biscuit", "bakery"),
    ("cookie", "bakery"),
    ("bread", "bakery"),
    ("rusk", "bakery"),
    ("cake", "bakery"),
    ("chip", "snacks"),
    ("namkeen", "snacks"),
    ("snack", "snacks"),
    ("juice", "beverages"),
    ("soda", "beverages"),
    ("tea", "beverages"),
    ("coffee", "beverages"),
    ("water", "beverages"),
    ("shampoo", "personal-care"),
    ("soap", "personal-care"),
    ("toothpaste", "personal-care"),
    ("detergent", "household"),
    ("cleaner", "household"),
    ("phenol", "household"),
]


def _rec(row, key, default=None):
    """Safe Record / mapping access (asyncpg Record may or may not support .get)."""
    try:
        if hasattr(row, "get"):
            return row.get(key, default)
        return row[key]
    except (KeyError, IndexError, TypeError):
        return default


def _to_float(value):
    if value is None:
        return None
    try:
        if isinstance(value, Decimal):
            return float(value)
        return float(value)
    except (TypeError, ValueError):
        return None


async def ensure_catalog_schema(db=None):
    db = db or await get_db()
    await db.execute("""
        CREATE TABLE IF NOT EXISTS product_categories (
            id SERIAL PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            icon TEXT,
            sort_order INTEGER DEFAULT 100,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    for stmt in (
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS display_name TEXT",
        # Older DBs often only have products(id, name, base_unit); brand/size live on store_products.
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS variant TEXT",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS size NUMERIC",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT",
    ):
        try:
            await db.execute(stmt)
        except Exception:
            pass

    for slug, name, icon, sort_order in CATEGORIES:
        if slug == "all":
            continue
        await db.execute("""
            INSERT INTO product_categories (slug, name, icon, sort_order)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (slug) DO UPDATE
            SET name = EXCLUDED.name,
                icon = EXCLUDED.icon,
                sort_order = EXCLUDED.sort_order
        """, slug, name, icon, sort_order)

    # Auto-categorize uncategorized products once
    cats = await db.fetch("SELECT id, slug FROM product_categories")
    slug_to_id = {c["slug"]: c["id"] for c in cats}
    rows = await db.fetch("""
        SELECT id, name FROM products
        WHERE category_id IS NULL
        LIMIT 2000
    """)
    for row in rows:
        name = (_rec(row, "name") or "").lower()
        matched = None
        for kw, slug in CATEGORY_KEYWORDS:
            if kw in name:
                matched = slug_to_id.get(slug)
                break
        if matched:
            await db.execute(
                "UPDATE products SET category_id = $1 WHERE id = $2",
                matched, _rec(row, "id"),
            )


def _placeholder(name: str, category_icon: str = "🛒") -> str:
    """Deterministic colorful SVG placeholder (no external CDN required)."""
    label = (name or "?")[:18].replace("&", "and")
    # simple hash → hue
    h = sum(ord(c) for c in (name or "x")) % 360
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="hsl({h},55%,92%)"/>'
        f'<stop offset="100%" stop-color="hsl({(h+40)%360},50%,82%)"/>'
        f'</linearGradient></defs>'
        f'<rect width="400" height="400" fill="url(#g)"/>'
        f'<text x="200" y="170" text-anchor="middle" font-size="72">{category_icon or "🛒"}</text>'
        f'<text x="200" y="250" text-anchor="middle" font-size="28" fill="#1f2937" '
        f'font-family="Segoe UI,Arial,sans-serif">{label}</text>'
        f'</svg>'
    )
    from urllib.parse import quote
    return "data:image/svg+xml;charset=utf-8," + quote(svg)


async def list_categories(db=None):
    db = db or await get_db()
    await ensure_catalog_schema(db)
    rows = await db.fetch("""
        SELECT c.id, c.slug, c.name, c.icon, c.sort_order,
               COUNT(p.id) as product_count
        FROM product_categories c
        LEFT JOIN products p ON p.category_id = c.id
        WHERE c.is_active IS DISTINCT FROM FALSE
        GROUP BY c.id
        ORDER BY c.sort_order, c.id
    """)
    total = await db.fetchval("SELECT COUNT(*) FROM products")
    out = [{
        "id": 0,
        "slug": "all",
        "name": "All",
        "icon": "🛒",
        "sort_order": 0,
        "product_count": int(total or 0),
    }]
    for r in rows:
        out.append({
            "id": _rec(r, "id"),
            "slug": _rec(r, "slug"),
            "name": _rec(r, "name"),
            "icon": _rec(r, "icon"),
            "sort_order": _rec(r, "sort_order"),
            "product_count": int(_rec(r, "product_count") or 0),
        })
    return out


async def list_products(category: str = None, search: str = None, limit: int = 60, offset: int = 0, db=None):
    db = db or await get_db()
    await ensure_catalog_schema(db)
    limit = max(1, min(int(limit or 60), 100))
    offset = max(0, int(offset or 0))

    where = ["1=1"]
    params = []
    if category and category not in ("all", ""):
        params.append(category)
        where.append(f"(c.slug = ${len(params)} OR CAST(c.id AS TEXT) = ${len(params)})")
    if search and search.strip():
        params.append(f"%{search.strip().lower()}%")
        # brand may be NULL after ADD COLUMN; COALESCE keeps search safe
        where.append(
            f"(LOWER(COALESCE(p.display_name, p.name)) LIKE ${len(params)} "
            f"OR LOWER(COALESCE(p.brand, sp.brand, '')) LIKE ${len(params)})"
        )

    # asyncpg uses 1-based $N; append limit then offset
    params.append(limit)
    lim_i = len(params)
    params.append(offset)
    off_i = len(params)

    # Core product columns + optional brand/size from products or a representative store SKU.
    # Does not invent prices; store_products is only used for display metadata.
    sql = f"""
        SELECT p.id, p.name, p.display_name, p.image_url, p.category_id,
               COALESCE(p.brand, sp.brand) AS brand,
               COALESCE(p.variant, sp.variant) AS variant,
               COALESCE(p.size, sp.size) AS size,
               COALESCE(p.unit, sp.unit, p.base_unit) AS unit,
               c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN LATERAL (
            SELECT brand, variant, size, unit
            FROM store_products
            WHERE product_id = p.id
            ORDER BY id
            LIMIT 1
        ) sp ON TRUE
        WHERE {' AND '.join(where)}
        ORDER BY COALESCE(p.display_name, p.name)
        LIMIT ${lim_i} OFFSET ${off_i}
    """
    try:
        rows = await db.fetch(sql, *params)
    except Exception as primary_err:
        # Fallback if LATERAL / base_unit / store_products shape differs.
        # Columns brand/variant/size/unit are ensured above.
        print(f"catalog list_products primary query failed, using fallback: {primary_err}")
        where_fb = ["1=1"]
        params_fb = []
        if category and category not in ("all", ""):
            params_fb.append(category)
            where_fb.append(
                f"(c.slug = ${len(params_fb)} OR CAST(c.id AS TEXT) = ${len(params_fb)})"
            )
        if search and search.strip():
            params_fb.append(f"%{search.strip().lower()}%")
            where_fb.append(
                f"(LOWER(COALESCE(p.display_name, p.name)) LIKE ${len(params_fb)} "
                f"OR LOWER(COALESCE(p.brand, '')) LIKE ${len(params_fb)})"
            )
        params_fb.append(limit)
        lim_fb = len(params_fb)
        params_fb.append(offset)
        off_fb = len(params_fb)
        sql_fallback = f"""
            SELECT p.id, p.name, p.display_name, p.image_url, p.category_id,
                   p.brand, p.variant, p.size, p.unit,
                   c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon
            FROM products p
            LEFT JOIN product_categories c ON c.id = p.category_id
            WHERE {' AND '.join(where_fb)}
            ORDER BY COALESCE(p.display_name, p.name)
            LIMIT ${lim_fb} OFFSET ${off_fb}
        """
        rows = await db.fetch(sql_fallback, *params_fb)

    items = []
    for r in rows:
        name = _rec(r, "display_name") or _rec(r, "name")
        size = _to_float(_rec(r, "size"))
        unit = _rec(r, "unit")
        unit_note = None
        if size is not None and unit:
            unit_note = f"{size} {unit}".strip()
        elif unit:
            unit_note = str(unit)
        cat_icon = _rec(r, "category_icon") or "🛒"
        raw_img = (_rec(r, "image_url") or "").strip()
        image = raw_img or _placeholder(name, cat_icon)
        items.append({
            "id": _rec(r, "id"),
            "name": name,
            "brand": _rec(r, "brand"),
            "variant": _rec(r, "variant"),
            "size": size,
            "unit": unit,
            "unit_note": unit_note,
            "image_url": image,
            "category_id": _rec(r, "category_id"),
            "category_slug": _rec(r, "category_slug"),
            "category_name": _rec(r, "category_name"),
            "category_icon": cat_icon,
        })
    return items
