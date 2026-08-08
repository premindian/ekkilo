-- Staff password login for admin / store owners (OTP still works for everyone)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
