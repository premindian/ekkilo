-- Add regular_store_id to user_preferences
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS regular_store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_regular_store ON user_preferences(regular_store_id);
