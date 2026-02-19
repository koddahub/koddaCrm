import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ensureDealOperation, lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { normalizeIntent } from '@/lib/domain';
import { prisma } from '@/lib/prisma';

const allowed = ['SIGNUP_STARTED', 'CHECKOUT_STARTED', 'SUBSCRIPTION_CREATED', 'PAYMENT_CONFIRMED', 'ABANDONED'];

function targetStageCodeBySessionStatus(status: string) {
  if (status === 'PAYMENT_CONFIRMED') return 'fechado_ganho';
  if (status === 'ABANDONED') return 'perdido';
  if (status === 'SUBSCRIPTION_CREATED' || status === 'CHECKOUT_STARTED') return 'pagamento_pendente';
  return 'cadastro_iniciado';
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const status = body.status ? String(body.status).toUpperCase() : 'CHECKOUT_STARTED';

  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 422 });
  }

  const session = await prisma.signupSession.findUnique({ where: { id: params.id } });
  if (!session) {
    return NextResponse.json({ error: 'signup session não encontrada' }, { status: 404 });
  }

  const updated = await prisma.signupSession.update({
    where: { id: params.id },
    data: {
      status,
      paymentConfirmed: status === 'PAYMENT_CONFIRMED' ? true : session.paymentConfirmed,
      abandonedAt: status === 'ABANDONED' ? new Date() : session.abandonedAt,
      metadata: body.metadata && typeof body.metadata === 'object'
        ? ({ ...(session.metadata as Record<string, unknown> | null), ...(body.metadata as Record<string, unknown>) } as Prisma.InputJsonValue)
        : (session.metadata === null ? undefined : (session.metadata as Prisma.InputJsonValue)),
      updatedAt: new Date(),
    },
    select: { id: true, status: true, updatedAt: true },
  });

  try {
    const pipeline = await resolvePipelineAndStages('hospedagem');
    const stageCode = targetStageCodeBySessionStatus(status);
    const stage = pipeline.stages.find((item) => item.code === stageCode) || pipeline.stages[0];

    const whereOr: Prisma.DealWhereInput[] = [];
    if (session.organizationId) whereOr.push({ organizationId: session.organizationId });
    if (session.email) whereOr.push({ contactEmail: session.email });
    if (session.phone) whereOr.push({ contactPhone: session.phone });

    const existing = await prisma.deal.findFirst({
      where: {
        pipelineId: pipeline.id,
        OR: whereOr.length > 0 ? whereOr : [{ id: '__no-match__' }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const lifecycle = lifecycleByStageCode(stage.code);

    const deal = existing
      ? await prisma.deal.update({
          where: { id: existing.id },
          data: {
            stageId: stage.id,
            planCode: session.planCode,
            intent: normalizeIntent(`hospedagem_${session.planCode || 'basic'}`),
            lifecycleStatus: lifecycle.lifecycleStatus,
            isClosed: lifecycle.isClosed,
            closedAt: lifecycle.closedAt,
            updatedAt: new Date(),
          },
        })
      : await prisma.deal.create({
          data: {
            pipelineId: pipeline.id,
            stageId: stage.id,
            organizationId: session.organizationId,
            title: `${session.email || session.phone || 'Lead'} - ${stage.name}`,
            contactName: session.email || session.phone || 'Lead',
            contactEmail: session.email,
            contactPhone: session.phone,
            dealType: 'HOSPEDAGEM',
            category: 'RECORRENTE',
            intent: normalizeIntent(`hospedagem_${session.planCode || 'basic'}`),
            origin: 'SIGNUP_FLOW',
            planCode: session.planCode,
            positionIndex: await prisma.deal.count({ where: { pipelineId: pipeline.id, stageId: stage.id } }),
            lifecycleStatus: lifecycle.lifecycleStatus,
            isClosed: lifecycle.isClosed,
            closedAt: lifecycle.closedAt,
            metadata: { source: 'signup_heartbeat', sessionId: session.id },
          },
        });

    await prisma.dealStageHistory.create({
      data: {
        dealId: deal.id,
        fromStageId: existing?.stageId || null,
        toStageId: stage.id,
        changedBy: 'SYSTEM',
        reason: `Atualização signup_session: ${status}`,
      },
    });

    if (lifecycle.lifecycleStatus === 'CLIENT') {
      await prisma.$transaction(async (tx) => {
        const d = await tx.deal.findUnique({ where: { id: deal.id }, select: { id: true, dealType: true } });
        if (d) await ensureDealOperation(tx, d);
      });
    }
  } catch {
    // não quebra fluxo do portal por falha no CRM
  }

  return NextResponse.json({ ok: true, session: updated });
}
