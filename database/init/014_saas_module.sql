CREATE SCHEMA IF NOT EXISTS saas;

CREATE TABLE IF NOT EXISTS saas.product (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  category VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas.site (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES saas.product(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  domain VARCHAR(190) NOT NULL UNIQUE,
  app_type VARCHAR(40) NOT NULL DEFAULT 'web',
  brand_name VARCHAR(160),
  support_email VARCHAR(190),
  is_active BOOLEAN NOT NULL DEFAULT true,
  env VARCHAR(40) NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas.email_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES saas.product(id) ON DELETE CASCADE,
  site_id UUID REFERENCES saas.site(id) ON DELETE CASCADE,
  template_key VARCHAR(80) NOT NULL,
  subject VARCHAR(220) NOT NULL,
  html TEXT,
  text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas.event_binding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES saas.product(id) ON DELETE CASCADE,
  site_id UUID REFERENCES saas.site(id) ON DELETE CASCADE,
  event_key VARCHAR(120) NOT NULL,
  template_id UUID NOT NULL REFERENCES saas.email_template(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES saas.site(id) ON DELETE SET NULL,
  template_id UUID REFERENCES saas.email_template(id) ON DELETE SET NULL,
  event_key VARCHAR(120) NOT NULL,
  recipient VARCHAR(190) NOT NULL,
  subject VARCHAR(220) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL,
  provider_message_id VARCHAR(190),
  request_payload_json JSONB,
  response_payload_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_product_slug
  ON saas.product(slug);

CREATE INDEX IF NOT EXISTS idx_saas_site_domain
  ON saas.site(domain);

CREATE INDEX IF NOT EXISTS idx_saas_template_key
  ON saas.email_template(template_key);

CREATE INDEX IF NOT EXISTS idx_saas_event_key
  ON saas.event_binding(event_key);

CREATE INDEX IF NOT EXISTS idx_saas_email_log_created
  ON saas.email_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_email_log_status_created
  ON saas.email_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_email_log_site_created
  ON saas.email_log(site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_email_log_event_created
  ON saas.email_log(event_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_template_scope_key_version
  ON saas.email_template (product_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), template_key, version);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_event_scope_key
  ON saas.event_binding (product_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), event_key);
