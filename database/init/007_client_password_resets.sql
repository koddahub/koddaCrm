CREATE TABLE IF NOT EXISTS client.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email_state
  ON client.password_resets(email, used_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at
  ON client.password_resets(expires_at);
