"""Admin CSV import for master products catalog."""
from __future__ import annotations

import csv
import io
import re
from typing import Any, Dict, List, Optional, Tuple

from app.services.catalog import CATEGORIES, CATEGORY_KEYWORDS, ensure_catalog_schema
from app.services.product_images import validate_image_url

CSV_HEADERS = [
    "name",
    "brand",
    "variant",
    "size",
    "unit",
    "category",
    "image_url",
    "display_name",
]

MAX_ROWS = 5000

# Short starter dump — everyday kirana SKUs (edit/extend in Excel, re-import).
SAMPLE_ROWS = [
    ["Onion", "", "", "1", "kg", "vegetables-fruits", "", "Onion"],
    ["Potato", "", "", "1", "kg", "vegetables-fruits", "", "Potato"],
    ["Tomato", "", "", "1", "kg", "vegetables-fruits", "", "Tomato"],
    ["Green Chilli", "", "", "250", "g", "vegetables-fruits", "", "Green Chilli"],
    ["Banana", "", "", "1", "dozen", "vegetables-fruits", "", "Banana"],
    ["Amul Gold Milk", "Amul", "Gold", "1", "l", "dairy", "", "Amul Gold Milk 1L"],
    ["Amul Toned Milk", "Amul", "Toned", "1", "l", "dairy", "", "Amul Toned Milk 1L"],
    ["Mother Dairy Curd", "Mother Dairy", "", "400", "g", "dairy", "", "Mother Dairy Curd 400g"],
    ["Amul Butter", "Amul", "", "100", "g", "dairy", "", "Amul Butter 100g"],
    ["Eggs", "", "", "12", "pcs", "dairy", "", "Eggs (12)"],
    ["Paneer", "", "", "200", "g", "dairy", "", "Paneer 200g"],
    ["Aashirvaad Atta", "Aashirvaad", "Whole Wheat", "5", "kg", "staples", "", "Aashirvaad Atta 5kg"],
    ["Fortune Chakki Atta", "Fortune", "Chakki Fresh", "5", "kg", "staples", "", "Fortune Atta 5kg"],
    ["India Gate Basmati Rice", "India Gate", "Classic", "1", "kg", "staples", "", "India Gate Basmati 1kg"],
    ["Sona Masoori Rice", "", "", "5", "kg", "staples", "", "Sona Masoori Rice 5kg"],
    ["Toor Dal", "", "", "1", "kg", "staples", "", "Toor Dal 1kg"],
    ["Moong Dal", "", "", "1", "kg", "staples", "", "Moong Dal 1kg"],
    ["Chana Dal", "", "", "1", "kg", "staples", "", "Chana Dal 1kg"],
    ["Sugar", "", "", "1", "kg", "staples", "", "Sugar 1kg"],
    ["Salt", "Tata", "Iodised", "1", "kg", "staples", "", "Tata Salt 1kg"],
    ["Fortune Sunflower Oil", "Fortune", "Sunflower", "1", "l", "oils", "", "Fortune Sunflower Oil 1L"],
    ["Saffola Gold Oil", "Saffola", "Gold", "1", "l", "oils", "", "Saffola Gold 1L"],
    ["Amul Ghee", "Amul", "", "1", "l", "oils", "", "Amul Ghee 1L"],
    ["Mustard Oil", "", "", "1", "l", "oils", "", "Mustard Oil 1L"],
    ["MDH Garam Masala", "MDH", "Garam Masala", "100", "g", "spices", "", "MDH Garam Masala 100g"],
    ["Everest Turmeric", "Everest", "Haldi", "200", "g", "spices", "", "Everest Turmeric 200g"],
    ["Red Chilli Powder", "", "", "100", "g", "spices", "", "Red Chilli Powder 100g"],
    ["Jeera", "", "", "100", "g", "spices", "", "Jeera 100g"],
    ["Maggi 2-Minute Noodles", "Maggi", "Masala", "70", "g", "snacks", "", "Maggi Masala 70g"],
    ["Lays Classic Salted", "Lays", "Classic", "52", "g", "snacks", "", "Lays Classic 52g"],
    ["Kurkure Masala Munch", "Kurkure", "Masala Munch", "90", "g", "snacks", "", "Kurkure Masala Munch"],
    ["Haldiram Bhujia", "Haldiram", "Bhujia", "200", "g", "snacks", "", "Haldiram Bhujia 200g"],
    ["Parle-G", "Parle", "G", "800", "g", "bakery", "", "Parle-G 800g"],
    ["Britannia Good Day", "Britannia", "Butter", "200", "g", "bakery", "", "Britannia Good Day 200g"],
    ["Britannia Bread", "Britannia", "White", "400", "g", "bakery", "", "Britannia Bread 400g"],
    ["Oreo", "Cadbury", "Original", "120", "g", "bakery", "", "Oreo 120g"],
    ["Tata Tea Premium", "Tata Tea", "Premium", "500", "g", "beverages", "", "Tata Tea Premium 500g"],
    ["Red Label Tea", "Brooke Bond", "Red Label", "500", "g", "beverages", "", "Red Label 500g"],
    ["Nescafe Classic", "Nescafe", "Classic", "50", "g", "beverages", "", "Nescafe Classic 50g"],
    ["Coca-Cola", "Coca-Cola", "", "750", "ml", "beverages", "", "Coca-Cola 750ml"],
    ["Sprite", "Sprite", "", "750", "ml", "beverages", "", "Sprite 750ml"],
    ["Bisleri Water", "Bisleri", "", "1", "l", "beverages", "", "Bisleri 1L"],
    ["Real Mixed Fruit Juice", "Real", "Mixed Fruit", "1", "l", "beverages", "", "Real Juice 1L"],
    ["Dove Soap", "Dove", "", "75", "g", "personal-care", "", "Dove Soap 75g"],
    ["Colgate Strong Teeth", "Colgate", "Strong Teeth", "200", "g", "personal-care", "", "Colgate 200g"],
    ["Clinic Plus Shampoo", "Clinic Plus", "", "180", "ml", "personal-care", "", "Clinic Plus 180ml"],
    ["Dettol Handwash", "Dettol", "", "200", "ml", "personal-care", "", "Dettol Handwash 200ml"],
    ["Surf Excel", "Surf Excel", "", "1", "kg", "household", "", "Surf Excel 1kg"],
    ["Vim Dishwash Liquid", "Vim", "", "500", "ml", "household", "", "Vim Dishwash 500ml"],
    ["Harpic Toilet Cleaner", "Harpic", "", "500", "ml", "household", "", "Harpic 500ml"],
    ["Lizol Floor Cleaner", "Lizol", "", "500", "ml", "household", "", "Lizol 500ml"],
    ["Coriander Leaves", "", "", "100", "g", "vegetables-fruits", "", "Coriander Leaves"],
    ["Ginger", "", "", "250", "g", "vegetables-fruits", "", "Ginger 250g"],
    ["Garlic", "", "", "250", "g", "vegetables-fruits", "", "Garlic 250g"],
    ["Lemon", "", "", "4", "pcs", "vegetables-fruits", "", "Lemon (4)"],
    ["Amul Cheese Cubes", "Amul", "", "200", "g", "dairy", "", "Amul Cheese Cubes 200g"],
    ["Nestle Everyday Dairy Whitener", "Nestle", "Everyday", "400", "g", "dairy", "", "Nestle Everyday 400g"],
    ["Fortune Besan", "Fortune", "", "1", "kg", "staples", "", "Fortune Besan 1kg"],
    ["Urad Dal", "", "", "1", "kg", "staples", "", "Urad Dal 1kg"],
    ["Rajma", "", "", "1", "kg", "staples", "", "Rajma 1kg"],
    ["Kabuli Chana", "", "", "1", "kg", "staples", "", "Kabuli Chana 1kg"],
    ["Everest Chicken Masala", "Everest", "Chicken", "100", "g", "spices", "", "Everest Chicken Masala"],
    ["Hing", "", "", "50", "g", "spices", "", "Hing 50g"],
    ["Bingo Mad Angles", "Bingo", "Mad Angles", "90", "g", "snacks", "", "Bingo Mad Angles"],
    ["Uncle Chipps", "Uncle Chipps", "Spicy Treat", "55", "g", "snacks", "", "Uncle Chipps 55g"],
    ["Hide & Seek", "Parle", "Chocolate", "120", "g", "bakery", "", "Hide & Seek 120g"],
    ["Thums Up", "Thums Up", "", "750", "ml", "beverages", "", "Thums Up 750ml"],
    ["Frooti", "Frooti", "Mango", "160", "ml", "beverages", "", "Frooti 160ml"],
    ["Pears Soap", "Pears", "", "75", "g", "personal-care", "", "Pears Soap 75g"],
    ["Sensodyne", "Sensodyne", "Repair", "70", "g", "personal-care", "", "Sensodyne 70g"],
    ["Comfort Fabric Conditioner", "Comfort", "", "860", "ml", "household", "", "Comfort 860ml"],
    ["Scotch-Brite Scrub Pad", "Scotch-Brite", "", "1", "pcs", "household", "", "Scotch-Brite Scrub"],
]


def build_template_csv(include_samples: bool = True) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADERS)
    if include_samples:
        writer.writerows(SAMPLE_ROWS)
    return buf.getvalue()


def sample_rows_as_dicts() -> List[Dict[str, Any]]:
    """Parse SAMPLE_ROWS into import_products-ready dicts."""
    csv_text = build_template_csv(include_samples=True)
    rows, _errs = parse_csv_text(csv_text)
    return rows


async def seed_starter_catalog(db=None) -> Dict[str, Any]:
    """Idempotent: insert starter SKUs; skip near-duplicates already in catalog."""
    from app.db.database import get_db as _get_db

    db = db or await _get_db()
    rows = sample_rows_as_dicts()
    result = await import_products(db, rows)
    result["source"] = "starter_samples"
    return result


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (h or "").strip().lower()).strip("_")


HEADER_ALIASES = {
    "name": "name",
    "product": "name",
    "product_name": "name",
    "brand": "brand",
    "variant": "variant",
    "size": "size",
    "unit": "unit",
    "base_unit": "unit",
    "category": "category",
    "category_slug": "category",
    "image_url": "image_url",
    "image": "image_url",
    "photo_url": "image_url",
    "display_name": "display_name",
}


def _parse_size(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    m = re.match(r"^([\d.]+)", s.replace(",", ""))
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _guess_category(name: str, brand: str = "") -> Optional[str]:
    text = f"{name} {brand}".lower()
    for kw, slug in CATEGORY_KEYWORDS:
        if kw in text:
            return slug
    return None


def parse_csv_text(text: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Return (rows, parse_errors)."""
    if text.startswith("\ufeff"):
        text = text[1:]
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return [], ["CSV has no header row"]

    field_map = {}
    for h in reader.fieldnames:
        key = HEADER_ALIASES.get(_norm_header(h))
        if key:
            field_map[h] = key

    if "name" not in field_map.values():
        return [], ["CSV must include a 'name' column"]

    rows: List[Dict[str, Any]] = []
    errors: List[str] = []
    for i, raw in enumerate(reader, start=2):
        if i - 1 > MAX_ROWS:
            errors.append(f"Stopped at {MAX_ROWS} data rows (limit)")
            break
        mapped = {field_map[k]: (raw.get(k) or "").strip() for k in field_map}
        name = mapped.get("name") or ""
        if not name:
            if any(mapped.values()):
                errors.append(f"Row {i}: missing name")
            continue
        size = _parse_size(mapped.get("size"))
        unit = (mapped.get("unit") or "unit").strip() or "unit"
        category = (mapped.get("category") or "").strip().lower()
        if category in ("all", ""):
            category = _guess_category(name, mapped.get("brand") or "") or ""
        # validate known slugs
        valid_slugs = {c[0] for c in CATEGORIES if c[0] != "all"}
        if category and category not in valid_slugs:
            errors.append(f"Row {i}: unknown category '{category}' (kept uncategorized)")
            category = ""

        image_url = mapped.get("image_url") or ""
        if image_url:
            try:
                image_url = validate_image_url(image_url) or ""
            except Exception as e:
                detail = getattr(e, "detail", None) or str(e)
                errors.append(f"Row {i}: bad image_url ({detail})")
                image_url = ""

        rows.append({
            "name": name[:200],
            "brand": (mapped.get("brand") or "")[:120],
            "variant": (mapped.get("variant") or "")[:120],
            "size": size if size is not None else 1,
            "unit": unit[:40],
            "category": category,
            "image_url": image_url or None,
            "display_name": (mapped.get("display_name") or name)[:200],
            "line": i,
        })
    return rows, errors


async def import_products(db, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    await ensure_catalog_schema(db)
    cats = await db.fetch("SELECT id, slug FROM product_categories")
    slug_to_id = {c["slug"]: c["id"] for c in cats}

    created = 0
    skipped = 0
    failed = []

    for row in rows:
        name = row["name"]
        brand = row["brand"]
        size = row["size"]
        unit = row["unit"]
        try:
            existing = await db.fetchval(
                """
                SELECT id FROM products
                WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                  AND LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM($2))
                  AND COALESCE(size, 1) = COALESCE($3::numeric, 1)
                  AND LOWER(TRIM(COALESCE(unit, base_unit, ''))) = LOWER(TRIM($4))
                LIMIT 1
                """,
                name,
                brand or "",
                size,
                unit,
            )
        except Exception:
            # Older schema without brand/size/unit
            existing = await db.fetchval(
                """
                SELECT id FROM products
                WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                LIMIT 1
                """,
                name,
            )

        if existing:
            skipped += 1
            continue

        category_id = slug_to_id.get(row["category"]) if row.get("category") else None
        try:
            await db.execute(
                """
                INSERT INTO products (
                    name, brand, variant, size, unit, base_unit,
                    category_id, image_url, display_name
                )
                VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)
                """,
                name,
                brand or None,
                row["variant"] or None,
                size,
                unit,
                category_id,
                row.get("image_url"),
                row.get("display_name") or name,
            )
            created += 1
        except Exception as e1:
            try:
                await db.execute(
                    """
                    INSERT INTO products (name, brand, variant, size, unit, category_id, image_url, display_name)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """,
                    name,
                    brand or None,
                    row["variant"] or None,
                    size,
                    unit,
                    category_id,
                    row.get("image_url"),
                    row.get("display_name") or name,
                )
                created += 1
            except Exception as e2:
                try:
                    await db.execute(
                        "INSERT INTO products (name, base_unit) VALUES ($1, $2)",
                        name,
                        unit,
                    )
                    created += 1
                except Exception as e3:
                    failed.append({
                        "line": row.get("line"),
                        "name": name,
                        "error": str(e3)[:200] or str(e2)[:200] or str(e1)[:200],
                    })

    return {
        "created": created,
        "skipped": skipped,
        "failed": failed[:50],
        "failed_count": len(failed),
        "total_rows": len(rows),
    }
