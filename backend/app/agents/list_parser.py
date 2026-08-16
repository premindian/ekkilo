import re
from app.agents.brands import extract_brand, BRAND_KEYWORDS, BRAND_ALIASES, normalize_text
from app.db.database import get_db

# Fallback product tokens if DB catalog is empty
DEFAULT_PRODUCTS = [
    "basmati rice", "wheat flour", "refined flour", "gram flour",
    "cooking oil", "mustard oil", "coconut oil",
    "milk", "sugar", "rice", "oil", "eggs", "salt", "atta",
    "tea", "coffee", "bread", "butter", "ghee", "curd", "dal",
    "toor dal", "moong dal", "chana dal", "urad dal",
]

DEFAULTS = {
    "milk": {"qty": 1, "unit": "l"},
    "sugar": {"qty": 1, "unit": "kg"},
    "rice": {"qty": 1, "unit": "kg"},
    "basmati rice": {"qty": 1, "unit": "kg"},
    "oil": {"qty": 1, "unit": "l"},
    "eggs": {"qty": 6, "unit": "pcs"},
    "salt": {"qty": 1, "unit": "kg"},
}


def _split_raw_segments(text: str):
    """Split on commas / and / & / newlines first."""
    parts = re.split(r"[,|\n]|(?:\band\b)|(?:\b&\b)", text, flags=re.IGNORECASE)
    return [p.strip() for p in parts if p.strip()]


def _greedy_split_products(segment: str, known_products: list):
    """
    Split a space-separated phrase into product items using longest-match.
    Supports optional brand prefixes: "amul milk tata salt", "india gate basmati rice".
    """
    remaining = normalize_text(segment)
    if not remaining:
        return []

    # Normalize typos / no-space brands (indiagate → india gate)
    for alias, canonical in BRAND_ALIASES.items():
        token = f" {alias} "
        if remaining == alias or f" {remaining} ".find(token) >= 0:
            remaining = normalize_text(remaining.replace(alias, canonical))

    brands = sorted(set(BRAND_KEYWORDS), key=len, reverse=True)
    products = sorted(set(known_products), key=len, reverse=True)
    found = []

    while remaining:
        remaining = remaining.strip()
        if not remaining:
            break

        matched = None

        # brand + product (longest product first)
        for brand in brands:
            if not (remaining == brand or remaining.startswith(brand + " ")):
                continue
            after_brand = remaining[len(brand):].strip()
            if not after_brand:
                matched = brand  # brand alone; rare
                break
            for product in products:
                if after_brand == product or after_brand.startswith(product + " "):
                    matched = f"{brand} {product}"
                    break
            if matched:
                break
            # brand matched but no known product yet — keep scanning products without forcing

        if not matched:
            for product in products:
                if remaining == product or remaining.startswith(product + " "):
                    matched = product
                    break

        if not matched:
            # take next word as a fallback item
            parts = remaining.split(None, 1)
            matched = parts[0]
            remaining = parts[1] if len(parts) > 1 else ""
        else:
            remaining = remaining[len(matched):].strip()

        found.append(matched)

    return found


class ListParser:
    async def run(self, context):
        text = context.get("user_text")

        if not text:
            context.set("parsed_items", [])
            return context

        known_products = list(DEFAULT_PRODUCTS)
        try:
            db = await get_db()
            rows = await db.fetch("""
                SELECT name FROM products
                WHERE name IS NOT NULL AND TRIM(name) <> ''
                ORDER BY LENGTH(name) DESC
            """)
            if rows:
                known_products = [r["name"].lower().strip() for r in rows]
        except Exception as e:
            print(f"⚠️ ListParser catalog load failed: {e}")

        segments = _split_raw_segments(text)
        # If user typed "milk rice" (no commas), greedily split into catalog items
        raw_items = []
        for seg in segments:
            has_count_marker = bool(
                re.search(
                    r"(?:^|\s)(?:\d+(?:\.\d+)?\s*(?:x|×)|(?:x|×)\s*\d+(?:\.\d+)?)\b",
                    seg,
                    flags=re.IGNORECASE,
                )
            )
            # Keep "3 x Amul Butter 100g" intact so pack size isn't split away from qty
            if has_count_marker:
                raw_items.append(seg)
            elif ("," not in text and " and " not in text.lower()
                    and "&" not in text and len(seg.split()) > 1):
                raw_items.extend(_greedy_split_products(seg, known_products))
            else:
                # still try greedy when a comma-segment has multiple known products
                words = seg.split()
                if len(words) > 1:
                    split = _greedy_split_products(seg, known_products)
                    # Only use greedy split if it found 2+ items; else keep whole phrase
                    # (preserves "india gate basmati rice" as one item)
                    if len(split) >= 2:
                        raw_items.extend(split)
                    else:
                        raw_items.append(seg)
                else:
                    raw_items.append(seg)

        parsed = []

        for item in raw_items:
            item = item.strip().lower()
            if not item:
                continue

            qty = None
            unit = None

            # Prefer explicit pack-count markers so "Amul Butter 100g x 3" → qty 3
            # (not 100 from the pack size embedded in the name).
            count_match = re.search(
                r"(?:^|\s)(?:x|×)\s*(\d+(?:\.\d+)?)\s*$|(?:^|\s)(\d+(?:\.\d+)?)\s*(?:x|×)\s+",
                item,
            )
            if count_match:
                qty_raw = count_match.group(1) or count_match.group(2)
                qty = float(qty_raw)
                if qty == int(qty):
                    qty = int(qty)
                unit = "pcs"
                item = (item[: count_match.start()] + " " + item[count_match.end() :]).strip()
                item = re.sub(r"\s+", " ", item)

            # Trailing bare count after a product phrase: "banana 3", "aashirvaad atta 5kg 2"
            if qty is None:
                trailing = re.search(r"^(.*\D)\s+(\d+(?:\.\d+)?)\s*$", item)
                if trailing:
                    head = trailing.group(1).strip()
                    # Only treat as order qty if the head already has a pack size OR is a known multi-word product
                    if re.search(r"\d+(?:\.\d+)?\s*(kg|g|l|ml|pcs|ltr|liter|litre)\b", head) or len(head.split()) >= 1:
                        qty = float(trailing.group(2))
                        if qty == int(qty):
                            qty = int(qty)
                        unit = "pcs"
                        item = head

            # Pack-size / amount in the remaining text (e.g. "2kg sugar", "milk 1l")
            if qty is None:
                match = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs|ltr|liter|litre)?\b", item)
                if match:
                    qty = float(match.group(1))
                    if qty == int(qty):
                        qty = int(qty)
                    raw_unit = (match.group(2) or "").lower()
                    if raw_unit in ("ltr", "liter", "litre"):
                        raw_unit = "l"
                    unit = raw_unit or "unit"
                    name = item.replace(match.group(0), "").strip()
                else:
                    name = item.strip()
                    product_only, _ = extract_brand(name)
                    default = DEFAULTS.get(product_only) or DEFAULTS.get(name)
                    if default:
                        qty = default["qty"]
                        unit = default["unit"]
                    else:
                        qty = 1
                        unit = "unit"
            else:
                name = item.strip()
                if not unit:
                    unit = "pcs"

            product_name, preferred_brand = extract_brand(name)
            if not product_name:
                product_name = name

            parsed.append({
                "name": product_name,
                "raw_name": name,
                "qty": qty,
                "unit": unit,
                "preferred_brand": preferred_brand,
            })

        print("🧠 PARSED:", parsed)

        context.set("parsed_items", parsed)
        return context
