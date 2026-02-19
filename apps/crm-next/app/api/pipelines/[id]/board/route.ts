import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const pipeline = await prisma.pipeline.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true, kind: true },
  });

  if (!pipeline) {
    return NextResponse.json({ error: 'Pipeline nao encontrado' }, { status: 404 });
  }

  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId: pipeline.id },
    orderBy: { stageOrder: 'asc' },
    include: {
      cards: {
        orderBy: { positionIndex: 'asc' },
        select: {
          id: true,
          title: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          intent: true,
          origin: true,
          category: true,
          dealType: true,
          valueCents: true,
          slaDeadline: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json({ pipeline, stages });
}
