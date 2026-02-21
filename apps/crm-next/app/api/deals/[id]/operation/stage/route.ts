import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation, operationStagesByDealType } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { ensurePublicationSubsteps } from '@/lib/site24h-operation';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const stageCode = String(body.stageCode || '').trim();
  const reason = String(body.reason || 'Mudança manual de etapa operacional').trim();
  if (!stageCode) {
    return NextResponse.json({ error: 'stageCode é obrigatório' }, { status: 422 });
  }

  try {
    const output = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          title: true,
          dealType: true,
          lifecycleStatus: true,
        },
      });
      if (!deal) throw new Error('Deal não encontrado');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Operação disponível apenas para cliente fechado');

      const allowed = new Set<string>(operationStagesByDealType(deal.dealType).map((item) => item.code));
      if (!allowed.has(stageCode)) throw new Error('Etapa operacional inválida');

      const operation = await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, stageCode);
      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'OPERATION_STAGE_CHANGED',
          content: `Etapa operacional alterada para ${operation.stageName}.`,
          metadata: { stageCode: operation.stageCode, reason },
          createdBy: 'ADMIN',
        },
      });

      return {
        dealId: deal.id,
        stageCode: operation.stageCode,
        stageName: operation.stageName,
        stageOrder: operation.stageOrder,
      };
    });

    if (output.stageCode === 'publicacao') {
      await ensurePublicationSubsteps(output.dealId);
    }

    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao alterar etapa operacional', details: String(error) }, { status: 500 });
  }
}
