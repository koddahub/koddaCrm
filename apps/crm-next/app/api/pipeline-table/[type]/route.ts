import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { parsePipelineType, resolvePipelineAndStages } from '@/lib/deals';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const type = parsePipelineType(params.type);
  if (!type) {
    return NextResponse.json({ error: 'Tipo de pipeline inválido' }, { status: 422 });
  }

  try {
    const pipeline = await resolvePipelineAndStages(type);

    const deals = await prisma.deal.findMany({
      where: {
        pipelineId: pipeline.id,
        lifecycleStatus: { not: 'CLIENT' },
      },
      orderBy: [{ positionIndex: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        planCode: true,
        productCode: true,
        intent: true,
        origin: true,
        valueCents: true,
        slaDeadline: true,
        lifecycleStatus: true,
        isClosed: true,
        stageId: true,
      },
    });

    const stageMap = new Map<string, Array<(typeof deals)[number]>>();
    for (const stage of pipeline.stages) {
      stageMap.set(stage.id, []);
    }
    for (const deal of deals) {
      const rows = stageMap.get(deal.stageId);
      if (rows) rows.push(deal);
    }

    return NextResponse.json({
      pipeline: {
        id: pipeline.id,
        code: pipeline.code,
        name: pipeline.name,
      },
      stages: pipeline.stages.map((stage) => ({
        id: stage.id,
        code: stage.code,
        name: stage.name,
        stageOrder: stage.stageOrder,
        rows: stageMap.get(stage.id) || [],
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao carregar pipeline', details: String(error) }, { status: 500 });
  }
}
