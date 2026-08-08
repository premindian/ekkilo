-- ETA + delay tracking for store packing times
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS eta_minutes INTEGER;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS ready_by TIMESTAMPTZ;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delay_note TEXT;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delay_notified_at TIMESTAMPTZ;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS late_ping_sent_at TIMESTAMPTZ;
