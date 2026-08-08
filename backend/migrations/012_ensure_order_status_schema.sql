-- Ensure order status columns + event tables exist (safe to re-run)
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'CREATED';
ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'PENDING';
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS store_id INTEGER;

CREATE TABLE IF NOT EXISTS final_order_events (
    id SERIAL PRIMARY KEY,
    final_order_id INTEGER REFERENCES final_orders(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_order_events (
    id SERIAL PRIMARY KEY,
    store_order_id INTEGER REFERENCES store_orders(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS final_order_id INTEGER REFERENCES final_orders(id);
