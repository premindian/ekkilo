-- ============================================
-- DIAGNOSTIC QUERIES - Run in pgAdmin4
-- ============================================

-- 1. CHECK PRODUCTS TABLE
SELECT '=== PRODUCTS TABLE ===' as section;
SELECT id, name, base_unit FROM products ORDER BY name;

-- Check if products table is empty
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '❌ NO PRODUCTS - YOU NEED TO ADD PRODUCTS FIRST!'
        ELSE '✅ Products found: ' || COUNT(*)::text
    END as status
FROM products;

-- 2. CHECK STORE_PRODUCTS TABLE
SELECT '=== STORE PRODUCTS TABLE ===' as section;
SELECT 
    s.name as store,
    pr.name as product,
    sp.brand,
    sp.variant,
    sp.size || sp.unit as package,
    sp.price,
    sp.stock,
    CASE 
        WHEN sp.stock IS NULL OR sp.stock = 0 THEN '❌ OUT OF STOCK'
        ELSE '✅ IN STOCK'
    END as stock_status
FROM store_products sp
JOIN stores s ON sp.store_id = s.id
JOIN products pr ON sp.product_id = pr.id
ORDER BY pr.name, s.name;

-- Check if store_products table is empty
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '❌ NO STORE PRODUCTS - YOU NEED TO ADD INVENTORY!'
        ELSE '✅ Store products found: ' || COUNT(*)::text
    END as status
FROM store_products;

-- 3. SEARCH TESTS
SELECT '=== SEARCH TEST: basamathi ===' as section;
SELECT name FROM products WHERE LOWER(name) LIKE '%basamathi%' OR LOWER(name) LIKE '%basmati%';

SELECT '=== SEARCH TEST: oil ===' as section;
SELECT name FROM products WHERE LOWER(name) LIKE '%oil%';

SELECT '=== SEARCH TEST: rice ===' as section;
SELECT name FROM products WHERE LOWER(name) LIKE '%rice%';

-- 4. CHECK IF SEARCH_PRODUCTS FUNCTION EXISTS
SELECT '=== CHECK search_products FUNCTION ===' as section;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ search_products function exists'
        ELSE '❌ search_products function NOT FOUND - Run migration 004!'
    END as status
FROM pg_proc 
WHERE proname = 'search_products';

-- ============================================
-- IF PRODUCTS TABLE IS EMPTY, RUN THIS:
-- ============================================

-- SAMPLE DATA - Uncomment and customize for your needs
/*
INSERT INTO products (name, base_unit) VALUES
('rice', 'kg'),
('basmati rice', 'kg'),
('oil', 'l'),
('sunflower oil', 'l'),
('milk', 'l'),
('sugar', 'kg'),
('wheat flour', 'kg'),
('dal', 'kg')
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- IF STORE_PRODUCTS IS EMPTY, ADD INVENTORY:
-- ============================================

/*
-- Example: Add basmati rice to Store A
INSERT INTO store_products (store_id, product_id, brand, variant, size, unit, price, stock)
SELECT 
    s.id,
    p.id,
    'India Gate',
    'Classic',
    5,
    'kg',
    450.00,
    20
FROM stores s, products p
WHERE s.name = 'Store A' AND p.name = 'basmati rice';

-- Example: Add oil to Store B
INSERT INTO store_products (store_id, product_id, brand, variant, size, unit, price, stock)
SELECT 
    s.id,
    p.id,
    'Fortune',
    'Sunflower',
    1,
    'l',
    120.00,
    15
FROM stores s, products p
WHERE s.name = 'Store B' AND p.name = 'oil';
*/
