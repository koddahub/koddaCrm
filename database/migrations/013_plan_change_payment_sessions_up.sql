BEGIN;

CREATE TABLE IF NOT EXISTS client.plan_change_payment_sessions (
  id UUID PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  target_plan_id UUID NOT NULL REFERENCES client.plans(id),
  target_plan_code VARCHAR(40) NOT NULL,
  payment_id VARCHAR(80) NOT NULL,
  request_id VARCHAR(120),
  action_id UUID,
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plan_change_payment_sessions_subscription
  ON client.plan_change_payment_sessions(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_change_payment_sessions_status
  ON client.plan_change_payment_sessions(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_change_payment_sessions_active
  ON client.plan_change_payment_sessions(subscription_id, target_plan_code)
  WHERE status='PENDING';

COMMIT;
