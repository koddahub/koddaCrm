import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { parsePipelineType, resolvePipelineAndStages } from '@/lib/deals';
import { normalizeIntent, normalizePhone } from '@/lib/domain';
import { notifyNewLeadByEmail } from '@/lib/lead-notification-email';
import { toCentsFromInput } from '@/lib/money';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const pipelineType = parsePipelineType(String(body.pipelineType || ''));
  const name = String(body.name || '').trim();
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const phone = normalizePhone(body.phone ? String(body.phone) : null) || null;

  if (!pipelineType) {
    return NextResponse.json({ error: 'pipelineType inválido' }, { status: 422 });
  }
  if (!name || (!email && !phone)) {
    return NextResponse.json({ error: 'Nome e pelo menos e-mail ou telefone são obrigatórios' }, { status: 422 });
  }

  const pipeline = await resolvePipelineAndStages(pipelineType);
  const firstStage = pipeline.stages[0];

  const planCode = pipelineType === 'hospedagem' ? String(body.planCode || 'basic').toLowerCase() : null;
  const productCode = pipelineType === 'avulsos' ? String(body.productCode || 'site_institucional').toLowerCase() : null;

  const intent = normalizeIntent(
    body.intent
      ? String(body.intent)
      : pipelineType === 'hospedagem'
        ? `hospedagem_${planCode}`
        : String(productCode),
  );

  const category = pipelineType === 'hospedagem' ? 'RECORRENTE' : 'AVULSO';
  const dealType = pipelineType === 'hospedagem' ? 'HOSPEDAGEM' : 'PROJETO_AVULSO';
  const valueCents = body.value ? toCentsFromInput(body.value) : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          source: 'manual',
          sourceRef: 'CRM_MANUAL',
          name,
          email,
          phone,
          interest: intent,
          payload: body,
          stage: 'NOVO',
        },
      });

      const positionIndex = await tx.deal.count({
        where: {
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          lifecycleStatus: { not: 'CLIENT' },
        },
      });

      const deal = await tx.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          leadId: lead.id,
          title: `${name} - ${intent}`,
          contactName: name,
          contactEmail: email,
          contactPhone: phone,
          dealType,
          category,
          intent,
          origin: 'MANUAL',
          planCode,
          productCode,
          valueCents,
          positionIndex,
          lifecycleStatus: 'OPEN',
          isClosed: false,
          metadata: body,
        },
      });

      await tx.dealStageHistory.create({
        data: {
          dealId: deal.id,
          fromStageId: null,
          toStageId: firstStage.id,
          changedBy: 'ADMIN',
          reason: 'Novo lead manual CRM',
        },
      });

      return { lead, deal };
    });

    let leadNotificationQueueId: string | null = null;
    let leadNotificationError: string | null = null;
    try {
      leadNotificationQueueId = await notifyNewLeadByEmail({
        source: 'manual',
        leadId: result.lead.id,
        dealId: result.deal.id,
        name,
        email,
        phone,
        interest: intent,
        intent,
        category,
        dealType,
        origin: 'MANUAL',
        payload: body,
      });
    } catch (notifyError) {
      leadNotificationError = notifyError instanceof Error ? notifyError.message : String(notifyError);
      console.error('[lead-notify] Falha ao enfileirar e-mail de novo lead (manual)', {
        leadId: result.lead.id,
        dealId: result.deal.id,
        error: leadNotificationError,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        leadId: result.lead.id,
        dealId: result.deal.id,
        leadNotification: {
          queued: Boolean(leadNotificationQueueId),
          queueId: leadNotificationQueueId,
          error: leadNotificationError,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao criar lead manual', details: String(error) }, { status: 500 });
  }
}
