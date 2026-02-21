import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { toCentsFromInput } from '@/lib/money';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const items = await prisma.proposalAvulsa.findMany({
    orderBy: { createdAt: 'desc' },
    take: 120,
    select: { id: true, title: true, status: true, valueCents: true, createdAt: true },
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'title é obrigatório' }, { status: 422 });
  }

  const valueCents = body.value !== undefined && body.value !== null && body.value !== ''
    ? toCentsFromInput(body.value)
    : null;

  const proposal = await prisma.proposalAvulsa.create({
    data: {
      title,
      scope: body.scope ? String(body.scope) : null,
      valueCents,
      status: 'PROPOSTA_ENVIADA',
      notes: body.notes ? String(body.notes) : null,
      leadId: body.leadId ? String(body.leadId) : null,
      organizationId: body.organizationId ? String(body.organizationId) : null,
    },
  });

  const pipeline = await resolvePipelineAndStages('avulsos');
  const stage = pipeline.stages.find((item) => item.code === 'proposta_enviada') || pipeline.stages[0];
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

  if (existing) {
    await prisma.deal.update({
      where: { id: existing.id },
      data: {
        stageId: stage.id,
        title,
        dealType: 'PROJETO_AVULSO',
        category: 'AVULSO',
        intent: 'projeto_avulso',
        origin: 'MANUAL',
        valueCents: proposal.valueCents,
        lifecycleStatus: lifecycle.lifecycleStatus,
        isClosed: lifecycle.isClosed,
        closedAt: lifecycle.closedAt,
        updatedAt: new Date(),
        metadata: {
          source: 'proposal_create',
          proposalId: proposal.id,
        },
      },
    });
  } else {
    const positionIndex = await prisma.deal.count({ where: { pipelineId: pipeline.id, stageId: stage.id } });
    await prisma.deal.create({
      data: {
        pipelineId: pipeline.id,
        stageId: stage.id,
        leadId: proposal.leadId,
        organizationId: proposal.organizationId,
        title,
        contactName: title,
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
          source: 'proposal_create',
          proposalId: proposal.id,
        },
      },
    });
  }

  return NextResponse.json({ ok: true, proposal }, { status: 201 });
}
