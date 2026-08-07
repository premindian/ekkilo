-- Migration 007: Add store settings and profile fields

-- Add description, hours, and other fields to stores table
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS open_time TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS close_time TIME DEFAULT '21:00:00',
ADD COLUMN IF NOT EXISTS address TEXT;

-- Create store_settings table for operational settings
CREATE TABLE IF NOT EXISTS store_settings (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
    delivery_radius DECIMAL(10,2) DEFAULT 5.0,
    min_order DECIMAL(10,2) DEFAULT 0,
    is_open BOOLEAN DEFAULT TRUE,
    auto_accept_orders BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create store_notifications table for notification preferences
CREATE TABLE IF NOT EXISTS store_notifications (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
    whatsapp_enabled BOOLEAN DEFAULT TRUE,
    low_stock_alert BOOLEAN DEFAULT TRUE,
    low_stock_threshold INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_store_settings_store_id ON store_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_store_notifications_store_id ON store_notifications(store_id);

COMMENT ON TABLE store_settings IS 'Store operational settings like delivery radius, min order, etc.';
COMMENT ON TABLE store_notifications IS 'Store owner notification preferences';
