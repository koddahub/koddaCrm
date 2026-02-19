import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const stageId = String(body.stageId || '');
  const positionIndex = Number.isFinite(Number(body.positionIndex)) ? Number(body.positionIndex) : 0;

  if (!stageId) {
    return NextResponse.json({ error: 'stageId obrigatorio' }, { status: 422 });
  }

  const card = await prisma.pipelineCard.findUnique({
    where: { id: params.id },
    select: { id: true, stageId: true, pipelineId: true },
  });

  if (!card) {
    return NextResponse.json({ error: 'Card nao encontrado' }, { status: 404 });
  }

  const stage = await prisma.pipelineStage.findUnique({
    where: { id: stageId },
    select: { id: true, pipelineId: true },
  });

  if (!stage || stage.pipelineId !== card.pipelineId) {
    return NextResponse.json({ error: 'Stage invalido para este pipeline' }, { status: 422 });
  }

  await prisma.$transaction(async (tx) => {
    const sourceCards = await tx.pipelineCard.findMany({
      where: { stageId: card.stageId, id: { not: card.id } },
      orderBy: [{ positionIndex: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const targetCards = await tx.pipelineCard.findMany({
      where: { stageId, id: { not: card.id } },
      orderBy: [{ positionIndex: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const clamped = Math.max(0, Math.min(positionIndex, targetCards.length));
    const nextTarget = [...targetCards.map((item) => item.id)];
    nextTarget.splice(clamped, 0, card.id);

    await tx.pipelineCard.update({
      where: { id: card.id },
      data: {
        stageId,
        updatedAt: new Date(),
      },
    });

    for (let i = 0; i < sourceCards.length; i += 1) {
      await tx.pipelineCard.update({
        where: { id: sourceCards[i].id },
        data: { positionIndex: i },
      });
    }

    for (let i = 0; i < nextTarget.length; i += 1) {
      await tx.pipelineCard.update({
        where: { id: nextTarget[i] },
        data: { positionIndex: i },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
