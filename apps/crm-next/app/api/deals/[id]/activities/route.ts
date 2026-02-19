import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const items = await prisma.dealActivity.findMany({
    where: { dealId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const activityType = String(body.activityType || 'NOTE').toUpperCase();
  const content = String(body.content || '').trim();

  if (!content) {
    return NextResponse.json({ error: 'Conteúdo é obrigatório' }, { status: 422 });
  }

  const exists = await prisma.deal.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }

  const item = await prisma.dealActivity.create({
    data: {
      dealId: params.id,
      activityType,
      content,
      createdBy: 'ADMIN',
      metadata: typeof body.metadata === 'object' ? body.metadata : null,
    },
  });

  return NextResponse.json({ ok: true, item }, { status: 201 });
}
