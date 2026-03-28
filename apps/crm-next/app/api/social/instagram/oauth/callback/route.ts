import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  createInstagramLog,
  getMetaInstagramConfig,
  graphApiRequest,
  MetaGraphRequestError,
  parseExpiresAt,
} from '@/lib/social-instagram';

const OAUTH_STATE_COOKIE = 'crm_instagram_oauth_state';
const OAUTH_RETURN_COOKIE = 'crm_instagram_oauth_return';
const DEFAULT_RETURN_PATH = '/social/contas';

type TokenExchangeResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type MetaPagesResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    instagram_business_account?: {
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    };
  }>;
};

function normalizeReturnPath(raw: string | null | undefined) {
  const value = String(raw || '').trim();
  if (!value.startsWith('/')) return DEFAULT_RETURN_PATH;
  if (value.startsWith('//') || value.startsWith('/api/')) return DEFAULT_RETURN_PATH;
  return value;
}

function finishRedirect(req: NextRequest, returnPath: string, params: URLSearchParams) {
  const redirectUrl = new URL(returnPath, req.url);
  redirectUrl.search = params.toString();
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(OAUTH_STATE_COOKIE, '', {
    path: '/',
    maxAge: 0,
  });

  response.cookies.set(OAUTH_RETURN_COOKIE, '', {
    path: '/',
    maxAge: 0,
  });

  return response;
}

function parseGrantedScopes(raw: string | null) {
  if (!raw) return null;
  const scopes = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (scopes.length === 0) return null;
  return scopes.join(',');
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const returnPath = normalizeReturnPath(req.cookies.get(OAUTH_RETURN_COOKIE)?.value);
  const stateCookie = String(req.cookies.get(OAUTH_STATE_COOKIE)?.value || '').trim();
  const stateParam = String(req.nextUrl.searchParams.get('state') || '').trim();
  const code = String(req.nextUrl.searchParams.get('code') || '').trim();
  const grantedScopes = parseGrantedScopes(req.nextUrl.searchParams.get('granted_scopes'));

  if (!code || !stateCookie || stateParam !== stateCookie) {
    await createInstagramLog({
      action: 'OAUTH_CALLBACK_VALIDATION',
      success: false,
      errorMessage: 'Parâmetros inválidos de OAuth (state/code).',
      requestPayload: {
        hasCode: Boolean(code),
        hasStateCookie: Boolean(stateCookie),
        hasStateParam: Boolean(stateParam),
      },
    });

    return finishRedirect(
      req,
      returnPath,
      new URLSearchParams({ social_error: 'Falha na validação da conexão OAuth. Tente novamente.' }),
    );
  }

  try {
    const config = getMetaInstagramConfig();

    const shortTokenResponse = await graphApiRequest<TokenExchangeResponse>({
      action: 'OAUTH_EXCHANGE_CODE',
      endpoint: 'oauth/access_token',
      method: 'GET',
      query: {
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: config.redirectUri,
        code,
      },
    });

    const shortLivedToken = String(shortTokenResponse.data.access_token || '').trim();
    if (!shortLivedToken) {
      throw new Error('Token temporário não retornado pela Meta.');
    }

    const longTokenResponse = await graphApiRequest<TokenExchangeResponse>({
      action: 'OAUTH_EXCHANGE_LONG_LIVED',
      endpoint: 'oauth/access_token',
      method: 'GET',
      query: {
        grant_type: 'fb_exchange_token',
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });

    const longLivedToken = String(longTokenResponse.data.access_token || shortLivedToken).trim();
    if (!longLivedToken) {
      throw new Error('Token de longa duração não retornado pela Meta.');
    }

    const pagesResponse = await graphApiRequest<MetaPagesResponse>({
      action: 'OAUTH_FETCH_PAGES',
      endpoint: 'me/accounts',
      method: 'GET',
      query: {
        fields: 'id,name,instagram_business_account{id,username,name,profile_picture_url}',
        access_token: longLivedToken,
      },
    });

    const pages = Array.isArray(pagesResponse.data.data) ? pagesResponse.data.data : [];
    const selectedPage = pages.find((page) => page.instagram_business_account?.id);

    if (!selectedPage?.instagram_business_account?.id) {
      throw new Error('Nenhuma conta profissional do Instagram vinculada às páginas autorizadas.');
    }

    const instagram = selectedPage.instagram_business_account;
    const pageId = String(selectedPage.id || '').trim();
    const instagramId = String(instagram.id || '').trim();

    if (!pageId || !instagramId) {
      throw new Error('Resposta da Meta não trouxe IDs obrigatórios da página/Instagram.');
    }

    const accountPayload = {
      pageId,
      pageName: selectedPage.name || null,
      instagramId,
      instagramUsername: instagram.username || `instagram_${instagramId}`,
      instagramName: instagram.name || null,
      profilePictureUrl: instagram.profile_picture_url || null,
      accessToken: longLivedToken,
      tokenExpiresAt: parseExpiresAt(longTokenResponse.data.expires_in),
      scopes: grantedScopes,
      status: 'ACTIVE',
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    } as const;

    const existingAccount = await prisma.socialInstagramAccount.findFirst({
      where: {
        OR: [
          { instagramId },
          { pageId },
        ],
      },
      select: { id: true },
    });

    const account = existingAccount
      ? await prisma.socialInstagramAccount.update({
          where: { id: existingAccount.id },
          data: accountPayload,
        })
      : await prisma.socialInstagramAccount.create({
          data: accountPayload,
        });

    await createInstagramLog({
      action: 'ACCOUNT_CONNECTED',
      accountId: account.id,
      success: true,
      requestPayload: {
        pageId,
        instagramId,
      },
      responsePayload: {
        accountId: account.id,
        instagramUsername: account.instagramUsername,
      },
    });

    return finishRedirect(
      req,
      returnPath,
      new URLSearchParams({ social_notice: 'Conta do Instagram conectada com sucesso.' }),
    );
  } catch (error) {
    const message =
      error instanceof MetaGraphRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Falha ao conectar conta do Instagram.';

    await createInstagramLog({
      action: 'OAUTH_CALLBACK_FAILURE',
      success: false,
      errorMessage: message,
      requestPayload: {
        callbackPath: req.nextUrl.pathname,
      },
      responsePayload: error instanceof MetaGraphRequestError ? error.response : null,
    });

    return finishRedirect(
      req,
      returnPath,
      new URLSearchParams({ social_error: message }),
    );
  }
}
