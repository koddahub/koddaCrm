import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureClientBillingInfra } from '@/lib/client-billing';
import { ensureDealSuppressionTable, purgeOrganizationData } from '@/lib/deal-purge';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest, { params }: { params: { dealId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  await ensureClientBillingInfra();
  await ensureDealSuppressionTable();

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.$queryRawUnsafe<
        Array<{ deal_id: string; organization_id: string | null; ghosted_at: Date | null; deal_type: string; lifecycle_status: string }>
      >(
        `
          SELECT
            d.id::text AS deal_id,
            d.organization_id::text AS organization_id,
            d.deal_type,
            d.lifecycle_status,
            c.ghosted_at
          FROM crm.deal d
          JOIN crm.client_billing_classification c ON c.deal_id = d.id
          WHERE d.id = $1::uuid
          LIMIT 1
        `,
        params.dealId
      );

      const row = target[0];
      if (!row) {
        throw new Error('E_NOT_FOUND:Cliente não encontrado para purge.');
      }
      if (!row.ghosted_at) {
        throw new Error('E_NOT_GHOST:Exclusão permanente permitida apenas para clientes da lista fantasma.');
      }
      if (!row.organization_id) {
        throw new Error('E_NO_ORG:Cliente sem organização vinculada para purge.');
      }
      if (row.deal_type !== 'HOSPEDAGEM') {
        throw new Error('E_INVALID_TYPE:Purge disponível apenas para hospedagem nesta versão.');
      }
      if (row.lifecycle_status !== 'CLIENT') {
        throw new Error('E_INVALID_LIFECYCLE:Purge disponível apenas para clientes fechados.');
      }

      await purgeOrganizationData(tx, row.organization_id);
    });

    return NextResponse.json({ ok: true, purge: 'full' });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const [code, details] = raw.includes(':') ? raw.split(/:(.+)/, 2) : ['', raw];
    const status =
      code === 'E_NOT_FOUND'
        ? 404
        : code === 'E_NOT_GHOST' || code === 'E_NO_ORG' || code === 'E_INVALID_TYPE' || code === 'E_INVALID_LIFECYCLE'
          ? 422
          : 500;
    return NextResponse.json({ error: 'Falha ao excluir permanentemente', details }, { status });
  }
}
