-- CRM Social module (Instagram)

CREATE TABLE IF NOT EXISTS crm.social_instagram_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id VARCHAR(80) NOT NULL,
  page_name VARCHAR(190),
  instagram_id VARCHAR(80) NOT NULL,
  instagram_username VARCHAR(190) NOT NULL,
  instagram_name VARCHAR(190),
  profile_picture_url TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_instagram_account_page_id
  ON crm.social_instagram_account(page_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_instagram_account_instagram_id
  ON crm.social_instagram_account(instagram_id);

CREATE INDEX IF NOT EXISTS idx_social_instagram_account_status_updated
  ON crm.social_instagram_account(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm.social_instagram_post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES crm.social_instagram_account(id) ON DELETE CASCADE,
  caption TEXT NOT NULL,
  media_url TEXT NOT NULL,
  ig_creation_id VARCHAR(120),
  ig_media_id VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_instagram_post_account_created
  ON crm.social_instagram_post(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_instagram_post_status_created
  ON crm.social_instagram_post(status, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.social_instagram_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES crm.social_instagram_account(id) ON DELETE SET NULL,
  post_id UUID REFERENCES crm.social_instagram_post(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  endpoint TEXT,
  http_method VARCHAR(10),
  request_payload JSONB,
  response_payload JSONB,
  status_code INT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_instagram_log_created
  ON crm.social_instagram_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_instagram_log_account_created
  ON crm.social_instagram_log(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_instagram_log_post_created
  ON crm.social_instagram_log(post_id, created_at DESC);
