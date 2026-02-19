import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation, lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { normalizeIntent } from '@/lib/domain';
import { prisma } from '@/lib/prisma';

function titleForSession(session: { email: string | null; phone: string | null; planCode: string | null }) {
  const contact = session.email || session.phone || 'Lead sem contato';
  return `${contact} - ${session.planCode || 'plano'}`;
}

async function findOrCreateDealForSession(params: {
  organizationId: string | null;
  email: string | null;
  phone: string | null;
  title: string;
  stageId: string;
  pipelineId: string;
  stageCode: string;
  planCode: string | null;
  reason: string;
}) {
  const whereOr: Prisma.DealWhereInput[] = [];
  if (params.organizationId) whereOr.push({ organizationId: params.organizationId });
  if (params.email) whereOr.push({ contactEmail: params.email });
  if (params.phone) whereOr.push({ contactPhone: params.phone });

  const existing = await prisma.deal.findFirst({
    where: {
      pipelineId: params.pipelineId,
      OR: whereOr.length > 0 ? whereOr : [{ id: '__no-match__' }],
    },
    orderBy: { updatedAt: 'desc' },
  });

  const lifecycle = lifecycleByStageCode(params.stageCode);

  if (existing) {
    const moved = await prisma.$transaction(async (tx) => {
      const updated = await tx.deal.update({
        where: { id: existing.id },
        data: {
          stageId: params.stageId,
          title: params.title,
          contactEmail: params.email,
          contactPhone: params.phone,
          planCode: params.planCode,
          intent: params.planCode ? normalizeIntent(`hospedagem_${params.planCode}`) : existing.intent,
          lifecycleStatus: lifecycle.lifecycleStatus,
          isClosed: lifecycle.isClosed,
          closedAt: lifecycle.closedAt,
          updatedAt: new Date(),
        },
      });

      await tx.dealStageHistory.create({
        data: {
          dealId: existing.id,
          fromStageId: existing.stageId,
          toStageId: params.stageId,
          changedBy: 'SYSTEM',
          reason: params.reason,
        },
      });

      return updated;
    });

    return moved;
  }

  const positionIndex = await prisma.deal.count({
    where: {
      pipelineId: params.pipelineId,
      stageId: params.stageId,
      lifecycleStatus: { not: 'CLIENT' },
    },
  });

  const deal = await prisma.deal.create({
    data: {
      pipelineId: params.pipelineId,
      stageId: params.stageId,
      organizationId: params.organizationId,
      title: params.title,
      contactName: params.email || params.phone || 'Cliente',
      contactEmail: params.email,
      contactPhone: params.phone,
      dealType: 'HOSPEDAGEM',
      category: 'RECORRENTE',
      intent: params.planCode ? normalizeIntent(`hospedagem_${params.planCode}`) : 'hospedagem_basico',
      origin: 'SIGNUP_FLOW',
      planCode: params.planCode,
      productCode: null,
      positionIndex,
      lifecycleStatus: lifecycle.lifecycleStatus,
      isClosed: lifecycle.isClosed,
      closedAt: lifecycle.closedAt,
      metadata: { source: 'reconcile_signup_session' },
    },
  });

  await prisma.dealStageHistory.create({
    data: {
      dealId: deal.id,
      fromStageId: null,
      toStageId: params.stageId,
      changedBy: 'SYSTEM',
      reason: params.reason,
    },
  });

  return deal;
}

async function syncClosedAvulsoDeals() {
  const pipeline = await resolvePipelineAndStages('avulsos');
  const wonStage = pipeline.stages.find((stage) => stage.code === 'fechado_ganho') || pipeline.stages.at(-1);
  if (!wonStage) return 0;

  const proposals = await prisma.proposalAvulsa.findMany({
    where: { status: 'FECHADO' },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  let processed = 0;

  for (const proposal of proposals) {
    const whereOr: Prisma.DealWhereInput[] = [];
    if (proposal.organizationId) whereOr.push({ organizationId: proposal.organizationId });
    if (proposal.leadId) whereOr.push({ leadId: proposal.leadId });

    const existing = await prisma.deal.findFirst({
      where: {
        pipelineId: pipeline.id,
        OR: whereOr.length > 0 ? whereOr : [{ id: '__no-match__' }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const lifecycle = lifecycleByStageCode(wonStage.code);

    let dealId = existing?.id;

    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.deal.update({
          where: { id: existing.id },
          data: {
            stageId: wonStage.id,
            title: proposal.title,
            dealType: 'PROJETO_AVULSO',
            category: 'AVULSO',
            intent: 'projeto_avulso',
            origin: 'MANUAL',
            productCode: existing.productCode || 'site_institucional',
            valueCents: proposal.valueCents,
            lifecycleStatus: lifecycle.lifecycleStatus,
            isClosed: lifecycle.isClosed,
            closedAt: lifecycle.closedAt,
            updatedAt: new Date(),
          },
        });

        await tx.dealStageHistory.create({
          data: {
            dealId: existing.id,
            fromStageId: existing.stageId,
            toStageId: wonStage.id,
            changedBy: 'SYSTEM',
            reason: 'Proposta avulsa fechada',
          },
        });
      });
    } else {
      const positionIndex = await prisma.deal.count({
        where: { pipelineId: pipeline.id, stageId: wonStage.id, lifecycleStatus: { not: 'CLIENT' } },
      });

      const created = await prisma.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: wonStage.id,
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
          metadata: { source: 'reconcile_proposal_avulsa' },
        },
      });
      dealId = created.id;

      await prisma.dealStageHistory.create({
        data: {
          dealId: created.id,
          fromStageId: null,
          toStageId: wonStage.id,
          changedBy: 'SYSTEM',
          reason: 'Proposta avulsa fechada',
        },
      });
    }

    if (dealId) {
      await prisma.$transaction(async (tx) => {
        const target = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, dealType: true } });
        if (target) await ensureDealOperation(tx, target);
      });
    }

    processed += 1;
  }

  return processed;
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const mode = req.nextUrl.searchParams.get('mode');
  if (mode === 'tickets') {
    const items = await prisma.ticketQueue.findMany({
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: {
        id: true,
        queueName: true,
        status: true,
        slaDeadline: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ items });
  }

  return NextResponse.json({ error: 'Modo inválido' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const now = new Date();
  const cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const pipeline = await resolvePipelineAndStages('hospedagem');
  const lostStage = pipeline.stages.find((stage) => stage.code === 'perdido') || pipeline.stages.at(-1);
  const wonStage = pipeline.stages.find((stage) => stage.code === 'fechado_ganho') || pipeline.stages.at(-1);

  if (!lostStage || !wonStage) {
    return NextResponse.json({ error: 'Pipeline de hospedagem sem estágios esperados' }, { status: 500 });
  }

  const sessionsToAbandon = await prisma.signupSession.findMany({
    where: {
      paymentConfirmed: false,
      abandonedAt: null,
      status: { in: ['SIGNUP_STARTED', 'CHECKOUT_STARTED', 'SUBSCRIPTION_CREATED'] },
      updatedAt: { lt: cutoff },
    },
    orderBy: { updatedAt: 'asc' },
    take: 200,
  });

  let abandonedCount = 0;
  for (const session of sessionsToAbandon) {
    await prisma.signupSession.update({
      where: { id: session.id },
      data: { status: 'ABANDONED', abandonedAt: now, updatedAt: now },
    });

    await findOrCreateDealForSession({
      organizationId: session.organizationId,
      email: session.email,
      phone: session.phone,
      title: titleForSession(session),
      stageId: lostStage.id,
      pipelineId: pipeline.id,
      stageCode: lostStage.code,
      planCode: session.planCode,
      reason: 'Cadastro abandonado após 2h sem pagamento',
    });

    abandonedCount += 1;
  }

  const paidSessions = await prisma.signupSession.findMany({
    where: {
      paymentConfirmed: true,
      status: { in: ['PAYMENT_CONFIRMED', 'SUBSCRIPTION_CREATED', 'CHECKOUT_STARTED'] },
    },
    orderBy: { updatedAt: 'asc' },
    take: 200,
  });

  let activatedCount = 0;
  for (const session of paidSessions) {
    await prisma.signupSession.update({
      where: { id: session.id },
      data: { status: 'PAYMENT_CONFIRMED', updatedAt: now },
    });

    const deal = await findOrCreateDealForSession({
      organizationId: session.organizationId,
      email: session.email,
      phone: session.phone,
      title: titleForSession(session),
      stageId: wonStage.id,
      pipelineId: pipeline.id,
      stageCode: wonStage.code,
      planCode: session.planCode,
      reason: 'Pagamento confirmado',
    });

    await prisma.$transaction(async (tx) => {
      const target = await tx.deal.findUnique({ where: { id: deal.id }, select: { id: true, dealType: true } });
      if (target) {
        await ensureDealOperation(tx, target);
      }
    });

    activatedCount += 1;
  }

  const proposalOps = await syncClosedAvulsoDeals();

  const summary = `abandonos=${abandonedCount}, pagamentos_confirmados=${activatedCount}, propostas_fechadas=${proposalOps}`;

  return NextResponse.json({
    ok: true,
    summary,
    abandonedCount,
    activatedCount,
    proposalOps,
  });
}
