-- CRM V4: Fluxo Site 24h (prompt/template/aprovacao/publicacao)

CREATE TABLE IF NOT EXISTS crm.deal_prompt_revision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  version INT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_json JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  requested_notes TEXT,
  created_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (deal_id, version)
);

CREATE INDEX IF NOT EXISTS idx_deal_prompt_revision_deal ON crm.deal_prompt_revision(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.deal_template_revision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  version INT NOT NULL,
  project_path VARCHAR(500) NOT NULL,
  entry_file VARCHAR(255) NOT NULL,
  preview_url VARCHAR(500),
  source_hash VARCHAR(128),
  status VARCHAR(40) NOT NULL DEFAULT 'GENERATED',
  generated_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (deal_id, version)
);

CREATE INDEX IF NOT EXISTS idx_deal_template_revision_deal ON crm.deal_template_revision(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.deal_client_approval (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  template_revision_id UUID NOT NULL REFERENCES crm.deal_template_revision(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  client_note TEXT,
  acted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_client_approval_token ON crm.deal_client_approval(token_hash);
CREATE INDEX IF NOT EXISTS idx_deal_client_approval_deal ON crm.deal_client_approval(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.deal_publish_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  template_revision_id UUID NOT NULL REFERENCES crm.deal_template_revision(id) ON DELETE CASCADE,
  target_domain VARCHAR(255),
  expected_hash VARCHAR(128),
  last_live_hash VARCHAR(128),
  last_http_status INT,
  matches BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_publish_check_deal ON crm.deal_publish_check(deal_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_publish_check_revision ON crm.deal_publish_check(template_revision_id, checked_at DESC);
