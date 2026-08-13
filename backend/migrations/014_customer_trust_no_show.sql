-- Soft no-show trust ladder (warn → cooldown → block)
CREATE TABLE IF NOT EXISTS customer_trust (
    phone TEXT PRIMARY KEY,
    no_show_count INTEGER NOT NULL DEFAULT 0,
    cooldown_until TIMESTAMPTZ,
    last_no_show_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS no_show_events (
    id SERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    final_order_id INTEGER NOT NULL UNIQUE,
    store_order_id INTEGER,
    strike_number INTEGER,
    action VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_show_events_phone_time
    ON no_show_events (phone, created_at DESC);
