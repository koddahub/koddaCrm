import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const promptText = String(body.promptText || '').trim();
  const promptJson = body.promptJson ?? null;
  if (!promptText) {
    return NextResponse.json({ error: 'Prompt é obrigatório para salvar rascunho.' }, { status: 422 });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        select: { id: true, dealType: true, lifecycleStatus: true },
      });
      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Pré-prompt disponível somente para hospedagem');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Deal ainda não está fechado para operação');

      const latest = await tx.dealPromptRevision.findFirst({
        where: { dealId: deal.id },
        orderBy: { version: 'desc' },
      });

      const revision = latest && latest.status !== 'APPROVED'
        ? await tx.dealPromptRevision.update({
            where: { id: latest.id },
            data: {
              promptText,
              promptJson: promptJson as never,
              status: 'DRAFT',
              updatedAt: new Date(),
            },
          })
        : await tx.dealPromptRevision.create({
            data: {
              dealId: deal.id,
              version: (latest?.version || 0) + 1,
              promptText,
              promptJson: promptJson as never,
              status: 'DRAFT',
              createdBy: 'ADMIN',
            },
          });

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'pre_prompt');
      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PREPROMPT_DRAFT_SAVED',
          content: `Rascunho do pré-prompt salvo (v${revision.version}).`,
          metadata: { revisionId: revision.id },
          createdBy: 'ADMIN',
        },
      });

      return { revisionId: revision.id, version: revision.version };
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao salvar rascunho do pré-prompt', details: String(error) }, { status: 500 });
  }
}
