-- Phase 1: User Profiles & Lists Migration
-- Run this SQL on your PostgreSQL database

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(15) UNIQUE NOT NULL,
    name VARCHAR(100),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. OTP verification table (for login)
CREATE TABLE IF NOT EXISTS otp_verifications (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Grocery lists
CREATE TABLE IF NOT EXISTS grocery_lists (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT 'My Monthly List',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Grocery list items
CREATE TABLE IF NOT EXISTS grocery_list_items (
    id SERIAL PRIMARY KEY,
    list_id INTEGER REFERENCES grocery_lists(id) ON DELETE CASCADE,
    product_name VARCHAR(200) NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit VARCHAR(20) DEFAULT 'unit',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. User favorite stores
CREATE TABLE IF NOT EXISTS user_favorite_stores (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    rank INTEGER DEFAULT 1, -- 1 = top favorite, 2 = second, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, store_id)
);

-- 6. User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    show_product_pictures BOOLEAN DEFAULT TRUE,
    default_view_mode VARCHAR(50) DEFAULT 'smart', -- smart, favorites, nearby, manual, support
    default_radius INTEGER DEFAULT 5, -- km
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. User sessions (for authentication)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_user ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_items_list ON grocery_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_favorite_stores_user ON user_favorite_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);

-- Default data: Create a default user preference for existing users
-- (Optional - for testing)
-- INSERT INTO users (phone, name) VALUES ('917981728794', 'Test User');
