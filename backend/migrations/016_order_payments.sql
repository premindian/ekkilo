-- Prepaid UPI (Razorpay) fields on final_orders
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'UNPAID';
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_final_orders_razorpay_order
    ON final_orders (razorpay_order_id)
    WHERE razorpay_order_id IS NOT NULL;

-- Pickup area on preferences (profile completeness)
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS pickup_area TEXT;
