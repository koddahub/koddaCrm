import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { decimalToCents } from '@/lib/money';
import { prisma } from '@/lib/prisma';

const PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'PAID', 'RECEIVED_IN_CASH', 'SETTLED']);

function agingBucket(daysLate: number) {
  if (daysLate <= 15) return '1-15';
  if (daysLate <= 30) return '16-30';
  return '31+';
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const now = new Date();
  const items = await prisma.payment.findMany({
    where: {
      dueDate: { lt: now },
    },
    orderBy: [{ dueDate: 'asc' }],
    take: 400,
    include: {
      subscription: {
        include: {
          organization: {
            select: {
              legalName: true,
              billingEmail: true,
            },
          },
        },
      },
    },
  });

  const filtered = items.filter((item) => !PAID_STATUSES.has(item.status.toUpperCase()));

  return NextResponse.json({
    items: filtered.map((item) => {
      const due = item.dueDate ? new Date(item.dueDate) : null;
      const daysLate = due ? Math.max(0, Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000))) : 0;
      return {
        id: item.id,
        organization: item.subscription.organization.legalName,
        email: item.subscription.organization.billingEmail,
        amountCents: decimalToCents(item.amount),
        dueDate: item.dueDate,
        daysLate,
        bucket: agingBucket(daysLate),
        status: item.status,
      };
    }),
  });
}
