import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type CardPayload = {
  pipelineCode: string;
  stageCode: string;
  title: string;
  leadId?: string | null;
  organizationId?: string | null;
  proposalId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  dealType: string;
  category: string;
  intent?: string | null;
  origin: string;
  valueCents?: number | null;
  metadata?: Record<string, unknown>;
};

export async function resolveStage(pipelineCode: string, stageCode: string) {
  const pipeline = await prisma.pipeline.findUnique({ where: { code: pipelineCode } });
  if (!pipeline) {
    throw new Error(`Pipeline ${pipelineCode} nao encontrado`);
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: pipeline.id, code: stageCode },
    orderBy: { stageOrder: 'asc' },
  });

  if (!stage) {
    throw new Error(`Stage ${stageCode} nao encontrado`);
  }

  return { pipeline, stage };
}

export async function upsertPipelineCard(payload: CardPayload) {
  const { pipeline, stage } = await resolveStage(payload.pipelineCode, payload.stageCode);

  const where: Record<string, unknown> = { pipelineId: pipeline.id };
  if (payload.leadId) {
    where.leadId = payload.leadId;
  } else if (payload.proposalId) {
    where.proposalId = payload.proposalId;
  } else if (payload.organizationId) {
    where.organizationId = payload.organizationId;
  }

  const existing = await prisma.pipelineCard.findFirst({ where });
  const countInStage = await prisma.pipelineCard.count({ where: { stageId: stage.id } });

  const baseData = {
    stageId: stage.id,
    pipelineId: pipeline.id,
    title: payload.title,
    contactName: payload.contactName || null,
    contactEmail: payload.contactEmail || null,
    contactPhone: payload.contactPhone || null,
    dealType: payload.dealType,
    category: payload.category,
    intent: payload.intent || null,
    origin: payload.origin,
    valueCents: payload.valueCents ?? null,
    metadata: (payload.metadata || {}) as Prisma.InputJsonValue,
    slaDeadline: stage.slaHours ? new Date(Date.now() + stage.slaHours * 3600000) : null,
    updatedAt: new Date(),
  };

  if (existing) {
    return prisma.pipelineCard.update({
      where: { id: existing.id },
      data: {
        ...baseData,
        positionIndex: countInStage,
      },
    });
  }

  return prisma.pipelineCard.create({
    data: {
      ...baseData,
      leadId: payload.leadId || null,
      organizationId: payload.organizationId || null,
      proposalId: payload.proposalId || null,
      positionIndex: countInStage,
    },
  });
}

export async function addDefaultTasksForOperationalCard(cardTitle: string, dealType: string) {
  if (dealType === 'HOSPEDAGEM') {
    await prisma.task.createMany({
      data: [
        {
          title: `Boas-vindas pendente - ${cardTitle}`,
          taskType: 'WELCOME',
          status: 'PENDING',
          slaDeadline: new Date(Date.now() + 2 * 3600000),
          details: 'Enviar email e fila WhatsApp manual assistida.',
        },
        {
          title: `Briefing pendente - ${cardTitle}`,
          taskType: 'SITE_BRIEF',
          status: 'PENDING',
          slaDeadline: new Date(Date.now() + 8 * 3600000),
          details: 'Cobrar preenchimento de briefing para gerar prompt.',
        },
      ],
    });
    return;
  }

  await prisma.task.createMany({
    data: [
      {
        title: `Kickoff projeto avulso - ${cardTitle}`,
        taskType: 'PROJECT_KICKOFF',
        status: 'PENDING',
        slaDeadline: new Date(Date.now() + 24 * 3600000),
        details: 'Agendar reuniao de kickoff e alinhar escopo.',
      },
      {
        title: `Coleta de requisitos - ${cardTitle}`,
        taskType: 'REQUIREMENTS',
        status: 'PENDING',
        slaDeadline: new Date(Date.now() + 48 * 3600000),
        details: 'Checklist de requisitos do projeto avulso.',
      },
    ],
  });
}
