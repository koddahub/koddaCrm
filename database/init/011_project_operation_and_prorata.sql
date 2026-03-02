-- Project operation state (CRM) + prorata sessions (Portal) + legacy backfill improvements

ALTER TABLE client.project_briefs
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_briefs_project_created
  ON client.project_briefs(project_id, created_at DESC);

-- Backfill project link for existing briefs (first ACTIVE project; fallback first project)
WITH preferred_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY
    p.organization_id,
    CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
    p.created_at ASC
)
UPDATE client.project_briefs pb
SET project_id = pp.project_id
FROM preferred_project pp
WHERE pb.organization_id = pp.organization_id
  AND pb.project_id IS NULL;

CREATE TABLE IF NOT EXISTS client.project_prorata_payment_sessions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES client.projects(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
  target_plan_id UUID NOT NULL REFERENCES client.plans(id),
  payment_id VARCHAR(80) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_prorata_payment_sessions_payment
  ON client.project_prorata_payment_sessions(payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_prorata_payment_sessions_project_pending
  ON client.project_prorata_payment_sessions(project_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_project_prorata_payment_sessions_project_created
  ON client.project_prorata_payment_sessions(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_prorata_payment_sessions_subscription_status
  ON client.project_prorata_payment_sessions(subscription_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.project_operation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES client.projects(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES crm.deal(id) ON DELETE SET NULL,
  stage VARCHAR(80) NOT NULL DEFAULT 'briefing_pendente',
  owner_user_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_project_operation_state_project
  ON crm.project_operation_state(project_id);

CREATE INDEX IF NOT EXISTS idx_crm_project_operation_state_org_updated
  ON crm.project_operation_state(organization_id, updated_at DESC);

-- Legacy compatibility:
-- 1) guarantee at least one ACTIVE project per organization
-- 2) assign synthetic PRJ-XXXX tag when there is no domain
INSERT INTO client.projects (organization_id, domain, project_type, status, created_at, updated_at)
SELECT
  o.id,
  ('PRJ-' || upper(substr(md5(o.id::text), 1, 4)))::varchar(190) AS domain,
  'hospedagem',
  'ACTIVE',
  now(),
  now()
FROM client.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM client.projects p
  WHERE p.organization_id = o.id
);

UPDATE client.projects p
SET
  domain = ('PRJ-' || upper(substr(md5(p.id::text), 1, 4)))::varchar(190),
  updated_at = now()
WHERE coalesce(trim(p.domain), '') = '';

-- Ensure each legacy organization has at least one subscription item
WITH latest_subscription AS (
  SELECT DISTINCT ON (s.organization_id)
    s.organization_id,
    s.plan_id,
    s.status
  FROM client.subscriptions s
  ORDER BY s.organization_id, s.created_at DESC
),
first_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS project_id
  FROM client.projects p
  ORDER BY p.organization_id, p.created_at ASC
)
INSERT INTO client.subscription_items (
  organization_id,
  project_id,
  plan_id,
  status,
  created_at,
  updated_at
)
SELECT
  ls.organization_id,
  fp.project_id,
  ls.plan_id,
  CASE
    WHEN upper(coalesce(ls.status, '')) = 'ACTIVE' THEN 'ACTIVE'
    WHEN upper(coalesce(ls.status, '')) IN ('CANCELED', 'CANCELLED', 'INACTIVE') THEN 'CANCELED'
    ELSE 'PENDING'
  END,
  now(),
  now()
FROM latest_subscription ls
JOIN first_project fp ON fp.organization_id = ls.organization_id
WHERE NOT EXISTS (
  SELECT 1
  FROM client.subscription_items si
  WHERE si.project_id = fp.project_id
);

-- Seed project operation state for client deals when missing
INSERT INTO crm.project_operation_state (organization_id, project_id, deal_id, stage, created_at, updated_at)
SELECT
  p.organization_id,
  p.id,
  d.id,
  'briefing_pendente',
  now(),
  now()
FROM client.projects p
JOIN LATERAL (
  SELECT d1.id
  FROM crm.deal d1
  WHERE d1.organization_id = p.organization_id
    AND d1.lifecycle_status = 'CLIENT'
  ORDER BY d1.updated_at DESC
  LIMIT 1
) d ON true
LEFT JOIN crm.project_operation_state pos ON pos.project_id = p.id
WHERE pos.id IS NULL;
