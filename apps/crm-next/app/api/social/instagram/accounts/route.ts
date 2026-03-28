import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { hasMetaInstagramConfig } from '@/lib/social-instagram';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const items = await prisma.socialInstagramAccount.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      pageId: true,
      pageName: true,
      instagramId: true,
      instagramUsername: true,
      instagramName: true,
      profilePictureUrl: true,
      tokenExpiresAt: true,
      scopes: true,
      status: true,
      lastSyncedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    items,
    metaConfigured: hasMetaInstagramConfig(),
    connectUrl: '/api/social/instagram/oauth/start?returnTo=/social/contas',
  });
}
