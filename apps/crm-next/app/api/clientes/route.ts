import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const items = await prisma.deal.findMany({
    where: {
      lifecycleStatus: 'CLIENT',
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      title: true,
      contactName: true,
      contactEmail: true,
      dealType: true,
      planCode: true,
      productCode: true,
      valueCents: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ items });
}
