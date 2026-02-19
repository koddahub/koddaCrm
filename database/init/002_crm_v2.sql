CREATE TABLE IF NOT EXISTS crm.pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  kind VARCHAR(30) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.pipeline_stage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm.pipeline(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  stage_order INT NOT NULL,
  sla_hours INT,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(pipeline_id, code)
);

CREATE TABLE IF NOT EXISTS crm.proposal_avulsa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  lead_id UUID,
  title VARCHAR(220) NOT NULL,
  scope TEXT,
  value_cents INT,
  status VARCHAR(40) NOT NULL DEFAULT 'PROPOSTA_ENVIADA',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.pipeline_card (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm.pipeline(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES crm.pipeline_stage(id) ON DELETE CASCADE,
  lead_id UUID,
  organization_id UUID,
  proposal_id UUID REFERENCES crm.proposal_avulsa(id) ON DELETE SET NULL,
  title VARCHAR(220) NOT NULL,
  contact_name VARCHAR(190),
  contact_email VARCHAR(190),
  contact_phone VARCHAR(30),
  deal_type VARCHAR(40) NOT NULL,
  category VARCHAR(30) NOT NULL,
  intent VARCHAR(80),
  origin VARCHAR(50) NOT NULL,
  value_cents INT,
  position_index INT NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMP,
  sla_deadline TIMESTAMP,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_card_stage_order ON crm.pipeline_card(stage_id, position_index);
CREATE INDEX IF NOT EXISTS idx_pipeline_card_pipeline_stage ON crm.pipeline_card(pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_card_org ON crm.pipeline_card(organization_id);

CREATE TABLE IF NOT EXISTS crm.signup_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  email VARCHAR(190),
  phone VARCHAR(30),
  plan_code VARCHAR(40),
  status VARCHAR(50) NOT NULL DEFAULT 'SIGNUP_STARTED',
  source VARCHAR(50) NOT NULL DEFAULT 'SITE',
  payment_confirmed BOOLEAN NOT NULL DEFAULT false,
  abandoned_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_session_status_updated ON crm.signup_session(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_signup_session_payment ON crm.signup_session(payment_confirmed);

CREATE TABLE IF NOT EXISTS crm.crm_contact_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  card_id UUID,
  channel VARCHAR(30) NOT NULL,
  direction VARCHAR(20) NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.lead_dedupe_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  dedupe_key VARCHAR(255) NOT NULL,
  lead_id UUID NOT NULL,
  day_bucket DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(source, dedupe_key, day_bucket)
);

CREATE TABLE IF NOT EXISTS crm.sla_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID,
  stage_id UUID,
  task_type VARCHAR(80),
  hours_limit INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.sla_breach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID,
  task_id UUID,
  breached_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO crm.pipeline(code, name, kind, description)
SELECT 'comercial_hospedagem', 'Pipeline Comercial - Hospedagem', 'COMERCIAL', 'Fluxo comercial de planos recorrentes'
WHERE NOT EXISTS (SELECT 1 FROM crm.pipeline WHERE code = 'comercial_hospedagem');

INSERT INTO crm.pipeline(code, name, kind, description)
SELECT 'comercial_avulsos', 'Pipeline Comercial - Projetos Avulsos', 'COMERCIAL', 'Fluxo comercial para projetos avulsos'
WHERE NOT EXISTS (SELECT 1 FROM crm.pipeline WHERE code = 'comercial_avulsos');

INSERT INTO crm.pipeline(code, name, kind, description)
SELECT 'operacao_hospedagem', 'Pipeline Operacao - Onboarding Hospedagem', 'OPERACIONAL', 'Fluxo operacional para onboarding de hospedagem'
WHERE NOT EXISTS (SELECT 1 FROM crm.pipeline WHERE code = 'operacao_hospedagem');

INSERT INTO crm.pipeline(code, name, kind, description)
SELECT 'operacao_avulsos', 'Pipeline Operacao - Projetos Avulsos', 'OPERACIONAL', 'Fluxo operacional para projetos avulsos fechados'
WHERE NOT EXISTS (SELECT 1 FROM crm.pipeline WHERE code = 'operacao_avulsos');

WITH p AS (SELECT id FROM crm.pipeline WHERE code = 'comercial_hospedagem')
INSERT INTO crm.pipeline_stage (pipeline_id, code, name, stage_order, sla_hours, is_terminal)
SELECT p.id, v.code, v.name, v.stage_order, v.sla_hours, v.is_terminal
FROM p
JOIN (
  VALUES
    ('lead_novo', 'Lead novo', 1, 2, false),
    ('qualificacao', 'Qualificacao', 2, 8, false),
    ('cadastro_iniciado', 'Cadastro iniciado', 3, 12, false),
    ('pagamento_pendente', 'Pagamento pendente', 4, 2, false),
    ('assinatura_ativa_ganho', 'Assinatura ativa (ganho)', 5, 24, true),
    ('perdido_abandonado', 'Perdido/abandonado', 6, 0, true)
) AS v(code, name, stage_order, sla_hours, is_terminal) ON true
WHERE NOT EXISTS (
  SELECT 1 FROM crm.pipeline_stage s WHERE s.pipeline_id = p.id AND s.code = v.code
);

WITH p AS (SELECT id FROM crm.pipeline WHERE code = 'comercial_avulsos')
INSERT INTO crm.pipeline_stage (pipeline_id, code, name, stage_order, sla_hours, is_terminal)
SELECT p.id, v.code, v.name, v.stage_order, v.sla_hours, v.is_terminal
FROM p
JOIN (
  VALUES
    ('lead_novo', 'Lead novo', 1, 4, false),
    ('diagnostico', 'Diagnostico', 2, 24, false),
    ('proposta_enviada', 'Proposta enviada', 3, 48, false),
    ('negociacao', 'Negociacao', 4, 72, false),
    ('fechado_ganho', 'Fechado (ganho)', 5, 24, true),
    ('perdido', 'Perdido', 6, 0, true)
) AS v(code, name, stage_order, sla_hours, is_terminal) ON true
WHERE NOT EXISTS (
  SELECT 1 FROM crm.pipeline_stage s WHERE s.pipeline_id = p.id AND s.code = v.code
);

WITH p AS (SELECT id FROM crm.pipeline WHERE code = 'operacao_hospedagem')
INSERT INTO crm.pipeline_stage (pipeline_id, code, name, stage_order, sla_hours, is_terminal)
SELECT p.id, v.code, v.name, v.stage_order, v.sla_hours, v.is_terminal
FROM p
JOIN (
  VALUES
    ('boas_vindas_pendente', 'Boas-vindas pendente', 1, 2, false),
    ('briefing_pendente', 'Briefing pendente', 2, 8, false),
    ('producao_ia_site_1p', 'Producao IA/site 1 pagina', 3, 24, false),
    ('revisao_interna', 'Revisao interna', 4, 12, false),
    ('publicado', 'Publicado', 5, 8, false),
    ('pos_entrega', 'Pos-entrega', 6, 24, true)
) AS v(code, name, stage_order, sla_hours, is_terminal) ON true
WHERE NOT EXISTS (
  SELECT 1 FROM crm.pipeline_stage s WHERE s.pipeline_id = p.id AND s.code = v.code
);

WITH p AS (SELECT id FROM crm.pipeline WHERE code = 'operacao_avulsos')
INSERT INTO crm.pipeline_stage (pipeline_id, code, name, stage_order, sla_hours, is_terminal)
SELECT p.id, v.code, v.name, v.stage_order, v.sla_hours, v.is_terminal
FROM p
JOIN (
  VALUES
    ('kickoff', 'Kickoff', 1, 24, false),
    ('coleta_requisitos', 'Coleta de requisitos', 2, 48, false),
    ('desenvolvimento', 'Desenvolvimento', 3, 72, false),
    ('validacao_cliente', 'Validacao cliente', 4, 48, false),
    ('entregue', 'Entregue', 5, 24, false),
    ('suporte_inicial', 'Suporte inicial', 6, 48, true)
) AS v(code, name, stage_order, sla_hours, is_terminal) ON true
WHERE NOT EXISTS (
  SELECT 1 FROM crm.pipeline_stage s WHERE s.pipeline_id = p.id AND s.code = v.code
);
