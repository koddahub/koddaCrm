import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { decimalToCents } from '@/lib/money';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const items = await prisma.payment.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 400,
    include: {
      subscription: {
        include: {
          organization: {
            select: {
              legalName: true,
            },
          },
          plan: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      organization: item.subscription.organization.legalName,
      plan: item.subscription.plan.name,
      amountCents: decimalToCents(item.amount),
      status: item.status,
      dueDate: item.dueDate,
      paidAt: item.paidAt,
      billingType: item.billingType,
    })),
  });
}
