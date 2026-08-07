-- ============================================
-- Migration 005: Store Owners & Authentication
-- ============================================

-- Add store owner relationship to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_store_owner BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_is_store_owner ON users(is_store_owner);

-- Create store owner details table
CREATE TABLE IF NOT EXISTS store_owner_details (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    owner_name VARCHAR(255),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    can_manage_products BOOLEAN DEFAULT TRUE,
    can_manage_orders BOOLEAN DEFAULT TRUE,
    can_view_reports BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_owner_details_user_id ON store_owner_details(user_id);
CREATE INDEX IF NOT EXISTS idx_store_owner_details_store_id ON store_owner_details(store_id);

-- Add last login tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Comments
COMMENT ON COLUMN users.is_store_owner IS 'Flag to identify store owner accounts';
COMMENT ON COLUMN users.store_id IS 'Associated store for store owners';
COMMENT ON TABLE store_owner_details IS 'Additional details and permissions for store owners';
