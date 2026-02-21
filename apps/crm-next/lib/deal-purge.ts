import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function ensureDealSuppressionTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_suppression (
      organization_id uuid NOT NULL,
      deal_type varchar(40) NOT NULL,
      subscription_id uuid NULL,
      reason text NULL,
      created_by varchar(120) NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, deal_type)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS deal_suppression_subscription_idx
      ON crm.deal_suppression(subscription_id)
  `);
}

export async function purgeOrganizationData(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const orgRows = await tx.$queryRawUnsafe<Array<{ id: string; user_id: string | null }>>(
    `
      SELECT id::text AS id, user_id::text AS user_id
      FROM client.organizations
      WHERE id = $1::uuid
      LIMIT 1
    `,
    organizationId
  );

  const userId = orgRows[0]?.user_id ?? null;

  await tx.$executeRawUnsafe(`DELETE FROM crm.deal WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.pipeline_card WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.proposal_avulsa WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.signup_session WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.email_queue WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.manual_whatsapp_queue WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.financial_entry WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.collection_action WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.accounts WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.deal_suppression WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM crm.client_billing_classification WHERE organization_id = $1::uuid`, organizationId);

  await tx.$executeRawUnsafe(`DELETE FROM client.tickets WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM client.project_briefs WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM client.payments WHERE subscription_id IN (SELECT id FROM client.subscriptions WHERE organization_id = $1::uuid)`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM client.subscriptions WHERE organization_id = $1::uuid`, organizationId);
  await tx.$executeRawUnsafe(`DELETE FROM client.organizations WHERE id = $1::uuid`, organizationId);

  if (userId) {
    const rem = await tx.$queryRawUnsafe<Array<{ c: number }>>(
      `
        SELECT COUNT(*)::int AS c
        FROM client.organizations
        WHERE user_id = $1::uuid
      `,
      userId
    );
    if ((rem[0]?.c ?? 0) === 0) {
      await tx.$executeRawUnsafe(`DELETE FROM client.users WHERE id = $1::uuid`, userId);
    }
  }

  await tx.$executeRawUnsafe(`
    DELETE FROM crm.lead_dedupe_key k
    WHERE NOT EXISTS (
      SELECT 1 FROM crm.deal d WHERE d.lead_id = k.lead_id
    )
  `);
  await tx.$executeRawUnsafe(`
    DELETE FROM crm.leads l
    WHERE NOT EXISTS (
      SELECT 1 FROM crm.deal d WHERE d.lead_id = l.id
    )
  `);
}
