from app.db.database import get_db


class Matcher:
    async def run(self, context):
        parsed = context.get("parsed_items")

        if not parsed:
            print("⚠️ No parsed items")
            context.set("matched_products", [])
            return context

        matched = []
        db = await get_db()

        for p in parsed:
            name = (p.get("name") or "").strip().lower()

            if not name:
                continue

            # Use fuzzy search to find matching products
            try:
                product_matches = await db.fetch("""
                    SELECT * FROM search_products($1)
                """, name)
                
                if product_matches:
                    # Use the best match (first result)
                    best_match = product_matches[0]
                    matched_name = best_match['product_name']
                    print(f"  ✓ Matched '{name}' → '{matched_name}' (score: {best_match['match_score']:.2f})")
                else:
                    # No match found, use original
                    matched_name = name
                    print(f"  ⚠️ No match for '{name}', using as-is")
                
                matched.append({
                    "name": matched_name,
                    "qty": p.get("qty", 1),
                    "unit": p.get("unit", "unit")
                })
            except Exception as e:
                print(f"  ❌ Error matching '{name}': {e}")
                # Fallback to original name
                matched.append({
                    "name": name,
                    "qty": p.get("qty", 1),
                    "unit": p.get("unit", "unit")
                })

        print("🧠 MATCHED:", matched)

        context.set("matched_products", matched)
        return context