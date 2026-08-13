"""
Manual quick-commerce price benchmarks (Blinkit / Instamart samples).
Not live prices — admin enters weekly samples; draft → publish with sanity checks.
"""
from datetime import date, datetime
from typing import List

from app.db.database import get_db

# Soft price bounds for sanity warnings (INR)
PRICE_MIN_WARN = 1.0
PRICE_MAX_WARN = 25000.0
WEEK_OVER_WEEK_PCT = 50.0


async def ensure_qc_schema(db=None):
    db = db or await get_db()
    await db.execute("""
        CREATE TABLE IF NOT EXISTS qc_benchmark_baskets (
            id SERIAL PRIMARY KEY,
            city TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'typical_qc',
            sampled_on DATE NOT NULL DEFAULT CURRENT_DATE,
            note TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            proof_url TEXT,
            proof_note TEXT,
            created_by INTEGER,
            published_by INTEGER,
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    # Idempotent column adds for older drafts of this table
    for stmt in (
        "ALTER TABLE qc_benchmark_baskets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'",
        "ALTER TABLE qc_benchmark_baskets ADD COLUMN IF NOT EXISTS proof_url TEXT",
        "ALTER TABLE qc_benchmark_baskets ADD COLUMN IF NOT EXISTS proof_note TEXT",
        "ALTER TABLE qc_benchmark_baskets ADD COLUMN IF NOT EXISTS published_by INTEGER",
        "ALTER TABLE qc_benchmark_baskets ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ",
    ):
        try:
            await db.execute(stmt)
        except Exception:
            pass
    await db.execute("""
        CREATE TABLE IF NOT EXISTS qc_benchmark_items (
            id SERIAL PRIMARY KEY,
            basket_id INTEGER NOT NULL REFERENCES qc_benchmark_baskets(id) ON DELETE CASCADE,
            product_key TEXT NOT NULL,
            display_name TEXT,
            price NUMERIC(12,2) NOT NULL,
            unit_note TEXT
        )
    """)


def _norm(s: str) -> str:
    return " ".join((s or "").lower().replace("-", " ").split())


def _match_key(query: str, product_key: str, display_name: str = None) -> bool:
    q = _norm(query)
    key = _norm(product_key)
    name = _norm(display_name or "")
    if not q or not key:
        return False
    if q == key or q in key or key in q:
        return True
    if name and (q in name or name in q):
        return True
    q_tokens = set(q.split())
    key_tokens = set(key.split()) | set(name.split())
    return bool(q_tokens & key_tokens)


def _serialize_basket(data: dict) -> dict:
    if not data:
        return data
    for k in ("sampled_on", "created_at", "published_at"):
        v = data.get(k)
        if v and hasattr(v, "isoformat"):
            data[k] = v.isoformat()
    if "basket_total" in data:
        data["basket_total"] = float(data.get("basket_total") or 0)
    for it in data.get("items") or []:
        if "price" in it:
            it["price"] = float(it["price"])
    return data


async def list_baskets(city: str = None, db=None):
    db = db or await get_db()
    await ensure_qc_schema(db)
    if city:
        rows = await db.fetch("""
            SELECT b.*,
                   (SELECT COUNT(*) FROM qc_benchmark_items i WHERE i.basket_id = b.id) as item_count,
                   (SELECT COALESCE(SUM(price), 0) FROM qc_benchmark_items i WHERE i.basket_id = b.id) as basket_total
            FROM qc_benchmark_baskets b
            WHERE LOWER(b.city) = LOWER($1)
            ORDER BY b.sampled_on DESC, b.id DESC
            LIMIT 50
        """, city.strip())
    else:
        rows = await db.fetch("""
            SELECT b.*,
                   (SELECT COUNT(*) FROM qc_benchmark_items i WHERE i.basket_id = b.id) as item_count,
                   (SELECT COALESCE(SUM(price), 0) FROM qc_benchmark_items i WHERE i.basket_id = b.id) as basket_total
            FROM qc_benchmark_baskets b
            ORDER BY b.sampled_on DESC, b.id DESC
            LIMIT 50
        """)
    return [_serialize_basket(dict(r)) for r in rows]


async def get_basket(basket_id: int, db=None):
    db = db or await get_db()
    await ensure_qc_schema(db)
    basket = await db.fetchrow("SELECT * FROM qc_benchmark_baskets WHERE id = $1", basket_id)
    if not basket:
        return None
    items = await db.fetch("""
        SELECT id, product_key, display_name, price, unit_note
        FROM qc_benchmark_items
        WHERE basket_id = $1
        ORDER BY id
    """, basket_id)
    data = dict(basket)
    data["items"] = [dict(i) for i in items]
    data["basket_total"] = sum(float(i["price"] or 0) for i in items)
    return _serialize_basket(data)


async def _prev_published_prices(city: str, source: str, exclude_id: int = None, db=None):
    db = db or await get_db()
    params = [city, source]
    exclude_sql = ""
    if exclude_id:
        params.append(exclude_id)
        exclude_sql = f" AND b.id <> ${len(params)}"
    row = await db.fetchrow(f"""
        SELECT b.id FROM qc_benchmark_baskets b
        WHERE LOWER(b.city) = LOWER($1)
          AND LOWER(b.source) = LOWER($2)
          AND b.status = 'published'
          {exclude_sql}
        ORDER BY b.sampled_on DESC, b.id DESC
        LIMIT 1
    """, *params)
    if not row:
        return {}
    items = await db.fetch("""
        SELECT product_key, price FROM qc_benchmark_items WHERE basket_id = $1
    """, row["id"])
    return {_norm(i["product_key"]): float(i["price"]) for i in items}


def sanity_check_items(items: List[dict], prev_prices: dict = None) -> List[dict]:
    """Return list of {level, message, product_key} warnings."""
    warnings = []
    prev_prices = prev_prices or {}
    seen = set()
    for it in items or []:
        key = _norm(it.get("product_key") or it.get("name") or "")
        label = it.get("display_name") or it.get("name") or key or "?"
        try:
            price = float(it.get("price"))
        except (TypeError, ValueError):
            warnings.append({
                "level": "error",
                "product_key": key,
                "message": f"Invalid price for “{label}”",
            })
            continue
        if not key:
            warnings.append({
                "level": "error",
                "product_key": "",
                "message": "Item missing product name/key",
            })
            continue
        if key in seen:
            warnings.append({
                "level": "warn",
                "product_key": key,
                "message": f"Duplicate key “{key}” in this basket",
            })
        seen.add(key)
        if price < PRICE_MIN_WARN or price > PRICE_MAX_WARN:
            warnings.append({
                "level": "warn",
                "product_key": key,
                "message": f"“{label}” ₹{price} looks unusual (expected ~₹{PRICE_MIN_WARN}–₹{PRICE_MAX_WARN})",
            })
        if key in prev_prices and prev_prices[key] > 0:
            old = prev_prices[key]
            pct = abs(price - old) / old * 100
            if pct >= WEEK_OVER_WEEK_PCT:
                warnings.append({
                    "level": "warn",
                    "product_key": key,
                    "message": (
                        f"“{label}” ₹{price} is {pct:.0f}% different from last published ₹{old:.2f}"
                    ),
                })
    return warnings


async def preview_sanity(city: str, source: str, items: List[dict], exclude_id: int = None, db=None):
    prev = await _prev_published_prices(city, source, exclude_id=exclude_id, db=db)
    return sanity_check_items(items, prev)


async def create_basket(
    city: str,
    source: str,
    sampled_on: str = None,
    note: str = None,
    items: List[dict] = None,
    created_by: int = None,
    proof_url: str = None,
    proof_note: str = None,
    status: str = "draft",
    db=None,
):
    db = db or await get_db()
    await ensure_qc_schema(db)
    city = (city or "").strip()
    source = (source or "typical_qc").strip().lower()
    if not city:
        raise ValueError("city required")
    if source not in ("blinkit", "instamart", "zepto", "typical_qc"):
        source = "typical_qc"
    status = "published" if status == "published" else "draft"

    sampled = sampled_on or date.today().isoformat()
    published_by = created_by if status == "published" else None
    row = await db.fetchrow("""
        INSERT INTO qc_benchmark_baskets
            (city, source, sampled_on, note, status, proof_url, proof_note, created_by,
             published_by, published_at)
        VALUES (
            $1, $2, $3::date, $4, $5, $6, $7, $8, $9,
            CASE WHEN $5 = 'published' THEN NOW() ELSE NULL END
        )
        RETURNING id
    """, city, source, sampled, note, status, proof_url, proof_note, created_by, published_by)
    basket_id = row["id"]

    for it in items or []:
        key = _norm(it.get("product_key") or it.get("name") or "")
        if not key:
            continue
        try:
            price = float(it.get("price"))
        except (TypeError, ValueError):
            continue
        if price < 0:
            continue
        await db.execute("""
            INSERT INTO qc_benchmark_items (basket_id, product_key, display_name, price, unit_note)
            VALUES ($1, $2, $3, $4, $5)
        """, basket_id, key, it.get("display_name") or it.get("name") or key, price, it.get("unit_note"))

    basket = await get_basket(basket_id, db=db)
    prev = await _prev_published_prices(city, source, exclude_id=basket_id, db=db)
    basket["warnings"] = sanity_check_items(basket.get("items") or [], prev)
    return basket


async def publish_basket(basket_id: int, published_by: int = None, db=None):
    db = db or await get_db()
    await ensure_qc_schema(db)
    basket = await get_basket(basket_id, db=db)
    if not basket:
        raise ValueError("Basket not found")
    if not basket.get("items"):
        raise ValueError("Cannot publish empty basket")
    prev = await _prev_published_prices(basket["city"], basket["source"], exclude_id=basket_id, db=db)
    warnings = sanity_check_items(basket.get("items") or [], prev)
    errors = [w for w in warnings if w["level"] == "error"]
    if errors:
        raise ValueError(errors[0]["message"])

    await db.execute("""
        UPDATE qc_benchmark_baskets
        SET status = 'published',
            published_by = $2,
            published_at = NOW()
        WHERE id = $1
    """, basket_id, published_by)
    basket = await get_basket(basket_id, db=db)
    basket["warnings"] = warnings
    return basket


async def unpublish_basket(basket_id: int, db=None):
    db = db or await get_db()
    await ensure_qc_schema(db)
    await db.execute("""
        UPDATE qc_benchmark_baskets
        SET status = 'draft', published_at = NULL, published_by = NULL
        WHERE id = $1
    """, basket_id)
    return await get_basket(basket_id, db=db)


async def delete_basket(basket_id: int, db=None):
    db = db or await get_db()
    await ensure_qc_schema(db)
    await db.execute("DELETE FROM qc_benchmark_baskets WHERE id = $1", basket_id)


async def latest_basket_for_city(city: str = None, source: str = None, db=None):
    """Latest *published* sample only (drafts never shown to customers)."""
    db = db or await get_db()
    await ensure_qc_schema(db)
    params = []
    where = ["status = 'published'"]
    if city:
        params.append(city.strip())
        where.append(f"LOWER(city) = LOWER(${len(params)})")
    if source:
        params.append(source.strip().lower())
        where.append(f"LOWER(source) = LOWER(${len(params)})")
    sql = "SELECT id FROM qc_benchmark_baskets WHERE " + " AND ".join(where)
    sql += " ORDER BY sampled_on DESC, id DESC LIMIT 1"
    row = await db.fetchrow(sql, *params)
    if not row and city:
        row = await db.fetchrow("""
            SELECT id FROM qc_benchmark_baskets
            WHERE status = 'published'
            ORDER BY sampled_on DESC, id DESC LIMIT 1
        """)
    if not row:
        return None
    return await get_basket(row["id"], db=db)


async def compare_items(item_names: List[str], city: str = None, source: str = None, db=None):
    basket = await latest_basket_for_city(city=city, source=source, db=db)
    if not basket:
        return {
            "available": False,
            "message": "No published quick-commerce sample yet.",
            "matched": [],
            "qc_total": 0,
            "matched_count": 0,
            "query_count": len(item_names or []),
        }

    items = basket.get("items") or []
    matched = []
    used_ids = set()

    for raw in item_names or []:
        q = (raw or "").strip()
        if not q:
            continue
        best = None
        for it in items:
            if it["id"] in used_ids:
                continue
            if _match_key(q, it["product_key"], it.get("display_name")):
                best = it
                break
        if best:
            used_ids.add(best["id"])
            matched.append({
                "query": q,
                "product_key": best["product_key"],
                "display_name": best.get("display_name") or best["product_key"],
                "price": float(best["price"]),
                "unit_note": best.get("unit_note"),
            })

    qc_total = sum(m["price"] for m in matched)
    return {
        "available": True,
        "disclaimer": "Sampled weekly estimate — not live Blinkit/Instamart prices.",
        "city": basket.get("city"),
        "source": basket.get("source"),
        "sampled_on": basket.get("sampled_on"),
        "basket_id": basket.get("id"),
        "matched": matched,
        "qc_total": round(qc_total, 2),
        "matched_count": len(matched),
        "query_count": len([x for x in (item_names or []) if (x or "").strip()]),
        "note": basket.get("note"),
    }
