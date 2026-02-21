import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureClientBillingInfra } from '@/lib/client-billing';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { dealId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  await ensureClientBillingInfra();

  const row = await prisma.$queryRawUnsafe<Array<{ deal_id: string; ghosted_at: Date | null }>>(
    `
      SELECT deal_id::text, ghosted_at
      FROM crm.client_billing_classification
      WHERE deal_id = $1::uuid
      LIMIT 1
    `,
    params.dealId
  );

  const current = row[0];
  if (!current) {
    return NextResponse.json({ error: 'Classificação não encontrada para este cliente.' }, { status: 404 });
  }

  if (!current.ghosted_at) {
    return NextResponse.json({ error: 'Cliente não está na lista fantasma.' }, { status: 422 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE crm.client_billing_classification
        SET ghosted_at = NULL, ghost_reason = NULL, updated_at = now()
        WHERE deal_id = $1::uuid
      `,
      params.dealId
    );

    await tx.dealActivity.create({
      data: {
        dealId: params.dealId,
        activityType: 'CLIENT_RESTORED',
        content: 'Cliente removido da lista fantasma.',
        metadata: {},
        createdBy: 'ADMIN',
      },
    });
  });

  return NextResponse.json({ ok: true });
}
