-- Weekly sampled quick-commerce basket prices (manual entry — not live scrape)
CREATE TABLE IF NOT EXISTS qc_benchmark_baskets (
    id SERIAL PRIMARY KEY,
    city TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'typical_qc',
    sampled_on DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    proof_url TEXT,
    proof_note TEXT,
    created_by INTEGER,
    published_by INTEGER,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_benchmark_items (
    id SERIAL PRIMARY KEY,
    basket_id INTEGER NOT NULL REFERENCES qc_benchmark_baskets(id) ON DELETE CASCADE,
    product_key TEXT NOT NULL,
    display_name TEXT,
    price NUMERIC(12,2) NOT NULL,
    unit_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_qc_baskets_city_sampled
    ON qc_benchmark_baskets (city, sampled_on DESC);

CREATE INDEX IF NOT EXISTS idx_qc_baskets_published
    ON qc_benchmark_baskets (status, city, sampled_on DESC);

CREATE INDEX IF NOT EXISTS idx_qc_items_basket
    ON qc_benchmark_items (basket_id);
