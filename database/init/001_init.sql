CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS client;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS audit;

DO $$ BEGIN
  CREATE TYPE crm.deal_stage AS ENUM ('NOVO','QUALIFICACAO','ONBOARDING','PRODUCAO','ATIVO','INADIMPLENTE','CANCELADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS client.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'CLIENTE',
  phone VARCHAR(30),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES client.users(id) ON DELETE CASCADE,
  person_type VARCHAR(2) NOT NULL CHECK (person_type IN ('PF','PJ')),
  cpf_cnpj VARCHAR(30) NOT NULL,
  legal_name VARCHAR(220) NOT NULL,
  trade_name VARCHAR(220),
  billing_email VARCHAR(190) NOT NULL,
  whatsapp VARCHAR(30),
  domain VARCHAR(190),
  billing_zip VARCHAR(20),
  billing_street VARCHAR(220),
  billing_number VARCHAR(40),
  billing_complement VARCHAR(120),
  billing_district VARCHAR(120),
  billing_city VARCHAR(120),
  billing_state VARCHAR(8),
  billing_country VARCHAR(80),
  has_domain BOOLEAN NOT NULL DEFAULT false,
  has_site BOOLEAN NOT NULL DEFAULT false,
  current_site_url VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_zip VARCHAR(20);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_street VARCHAR(220);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_number VARCHAR(40);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_complement VARCHAR(120);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_district VARCHAR(120);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_city VARCHAR(120);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_state VARCHAR(8);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS billing_country VARCHAR(80);
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS has_domain BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS has_site BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client.organizations ADD COLUMN IF NOT EXISTS current_site_url VARCHAR(255);

CREATE TABLE IF NOT EXISTS client.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES client.plans(id),
  asaas_customer_id VARCHAR(80),
  asaas_subscription_id VARCHAR(80),
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(20) NOT NULL,
  next_due_date DATE,
  grace_until DATE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
  asaas_payment_id VARCHAR(80),
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(40) NOT NULL,
  billing_type VARCHAR(20),
  due_date DATE,
  paid_at TIMESTAMP,
  raw_payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_payments_asaas_payment_id
  ON client.payments(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS client.billing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
  card_holder VARCHAR(190),
  card_last4 VARCHAR(4),
  card_brand VARCHAR(40),
  exp_month SMALLINT,
  exp_year SMALLINT,
  is_validated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(subscription_id)
);

CREATE TABLE IF NOT EXISTS client.project_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  audience TEXT NOT NULL,
  differentials TEXT,
  services TEXT,
  cta_text VARCHAR(200),
  tone_of_voice VARCHAR(120),
  color_palette TEXT,
  visual_references TEXT,
  legal_content TEXT,
  integrations TEXT,
  domain_target VARCHAR(190),
  extra_requirements TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client.ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NOT NULL REFERENCES client.project_briefs(id) ON DELETE CASCADE,
  prompt_json JSONB NOT NULL,
  prompt_text TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  ticket_type VARCHAR(40) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  subject VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES client.tickets(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL,
  author_name VARCHAR(190),
  author_email VARCHAR(190),
  message TEXT NOT NULL,
  attachments JSONB,
  visibility VARCHAR(20) NOT NULL DEFAULT 'CLIENT',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON client.ticket_messages(ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS client.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(120),
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

CREATE TABLE IF NOT EXISTS crm.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(40) NOT NULL,
  source_ref VARCHAR(120),
  name VARCHAR(190) NOT NULL,
  email VARCHAR(190),
  phone VARCHAR(30),
  interest VARCHAR(120),
  payload JSONB,
  stage crm.deal_stage NOT NULL DEFAULT 'NOVO',
  owner VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  subscription_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  health_score INT DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  account_id UUID,
  title VARCHAR(220) NOT NULL,
  task_type VARCHAR(60) NOT NULL,
  sla_deadline TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  assignee VARCHAR(120),
  details TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.ticket_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  queue_name VARCHAR(60) NOT NULL,
  sla_deadline TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID,
  lead_id UUID,
  activity_type VARCHAR(80) NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.manual_whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  phone VARCHAR(30) NOT NULL,
  template_key VARCHAR(80) NOT NULL,
  context JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  processed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  email_to VARCHAR(190) NOT NULL,
  subject VARCHAR(220) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  processed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor VARCHAR(120),
  actor_role VARCHAR(40),
  action VARCHAR(120) NOT NULL,
  target_type VARCHAR(80),
  target_id VARCHAR(80),
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO client.plans(code,name,monthly_price,description)
SELECT 'basic','Básico',149.99,'Site institucional 1 página + domínio + 1 e-mail profissional'
WHERE NOT EXISTS (SELECT 1 FROM client.plans WHERE code='basic');

INSERT INTO client.plans(code,name,monthly_price,description)
SELECT 'profissional','Profissional',249.00,'Site institucional até 3 páginas + e-mails ilimitados + suporte/atualizações'
WHERE NOT EXISTS (SELECT 1 FROM client.plans WHERE code='profissional');

INSERT INTO client.plans(code,name,monthly_price,description)
SELECT 'pro','Pro',399.00,'Operação robusta com chatbot, e-commerce básico e suporte avançado'
WHERE NOT EXISTS (SELECT 1 FROM client.plans WHERE code='pro');

INSERT INTO client.users(name,email,password_hash,phone,role)
SELECT 'Cliente Teste','teste.cliente@koddahub.local','$2y$10$ZVO.oyGb33lKEry.mPUCHOqztFs.w6Zj3KDBL8GWdYEX7qQ6U.5ma','41999998888','CLIENTE'
WHERE NOT EXISTS (SELECT 1 FROM client.users WHERE email='teste.cliente@koddahub.local');

UPDATE client.users
SET password_hash = '$2y$10$ZVO.oyGb33lKEry.mPUCHOqztFs.w6Zj3KDBL8GWdYEX7qQ6U.5ma',
    updated_at = now()
WHERE email = 'teste.cliente@koddahub.local';

INSERT INTO client.organizations(
  user_id, person_type, cpf_cnpj, legal_name, trade_name, billing_email, whatsapp,
  domain, billing_zip, billing_street, billing_number, billing_district, billing_city,
  billing_state, billing_country, has_domain, has_site, current_site_url
)
SELECT
  u.id, 'PJ', '12345678000199', 'Empresa Teste Cliente LTDA', 'Empresa Teste',
  'financeiro.teste@koddahub.local', '41999998888',
  'empresateste.com.br', '80000-000', 'Rua Exemplo', '100', 'Centro', 'Curitiba',
  'PR', 'Brasil', true, true, 'https://empresateste.com.br'
FROM client.users u
WHERE u.email='teste.cliente@koddahub.local'
  AND NOT EXISTS (SELECT 1 FROM client.organizations o WHERE o.user_id=u.id);

INSERT INTO client.subscriptions(
  organization_id, plan_id, asaas_customer_id, asaas_subscription_id, status, payment_method, next_due_date, grace_until
)
SELECT
  o.id, p.id, 'cust_test_local', 'sub_test_local', 'ACTIVE', 'CREDIT_CARD', CURRENT_DATE + 30, CURRENT_DATE + 7
FROM client.organizations o
JOIN client.users u ON u.id=o.user_id
JOIN client.plans p ON p.code='profissional'
WHERE u.email='teste.cliente@koddahub.local'
  AND NOT EXISTS (SELECT 1 FROM client.subscriptions s WHERE s.organization_id=o.id);
