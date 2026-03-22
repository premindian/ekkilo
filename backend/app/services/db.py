import asyncpg

# ?? connect to PostgreSQL
async def get_connection():
    return await asyncpg.connect(
        user="postgres",
        password="$Aman",   # ?? change this
        database="kirana",
        host="127.0.0.1"
    )

# ?? fetch prices
async def fetch_prices(products):
    conn = await get_connection()

    query = """
    SELECT p.name, s.name, sp.price
    FROM store_prices sp
    JOIN products p ON p.id = sp.product_id
    JOIN stores s ON s.id = sp.store_id
    """

    rows = await conn.fetch(query)

    matrix = {}

    for r in rows:
        product = r[0]
        store = r[1]
        price = r[2]

        if product not in matrix:
            matrix[product] = {}

        matrix[product][store] = price

    await conn.close()
    return matrix