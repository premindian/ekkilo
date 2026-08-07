-- ============================================
-- FIX DUPLICATE PRODUCTS - Run in pgAdmin4
-- ============================================

-- Step 1: Check what store_products are using which product IDs
SELECT 
    sp.product_id,
    pr.name as product_name,
    pr.base_unit,
    COUNT(*) as usage_count
FROM store_products sp
JOIN products pr ON sp.product_id = pr.id
GROUP BY sp.product_id, pr.name, pr.base_unit
ORDER BY pr.name;

-- Step 2: Find duplicates
SELECT 
    name,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY id) as ids,
    array_agg(base_unit ORDER BY id) as base_units
FROM products
GROUP BY name
HAVING COUNT(*) > 1;

-- Step 3: Update store_products to use the CORRECT product IDs before deleting
-- (This prevents breaking foreign key constraints)

-- Fix milk: Change old id (1) to new id (15)
UPDATE store_products 
SET product_id = 15 
WHERE product_id = 1;

-- Fix oil: Change wrong base_unit id (4) to correct id (12)
UPDATE store_products 
SET product_id = 12 
WHERE product_id = 4;

-- Fix rice: Change wrong base_unit id (3) to correct id (10)
UPDATE store_products 
SET product_id = 10 
WHERE product_id = 3;

-- Fix sugar: Change old id (2) to new id (16)
UPDATE store_products 
SET product_id = 16 
WHERE product_id = 2;

-- Step 4: NOW delete the duplicate/wrong products
DELETE FROM products WHERE id IN (1, 2, 3, 4);

-- Step 5: Also clean up other unused products with wrong base_units
DELETE FROM products WHERE id IN (5, 6, 7, 9) AND base_unit = 'unit';

-- Step 6: Verify - Should see NO duplicates now
SELECT 
    name,
    COUNT(*) as count
FROM products
GROUP BY name
HAVING COUNT(*) > 1;

-- Step 7: Final check - All products
SELECT id, name, base_unit FROM products ORDER BY name;

-- Step 8: Verify store inventory still works
SELECT 
    s.name as store,
    pr.name as product,
    sp.brand,
    sp.price,
    sp.stock
FROM store_products sp
JOIN stores s ON sp.store_id = s.id
JOIN products pr ON sp.product_id = pr.id
ORDER BY s.name, pr.name;
