-- Migration 008: Add admin support

-- Add is_admin column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add is_active column to stores table
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Create index for faster admin queries
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_is_store_owner ON users(is_store_owner) WHERE is_store_owner = TRUE;
CREATE INDEX IF NOT EXISTS idx_stores_is_active ON stores(is_active) WHERE is_active = TRUE;

COMMENT ON COLUMN users.is_admin IS 'Whether user has admin privileges';
COMMENT ON COLUMN stores.is_active IS 'Whether store is active and accepting orders';
