from app.db.database import get_db


class Matcher:
    # Common brand names to strip from search queries
    BRAND_KEYWORDS = [
        'amul', 'mother dairy', 'britannia', 'parle', 'nestle', 'maggi',
        'tata', 'fortune', 'saffola', 'sundrop', 'dalda', 'aashirvaad',
        'india gate', 'kohinoor', 'daawat', 'basmati', 'annapurna',
        'pillsbury', 'horlicks', 'bournvita', 'complan', 'boost'
    ]
    
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

            if not name:
                continue

            print(f"🔍 MATCHER: Searching for '{name}'")
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
    
    def _strip_brand_keywords(self, search_name):
        """Remove common brand names from search query"""
        cleaned = search_name.lower().strip()
        
        for brand in self.BRAND_KEYWORDS:
            # Remove brand at start
            if cleaned.startswith(brand + ' '):
                cleaned = cleaned[len(brand)+1:].strip()
            # Remove brand at end
            if cleaned.endswith(' ' + brand):
                cleaned = cleaned[:-len(brand)-1].strip()
        
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
            # Common synonyms (Hindi/English)
            'basmati': 'rice',
            'basmathi': 'rice',  # Common typo
            'basumati': 'rice',  # Common typo
            'atta': 'wheat flour',
            'maida': 'refined flour',
            'besan': 'gram flour',
            'doodh': 'milk',
            'dhood': 'milk',  # Common typo
            'tel': 'oil',
            'tail': 'oil',  # Common typo
            'cheeni': 'sugar',
            'chini': 'sugar',  # Common typo
            'namak': 'salt',
            'chawal': 'rice',
            'chaawal': 'rice',  # Common typo
            # Brand name typos
            'amool': 'milk',
            'ammul': 'milk',
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
            for word in sorted(words, key=len, reverse=True):  # Try longest words first
                if len(word) > 2:  # Skip very short words
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
        
        # No match found, use original
        print(f"  ⚠️ No fuzzy match for '{search_name}', using as-is")
        return search_name
