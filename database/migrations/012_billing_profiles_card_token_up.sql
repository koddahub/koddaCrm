BEGIN;

ALTER TABLE client.billing_profiles
  ADD COLUMN IF NOT EXISTS card_token VARCHAR(120);

ALTER TABLE client.billing_profiles
  ADD COLUMN IF NOT EXISTS card_token_updated_at TIMESTAMPTZ;

COMMIT;
