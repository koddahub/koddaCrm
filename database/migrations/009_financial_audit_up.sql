BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.financial_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL UNIQUE,
  org_id UUID,
  user_id UUID,
  deal_id UUID,
  action_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(120),
  request_id VARCHAR(120) NOT NULL,
  correlation_id VARCHAR(120),
  before_state JSONB,
  after_state JSONB,
  payload JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  notification_email_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  notification_crm_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  email_requested_sent_at TIMESTAMPTZ,
  email_confirmed_sent_at TIMESTAMPTZ,
  email_failed_sent_at TIMESTAMPTZ,
  crm_requested_sent_at TIMESTAMPTZ,
  crm_confirmed_sent_at TIMESTAMPTZ,
  crm_failed_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_reason TEXT,
  source VARCHAR(40)
);

CREATE INDEX IF NOT EXISTS idx_fin_actions_org_created ON audit.financial_actions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_actions_status_created ON audit.financial_actions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_actions_type_created ON audit.financial_actions(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_actions_request_id ON audit.financial_actions(request_id);

CREATE TABLE IF NOT EXISTS client.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES client.tickets(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL,
  author_name VARCHAR(190),
  author_email VARCHAR(190),
  message TEXT NOT NULL,
  attachments JSONB,
  visibility VARCHAR(20) NOT NULL DEFAULT 'CLIENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON client.ticket_messages(ticket_id, created_at ASC);

COMMIT;
