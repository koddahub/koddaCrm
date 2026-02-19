import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { moveDealStage } from '@/lib/deals';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const stageId = String(body.stageId || '').trim();
  const reason = body.reason ? String(body.reason).trim() : 'Mudança manual de estágio';

  if (!stageId) {
    return NextResponse.json({ error: 'stageId é obrigatório' }, { status: 422 });
  }

  try {
    const updated = await prisma.$transaction((tx) =>
      moveDealStage(tx, {
        dealId: params.id,
        toStageId: stageId,
        changedBy: 'ADMIN',
        reason,
      }),
    );

    return NextResponse.json({ ok: true, deal: updated });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao alterar estágio', details: String(error) }, { status: 500 });
  }
}
