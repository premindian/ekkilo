-- Phone blocklist + abuse event log for rate limiting
CREATE TABLE IF NOT EXISTS blocked_phones (
    phone TEXT PRIMARY KEY,
    reason TEXT,
    blocked_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS abuse_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(30) NOT NULL,
    phone TEXT,
    ip TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abuse_events_type_phone_time
    ON abuse_events (event_type, phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_abuse_events_type_ip_time
    ON abuse_events (event_type, ip, created_at DESC);
