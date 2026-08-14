"""Store inventory CSV import (match master catalog + set price/stock)."""
from __future__ import annotations

import csv
import io
import re
from typing import Any, Dict, List, Optional, Tuple

MAX_ROWS = 2000

CSV_HEADERS = ["name", "brand", "size", "unit", "price", "stock"]

SAMPLE_ROWS_A = [
    ["Onion", "", "1", "kg", "28", "50"],
    ["Potato", "", "1", "kg", "32", "50"],
    ["Tomato", "", "1", "kg", "40", "40"],
    ["Amul Gold Milk", "Amul", "1", "l", "68", "30"],
    ["Amul Toned Milk", "Amul", "1", "l", "58", "30"],
    ["Eggs", "", "12", "pcs", "85", "20"],
    ["Aashirvaad Atta", "Aashirvaad", "5", "kg", "275", "15"],
    ["Toor Dal", "", "1", "kg", "145", "20"],
    ["Sugar", "", "1", "kg", "48", "25"],
    ["Fortune Sunflower Oil", "Fortune", "1", "l", "145", "18"],
    ["Maggi 2-Minute Noodles", "Maggi", "70", "g", "14", "40"],
    ["Parle-G", "Parle", "800", "g", "55", "20"],
    ["Tata Tea Premium", "Tata Tea", "500", "g", "285", "12"],
    ["Surf Excel", "Surf Excel", "1", "kg", "135", "15"],
    ["Bisleri Water", "Bisleri", "1", "l", "20", "40"],
]

SAMPLE_ROWS_B = [
    ["Onion", "", "1", "kg", "30", "40"],
    ["Potato", "", "1", "kg", "30", "40"],
    ["Tomato", "", "1", "kg", "38", "35"],
    ["Amul Gold Milk", "Amul", "1", "l", "70", "25"],
    ["Amul Butter", "Amul", "100", "g", "58", "20"],
    ["Eggs", "", "12", "pcs", "82", "25"],
    ["Fortune Chakki Atta", "Fortune", "5", "kg", "265", "12"],
    ["Moong Dal", "", "1", "kg", "130", "18"],
    ["Salt", "Tata", "1", "kg", "28", "30"],
    ["Saffola Gold Oil", "Saffola", "1", "l", "175", "10"],
    ["Lays Classic Salted", "Lays", "52", "g", "20", "35"],
    ["Britannia Good Day", "Britannia", "200", "g", "40", "20"],
    ["Nescafe Classic", "Nescafe", "50", "g", "165", "10"],
    ["Dove Soap", "Dove", "75", "g", "55", "20"],
    ["Vim Dishwash Liquid", "Vim", "500", "ml", "110", "12"],
]


def build_store_inventory_template(which: str = "a") -> str:
    rows = SAMPLE_ROWS_A if which.lower() != "b" else SAMPLE_ROWS_B
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_HEADERS)
    w.writerows(rows)
    return buf.getvalue()


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (h or "").strip().lower()).strip("_")


HEADER_ALIASES = {
    "name": "name",
    "product": "name",
    "product_name": "name",
    "brand": "brand",
    "size": "size",
    "unit": "unit",
    "price": "price",
    "mrp": "price",
    "selling_price": "price",
    "stock": "stock",
    "qty": "stock",
    "quantity": "stock",
}


def _parse_num(v: Any) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_store_inventory_csv(text: str) -> Tuple[List[Dict[str, Any]], List[str]]:
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
        return [], ["CSV must include a 'name' (or product_name) column"]
    if "price" not in field_map.values():
        return [], ["CSV must include a 'price' column"]

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
        price = _parse_num(mapped.get("price"))
        if price is None or price < 0:
            errors.append(f"Row {i}: invalid price")
            continue
        stock = _parse_num(mapped.get("stock"))
        stock_i = int(stock) if stock is not None else 0
        size = _parse_num(mapped.get("size"))
        rows.append(
            {
                "name": name[:200],
                "brand": (mapped.get("brand") or "")[:120],
                "size": size,
                "unit": (mapped.get("unit") or "").strip()[:40],
                "price": round(float(price), 2),
                "stock": max(0, stock_i),
                "line": i,
            }
        )
    return rows, errors


async def import_store_inventory(db, store_id: int, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    created = 0
    updated = 0
    skipped = 0
    failed: List[str] = []

    for row in rows:
        name = row["name"]
        brand = row["brand"]
        unit = row["unit"]
        size = row["size"]
        try:
            # Prefer exact-ish match on name+brand (+ size/unit when provided)
            if size is not None and unit:
                master = await db.fetchrow(
                    """
                    SELECT id, brand, variant, size, unit, COALESCE(unit, base_unit) AS u
                    FROM products
                    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                      AND LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM($2))
                      AND COALESCE(size, 1) = COALESCE($3::numeric, 1)
                      AND LOWER(TRIM(COALESCE(unit, base_unit, ''))) = LOWER(TRIM($4))
                    LIMIT 1
                    """,
                    name,
                    brand,
                    size,
                    unit,
                )
            else:
                master = None

            if not master:
                master = await db.fetchrow(
                    """
                    SELECT id, brand, variant, size, unit, COALESCE(unit, base_unit) AS u
                    FROM products
                    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                      AND (
                        $2 = '' OR LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM($2))
                      )
                    ORDER BY id
                    LIMIT 1
                    """,
                    name,
                    brand,
                )

            if not master:
                failed.append(f"Row {row['line']}: '{name}' not in master catalog")
                continue

            existing = await db.fetchrow(
                """
                SELECT id FROM store_products
                WHERE store_id = $1 AND product_id = $2
                """,
                store_id,
                master["id"],
            )
            if existing:
                await db.execute(
                    """
                    UPDATE store_products
                    SET price = $1, stock = $2, updated_at = NOW()
                    WHERE id = $3
                    """,
                    row["price"],
                    row["stock"],
                    existing["id"],
                )
                updated += 1
            else:
                await db.execute(
                    """
                    INSERT INTO store_products (
                      store_id, product_id, brand, variant, size, unit, price, stock, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                    """,
                    store_id,
                    master["id"],
                    master.get("brand") or brand or "",
                    master.get("variant") or "",
                    master.get("size") or size or 1,
                    master.get("unit") or master.get("u") or unit or "unit",
                    row["price"],
                    row["stock"],
                )
                created += 1
        except Exception as e:
            failed.append(f"Row {row['line']}: {e}")
            skipped += 1

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "failed_count": len(failed),
        "failed": failed[:40],
        "total_rows": len(rows),
    }
