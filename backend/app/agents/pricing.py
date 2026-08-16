class Pricing:

    print("🔥 PRICING FILE LOADED")

    async def run(self, context):
        print("🔥 PRICING RUN STARTED")
        from app.db.database import get_db
        from app.agents.brands import brand_matches, display_name
        import math

        db = await get_db()

        products = context.get("matched_products") or []
        print("🧠 PRODUCTS IN PRICING:", products)

        price_matrix = {}

        for p in products:
            name = p.get("name")
            preferred_brand = (p.get("preferred_brand") or "").strip()
            
            print(f"\n💰 PRICING: Looking up '{name}' (want brand={preferred_brand or 'any'})...")

            # Prefer exact brand SKUs first when requested
            if preferred_brand:
                rows = await db.fetch("""
                    SELECT 
                        s.name as store,
                        s.phone,
                        sp.price,
                        sp.brand,
                        sp.variant,
                        sp.size,
                        sp.unit,
                        sp.stock,
                        pr.base_unit
                    FROM store_products sp
                    JOIN stores s ON sp.store_id = s.id
                    JOIN products pr ON sp.product_id = pr.id
                    WHERE LOWER(pr.name) = LOWER($1)
                    ORDER BY
                      CASE WHEN LOWER(COALESCE(sp.brand,'')) LIKE LOWER($2) THEN 0 ELSE 1 END,
                      sp.price ASC
                """, name, f"%{preferred_brand}%")
            else:
                rows = await db.fetch("""
                    SELECT 
                        s.name as store,
                        s.phone,
                        sp.price,
                        sp.brand,
                        sp.variant,
                        sp.size,
                        sp.unit,
                        sp.stock,
                        pr.base_unit
                    FROM store_products sp
                    JOIN stores s ON sp.store_id = s.id
                    JOIN products pr ON sp.product_id = pr.id
                    WHERE LOWER(pr.name) = LOWER($1)
                """, name)

            print(f"🔍 '{name}': Found {len(rows)} options across stores")

            if not rows:
                print(f"⚠️ No pricing found for '{name}' - product not in any store")
                price_matrix[name] = []
                continue

            options = []
            brand_hit_count = 0

            for r in rows:
                stock_emoji = '✅' if (r.get("stock", 0) or 0) > 0 else '❌'
                is_brand = brand_matches(preferred_brand, r.get("brand"))
                if preferred_brand and is_brand:
                    brand_hit_count += 1
                print(f"  {stock_emoji} {r.get('store')}: {r.get('brand')} {r.get('variant')} {r.get('size')}{r.get('unit')} - ₹{r.get('price')} (stock: {r.get('stock', 0)}) brand_match={is_brand}")

                base_unit = (r.get("base_unit") or "").lower()

                # 🔥 STOCK HANDLING (SAFE)
                is_available = (r.get("stock", 0) or 0) > 0

                user_unit = (p.get("unit") or "").lower()
                count_units = {"pcs", "pc", "item", "items", "unit", "pack", "packs", "x", "dozen"}

                # Shop cart qty means "number of packs/pieces", not grams of the pack size in the name
                if user_unit in count_units or user_unit == "":
                    packs = max(1, int(math.ceil(float(p.get("qty") or 1))))
                else:
                    # 🔥 USER REQUIRED QTY → BASE UNIT
                    required_qty = self.convert_to_base(
                        p.get("qty", 1),
                        p.get("unit"),
                        base_unit
                    )

                    # 🔥 PACK SIZE → BASE UNIT
                    pack_size = self.convert_to_base(
                        float(r.get("size") or 1),  # Convert Decimal to float
                        r.get("unit"),
                        base_unit
                    )

                    if pack_size <= 0:
                        continue

                    packs = math.ceil(required_qty / pack_size)

                unit_price = float(r.get("price", 0))
                total_price = packs * unit_price

                # 🔥 KEY: DO NOT REMOVE — JUST DEPRIORITIZE
                # Reduced penalty to still show out-of-stock items at bottom
                if not is_available:
                    total_price = total_price + 500  # push down but still visible

                # Soft penalty when brand requested but this SKU is different
                if preferred_brand and not is_brand:
                    total_price = total_price + 300

                label = display_name(name, r.get("brand"), preferred_brand)

                options.append({
                    "name": name,
                    "display_name": label,
                    "store": r.get("store"),
                    "phone": r.get("phone"),

                    # 🔥 PRICING
                    "price": total_price,
                    "real_price": packs * unit_price,
                    "unit_price": unit_price,

                    # 🔥 STOCK FLAG
                    "available": is_available,

                    # 🔥 QUANTITY
                    "packs": packs,

                    # 🔥 META
                    "brand": r.get("brand"),
                    "preferred_brand": preferred_brand or None,
                    "brand_match": bool(is_brand) if preferred_brand else True,
                    "variant": r.get("variant"),
                    "size": r.get("size"),
                    "unit": r.get("unit"),
                    "base_unit": base_unit
                })

            if preferred_brand:
                print(f"  🏷️ Brand '{preferred_brand}' matches: {brand_hit_count}/{len(options)}")

            price_matrix[name] = options

        context.set("price_matrix", price_matrix)
        return context

    # 🔥 CORE: BASE UNIT CONVERSION
    def convert_to_base(self, qty, unit, base_unit):
        unit = (unit or "").lower()
        base_unit = (base_unit or "").lower()

        # ✅ SAME UNIT
        if unit == base_unit:
            return qty

        # 🧂 MASS (g)
        if base_unit == "g":
            if unit == "kg":
                return qty * 1000
            if unit == "g":
                return qty

        # 🥛 VOLUME (L as base)
        if base_unit == "l":
            if unit == "ml":
                return qty / 1000  # 500ml → 0.5L
            if unit == "l":
                return qty

        # 🥛 VOLUME (ml as base)
        if base_unit == "ml":
            if unit == "l":
                return qty * 1000  # 1L → 1000ml
            if unit == "ml":
                return qty

        # ⚖️ MASS (kg as base)
        if base_unit == "kg":
            if unit == "g":
                return qty / 1000  # 500g → 0.5kg
            if unit == "kg":
                return qty

        # 🥚 COUNT
        if base_unit in ["pcs", "unit"]:
            return qty

        # ⚠️ fallback
        return qty