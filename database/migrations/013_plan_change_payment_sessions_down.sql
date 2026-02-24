BEGIN;

DROP INDEX IF EXISTS uq_plan_change_payment_sessions_active;
DROP INDEX IF EXISTS idx_plan_change_payment_sessions_status;
DROP INDEX IF EXISTS idx_plan_change_payment_sessions_subscription;
DROP TABLE IF EXISTS client.plan_change_payment_sessions;

COMMIT;
