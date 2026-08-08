-- Ensure final_orders and store_orders have status/updated_at/total_amount columns
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'CREATED';
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'PENDING';
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0;
