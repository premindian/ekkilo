class Context:
    def __init__(self, user_text, order_id=None, phone=None):
        self.order_id = order_id
        self.phone = phone

        self.data = {
            "user_text": user_text,
            "parsed_items": [],
            "matched_products": [],
            "price_matrix": {},
            "optimized_plan": {}
        }

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value):
        self.data[key] = value