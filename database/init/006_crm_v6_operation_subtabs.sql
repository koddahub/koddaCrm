-- CRM V6: Operação por sub-abas (sub-etapas, catálogo de modelos e solicitações de pré-prompt)

CREATE TABLE IF NOT EXISTS crm.deal_operation_substep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  stage_code VARCHAR(80) NOT NULL,
  substep_code VARCHAR(80) NOT NULL,
  substep_name VARCHAR(140) NOT NULL,
  substep_order INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  is_required BOOLEAN NOT NULL DEFAULT true,
  owner VARCHAR(120),
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, stage_code, substep_code)
);

CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
  ON crm.deal_operation_substep(deal_id, stage_code, substep_order);
CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status
  ON crm.deal_operation_substep(deal_id, stage_code, status);

CREATE TABLE IF NOT EXISTS crm.template_model_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  root_path VARCHAR(500) NOT NULL,
  entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_model_catalog_active
  ON crm.template_model_catalog(is_active, is_default);

CREATE TABLE IF NOT EXISTS crm.deal_prompt_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  prompt_revision_id UUID REFERENCES crm.deal_prompt_revision(id) ON DELETE SET NULL,
  subject VARCHAR(220) NOT NULL,
  request_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  message TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  email_queue_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'SENT',
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
  ON crm.deal_prompt_request(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
  ON crm.deal_prompt_request(status, due_at);
