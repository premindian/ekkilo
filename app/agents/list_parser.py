import re

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
            match = re.search(r"(\d+)\s*(kg|g|l|ml|pcs)?", item)

            if match:
                qty = int(match.group(1))
                unit = match.group(2) or "unit"

                name = item.replace(match.group(0), "").strip()
            else:
                name = item.strip()

                # 🔥 apply default if exists
                default = DEFAULTS.get(name)
                if default:
                    qty = default["qty"]
                    unit = default["unit"]
                else:
                    qty = 1
                    unit = "unit"

            parsed.append({
                "name": name,
                "qty": qty,
                "unit": unit
            })

        print("🧠 PARSED:", parsed)

        context.set("parsed_items", parsed)
        return context