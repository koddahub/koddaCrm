import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation, lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const status = String(body.status || '').toUpperCase();
  if (!status) {
    return NextResponse.json({ error: 'status é obrigatório' }, { status: 422 });
  }

  const proposal = await prisma.proposalAvulsa.findUnique({ where: { id: params.id } });
  if (!proposal) {
    return NextResponse.json({ error: 'Proposta não encontrada' }, { status: 404 });
  }

  const updated = await prisma.proposalAvulsa.update({
    where: { id: params.id },
    data: { status, updatedAt: new Date() },
  });

  if (status === 'FECHADO') {
    const pipeline = await resolvePipelineAndStages('avulsos');
    const stage = pipeline.stages.find((item) => item.code === 'fechado_ganho') || pipeline.stages.at(-1);

    if (stage) {
      const lifecycle = lifecycleByStageCode(stage.code);
      const whereOr: Prisma.DealWhereInput[] = [];
      if (proposal.organizationId) whereOr.push({ organizationId: proposal.organizationId });
      if (proposal.leadId) whereOr.push({ leadId: proposal.leadId });
      const existing = await prisma.deal.findFirst({
        where: {
          pipelineId: pipeline.id,
          OR: whereOr.length > 0 ? whereOr : [{ id: '00000000-0000-0000-0000-000000000000' }],
        },
        orderBy: { updatedAt: 'desc' },
      });

      let dealId = existing?.id;

      if (existing) {
        await prisma.deal.update({
          where: { id: existing.id },
          data: {
            stageId: stage.id,
            title: proposal.title,
            valueCents: proposal.valueCents,
            lifecycleStatus: lifecycle.lifecycleStatus,
            isClosed: lifecycle.isClosed,
            closedAt: lifecycle.closedAt,
            updatedAt: new Date(),
            metadata: {
              source: 'proposal_closed',
              proposalId: proposal.id,
            },
          },
        });
      } else {
        const positionIndex = await prisma.deal.count({ where: { pipelineId: pipeline.id, stageId: stage.id } });
        const created = await prisma.deal.create({
          data: {
            pipelineId: pipeline.id,
            stageId: stage.id,
            leadId: proposal.leadId,
            organizationId: proposal.organizationId,
            title: proposal.title,
            contactName: proposal.title,
            dealType: 'PROJETO_AVULSO',
            category: 'AVULSO',
            intent: 'projeto_avulso',
            origin: 'MANUAL',
            productCode: 'site_institucional',
            valueCents: proposal.valueCents,
            positionIndex,
            lifecycleStatus: lifecycle.lifecycleStatus,
            isClosed: lifecycle.isClosed,
            closedAt: lifecycle.closedAt,
            metadata: {
              source: 'proposal_closed',
              proposalId: proposal.id,
            },
          },
        });
        dealId = created.id;
      }

      if (dealId) {
        await prisma.$transaction(async (tx) => {
          const deal = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, dealType: true } });
          if (deal) {
            await ensureDealOperation(tx, deal);
          }
        });
      }
    }
  }

  return NextResponse.json({ ok: true, proposal: updated });
}
