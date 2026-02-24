import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type PipelineType = 'hospedagem' | 'avulsos';

export const PIPELINE_CODES: Record<PipelineType, string> = {
  hospedagem: 'comercial_hospedagem',
  avulsos: 'comercial_avulsos',
};

export const WON_STAGE_CODES = new Set(['fechado_ganho', 'assinatura_ativa_ganho']);
export const LOST_STAGE_CODES = new Set(['perdido', 'perdido_abandonado']);

const HOSPEDAGEM_OPERATION_STAGES = [
  { code: 'briefing_pendente', name: 'Briefing pendente', order: 1 },
  { code: 'pre_prompt', name: 'Pré-prompt', order: 2 },
  { code: 'template_v1', name: 'Template V1', order: 3 },
  { code: 'ajustes', name: 'Ajustes', order: 4 },
  { code: 'aprovacao_cliente', name: 'Aprovação do cliente', order: 5 },
  { code: 'publicacao', name: 'Publicação', order: 6 },
  { code: 'publicado', name: 'Publicado', order: 7 },
] as const;

const AVULSO_OPERATION_STAGES = [
  { code: 'kickoff', name: 'Kickoff', order: 1 },
  { code: 'requisitos', name: 'Requisitos', order: 2 },
  { code: 'desenvolvimento', name: 'Desenvolvimento', order: 3 },
  { code: 'validacao', name: 'Validação', order: 4 },
  { code: 'entrega', name: 'Entrega', order: 5 },
  { code: 'suporte_inicial', name: 'Suporte inicial', order: 6 },
] as const;

export function lifecycleByStageCode(stageCode: string): {
  lifecycleStatus: 'OPEN' | 'CLIENT' | 'LOST';
  isClosed: boolean;
  closedAt: Date | null;
} {
  if (WON_STAGE_CODES.has(stageCode)) {
    return { lifecycleStatus: 'CLIENT', isClosed: true, closedAt: new Date() };
  }
  if (LOST_STAGE_CODES.has(stageCode)) {
    return { lifecycleStatus: 'LOST', isClosed: true, closedAt: new Date() };
  }
  return { lifecycleStatus: 'OPEN', isClosed: false, closedAt: null };
}

export function operationStagesByDealType(dealType: string) {
  return dealType === 'HOSPEDAGEM' ? HOSPEDAGEM_OPERATION_STAGES : AVULSO_OPERATION_STAGES;
}

export async function resolvePipelineAndStages(type: PipelineType) {
  const code = PIPELINE_CODES[type];
  const pipeline = await prisma.pipeline.findUnique({
    where: { code },
    include: {
      stages: {
        orderBy: { stageOrder: 'asc' },
      },
    },
  });

  if (!pipeline) {
    throw new Error(`Pipeline ${code} não encontrado`);
  }

  return pipeline;
}

export async function ensureDealOperation(
  tx: Prisma.TransactionClient,
  deal: { id: string; dealType: string },
  stageCode?: string,
) {
  const operationStages = operationStagesByDealType(deal.dealType);
  const inferStageFromArtifacts = async (): Promise<string | null> => {
    const activeOperation = await tx.dealOperation.findFirst({
      where: {
        dealId: deal.id,
        operationType: deal.dealType,
        status: 'ACTIVE',
      },
      orderBy: { stageOrder: 'desc' },
      select: { stageCode: true, stageOrder: true },
    });
    const highestCompleted = await tx.dealOperation.findFirst({
      where: {
        dealId: deal.id,
        operationType: deal.dealType,
        status: 'COMPLETED',
      },
      orderBy: { stageOrder: 'desc' },
      select: { stageCode: true, stageOrder: true },
    });

    if (
      activeOperation
      && highestCompleted
      && Number(highestCompleted.stageOrder || 0) > Number(activeOperation.stageOrder || 0)
      && highestCompleted.stageCode
    ) {
      return highestCompleted.stageCode;
    }

    if (deal.dealType !== 'HOSPEDAGEM') return null;
    const [latestApproval, latestTemplate, latestActivity, latestPromptRevision] = await Promise.all([
      tx.dealClientApproval.findFirst({
        where: { dealId: deal.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      }),
      tx.dealTemplateRevision.findFirst({
        where: { dealId: deal.id },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        select: { status: true },
      }),
      tx.dealActivity.findFirst({
        where: {
          dealId: deal.id,
          activityType: { in: ['CLIENT_APPROVAL_REQUESTED', 'CLIENT_REQUESTED_CHANGES', 'CLIENT_APPROVED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { activityType: true },
      }),
      tx.dealPromptRevision.findFirst({
        where: { dealId: deal.id },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
      }),
    ]);

    const approvalStatus = String(latestApproval?.status || '').toUpperCase();
    const templateStatus = String(latestTemplate?.status || '').toUpperCase();
    const activityType = String(latestActivity?.activityType || '').toUpperCase();

    if (
      approvalStatus === 'APPROVED'
      || templateStatus === 'APPROVED_CLIENT'
      || activityType === 'CLIENT_APPROVED'
    ) {
      return 'publicacao';
    }
    if (
      approvalStatus === 'CHANGES_REQUESTED'
      || templateStatus === 'NEEDS_ADJUSTMENTS'
      || activityType === 'CLIENT_REQUESTED_CHANGES'
    ) {
      return 'ajustes';
    }
    if (
      approvalStatus === 'PENDING'
      || ['SENT_CLIENT', 'IN_REVIEW'].includes(templateStatus)
      || activityType === 'CLIENT_APPROVAL_REQUESTED'
    ) {
      return 'aprovacao_cliente';
    }
    if (templateStatus) {
      return 'template_v1';
    }
    if (latestPromptRevision?.id) {
      return 'pre_prompt';
    }
    return null;
  };

  const active = await tx.dealOperation.findFirst({
    where: {
      dealId: deal.id,
      operationType: deal.dealType,
      status: 'ACTIVE',
    },
    orderBy: { stageOrder: 'desc' },
  });

  let desiredStageCode = stageCode;
  if (!desiredStageCode) {
    const inferred = await inferStageFromArtifacts();
    if (!inferred && active) {
      // No explicit stage and no stronger signal: keep current active stage.
      return active;
    }
    if (inferred && active) {
      const inferredOrder = operationStages.find((item) => item.code === inferred)?.order || 0;
      const activeOrder = Number(active.stageOrder || 0);
      if (inferredOrder <= activeOrder) {
        return active;
      }
    }
    if (inferred) {
      desiredStageCode = inferred;
    }
  }

  const selected = desiredStageCode
    ? operationStages.find((item) => item.code === desiredStageCode)
    : operationStages[0];

  if (!selected) {
    throw new Error('Etapa operacional inválida');
  }

  if (active?.stageCode === selected.code) {
    return active;
  }

  if (active) {
    await tx.dealOperation.update({
      where: { id: active.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  return tx.dealOperation.create({
    data: {
      dealId: deal.id,
      operationType: deal.dealType,
      stageCode: selected.code,
      stageName: selected.name,
      stageOrder: selected.order,
      status: 'ACTIVE',
      startedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function moveDealStage(
  tx: Prisma.TransactionClient,
  params: {
    dealId: string;
    toStageId: string;
    changedBy?: string;
    reason?: string;
    positionIndex?: number;
  },
) {
  const deal = await tx.deal.findUnique({
    where: { id: params.dealId },
    include: {
      stage: true,
      pipeline: true,
    },
  });

  if (!deal) {
    throw new Error('Deal não encontrado');
  }

  const targetStage = await tx.pipelineStage.findUnique({ where: { id: params.toStageId } });
  if (!targetStage || targetStage.pipelineId !== deal.pipelineId) {
    throw new Error('Estágio inválido para este pipeline');
  }

  const sourceRows = await tx.deal.findMany({
    where: {
      pipelineId: deal.pipelineId,
      stageId: deal.stageId,
      id: { not: deal.id },
      lifecycleStatus: { not: 'CLIENT' },
    },
    orderBy: [{ positionIndex: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });

  const targetRows = await tx.deal.findMany({
    where: {
      pipelineId: deal.pipelineId,
      stageId: targetStage.id,
      id: { not: deal.id },
      lifecycleStatus: { not: 'CLIENT' },
    },
    orderBy: [{ positionIndex: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });

  const clampedPosition = Math.max(0, Math.min(params.positionIndex ?? targetRows.length, targetRows.length));
  const targetIds = targetRows.map((item) => item.id);
  targetIds.splice(clampedPosition, 0, deal.id);

  const lifecycle = lifecycleByStageCode(targetStage.code);

  const updated = await tx.deal.update({
    where: { id: deal.id },
    data: {
      stageId: targetStage.id,
      lifecycleStatus: lifecycle.lifecycleStatus,
      isClosed: lifecycle.isClosed,
      closedAt: lifecycle.closedAt,
      updatedAt: new Date(),
    },
  });

  await tx.dealStageHistory.create({
    data: {
      dealId: deal.id,
      fromStageId: deal.stageId,
      toStageId: targetStage.id,
      changedBy: params.changedBy || 'ADMIN',
      reason: params.reason || null,
    },
  });

  for (let index = 0; index < sourceRows.length; index += 1) {
    await tx.deal.update({
      where: { id: sourceRows[index].id },
      data: { positionIndex: index },
    });
  }

  for (let index = 0; index < targetIds.length; index += 1) {
    await tx.deal.update({
      where: { id: targetIds[index] },
      data: { positionIndex: index },
    });
  }

  if (lifecycle.lifecycleStatus === 'CLIENT') {
    await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType });
  }

  return updated;
}

export function parsePipelineType(type: string): PipelineType | null {
  if (type === 'hospedagem') return 'hospedagem';
  if (type === 'avulsos') return 'avulsos';
  return null;
}
