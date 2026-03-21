class Pricing:

    print("🔥 PRICING FILE LOADED")

    async def run(self, context):
        print("🔥 PRICING RUN STARTED")
        from app.db.database import get_db
        import math

        db = await get_db()

        products = context.get("matched_products") or []
        print("🧠 PRODUCTS IN PRICING:", products)

        price_matrix = {}

        for p in products:
            name = p.get("name")

            # 🔥 FETCH FROM DB (WITH STOCK)
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

            print("🧠 PRICING ROWS:", rows)

            if not rows:
                print(f"⚠️ No pricing found for {name}")
                price_matrix[name] = []
                continue

            options = []

            for r in rows:

                base_unit = (r.get("base_unit") or "").lower()

                # 🔥 STOCK HANDLING (SAFE)
                is_available = (r.get("stock", 0) or 0) > 0

                # 🔥 USER REQUIRED QTY → BASE UNIT
                required_qty = self.convert_to_base(
                    p.get("qty", 1),
                    p.get("unit"),
                    base_unit
                )

                # 🔥 PACK SIZE → BASE UNIT
                pack_size = self.convert_to_base(
                    r.get("size") or 1,
                    r.get("unit"),
                    base_unit
                )

                if pack_size <= 0:
                    continue

                packs = math.ceil(required_qty / pack_size)

                unit_price = float(r.get("price", 0))
                total_price = packs * unit_price

                # 🔥 KEY: DO NOT REMOVE — JUST DEPRIORITIZE
                if not is_available:
                    total_price = total_price + 100000  # push down in optimizer

                options.append({
                    "name": name,
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
                    "variant": r.get("variant"),
                    "size": r.get("size"),
                    "unit": r.get("unit"),
                    "base_unit": base_unit
                })

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

        # 🥛 VOLUME (ml)
        if base_unit == "ml":
            if unit == "l":
                return qty * 1000
            if unit == "ml":
                return qty

        # 🥚 COUNT
        if base_unit == "pcs":
            return qty

        # ⚠️ fallback
        return qty