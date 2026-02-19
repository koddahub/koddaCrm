import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const items = await prisma.dealAgenda.findMany({
    where: { dealId: params.id },
    orderBy: { dueAt: 'asc' },
    take: 300,
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const description = body.description ? String(body.description).trim() : null;
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null;

  if (!title || !dueAt || Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: 'Título e data/hora válida são obrigatórios' }, { status: 422 });
  }

  const exists = await prisma.deal.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }

  const item = await prisma.dealAgenda.create({
    data: {
      dealId: params.id,
      title,
      description,
      dueAt,
      createdBy: 'ADMIN',
    },
  });

  return NextResponse.json({ ok: true, item }, { status: 201 });
}
