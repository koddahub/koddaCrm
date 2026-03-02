CREATE TABLE IF NOT EXISTS crm.freelas_proposal_ticket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'NEW',
  project_link TEXT NOT NULL,
  project_title VARCHAR(300) NOT NULL,
  project_payload JSONB NOT NULL,
  analysis_payload JSONB NOT NULL,
  proposal_text TEXT NOT NULL,
  offer_amount_cents INT,
  final_offer_amount_cents INT,
  estimated_duration_text VARCHAR(120),
  details_text TEXT NOT NULL,
  review_notes TEXT,
  approved_by VARCHAR(120),
  approved_at TIMESTAMPTZ,
  integration_execution_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freelas_proposal_ticket_deal_created
  ON crm.freelas_proposal_ticket(deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_freelas_proposal_ticket_status
  ON crm.freelas_proposal_ticket(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_freelas_ticket_project_exec
  ON crm.freelas_proposal_ticket(project_link, integration_execution_id)
  WHERE integration_execution_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm.freelas_proposal_dispatch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES crm.freelas_proposal_ticket(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freelas_dispatch_ticket_created
  ON crm.freelas_proposal_dispatch(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_freelas_dispatch_status
  ON crm.freelas_proposal_dispatch(status, created_at DESC);
