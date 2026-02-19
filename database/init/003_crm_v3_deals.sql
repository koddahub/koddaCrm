-- CRM V3: deal-centric pipeline, financeiro e proposta por cliente

ALTER TABLE crm.email_queue
  ADD COLUMN IF NOT EXISTS attachments JSONB;

CREATE TABLE IF NOT EXISTS crm.deal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm.pipeline(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES crm.pipeline_stage(id) ON DELETE RESTRICT,
  lead_id UUID,
  organization_id UUID,
  subscription_id UUID,
  title VARCHAR(220) NOT NULL,
  contact_name VARCHAR(190),
  contact_email VARCHAR(190),
  contact_phone VARCHAR(30),
  deal_type VARCHAR(40) NOT NULL,
  category VARCHAR(30) NOT NULL,
  intent VARCHAR(80),
  origin VARCHAR(50) NOT NULL,
  plan_code VARCHAR(40),
  product_code VARCHAR(80),
  value_cents INT,
  position_index INT NOT NULL DEFAULT 0,
  sla_deadline TIMESTAMP,
  lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  is_closed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_pipeline_stage_pos ON crm.deal(pipeline_id, stage_id, position_index);
CREATE INDEX IF NOT EXISTS idx_deal_lifecycle_closed ON crm.deal(lifecycle_status, is_closed);
CREATE INDEX IF NOT EXISTS idx_deal_type_category ON crm.deal(deal_type, category);

CREATE TABLE IF NOT EXISTS crm.deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  from_stage_id UUID,
  to_stage_id UUID NOT NULL,
  changed_by VARCHAR(120),
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON crm.deal_stage_history(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.deal_operation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  operation_type VARCHAR(20) NOT NULL,
  stage_code VARCHAR(80) NOT NULL,
  stage_name VARCHAR(120) NOT NULL,
  stage_order INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_operation_deal ON crm.deal_operation(deal_id, stage_order);

CREATE TABLE IF NOT EXISTS crm.deal_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120),
  size_bytes BIGINT,
  uploaded_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_document_deal ON crm.deal_document(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.deal_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  activity_type VARCHAR(60) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_activity_deal ON crm.deal_activity(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.deal_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  title VARCHAR(220) NOT NULL,
  description TEXT,
  due_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_agenda_due ON crm.deal_agenda(deal_id, due_at);

CREATE TABLE IF NOT EXISTS crm.deal_proposal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  title VARCHAR(220) NOT NULL,
  scope TEXT,
  snapshot JSONB,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  value_cents INT,
  pdf_path VARCHAR(500),
  created_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_proposal_deal ON crm.deal_proposal(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.financial_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID,
  organization_id UUID,
  entry_type VARCHAR(20) NOT NULL,
  category VARCHAR(60),
  amount_cents INT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  metadata JSONB,
  created_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_entry_date_type ON crm.financial_entry(entry_date, entry_type);

CREATE TABLE IF NOT EXISTS crm.collection_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID,
  organization_id UUID,
  action_type VARCHAR(40) NOT NULL,
  channel VARCHAR(30),
  outcome VARCHAR(40),
  notes TEXT,
  next_action_at TIMESTAMP,
  created_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_next_action ON crm.collection_action(next_action_at);

-- Refresh stages for commercial pipelines (blueprint KoddaHub)
WITH p AS (
  SELECT id FROM crm.pipeline WHERE code = 'comercial_hospedagem'
)
DELETE FROM crm.pipeline_stage s USING p WHERE s.pipeline_id = p.id;

WITH p AS (SELECT id FROM crm.pipeline WHERE code = 'comercial_hospedagem')
INSERT INTO crm.pipeline_stage (pipeline_id, code, name, stage_order, sla_hours, is_terminal)
SELECT p.id, v.code, v.name, v.stage_order, v.sla_hours, v.is_terminal
FROM p
JOIN (
  VALUES
    ('lead_novo', 'Lead novo', 1, 2, false),
    ('diagnostico', 'Diagnóstico', 2, 8, false),
    ('proposta_plano', 'Proposta de plano', 3, 12, false),
    ('cadastro_iniciado', 'Cadastro iniciado', 4, 12, false),
    ('pagamento_pendente', 'Pagamento pendente', 5, 6, false),
    ('fechado_ganho', 'Fechado ganho', 6, 24, true),
    ('perdido', 'Perdido', 7, 0, true)
) AS v(code, name, stage_order, sla_hours, is_terminal) ON true;

WITH p AS (
  SELECT id FROM crm.pipeline WHERE code = 'comercial_avulsos'
)
DELETE FROM crm.pipeline_stage s USING p WHERE s.pipeline_id = p.id;

WITH p AS (SELECT id FROM crm.pipeline WHERE code = 'comercial_avulsos')
INSERT INTO crm.pipeline_stage (pipeline_id, code, name, stage_order, sla_hours, is_terminal)
SELECT p.id, v.code, v.name, v.stage_order, v.sla_hours, v.is_terminal
FROM p
JOIN (
  VALUES
    ('lead_novo', 'Lead novo', 1, 4, false),
    ('descoberta', 'Descoberta', 2, 24, false),
    ('escopo', 'Escopo', 3, 36, false),
    ('proposta_enviada', 'Proposta enviada', 4, 48, false),
    ('negociacao', 'Negociação', 5, 72, false),
    ('fechado_ganho', 'Fechado ganho', 6, 24, true),
    ('perdido', 'Perdido', 7, 0, true)
) AS v(code, name, stage_order, sla_hours, is_terminal) ON true;

-- Migrate active legacy cards to deal table if still empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm.deal LIMIT 1) THEN
    INSERT INTO crm.deal (
      pipeline_id,
      stage_id,
      lead_id,
      organization_id,
      title,
      contact_name,
      contact_email,
      contact_phone,
      deal_type,
      category,
      intent,
      origin,
      value_cents,
      position_index,
      sla_deadline,
      lifecycle_status,
      is_closed,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      newp.id,
      news.id,
      c.lead_id,
      c.organization_id,
      c.title,
      c.contact_name,
      c.contact_email,
      c.contact_phone,
      c.deal_type,
      c.category,
      c.intent,
      c.origin,
      c.value_cents,
      ROW_NUMBER() OVER (PARTITION BY newp.id, news.id ORDER BY c.created_at) - 1,
      c.sla_deadline,
      CASE
        WHEN news.code = 'fechado_ganho' THEN 'CLIENT'
        WHEN news.code = 'perdido' THEN 'LOST'
        ELSE 'OPEN'
      END,
      CASE WHEN news.code IN ('fechado_ganho', 'perdido') THEN true ELSE false END,
      c.metadata,
      c.created_at,
      c.updated_at
    FROM crm.pipeline_card c
    JOIN crm.pipeline oldp ON oldp.id = c.pipeline_id
    JOIN crm.pipeline newp ON newp.code = oldp.code
    JOIN crm.pipeline_stage news ON news.pipeline_id = newp.id
      AND news.code = (
        CASE
          WHEN oldp.code = 'comercial_hospedagem' THEN
            CASE c.stage_id
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'lead_novo' LIMIT 1) THEN 'lead_novo'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'qualificacao' LIMIT 1) THEN 'diagnostico'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'cadastro_iniciado' LIMIT 1) THEN 'cadastro_iniciado'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'pagamento_pendente' LIMIT 1) THEN 'pagamento_pendente'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'assinatura_ativa_ganho' LIMIT 1) THEN 'fechado_ganho'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'perdido_abandonado' LIMIT 1) THEN 'perdido'
              ELSE 'lead_novo'
            END
          WHEN oldp.code = 'comercial_avulsos' THEN
            CASE c.stage_id
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'lead_novo' LIMIT 1) THEN 'lead_novo'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'diagnostico' LIMIT 1) THEN 'descoberta'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'proposta_enviada' LIMIT 1) THEN 'proposta_enviada'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'negociacao' LIMIT 1) THEN 'negociacao'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'fechado_ganho' LIMIT 1) THEN 'fechado_ganho'
              WHEN (SELECT id FROM crm.pipeline_stage WHERE pipeline_id = c.pipeline_id AND code = 'perdido' LIMIT 1) THEN 'perdido'
              ELSE 'lead_novo'
            END
          ELSE 'lead_novo'
        END
      )
    WHERE oldp.code IN ('comercial_hospedagem', 'comercial_avulsos');
  END IF;
END $$;
