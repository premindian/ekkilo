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

            matched_name = name
            
            # Try using search_products function if it exists
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
                    print(f"  ⚠️ No match via search_products for '{name}', trying direct match")
                    # Try direct fuzzy match
                    matched_name = await self._fallback_match(db, name)
            except Exception as e:
                print(f"  ⚠️ search_products error for '{name}': {e}, trying direct match")
                # Try direct fuzzy match
                try:
                    matched_name = await self._fallback_match(db, name)
                except Exception as e2:
                    print(f"  ❌ Fallback match error for '{name}': {e2}, using as-is")
                    matched_name = name
            
            matched.append({
                "name": matched_name,
                "qty": p.get("qty", 1),
                "unit": p.get("unit", "unit")
            })

        print("🧠 MATCHED:", matched)

        context.set("matched_products", matched)
        return context
    
    async def _fallback_match(self, db, search_name):
        """Direct fuzzy matching against products table"""
        # Try exact match first
        exact = await db.fetchval("""
            SELECT name FROM products 
            WHERE LOWER(name) = LOWER($1)
            LIMIT 1
        """, search_name)
        
        if exact:
            print(f"  ✓ Exact match: '{search_name}' → '{exact}'")
            return exact
        
        # Try partial match (contains)
        partial = await db.fetchval("""
            SELECT name FROM products 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY LENGTH(name)
            LIMIT 1
        """, f"%{search_name}%")
        
        if partial:
            print(f"  ✓ Partial match: '{search_name}' → '{partial}'")
            return partial
        
        # Try reverse partial match (product name is in search query)
        reverse = await db.fetchval("""
            SELECT name FROM products 
            WHERE LOWER($1) LIKE LOWER('%' || name || '%')
            ORDER BY LENGTH(name) DESC
            LIMIT 1
        """, search_name)
        
        if reverse:
            print(f"  ✓ Reverse match: '{search_name}' → '{reverse}'")
            return reverse
        
        # No match found, use original
        print(f"  ⚠️ No fuzzy match for '{search_name}', using as-is")
        return search_name