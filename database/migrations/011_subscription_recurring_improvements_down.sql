BEGIN;

DROP INDEX IF EXISTS idx_subscription_change_schedule_action;
DROP INDEX IF EXISTS idx_subscription_change_schedule_subscription;
DROP INDEX IF EXISTS idx_subscription_change_schedule_status_effective;
DROP TABLE IF EXISTS client.subscription_change_schedule;

ALTER TABLE client.subscriptions DROP COLUMN IF EXISTS last_asaas_event_at;
ALTER TABLE client.subscriptions DROP COLUMN IF EXISTS billing_profile_updated_at;
ALTER TABLE client.subscriptions DROP COLUMN IF EXISTS price_override;

COMMIT;
