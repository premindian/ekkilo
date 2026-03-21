class Matcher:
    async def run(self, context):
        parsed = context.get("parsed_items")

        if not parsed:
            print("⚠️ No parsed items")
            context.set("matched_products", [])
            return context

        matched = []

        for p in parsed:
            name = (p.get("name") or "").strip().lower()

            if not name:
                continue

            matched.append({
                "name": name,
                "qty": p.get("qty", 1),
                "unit": p.get("unit", "unit")
            })

        print("🧠 MATCHED:", matched)

        context.set("matched_products", matched)
        return context