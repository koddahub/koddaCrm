import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { createInstagramLog, graphApiRequest, MetaGraphRequestError } from '@/lib/social-instagram';

type CreatePostBody = {
  accountId?: string;
  caption?: string;
  mediaUrl?: string;
};

type CreateMediaResponse = {
  id?: string;
};

type PublishMediaResponse = {
  id?: string;
};

function parseLimit(raw: string | null, fallback = 40) {
  const parsed = Number(raw || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.round(parsed)));
}

function isValidMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
  const accountId = String(req.nextUrl.searchParams.get('accountId') || '').trim();

  const items = await prisma.socialInstagramPost.findMany({
    where: accountId ? { accountId } : undefined,
    include: {
      account: {
        select: {
          id: true,
          instagramUsername: true,
          pageName: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as CreatePostBody;
  const caption = String(body.caption || '').trim();
  const mediaUrl = String(body.mediaUrl || '').trim();
  const requestedAccountId = String(body.accountId || '').trim();

  if (!mediaUrl || !isValidMediaUrl(mediaUrl)) {
    return NextResponse.json({ error: 'mediaUrl inválida. Informe uma URL HTTP/HTTPS pública.' }, { status: 422 });
  }

  const account = requestedAccountId
    ? await prisma.socialInstagramAccount.findUnique({ where: { id: requestedAccountId } })
    : await prisma.socialInstagramAccount.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: [{ updatedAt: 'desc' }],
      });

  if (!account) {
    return NextResponse.json({ error: 'Nenhuma conta Instagram conectada para publicação.' }, { status: 404 });
  }

  const post = await prisma.socialInstagramPost.create({
    data: {
      accountId: account.id,
      caption,
      mediaUrl,
      status: 'PENDING',
    },
  });

  try {
    const createMedia = await graphApiRequest<CreateMediaResponse>({
      action: 'POST_CREATE_MEDIA_CONTAINER',
      endpoint: `${account.instagramId}/media`,
      method: 'POST',
      accountId: account.id,
      postId: post.id,
      body: {
        image_url: mediaUrl,
        caption,
        access_token: account.accessToken,
      },
    });

    const creationId = String(createMedia.data.id || '').trim();
    if (!creationId) {
      throw new Error('Meta não retornou creation_id para o post.');
    }

    const publishMedia = await graphApiRequest<PublishMediaResponse>({
      action: 'POST_PUBLISH_MEDIA',
      endpoint: `${account.instagramId}/media_publish`,
      method: 'POST',
      accountId: account.id,
      postId: post.id,
      body: {
        creation_id: creationId,
        access_token: account.accessToken,
      },
    });

    const mediaId = String(publishMedia.data.id || '').trim() || null;

    const updated = await prisma.socialInstagramPost.update({
      where: { id: post.id },
      data: {
        igCreationId: creationId,
        igMediaId: mediaId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      },
      include: {
        account: {
          select: {
            id: true,
            instagramUsername: true,
            pageName: true,
          },
        },
      },
    });

    await createInstagramLog({
      action: 'POST_PUBLISHED',
      accountId: account.id,
      postId: post.id,
      success: true,
      requestPayload: {
        mediaUrl,
        captionLength: caption.length,
      },
      responsePayload: {
        igCreationId: creationId,
        igMediaId: mediaId,
      },
    });

    return NextResponse.json({ item: updated }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof MetaGraphRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Falha na publicação do Instagram.';

    const failed = await prisma.socialInstagramPost.update({
      where: { id: post.id },
      data: {
        status: 'FAILED',
        errorMessage: message,
        updatedAt: new Date(),
      },
      include: {
        account: {
          select: {
            id: true,
            instagramUsername: true,
            pageName: true,
          },
        },
      },
    });

    await createInstagramLog({
      action: 'POST_PUBLISH_FAILURE',
      accountId: account.id,
      postId: post.id,
      success: false,
      errorMessage: message,
      requestPayload: {
        mediaUrl,
      },
      responsePayload: error instanceof MetaGraphRequestError ? error.response : null,
    });

    return NextResponse.json(
      {
        error: 'Falha ao publicar imagem no Instagram.',
        details: message,
        item: failed,
      },
      { status: 502 },
    );
  }
}
