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

            for opt in combo:
                store = opt.get("store")
                total_price += opt.get("price", 0)

                covered_items.add(opt.get("name"))
                if store:
                    used_stores.add(store)

                # 🔥 HANDLE OUT-OF-STOCK
                if not opt.get("available", True):
                    availability_penalty += 50  # strong penalty

                plan.setdefault(store, []).append(opt)

            # -----------------------------
            # 🧠 SCORES
            # -----------------------------

            # 📦 availability
            coverage_ratio = len(covered_items) / total_items

            # 💰 normalized price
            normalized_price = total_price / total_items

            # 📍 distance (average)
            distances = []
            for s in used_stores:
                d = store_meta.get(s, {}).get("distance")
                if d is not None:
                    distances.append(d)

            avg_distance = sum(distances) / len(distances) if distances else 5
            normalized_distance = avg_distance / 10  # assume 10km max

            # 🏪 STORE COUNT PENALTY (NEW 🔥)
            store_penalty = len(used_stores) * 10

            # -----------------------------
            # 🔥 FINAL SCORE (CLEANED)
            # -----------------------------
            score = (
                (0.5 * normalized_price) +          # price matters most
                (30 * normalized_distance) +        # distance penalty
                (40 * (1 - coverage_ratio)) +       # missing items penalty
                store_penalty +                     # fewer stores preferred
                availability_penalty                # avoid OOS
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
                item["real_price"] if item.get("real_price") else item["price"]
                for store_items in best_plan.values()
                for item in store_items
            )

        print("🧠 BEST PLAN:", best_plan)
        print("💰 TOTAL:", total_price)

        context.set("optimized_plan", best_plan)
        context.set("optimized_total", total_price)

        return context