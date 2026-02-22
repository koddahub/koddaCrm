-- CRM V7: releases versionadas por deal + variantes V1/V2/V3 + assets do prompt

CREATE TABLE IF NOT EXISTS crm.deal_site_release (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  project_root VARCHAR(500) NOT NULL,
  assets_path VARCHAR(500) NOT NULL,
  prompt_md_path VARCHAR(500),
  prompt_json_path VARCHAR(500),
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, version)
);

CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
  ON crm.deal_site_release(deal_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_status
  ON crm.deal_site_release(deal_id, status);

CREATE TABLE IF NOT EXISTS crm.deal_site_variant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
  variant_code VARCHAR(10) NOT NULL,
  folder_path VARCHAR(500) NOT NULL,
  entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
  preview_url VARCHAR(500),
  source_hash VARCHAR(128),
  status VARCHAR(40) NOT NULL DEFAULT 'BASE_PREPARED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_id, variant_code)
);

CREATE INDEX IF NOT EXISTS idx_deal_site_variant_release_status
  ON crm.deal_site_variant(release_id, status);

CREATE TABLE IF NOT EXISTS crm.deal_prompt_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
  asset_type VARCHAR(40) NOT NULL,
  original_path VARCHAR(500) NOT NULL,
  release_path VARCHAR(500) NOT NULL,
  meta_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_prompt_asset_release_type
  ON crm.deal_prompt_asset(release_id, asset_type);
