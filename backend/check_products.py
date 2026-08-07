import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def check_products():
    try:
        db = await asyncpg.connect(os.getenv('DATABASE_URL'))
        
        print("=" * 60)
        print("📦 CHECKING PRODUCTS TABLE")
        print("=" * 60)
        
        # Check all products
        products = await db.fetch("""
            SELECT id, name, base_unit 
            FROM products 
            ORDER BY name
        """)
        
        if not products:
            print("\n❌ NO PRODUCTS FOUND IN DATABASE!")
            print("\nYou need to add products first. Example:")
            print("""
            INSERT INTO products (name, base_unit) VALUES
            ('rice', 'kg'),
            ('oil', 'l'),
            ('milk', 'l'),
            ('sugar', 'kg');
            """)
        else:
            print(f"\n✅ Found {len(products)} products:")
            for p in products:
                print(f"  • {p['name']} (base_unit: {p['base_unit']})")
        
        print("\n" + "=" * 60)
        print("🏪 CHECKING STORE_PRODUCTS")
        print("=" * 60)
        
        # Check store products
        store_products = await db.fetch("""
            SELECT 
                s.name as store,
                pr.name as product,
                sp.brand,
                sp.variant,
                sp.size,
                sp.unit,
                sp.price,
                sp.stock
            FROM store_products sp
            JOIN stores s ON sp.store_id = s.id
            JOIN products pr ON sp.product_id = pr.id
            ORDER BY pr.name, s.name
        """)
        
        if not store_products:
            print("\n❌ NO STORE_PRODUCTS FOUND!")
            print("\nYou need to add inventory for each store. Example:")
            print("""
            INSERT INTO store_products (store_id, product_id, brand, variant, size, unit, price, stock)
            SELECT 
                s.id,
                p.id,
                'Amul',
                'Gold',
                500,
                'ml',
                30.00,
                10
            FROM stores s, products p
            WHERE s.name = 'Store A' AND p.name = 'milk';
            """)
        else:
            print(f"\n✅ Found {len(store_products)} store-product entries:")
            current_product = None
            for sp in store_products:
                if sp['product'] != current_product:
                    current_product = sp['product']
                    print(f"\n  📦 {current_product}:")
                stock_emoji = '✅' if sp['stock'] and sp['stock'] > 0 else '❌'
                print(f"    {stock_emoji} {sp['store']}: {sp['brand']} {sp['variant']} {sp['size']}{sp['unit']} - ₹{sp['price']} (stock: {sp['stock']})")
        
        print("\n" + "=" * 60)
        print("🔍 TESTING SEARCH")
        print("=" * 60)
        
        # Test searches
        test_queries = ['basamathi', 'rice', 'oil', 'milk']
        
        for query in test_queries:
            print(f"\n🔍 Searching for '{query}':")
            
            # Try exact match
            exact = await db.fetch("""
                SELECT name FROM products 
                WHERE LOWER(name) = LOWER($1)
            """, query)
            
            if exact:
                print(f"  ✅ Exact match: {[r['name'] for r in exact]}")
            else:
                print(f"  ❌ No exact match")
            
            # Try partial match
            partial = await db.fetch("""
                SELECT name FROM products 
                WHERE LOWER(name) LIKE LOWER($1)
                ORDER BY LENGTH(name)
                LIMIT 3
            """, f"%{query}%")
            
            if partial:
                print(f"  ✅ Partial matches: {[r['name'] for r in partial]}")
            else:
                print(f"  ❌ No partial matches")
        
        await db.close()
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(check_products())
