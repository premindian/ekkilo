import re
from app.agents.brands import extract_brand

# 🔥 Default quantities for common items
DEFAULTS = {
    "milk": {"qty": 1, "unit": "l"},
    "sugar": {"qty": 1, "unit": "kg"},
    "rice": {"qty": 1, "unit": "kg"},
    "oil": {"qty": 1, "unit": "l"},
    "eggs": {"qty": 6, "unit": "pcs"},
}

class ListParser:
    async def run(self, context):
        text = context.get("user_text")

        if not text:
            context.set("parsed_items", [])
            return context

        raw_items = text.split(",")
        parsed = []

        for item in raw_items:
            item = item.strip().lower()

            # 🔍 extract quantity + unit (supports kg, g, l, ml, pcs)
            match = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs)?", item)

            if match:
                qty = float(match.group(1))
                if qty == int(qty):
                    qty = int(qty)
                unit = match.group(2) or "unit"

                name = item.replace(match.group(0), "").strip()
            else:
                name = item.strip()

                # 🔥 apply default if exists (after brand strip for lookup)
                product_only, _ = extract_brand(name)
                default = DEFAULTS.get(product_only) or DEFAULTS.get(name)
                if default:
                    qty = default["qty"]
                    unit = default["unit"]
                else:
                    qty = 1
                    unit = "unit"

            product_name, preferred_brand = extract_brand(name)
            # Keep a searchable product name; fall back to original if empty
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
