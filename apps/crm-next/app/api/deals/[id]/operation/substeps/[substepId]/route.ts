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
  const owner = body.owner === undefined ? undefined : String(body.owner || '').trim();
  const notes = body.notes === undefined ? undefined : String(body.notes || '').trim();

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
      const updateData = {
        status: nextStatus,
        owner: owner === undefined ? undefined : owner || null,
        notes: notes === undefined ? undefined : notes || null,
        startedAt: nextStatus === 'IN_PROGRESS' ? now : undefined,
        completedAt: ['COMPLETED', 'SKIPPED'].includes(nextStatus) ? now : undefined,
        updatedAt: now,
      };

      await tx.$executeRaw`
        UPDATE crm.deal_operation_substep
        SET
          status = ${updateData.status},
          owner = COALESCE(${updateData.owner ?? null}, owner),
          notes = COALESCE(${updateData.notes ?? null}, notes),
          started_at = CASE
            WHEN ${updateData.startedAt ? true : false} = true AND started_at IS NULL THEN ${updateData.startedAt ?? null}
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ${updateData.completedAt ? true : false} = true THEN ${updateData.completedAt ?? null}
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
