import itertools

class Optimizer:
    async def run(self, context):
        price_matrix = context.get("price_matrix") or {}
        store_meta = context.get("store_meta") or {}

        items = list(price_matrix.keys())
        total_items = len(items) or 1

        options_per_item = []

        for item in items:
            options = price_matrix.get(item, [])
            if not options:
                continue
            options_per_item.append(options)

        best_plan = None
        best_score = float("inf")

        for combo in itertools.product(*options_per_item):
            total_price = 0
            plan = {}
            covered_items = set()
            used_stores = set()
            availability_penalty = 0

            # 🔥 NEW
            brand_bonus = 0
            variant_bonus = 0

            for opt in combo:
                store = opt.get("store")
                total_price += opt.get("price", 0)

                covered_items.add(opt.get("name"))
                if store:
                    used_stores.add(store)

                # ❌ OUT OF STOCK
                if not opt.get("available", True):
                    availability_penalty += 50

                # 🧠 PREFERENCE MATCHING
                pref_brand = (opt.get("preferred_brand") or "").lower()
                pref_variant = (opt.get("preferred_variant") or "").lower()

                brand = (opt.get("brand") or "").lower()
                variant = (opt.get("variant") or "").lower()

                if pref_brand and brand == pref_brand:
                    brand_bonus += 5   # strong signal

                if pref_variant and variant == pref_variant:
                    variant_bonus += 3

                plan.setdefault(store, []).append(opt)

            # -----------------------------
            # 🧠 SCORES
            # -----------------------------

            coverage_ratio = len(covered_items) / total_items
            normalized_price = total_price / total_items

            # 📍 distance
            distances = [
                store_meta.get(s, {}).get("distance")
                for s in used_stores
                if store_meta.get(s, {}).get("distance") is not None
            ]

            avg_distance = sum(distances) / len(distances) if distances else 5
            normalized_distance = avg_distance / 10

            # 🏪 store penalty
            store_penalty = len(used_stores) * 10

            # -----------------------------
            # 🔥 FINAL SCORE (UPGRADED)
            # -----------------------------
            score = (
                (0.5 * normalized_price)
                + (30 * normalized_distance)
                + (40 * (1 - coverage_ratio))
                + store_penalty
                + availability_penalty
                - (brand_bonus)       # ⭐ reward preference
                - (variant_bonus)
            )

            if score < best_score:
                best_score = score
                best_plan = plan

        # -----------------------------
        # 🔥 FINAL TOTAL
        # -----------------------------
        if not best_plan:
            best_plan = {}
            total_price = 0
        else:
            total_price = sum(
                item.get("real_price", item.get("price", 0))
                for store_items in best_plan.values()
                for item in store_items
            )

        print("🧠 BEST PLAN:", best_plan)
        print("💰 TOTAL:", total_price)

        context.set("optimized_plan", best_plan)
        context.set("optimized_total", total_price)

        return context