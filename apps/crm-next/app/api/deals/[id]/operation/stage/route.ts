import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation, operationStagesByDealType } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { ensurePublicationSubsteps } from '@/lib/site24h-operation';

class OperationStageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const stageCode = String(body.stageCode || '').trim();
  const projectId = String(body.projectId || '').trim();
  const reason = String(body.reason || 'Mudança manual de etapa operacional').trim();
  if (!stageCode) {
    return NextResponse.json({ error: 'stageCode é obrigatório' }, { status: 422 });
  }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId é obrigatório' }, { status: 422 });
  }

  try {
    const output = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          title: true,
          dealType: true,
          lifecycleStatus: true,
          organizationId: true,
        },
      });
      if (!deal) throw new OperationStageError('Deal não encontrado', 404);
      if (deal.lifecycleStatus !== 'CLIENT') throw new OperationStageError('Operação disponível apenas para cliente fechado', 409);
      if (!deal.organizationId) throw new OperationStageError('Deal sem organização vinculada', 422);

      const allowed = new Set<string>(operationStagesByDealType(deal.dealType).map((item) => item.code));
      if (!allowed.has(stageCode)) throw new OperationStageError('Etapa operacional inválida', 422);

      const ownedProjectRows = await tx.$queryRaw<Array<{ id: string; domain: string | null }>>`
        SELECT id::text AS id, domain
        FROM client.projects
        WHERE id = ${projectId}::uuid
        LIMIT 1
      `;
      const ownedProject = ownedProjectRows[0] || null;
      if (!ownedProject) throw new OperationStageError('Projeto não encontrado', 404);
      const belongsRows = await tx.$queryRaw<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM client.projects
        WHERE id = ${projectId}::uuid
          AND organization_id = ${deal.organizationId}::uuid
        LIMIT 1
      `;
      if (!belongsRows[0]?.ok) {
        throw new OperationStageError('Projeto não pertence ao cliente deste deal', 403);
      }

      const operation = await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, stageCode);
      await tx.$executeRaw`
        INSERT INTO crm.project_operation_state (
          organization_id, project_id, deal_id, stage, created_at, updated_at
        )
        VALUES (
          ${deal.organizationId}::uuid, ${projectId}::uuid, ${deal.id}::uuid, ${operation.stageCode}, now(), now()
        )
        ON CONFLICT (project_id)
        DO UPDATE SET
          stage = EXCLUDED.stage,
          deal_id = EXCLUDED.deal_id,
          updated_at = now()
      `;
      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'OPERATION_STAGE_CHANGED',
          content: `Etapa operacional do projeto alterada para ${operation.stageName}.`,
          metadata: {
            stageCode: operation.stageCode,
            reason,
            project_id: projectId,
            project_domain: ownedProject.domain || null,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        dealId: deal.id,
        projectId,
        stageCode: operation.stageCode,
        stageName: operation.stageName,
        stageOrder: operation.stageOrder,
      };
    });

    if (output.stageCode === 'publicacao') {
      await ensurePublicationSubsteps(output.dealId);
    }

    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    if (error instanceof OperationStageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Falha ao alterar etapa operacional', details: String(error) }, { status: 500 });
  }
}
