-- Migration 006: Add store_id to store_orders table
-- This enables store portal functionality

-- Add store_id column to store_orders
ALTER TABLE store_orders 
ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id);

-- Populate store_id by matching store_phone with stores table
UPDATE store_orders so
SET store_id = s.id
FROM stores s
WHERE so.store_phone = s.phone
AND so.store_id IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_store_orders_store_id ON store_orders(store_id);

-- Add total_amount column if it doesn't exist (for sales tracking)
ALTER TABLE store_orders 
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0;

-- Calculate and update total_amount from existing order_items
UPDATE store_orders so
SET total_amount = (
    SELECT COALESCE(SUM(oi.price * oi.quantity), 0)
    FROM order_items oi
    WHERE oi.store_order_id = so.id
)
WHERE so.total_amount = 0 OR so.total_amount IS NULL;

COMMENT ON COLUMN store_orders.store_id IS 'Foreign key to stores table for store portal';
COMMENT ON COLUMN store_orders.total_amount IS 'Total order amount for sales tracking';
