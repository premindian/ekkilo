-- ============================================
-- URGENT: Check if you have data in tables
-- Run these queries ONE BY ONE in pgAdmin4
-- ============================================

-- QUERY 1: Do you have ANY products?
SELECT 'PRODUCTS COUNT' as check_type, COUNT(*) as count FROM products;

-- QUERY 2: Show me ALL products (if any)
SELECT * FROM products ORDER BY name;

-- QUERY 3: Do you have ANY store inventory?
SELECT 'STORE_PRODUCTS COUNT' as check_type, COUNT(*) as count FROM store_products;

-- QUERY 4: Show me what products each store has
SELECT 
    s.name as store_name,
    pr.name as product_name,
    sp.brand,
    sp.size || sp.unit as package,
    sp.price,
    sp.stock
FROM store_products sp
JOIN stores s ON sp.store_id = s.id
JOIN products pr ON sp.product_id = pr.id
ORDER BY pr.name, s.name;

-- QUERY 5: Check if stores have coordinates
SELECT 
    name,
    phone,
    lat,
    lng,
    CASE 
        WHEN lat IS NULL OR lng IS NULL THEN '❌ NO LOCATION'
        ELSE '✅ HAS LOCATION'
    END as location_status
FROM stores;

-- ============================================
-- IF QUERY 1 SHOWS COUNT = 0, RUN THIS:
-- ============================================

-- Add basic products (ONLY if products table is empty)
INSERT INTO products (name, base_unit) VALUES
('milk', 'l'),
('rice', 'kg'),
('basmati rice', 'kg'),
('oil', 'l'),
('sunflower oil', 'l'),
('sugar', 'kg'),
('wheat flour', 'kg'),
('salt', 'kg')
ON CONFLICT DO NOTHING;

-- Verify products added
SELECT 'AFTER INSERT' as status, COUNT(*) as products_count FROM products;
SELECT * FROM products;

-- ============================================
-- IF QUERY 3 SHOWS COUNT = 0, ADD INVENTORY:
-- ============================================

-- Example: Add milk to ALL stores (change prices as needed)
INSERT INTO store_products (store_id, product_id, brand, variant, size, unit, price, stock)
SELECT 
    s.id as store_id,
    p.id as product_id,
    'Amul',
    'Gold',
    500,
    'ml',
    30.00,
    10
FROM stores s
CROSS JOIN products p
WHERE p.name = 'milk'
ON CONFLICT DO NOTHING;

-- Add basmati rice to ALL stores
INSERT INTO store_products (store_id, product_id, brand, variant, size, unit, price, stock)
SELECT 
    s.id,
    p.id,
    'India Gate',
    'Basmati',
    5,
    'kg',
    450.00,
    15
FROM stores s
CROSS JOIN products p
WHERE p.name IN ('rice', 'basmati rice')
ON CONFLICT DO NOTHING;

-- Add oil to ALL stores
INSERT INTO store_products (store_id, product_id, brand, variant, size, unit, price, stock)
SELECT 
    s.id,
    p.id,
    'Fortune',
    'Sunflower',
    1,
    'l',
    120.00,
    20
FROM stores s
CROSS JOIN products p
WHERE p.name = 'oil'
ON CONFLICT DO NOTHING;

-- Verify inventory added
SELECT 'AFTER INVENTORY INSERT' as status, COUNT(*) as store_products_count FROM store_products;

SELECT 
    s.name as store,
    pr.name as product,
    COUNT(*) as variants
FROM store_products sp
JOIN stores s ON sp.store_id = s.id
JOIN products pr ON sp.product_id = pr.id
GROUP BY s.name, pr.name
ORDER BY pr.name, s.name;
