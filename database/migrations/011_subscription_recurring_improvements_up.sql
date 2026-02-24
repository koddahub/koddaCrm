BEGIN;

ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS price_override NUMERIC(10,2);
ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS billing_profile_updated_at TIMESTAMPTZ;
ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS last_asaas_event_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS client.subscription_change_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID UNIQUE NOT NULL,
  subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  asaas_subscription_id VARCHAR(80) NOT NULL,
  change_type VARCHAR(40) NOT NULL,
  current_plan_id UUID REFERENCES client.plans(id),
  target_plan_id UUID REFERENCES client.plans(id),
  current_value NUMERIC(10,2),
  target_value NUMERIC(10,2) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscription_change_schedule_status_effective
  ON client.subscription_change_schedule(status, effective_at);
CREATE INDEX IF NOT EXISTS idx_subscription_change_schedule_subscription
  ON client.subscription_change_schedule(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_change_schedule_action
  ON client.subscription_change_schedule(action_id);

COMMIT;
