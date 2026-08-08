-- Unguessable public tracking links (WhatsApp / shared URLs)
ALTER TABLE final_orders
  ADD COLUMN IF NOT EXISTS track_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_final_orders_track_token
  ON final_orders (track_token)
  WHERE track_token IS NOT NULL;

-- Backfill existing rows (Postgres)
UPDATE final_orders
SET track_token = encode(gen_random_bytes(16), 'hex')
WHERE track_token IS NULL;
