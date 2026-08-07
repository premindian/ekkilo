-- ============================================
-- Migration 004: Improve Product Matching
-- ============================================

-- Enable pg_trgm extension for fuzzy matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS search_products(text);

-- Create improved search_products function with fuzzy matching
CREATE OR REPLACE FUNCTION search_products(search_query text)
RETURNS TABLE (
    product_id INTEGER,
    product_name TEXT,
    matched_alias TEXT,
    match_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        p.id,
        p.name,
        COALESCE(pa.alias, p.name) as matched_alias,
        GREATEST(
            similarity(LOWER(p.name), LOWER(search_query)),
            COALESCE(MAX(similarity(LOWER(pa.alias), LOWER(search_query))), 0)
        ) as match_score
    FROM products p
    LEFT JOIN product_aliases pa ON p.id = pa.product_id
    WHERE 
        LOWER(p.name) % LOWER(search_query)
        OR LOWER(p.name) LIKE LOWER('%' || search_query || '%')
        OR (pa.alias IS NOT NULL AND (
            LOWER(pa.alias) % LOWER(search_query)
            OR LOWER(pa.alias) LIKE LOWER('%' || search_query || '%')
        ))
    GROUP BY p.id, p.name, pa.alias
    HAVING GREATEST(
        similarity(LOWER(p.name), LOWER(search_query)),
        COALESCE(MAX(similarity(LOWER(pa.alias), LOWER(search_query))), 0)
    ) > 0.1
    ORDER BY match_score DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Create product_aliases table if it doesn't exist
CREATE TABLE IF NOT EXISTS product_aliases (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, alias)
);

-- Create index for faster alias lookups
CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias_trgm ON product_aliases USING gin(LOWER(alias) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(LOWER(name) gin_trgm_ops);

-- Add some common aliases for existing products (optional - customize based on your data)
-- Example:
-- INSERT INTO product_aliases (product_id, alias) VALUES
-- ((SELECT id FROM products WHERE name = 'milk' LIMIT 1), 'doodh'),
-- ((SELECT id FROM products WHERE name = 'milk' LIMIT 1), 'paal')
-- ON CONFLICT (product_id, alias) DO NOTHING;

COMMENT ON FUNCTION search_products(text) IS 'Fuzzy search products by name or alias with similarity scoring';
