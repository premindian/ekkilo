-- Migration: Create WhatsApp messages tracking table
-- Description: Track all WhatsApp messages sent/received with status

-- Create whatsapp_messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    whatsapp_message_id VARCHAR(100),
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id ON whatsapp_messages(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON whatsapp_messages(created_at DESC);

-- Add final_order_id column for linking messages to orders
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS final_order_id INTEGER REFERENCES final_orders(id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order ON whatsapp_messages(final_order_id);
