-- CRM project-scoped operation artifacts

ALTER TABLE crm.deal_operation_substep
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE CASCADE;

ALTER TABLE crm.deal_prompt_request
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL;

ALTER TABLE crm.deal_client_approval
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL;

ALTER TABLE crm.deal_template_revision
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL;

ALTER TABLE crm.deal_publish_check
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL;

ALTER TABLE crm.deal_site_release
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL;

-- Legacy constraints must be relaxed for project-level autonomy.
ALTER TABLE crm.deal_operation_substep
  DROP CONSTRAINT IF EXISTS deal_operation_substep_deal_id_stage_code_substep_code_key;

ALTER TABLE crm.deal_template_revision
  DROP CONSTRAINT IF EXISTS deal_template_revision_deal_id_version_key;

ALTER TABLE crm.deal_site_release
  DROP CONSTRAINT IF EXISTS deal_site_release_deal_id_version_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_deal_operation_substep_project_stage_code
  ON crm.deal_operation_substep(deal_id, project_id, stage_code, substep_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_deal_template_revision_project_version
  ON crm.deal_template_revision(deal_id, project_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_deal_site_release_project_version
  ON crm.deal_site_release(deal_id, project_id, version);

CREATE INDEX IF NOT EXISTS idx_crm_deal_operation_substep_project_order
  ON crm.deal_operation_substep(deal_id, project_id, stage_code, substep_order);

CREATE INDEX IF NOT EXISTS idx_crm_deal_prompt_request_project_created
  ON crm.deal_prompt_request(deal_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_deal_client_approval_project_created
  ON crm.deal_client_approval(deal_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_deal_template_revision_project_created
  ON crm.deal_template_revision(deal_id, project_id, version DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_deal_publish_check_project_checked
  ON crm.deal_publish_check(deal_id, project_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_deal_site_release_project_version
  ON crm.deal_site_release(deal_id, project_id, version DESC);

-- Backfill by metadata.project_id and fallback to first ACTIVE project of the organization.
WITH fallback_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY
    p.organization_id,
    CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
    p.created_at ASC
),
deal_project AS (
  SELECT
    d.id AS deal_id,
    d.organization_id,
    CASE
      WHEN coalesce(d.metadata->>'project_id', '') ~* '^[0-9a-f-]{36}$'
      THEN (d.metadata->>'project_id')::uuid
      ELSE NULL
    END AS metadata_project_id
  FROM crm.deal d
  WHERE d.organization_id IS NOT NULL
),
resolved_deal_project AS (
  SELECT
    dp.deal_id,
    coalesce(
      (
        SELECT p.id
        FROM client.projects p
        WHERE p.id = dp.metadata_project_id
          AND p.organization_id = dp.organization_id
        LIMIT 1
      ),
      fp.project_id
    ) AS project_id
  FROM deal_project dp
  LEFT JOIN fallback_project fp ON fp.organization_id = dp.organization_id
)
UPDATE crm.deal_operation_substep os
SET project_id = rdp.project_id
FROM resolved_deal_project rdp
WHERE os.deal_id = rdp.deal_id
  AND os.project_id IS NULL
  AND rdp.project_id IS NOT NULL;

WITH fallback_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY
    p.organization_id,
    CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
    p.created_at ASC
),
resolved_deal_project AS (
  SELECT
    d.id AS deal_id,
    coalesce(
      (
        SELECT p.id
        FROM client.projects p
        WHERE p.organization_id = d.organization_id
          AND coalesce(d.metadata->>'project_id', '') = p.id::text
        LIMIT 1
      ),
      fp.project_id
    ) AS project_id
  FROM crm.deal d
  LEFT JOIN fallback_project fp ON fp.organization_id = d.organization_id
  WHERE d.organization_id IS NOT NULL
)
UPDATE crm.deal_prompt_request pr
SET project_id = rdp.project_id
FROM resolved_deal_project rdp
WHERE pr.deal_id = rdp.deal_id
  AND pr.project_id IS NULL
  AND rdp.project_id IS NOT NULL;

WITH fallback_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY
    p.organization_id,
    CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
    p.created_at ASC
),
resolved_deal_project AS (
  SELECT
    d.id AS deal_id,
    coalesce(
      (
        SELECT p.id
        FROM client.projects p
        WHERE p.organization_id = d.organization_id
          AND coalesce(d.metadata->>'project_id', '') = p.id::text
        LIMIT 1
      ),
      fp.project_id
    ) AS project_id
  FROM crm.deal d
  LEFT JOIN fallback_project fp ON fp.organization_id = d.organization_id
  WHERE d.organization_id IS NOT NULL
)
UPDATE crm.deal_client_approval a
SET project_id = rdp.project_id
FROM resolved_deal_project rdp
WHERE a.deal_id = rdp.deal_id
  AND a.project_id IS NULL
  AND rdp.project_id IS NOT NULL;

WITH fallback_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY
    p.organization_id,
    CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
    p.created_at ASC
),
resolved_deal_project AS (
  SELECT
    d.id AS deal_id,
    coalesce(
      (
        SELECT p.id
        FROM client.projects p
        WHERE p.organization_id = d.organization_id
          AND coalesce(d.metadata->>'project_id', '') = p.id::text
        LIMIT 1
      ),
      fp.project_id
    ) AS project_id
  FROM crm.deal d
  LEFT JOIN fallback_project fp ON fp.organization_id = d.organization_id
  WHERE d.organization_id IS NOT NULL
)
UPDATE crm.deal_template_revision tr
SET project_id = rdp.project_id
FROM resolved_deal_project rdp
WHERE tr.deal_id = rdp.deal_id
  AND tr.project_id IS NULL
  AND rdp.project_id IS NOT NULL;

WITH fallback_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY
    p.organization_id,
    CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
    p.created_at ASC
),
resolved_deal_project AS (
  SELECT
    d.id AS deal_id,
    coalesce(
      (
        SELECT p.id
        FROM client.projects p
        WHERE p.organization_id = d.organization_id
          AND coalesce(d.metadata->>'project_id', '') = p.id::text
        LIMIT 1
      ),
      fp.project_id
    ) AS project_id
  FROM crm.deal d
  LEFT JOIN fallback_project fp ON fp.organization_id = d.organization_id
  WHERE d.organization_id IS NOT NULL
)
UPDATE crm.deal_publish_check pc
SET project_id = rdp.project_id
FROM resolved_deal_project rdp
WHERE pc.deal_id = rdp.deal_id
  AND pc.project_id IS NULL
  AND rdp.project_id IS NOT NULL;

WITH fallback_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY
    p.organization_id,
    CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
    p.created_at ASC
),
resolved_deal_project AS (
  SELECT
    d.id AS deal_id,
    coalesce(
      (
        SELECT p.id
        FROM client.projects p
        WHERE p.organization_id = d.organization_id
          AND coalesce(d.metadata->>'project_id', '') = p.id::text
        LIMIT 1
      ),
      fp.project_id
    ) AS project_id
  FROM crm.deal d
  LEFT JOIN fallback_project fp ON fp.organization_id = d.organization_id
  WHERE d.organization_id IS NOT NULL
)
UPDATE crm.deal_site_release sr
SET project_id = rdp.project_id
FROM resolved_deal_project rdp
WHERE sr.deal_id = rdp.deal_id
  AND sr.project_id IS NULL
  AND rdp.project_id IS NOT NULL;
