import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation, lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { normalizeIntent } from '@/lib/domain';
import { prisma } from '@/lib/prisma';

async function ensureDealSuppressionTable() {
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

async function isSuppressedOrganization(organizationId: string | null, dealType: string): Promise<boolean> {
  if (!organizationId) return false;
  const row = await prisma.$queryRaw<Array<{ organization_id: string }>>`
    SELECT organization_id
    FROM crm.deal_suppression
    WHERE organization_id = ${organizationId}::uuid
      AND deal_type = ${dealType}
    LIMIT 1
  `;
  return row.length > 0;
}

function titleForSession(session: { email: string | null; phone: string | null; planCode: string | null }) {
  const contact = session.email || session.phone || 'Lead sem contato';
  return `${contact} - ${session.planCode || 'plano'}`;
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
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
  if (await isSuppressedOrganization(params.organizationId, 'HOSPEDAGEM')) {
    return null;
  }

  const emailNorm = params.email ? params.email.trim().toLowerCase() : null;
  const phoneNorm = normalizePhone(params.phone);

  let existing = null as Awaited<ReturnType<typeof prisma.deal.findFirst>>;

  if (params.organizationId) {
    existing = await prisma.deal.findFirst({
      where: {
        pipelineId: params.pipelineId,
        dealType: 'HOSPEDAGEM',
        organizationId: params.organizationId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!existing) {
      const whereOr: Prisma.DealWhereInput[] = [];
      if (emailNorm) whereOr.push({ contactEmail: emailNorm });
      if (params.phone) whereOr.push({ contactPhone: params.phone });
      if (phoneNorm && params.phone !== phoneNorm) whereOr.push({ contactPhone: phoneNorm });

      if (whereOr.length > 0) {
        existing = await prisma.deal.findFirst({
          where: {
            pipelineId: params.pipelineId,
            dealType: 'HOSPEDAGEM',
            organizationId: null,
            OR: whereOr,
          },
          orderBy: { updatedAt: 'desc' },
        });
      }
    }
  } else {
    const whereOr: Prisma.DealWhereInput[] = [];
    if (emailNorm) whereOr.push({ contactEmail: emailNorm });
    if (params.phone) whereOr.push({ contactPhone: params.phone });
    if (phoneNorm && params.phone !== phoneNorm) whereOr.push({ contactPhone: phoneNorm });

    if (whereOr.length > 0) {
      existing = await prisma.deal.findFirst({
        where: {
          pipelineId: params.pipelineId,
          dealType: 'HOSPEDAGEM',
          organizationId: null,
          OR: whereOr,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
  }

  const lifecycle = lifecycleByStageCode(params.stageCode);

  if (existing) {
    const moved = await prisma.$transaction(async (tx) => {
      const updated = await tx.deal.update({
        where: { id: existing.id },
        data: {
          stageId: params.stageId,
          title: params.title,
          contactEmail: emailNorm ?? params.email,
          contactPhone: phoneNorm ?? params.phone,
          organizationId: existing.organizationId ?? params.organizationId,
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
      contactEmail: emailNorm ?? params.email,
      contactPhone: phoneNorm ?? params.phone,
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

  await ensureDealSuppressionTable();

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

    const deal = await findOrCreateDealForSession({
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

    if (deal) {
      abandonedCount += 1;
    }
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

    if (deal) {
      await prisma.$transaction(async (tx) => {
        const target = await tx.deal.findUnique({ where: { id: deal.id }, select: { id: true, dealType: true } });
        if (target) {
          await ensureDealOperation(tx, target);
        }
      });
      activatedCount += 1;
    }
  }

  // Evita criação automática cíclica de deals avulsos sem vínculo.
  // A entrada de avulsos deve ocorrer apenas por fluxo manual/fechamento explícito.
  const proposalOps = 0;

  const summary = `abandonos=${abandonedCount}, pagamentos_confirmados=${activatedCount}, propostas_fechadas=${proposalOps}`;

  return NextResponse.json({
    ok: true,
    summary,
    abandonedCount,
    activatedCount,
    proposalOps,
  });
}
