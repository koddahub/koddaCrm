import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { ensurePublicationSubsteps, listPublicationSubsteps, publicationSubstepsStatus } from '@/lib/site24h-operation';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const stage = (req.nextUrl.searchParams.get('stage') || 'publicacao').trim().toLowerCase();
  if (stage !== 'publicacao') {
    return NextResponse.json({ error: 'Sub-etapas disponíveis apenas para o estágio publicacao nesta versão.' }, { status: 422 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    select: { id: true, dealType: true, lifecycleStatus: true },
  });
  if (!deal) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  if (deal.dealType !== 'HOSPEDAGEM') {
    return NextResponse.json({ error: 'Sub-etapas disponíveis apenas para hospedagem.' }, { status: 422 });
  }

  await ensurePublicationSubsteps(deal.id);
  const items = await listPublicationSubsteps(deal.id);
  const summary = await publicationSubstepsStatus(deal.id);
  return NextResponse.json({ ok: true, stage: 'publicacao', summary, items });
}
