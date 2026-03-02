-- Client projects + consolidated internal billing items

CREATE TABLE IF NOT EXISTS client.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  domain VARCHAR(190),
  project_type VARCHAR(40) NOT NULL DEFAULT 'hospedagem',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_client_projects_status CHECK (upper(status) IN ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELED')),
  CONSTRAINT ck_client_projects_type_len CHECK (char_length(project_type) >= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_projects_org_domain
  ON client.projects(organization_id, lower(coalesce(domain, '')));

CREATE INDEX IF NOT EXISTS idx_client_projects_org_status
  ON client.projects(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS client.subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES client.projects(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES client.plans(id),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  price_override NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_client_subscription_items_status CHECK (upper(status) IN ('ACTIVE', 'PENDING', 'CANCELED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_subscription_items_project
  ON client.subscription_items(project_id);

CREATE INDEX IF NOT EXISTS idx_client_subscription_items_org_status
  ON client.subscription_items(organization_id, status, created_at DESC);

ALTER TABLE client.subscriptions
  ADD COLUMN IF NOT EXISTS consolidated_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS last_recalc_at TIMESTAMPTZ;

-- Backfill: each legacy org domain becomes a default ACTIVE project
INSERT INTO client.projects (organization_id, domain, project_type, status, created_at, updated_at)
SELECT
  o.id,
  lower(trim(o.domain)) AS domain,
  'hospedagem' AS project_type,
  'ACTIVE' AS status,
  now(),
  now()
FROM client.organizations o
WHERE coalesce(trim(o.domain), '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM client.projects p
    WHERE p.organization_id = o.id
      AND lower(coalesce(p.domain, '')) = lower(trim(o.domain))
  );

-- Backfill internal subscription items using latest consolidated subscription and first project
WITH latest_subscription AS (
  SELECT DISTINCT ON (s.organization_id)
    s.id AS subscription_id,
    s.organization_id,
    s.plan_id,
    s.status,
    s.price_override,
    s.created_at
  FROM client.subscriptions s
  ORDER BY s.organization_id, s.created_at DESC
), first_project AS (
  SELECT DISTINCT ON (p.organization_id)
    p.id AS project_id,
    p.organization_id
  FROM client.projects p
  ORDER BY p.organization_id, p.created_at ASC
)
INSERT INTO client.subscription_items (
  organization_id,
  project_id,
  plan_id,
  status,
  price_override,
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
  END AS status,
  ls.price_override,
  now(),
  now()
FROM latest_subscription ls
JOIN first_project fp ON fp.organization_id = ls.organization_id
WHERE NOT EXISTS (
  SELECT 1
  FROM client.subscription_items si
  WHERE si.project_id = fp.project_id
);

-- Initial consolidated value based on ACTIVE/PENDING items
WITH totals AS (
  SELECT
    si.organization_id,
    round(sum(coalesce(si.price_override, p.monthly_price))::numeric, 2) AS total_value
  FROM client.subscription_items si
  JOIN client.plans p ON p.id = si.plan_id
  WHERE upper(si.status) IN ('ACTIVE', 'PENDING')
  GROUP BY si.organization_id
)
UPDATE client.subscriptions s
SET
  consolidated_value = coalesce(t.total_value, 0),
  last_recalc_at = now(),
  updated_at = now()
FROM totals t
WHERE s.organization_id = t.organization_id;

UPDATE client.subscriptions s
SET
  consolidated_value = coalesce(s.consolidated_value, 0),
  last_recalc_at = coalesce(s.last_recalc_at, now())
WHERE s.consolidated_value IS NULL
   OR s.last_recalc_at IS NULL;
