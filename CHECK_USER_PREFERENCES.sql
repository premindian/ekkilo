-- Check user preferences and favorites
-- Run in pgAdmin4

-- 1. Check all users
SELECT id, phone, created_at FROM users;

-- 2. Check user preferences (use your user_id from above)
SELECT 
    up.*,
    s.name as regular_store_name
FROM user_preferences up
LEFT JOIN stores s ON up.regular_store_id = s.id
ORDER BY up.user_id;

-- 3. Check favorite stores
SELECT 
    fs.*,
    s.name as store_name,
    u.phone as user_phone
FROM favorite_stores fs
JOIN stores s ON fs.store_id = s.id
JOIN users u ON fs.user_id = u.id
ORDER BY u.phone;

-- 4. Check all stores
SELECT id, name, phone FROM stores;
