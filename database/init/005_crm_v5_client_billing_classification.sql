-- CRM V5: classificação operacional de clientes (ativo/atrasado/inativo) + lista fantasma

CREATE TABLE IF NOT EXISTS crm.client_billing_classification (
  deal_id uuid PRIMARY KEY REFERENCES crm.deal(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  class_status varchar(20) NOT NULL CHECK (class_status IN ('ATIVO','ATRASADO','INATIVO')),
  days_late int NOT NULL DEFAULT 0,
  reference_due_date date NULL,
  last_payment_status varchar(40) NULL,
  last_payment_id uuid NULL,
  ticket_id uuid NULL,
  ticket_created_at timestamptz NULL,
  ghosted_at timestamptz NULL,
  ghost_reason text NULL,
  last_transition_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_billing_class_status
  ON crm.client_billing_classification(class_status);

CREATE INDEX IF NOT EXISTS idx_client_billing_org
  ON crm.client_billing_classification(organization_id);

CREATE INDEX IF NOT EXISTS idx_client_billing_ghosted
  ON crm.client_billing_classification(ghosted_at);

CREATE TABLE IF NOT EXISTS crm.holiday_calendar (
  holiday_date date PRIMARY KEY,
  name varchar(180) NOT NULL,
  scope varchar(20) NOT NULL DEFAULT 'NACIONAL',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- O seed completo (feriados nacionais fixos/móveis de 2026-2030) é mantido pelo worker.
