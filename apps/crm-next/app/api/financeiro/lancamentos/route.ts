import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { toCentsFromInput } from '@/lib/money';
import { prisma } from '@/lib/prisma';

const ENTRY_TYPES = new Set(['RECEITA', 'DESPESA', 'AJUSTE']);

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const entryType = String(body.entryType || '').toUpperCase();
  const amountCents = toCentsFromInput(body.amount);
  const entryDate = body.entryDate ? new Date(String(body.entryDate)) : null;

  if (!ENTRY_TYPES.has(entryType)) {
    return NextResponse.json({ error: 'entryType inválido' }, { status: 422 });
  }
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 422 });
  }
  if (!entryDate || Number.isNaN(entryDate.getTime())) {
    return NextResponse.json({ error: 'Data inválida' }, { status: 422 });
  }

  const item = await prisma.financialEntry.create({
    data: {
      dealId: body.dealId ? String(body.dealId) : null,
      organizationId: body.organizationId ? String(body.organizationId) : null,
      entryType,
      category: body.category ? String(body.category) : null,
      amountCents,
      entryDate,
      description: body.description ? String(body.description) : null,
      createdBy: 'ADMIN',
      metadata: typeof body.metadata === 'object' ? body.metadata : null,
    },
  });

  return NextResponse.json({ ok: true, item }, { status: 201 });
}
