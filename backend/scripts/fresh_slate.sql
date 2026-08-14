-- =============================================================================
-- Ekkilo FRESH SLATE
-- Wipes orders, inventory, stores, catalog, and non-admin users.
-- KEEPS: admin users (is_admin = TRUE) + their preferences.
-- Product categories are kept (re-seeded by app if missing).
--
-- Run via:  python backend/scripts/fresh_slate.py
-- Or:       psql "$DATABASE_URL" -f backend/scripts/fresh_slate.sql
-- =============================================================================

BEGIN;

-- Detach store ownership so stores can be deleted cleanly
UPDATE users
SET is_store_owner = FALSE,
    store_id = NULL
WHERE COALESCE(is_admin, FALSE) = FALSE;

UPDATE users
SET store_id = NULL
WHERE COALESCE(is_admin, FALSE) = TRUE;

-- Drop dependent operational data (ignore missing tables)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'order_items',
    'store_order_events',
    'final_order_events',
    'store_orders',
    'final_orders',
    'refund_requests',
    'grocery_list_items',
    'grocery_lists',
    'user_favorite_stores',
    'store_products',
    'store_settings',
    'store_owner_details',
    'staff_audit_events',
    'otp_verifications',
    'user_sessions',
    'whatsapp_messages',
    'abuse_events',
    'no_show_events',
    'customer_trust',
    'qc_benchmark_prices',
    'qc_benchmark_runs'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Remove all stores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) THEN
    DELETE FROM stores;
    -- Reset serial if present
    BEGIN
      PERFORM setval(pg_get_serial_sequence('stores', 'id'), 1, false);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- Wipe master catalog products (starter seed runs after this)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    DELETE FROM products;
    BEGIN
      PERFORM setval(pg_get_serial_sequence('products', 'id'), 1, false);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- Keep only admin users
DELETE FROM user_preferences
WHERE user_id NOT IN (SELECT id FROM users WHERE COALESCE(is_admin, FALSE) = TRUE);

DELETE FROM users
WHERE COALESCE(is_admin, FALSE) = FALSE;

COMMIT;

-- Quick sanity counts
SELECT 'users' AS entity, COUNT(*)::text AS count FROM users
UNION ALL SELECT 'admins', COUNT(*)::text FROM users WHERE is_admin = TRUE
UNION ALL SELECT 'stores', COUNT(*)::text FROM stores
UNION ALL SELECT 'products', COUNT(*)::text FROM products
UNION ALL SELECT 'store_products', COUNT(*)::text FROM store_products
UNION ALL SELECT 'final_orders', COUNT(*)::text FROM final_orders;
