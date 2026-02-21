import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { CLIENT_CLASS_STATUS, ensureClientBillingInfra } from '@/lib/client-billing';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { dealId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  await ensureClientBillingInfra();

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : 'Movido manualmente para lista fantasma';

  const row = await prisma.$queryRawUnsafe<Array<{ deal_id: string; class_status: string; ghosted_at: Date | null }>>(
    `
      SELECT deal_id::text, class_status, ghosted_at
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

  if (current.class_status !== CLIENT_CLASS_STATUS.INATIVO) {
    return NextResponse.json({ error: 'Somente clientes inativos podem ir para a lista fantasma.' }, { status: 422 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE crm.client_billing_classification
        SET ghosted_at = now(), ghost_reason = $2::text, updated_at = now()
        WHERE deal_id = $1::uuid
      `,
      params.dealId,
      reason
    );

    await tx.dealActivity.create({
      data: {
        dealId: params.dealId,
        activityType: 'CLIENT_GHOSTED',
        content: 'Cliente movido para lista fantasma.',
        metadata: { reason },
        createdBy: 'ADMIN',
      },
    });
  });

  return NextResponse.json({ ok: true });
}
