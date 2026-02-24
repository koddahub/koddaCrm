BEGIN;

ALTER TABLE client.billing_profiles
  DROP COLUMN IF EXISTS card_token_updated_at;

ALTER TABLE client.billing_profiles
  DROP COLUMN IF EXISTS card_token;

COMMIT;
