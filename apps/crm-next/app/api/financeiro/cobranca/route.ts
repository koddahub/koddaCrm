import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const actionType = String(body.actionType || '').trim();
  if (!actionType) {
    return NextResponse.json({ error: 'actionType é obrigatório' }, { status: 422 });
  }

  const nextActionAt = body.nextActionAt ? new Date(String(body.nextActionAt)) : null;
  if (body.nextActionAt && (!nextActionAt || Number.isNaN(nextActionAt.getTime()))) {
    return NextResponse.json({ error: 'nextActionAt inválido' }, { status: 422 });
  }

  const item = await prisma.collectionAction.create({
    data: {
      dealId: body.dealId ? String(body.dealId) : null,
      organizationId: body.organizationId ? String(body.organizationId) : null,
      actionType,
      channel: body.channel ? String(body.channel) : null,
      outcome: body.outcome ? String(body.outcome) : null,
      notes: body.notes ? String(body.notes) : null,
      nextActionAt,
      createdBy: 'ADMIN',
    },
  });

  return NextResponse.json({ ok: true, item }, { status: 201 });
}
