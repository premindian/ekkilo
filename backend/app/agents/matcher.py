from app.db.database import get_db
from app.agents.brands import extract_brand, BRAND_KEYWORDS


class Matcher:
    BRAND_KEYWORDS = BRAND_KEYWORDS
    
    async def run(self, context):
        parsed = context.get("parsed_items")

        if not parsed:
            print("⚠️ No parsed items")
            context.set("matched_products", [])
            return context

        print(f"🔍 MATCHER: Processing {len(parsed)} items")
        matched = []
        db = await get_db()

        for p in parsed:
            name = (p.get("name") or "").strip().lower()
            preferred_brand = p.get("preferred_brand")
            raw_name = (p.get("raw_name") or name).strip().lower()

            if not name and not raw_name:
                continue

            # Ensure brand is captured even if parser missed it
            if not preferred_brand:
                cleaned, preferred_brand = extract_brand(raw_name or name)
                if cleaned:
                    name = cleaned

            search_name = name or raw_name
            print(f"🔍 MATCHER: Searching for '{search_name}' (brand={preferred_brand})")
            matched_name = search_name
            
            # Try using search_products function if it exists
            try:
                product_matches = await db.fetch("""
                    SELECT * FROM search_products($1)
                """, search_name)
                
                if product_matches:
                    best_match = product_matches[0]
                    matched_name = best_match['product_name']
                    print(f"  ✓ Matched '{search_name}' → '{matched_name}' (score: {best_match['match_score']:.2f})")
                else:
                    print(f"  ⚠️ No match via search_products for '{search_name}', trying direct match")
                    matched_name = await self._fallback_match(db, search_name)
            except Exception as e:
                print(f"  ⚠️ search_products error for '{search_name}': {e}, trying direct match")
                try:
                    matched_name = await self._fallback_match(db, search_name)
                except Exception as e2:
                    print(f"  ❌ Fallback match error for '{search_name}': {e2}, using as-is")
                    matched_name = search_name
            
            matched.append({
                "name": matched_name,
                "qty": p.get("qty", 1),
                "unit": p.get("unit", "unit"),
                "preferred_brand": preferred_brand,
                "raw_name": raw_name,
            })

        print("🧠 MATCHED:", matched)

        context.set("matched_products", matched)
        return context
    
    def _strip_brand_keywords(self, search_name):
        cleaned, _ = extract_brand(search_name)
        return cleaned if cleaned else search_name
    
    async def _fallback_match(self, db, search_name):
        """Direct fuzzy matching against products table with smart brand stripping"""
        
        # STRATEGY 1: Try exact match first
        row = await db.fetchrow("""
            SELECT name FROM products 
            WHERE LOWER(name) = LOWER($1)
            LIMIT 1
        """, search_name)
        
        if row:
            exact = row['name']
            print(f"  ✓ Exact match: '{search_name}' → '{exact}'")
            return exact
        
        # STRATEGY 2: Strip brand keywords and try again
        cleaned_name = self._strip_brand_keywords(search_name)
        if cleaned_name != search_name:
            print(f"  🧹 Stripped brands: '{search_name}' → '{cleaned_name}'")
            
            row = await db.fetchrow("""
                SELECT name FROM products 
                WHERE LOWER(name) = LOWER($1)
                LIMIT 1
            """, cleaned_name)
            
            if row:
                exact_cleaned = row['name']
                print(f"  ✓ Exact match after cleaning: '{cleaned_name}' → '{exact_cleaned}'")
                return exact_cleaned
        
        # STRATEGY 3: Partial match on cleaned name (contains)
        row = await db.fetchrow("""
            SELECT name FROM products 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY LENGTH(name)
            LIMIT 1
        """, f"%{cleaned_name}%")
        
        if row:
            partial = row['name']
            print(f"  ✓ Partial match: '{cleaned_name}' → '{partial}'")
            return partial
        
        # STRATEGY 4: Reverse partial match (product name is in search query)
        row = await db.fetchrow("""
            SELECT name FROM products 
            WHERE LOWER($1) LIKE LOWER('%' || name || '%')
            ORDER BY LENGTH(name) DESC
            LIMIT 1
        """, search_name)
        
        if row:
            reverse = row['name']
            print(f"  ✓ Reverse match: '{search_name}' → '{reverse}'")
            return reverse
        
        # STRATEGY 5: Try common product synonyms + typos
        synonyms = {
            'basmati': 'rice',
            'basmathi': 'rice',
            'basumati': 'rice',
            'atta': 'wheat flour',
            'maida': 'refined flour',
            'besan': 'gram flour',
            'doodh': 'milk',
            'dhood': 'milk',
            'tel': 'oil',
            'tail': 'oil',
            'cheeni': 'sugar',
            'chini': 'sugar',
            'namak': 'salt',
            'chawal': 'rice',
            'chaawal': 'rice',
        }
        
        for key, value in synonyms.items():
            if key in search_name.lower():
                row = await db.fetchrow("""
                    SELECT name FROM products 
                    WHERE LOWER(name) LIKE LOWER($1)
                    ORDER BY LENGTH(name)
                    LIMIT 1
                """, f"%{value}%")
                
                if row:
                    synonym_match = row['name']
                    print(f"  ✓ Synonym match: '{search_name}' ({key}) → '{synonym_match}'")
                    return synonym_match
        
        # STRATEGY 6: Try word-by-word matching (last resort)
        words = cleaned_name.split()
        if len(words) > 1:
            for word in sorted(words, key=len, reverse=True):
                if len(word) > 2:
                    row = await db.fetchrow("""
                        SELECT name FROM products 
                        WHERE LOWER(name) LIKE LOWER($1)
                        ORDER BY LENGTH(name)
                        LIMIT 1
                    """, f"%{word}%")
                    
                    if row:
                        word_match = row['name']
                        print(f"  ✓ Word match: '{search_name}' (word: '{word}') → '{word_match}'")
                        return word_match
        
        print(f"  ⚠️ No fuzzy match for '{search_name}', using as-is")
        return search_name
