-- Ensure WhatsApp message tracking columns exist on older databases
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(100);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS final_order_id INTEGER;
