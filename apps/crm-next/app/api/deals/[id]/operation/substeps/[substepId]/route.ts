import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { publicationSubstepsStatus } from '@/lib/site24h-operation';

const ALLOWED_STATUS = new Set(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED']);
class SubstepRouteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; substepId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const projectId = String(body.projectId || body.project_id || '').trim();
  const status = String(body.status || '').trim().toUpperCase();
  const ownerProvided = body.owner !== undefined;
  const notesProvided = body.notes !== undefined;
  const owner = ownerProvided ? String(body.owner || '').trim() : undefined;
  const notes = notesProvided ? String(body.notes || '').trim() : undefined;

  if (status && !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'Status de sub-etapa inválido.' }, { status: 422 });
  }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId é obrigatório.' }, { status: 422 });
  }

  try {
    const deal = await prisma.deal.findUnique({
      where: { id: params.id },
      select: { id: true, organizationId: true },
    });
    if (!deal?.id || !deal.organizationId) {
      return NextResponse.json({ error: 'Deal não encontrado.' }, { status: 404 });
    }
    const ownedProject = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM client.projects
      WHERE id = ${projectId}::uuid
        AND organization_id = ${deal.organizationId}::uuid
      LIMIT 1
    `;
    if (!ownedProject[0]?.id) {
      return NextResponse.json({ error: 'Projeto inválido para este cliente.' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const substeps = await tx.$queryRaw<Array<{
        id: string;
        deal_id: string;
        project_id: string | null;
        stage_code: string;
        substep_name: string;
        status: string;
      }>>`
        SELECT id::text, deal_id::text, project_id::text, stage_code, substep_name, status
        FROM crm.deal_operation_substep
        WHERE id = ${params.substepId}::uuid
          AND deal_id = ${params.id}::uuid
          AND project_id = ${projectId}::uuid
        LIMIT 1
      `;

      const current = substeps[0];
      if (!current) throw new SubstepRouteError('Sub-etapa não encontrada', 404);
      if (current.stage_code !== 'publicacao') {
        throw new SubstepRouteError('Somente sub-etapas de publicação são suportadas nesta versão', 422);
      }

      const now = new Date();
      const nextStatus = status || current.status;
      const shouldStart = nextStatus === 'IN_PROGRESS';
      const shouldComplete = ['COMPLETED', 'SKIPPED'].includes(nextStatus);
      const shouldResetStarted = nextStatus === 'PENDING';
      const shouldResetCompleted = ['PENDING', 'IN_PROGRESS', 'BLOCKED'].includes(nextStatus);
      const updateData = {
        status: nextStatus,
        owner: ownerProvided ? owner || null : null,
        notes: notesProvided ? notes || null : null,
        shouldStart,
        shouldComplete,
        shouldResetStarted,
        shouldResetCompleted,
        updatedAt: now,
      };

      await tx.$executeRaw`
        UPDATE crm.deal_operation_substep
        SET
          status = ${updateData.status},
          owner = CASE
            WHEN ${ownerProvided} = true THEN ${updateData.owner}
            ELSE owner
          END,
          notes = CASE
            WHEN ${notesProvided} = true THEN ${updateData.notes}
            ELSE notes
          END,
          started_at = CASE
            WHEN ${updateData.shouldStart} = true AND started_at IS NULL THEN now()
            WHEN ${updateData.shouldResetStarted} = true THEN NULL
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ${updateData.shouldComplete} = true THEN now()
            WHEN ${updateData.shouldResetCompleted} = true THEN NULL
            ELSE completed_at
          END,
          updated_at = now()
        WHERE id = ${params.substepId}::uuid
          AND project_id = ${projectId}::uuid
      `;

      await tx.dealActivity.create({
        data: {
          dealId: params.id,
          activityType: 'PUBLICATION_SUBSTEP_UPDATED',
          content: `Sub-etapa "${current.substep_name}" atualizada para ${nextStatus}.`,
          metadata: {
            substepId: params.substepId,
            stageCode: 'publicacao',
            status: nextStatus,
            owner: owner || null,
            notes: notes ?? null,
            project_id: projectId,
          },
          createdBy: 'ADMIN',
        },
      });

      return { ok: true, substepId: params.substepId, status: nextStatus };
    });

    const summary = await publicationSubstepsStatus(params.id, projectId);
    if (summary.ready) {
      await prisma.dealActivity.create({
        data: {
          dealId: params.id,
          activityType: 'PUBLICATION_READY',
          content: 'Todas as sub-etapas obrigatórias de publicação foram concluídas. Monitor estrito está ativo.',
          metadata: {
            ...summary,
            project_id: projectId,
          },
          createdBy: 'SYSTEM',
        },
      });
    }

    return NextResponse.json({ ...result, summary });
  } catch (error) {
    if (error instanceof SubstepRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Falha ao atualizar sub-etapa', details: String(error) }, { status: 500 });
  }
}
