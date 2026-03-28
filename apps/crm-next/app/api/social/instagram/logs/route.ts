import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function parseLimit(raw: string | null, fallback = 80) {
  const parsed = Number(raw || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(300, Math.round(parsed)));
}

function parseSuccess(raw: string | null): boolean | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
  const accountId = String(req.nextUrl.searchParams.get('accountId') || '').trim();
  const successFilter = parseSuccess(req.nextUrl.searchParams.get('success'));

  const items = await prisma.socialInstagramLog.findMany({
    where: {
      ...(accountId ? { accountId } : {}),
      ...(successFilter === undefined ? {} : { success: successFilter }),
    },
    include: {
      account: {
        select: {
          id: true,
          instagramUsername: true,
          pageName: true,
        },
      },
      post: {
        select: {
          id: true,
          status: true,
          mediaUrl: true,
          igMediaId: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });

  return NextResponse.json({ items });
}
