import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function normalizeStatus(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'INACTIVE') return normalized;
  return '';
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const status = normalizeStatus(body.status);
  if (!status) {
    return NextResponse.json({ error: 'Status inválido. Use ACTIVE ou INACTIVE.' }, { status: 422 });
  }

  try {
    const item = await prisma.socialInstagramAccount.update({
      where: { id: params.id },
      data: {
        status,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        instagramUsername: true,
        status: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Conta social não encontrada' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Falha ao atualizar conta social' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    await prisma.socialInstagramAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Conta social não encontrada' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Falha ao remover conta social' }, { status: 500 });
  }
}
