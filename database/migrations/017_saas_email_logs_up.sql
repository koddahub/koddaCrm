CREATE SCHEMA IF NOT EXISTS saas;

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

CREATE INDEX IF NOT EXISTS idx_saas_email_log_created
  ON saas.email_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_email_log_status_created
  ON saas.email_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_email_log_site_created
  ON saas.email_log(site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_email_log_event_created
  ON saas.email_log(event_key, created_at DESC);
