-- MANUAL ONLY — do not run on production deploy blindly.
-- Wipes order + WhatsApp test data; keeps users, stores, products.
-- Safe to re-run. Uses ROLLBACK first in case a prior txn aborted.
--
-- Example:
--   psql "$DATABASE_URL" -f backend/migrations/manual_clean_orders_keep_users.sql

ROLLBACK;

DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM order_items;
  END IF;

  IF to_regclass('public.store_order_events') IS NOT NULL THEN
    DELETE FROM store_order_events;
  END IF;

  IF to_regclass('public.final_order_events') IS NOT NULL THEN
    DELETE FROM final_order_events;
  END IF;

  -- Clear WhatsApp rows before final_orders (FK: final_order_id)
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    DELETE FROM whatsapp_messages;
  END IF;

  IF to_regclass('public.whatsapp_webhook_events') IS NOT NULL THEN
    DELETE FROM whatsapp_webhook_events;
  END IF;

  IF to_regclass('public.store_orders') IS NOT NULL THEN
    DELETE FROM store_orders;
  END IF;

  IF to_regclass('public.final_orders') IS NOT NULL THEN
    DELETE FROM final_orders;
  END IF;

  IF to_regclass('public.order_events') IS NOT NULL THEN
    DELETE FROM order_events;
  END IF;

  IF to_regclass('public.otp_verifications') IS NOT NULL THEN
    DELETE FROM otp_verifications;
  END IF;

  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    DELETE FROM user_sessions;
  END IF;
END $$;

-- Reset IDs (ignore if sequence name differs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'final_orders_id_seq') THEN
    EXECUTE 'ALTER SEQUENCE final_orders_id_seq RESTART WITH 1';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'store_orders_id_seq') THEN
    EXECUTE 'ALTER SEQUENCE store_orders_id_seq RESTART WITH 1';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'order_items_id_seq') THEN
    EXECUTE 'ALTER SEQUENCE order_items_id_seq RESTART WITH 1';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'whatsapp_messages_id_seq') THEN
    EXECUTE 'ALTER SEQUENCE whatsapp_messages_id_seq RESTART WITH 1';
  END IF;
END $$;
