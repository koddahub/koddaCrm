import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { publicationSubstepsStatus } from '@/lib/site24h-operation';

const ALLOWED_STATUS = new Set(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED']);

export async function PATCH(req: NextRequest, { params }: { params: { id: string; substepId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const status = String(body.status || '').trim().toUpperCase();
  const ownerProvided = body.owner !== undefined;
  const notesProvided = body.notes !== undefined;
  const owner = ownerProvided ? String(body.owner || '').trim() : undefined;
  const notes = notesProvided ? String(body.notes || '').trim() : undefined;

  if (status && !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'Status de sub-etapa inválido.' }, { status: 422 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const substeps = await tx.$queryRaw<Array<{
        id: string;
        deal_id: string;
        stage_code: string;
        substep_name: string;
        status: string;
      }>>`
        SELECT id::text, deal_id::text, stage_code, substep_name, status
        FROM crm.deal_operation_substep
        WHERE id = ${params.substepId}::uuid
          AND deal_id = ${params.id}::uuid
        LIMIT 1
      `;

      const current = substeps[0];
      if (!current) throw new Error('Sub-etapa não encontrada');
      if (current.stage_code !== 'publicacao') throw new Error('Somente sub-etapas de publicação são suportadas nesta versão');

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
          },
          createdBy: 'ADMIN',
        },
      });

      return { ok: true, substepId: params.substepId, status: nextStatus };
    });

    const summary = await publicationSubstepsStatus(params.id);
    if (summary.ready) {
      await prisma.dealActivity.create({
        data: {
          dealId: params.id,
          activityType: 'PUBLICATION_READY',
          content: 'Todas as sub-etapas obrigatórias de publicação foram concluídas. Monitor estrito está ativo.',
          metadata: summary,
          createdBy: 'SYSTEM',
        },
      });
    }

    return NextResponse.json({ ...result, summary });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao atualizar sub-etapa', details: String(error) }, { status: 500 });
  }
}
