import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { normalizeIntent, normalizePhone } from '@/lib/domain';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const phone = normalizePhone(body.phone ? String(body.phone) : null) || null;
  const planCode = body.planCode ? String(body.planCode).toLowerCase() : null;
  const source = body.source ? String(body.source) : 'SITE';
  const organizationId = body.organizationId ? String(body.organizationId) : null;
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  const session = await prisma.signupSession.create({
    data: {
      organizationId,
      email,
      phone,
      planCode,
      source,
      status: 'SIGNUP_STARTED',
      paymentConfirmed: false,
      metadata,
    },
    select: { id: true, status: true, createdAt: true },
  });

  try {
    const pipeline = await resolvePipelineAndStages('hospedagem');
    const stage = pipeline.stages.find((item) => item.code === 'cadastro_iniciado') || pipeline.stages[0];

    const whereOr: Prisma.DealWhereInput[] = [];
    if (organizationId) whereOr.push({ organizationId });
    if (email) whereOr.push({ contactEmail: email });
    if (phone) whereOr.push({ contactPhone: phone });

    const existing = await prisma.deal.findFirst({
      where: {
        pipelineId: pipeline.id,
        OR: whereOr.length > 0 ? whereOr : [{ id: '__no-match__' }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const lifecycle = lifecycleByStageCode(stage.code);

    if (existing) {
      await prisma.deal.update({
        where: { id: existing.id },
        data: {
          stageId: stage.id,
          contactEmail: email,
          contactPhone: phone,
          planCode,
          intent: normalizeIntent(`hospedagem_${planCode || 'basic'}`),
          lifecycleStatus: lifecycle.lifecycleStatus,
          isClosed: lifecycle.isClosed,
          closedAt: lifecycle.closedAt,
          updatedAt: new Date(),
        },
      });
    } else {
      const positionIndex = await prisma.deal.count({ where: { pipelineId: pipeline.id, stageId: stage.id } });
      await prisma.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: stage.id,
          organizationId,
          title: `${email || phone || 'Lead'} - cadastro iniciado`,
          contactName: email || phone || 'Lead',
          contactEmail: email,
          contactPhone: phone,
          dealType: 'HOSPEDAGEM',
          category: 'RECORRENTE',
          intent: normalizeIntent(`hospedagem_${planCode || 'basic'}`),
          origin: 'SIGNUP_FLOW',
          planCode,
          positionIndex,
          lifecycleStatus: lifecycle.lifecycleStatus,
          isClosed: lifecycle.isClosed,
          closedAt: lifecycle.closedAt,
          metadata: { source, sessionStartId: session.id },
        },
      });
    }
  } catch {
    // Não bloqueia fluxo de signup se CRM falhar neste ponto.
  }

  return NextResponse.json({ ok: true, session }, { status: 201 });
}
