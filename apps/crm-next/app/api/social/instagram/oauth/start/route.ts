import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { buildInstagramOAuthUrl, hasMetaInstagramConfig } from '@/lib/social-instagram';

const OAUTH_STATE_COOKIE = 'crm_instagram_oauth_state';
const OAUTH_RETURN_COOKIE = 'crm_instagram_oauth_return';
const DEFAULT_RETURN_PATH = '/social/contas';

function normalizeReturnPath(raw: string | null) {
  const value = String(raw || '').trim();
  if (!value.startsWith('/')) return DEFAULT_RETURN_PATH;
  if (value.startsWith('//') || value.startsWith('/api/')) return DEFAULT_RETURN_PATH;
  return value;
}

function redirectBack(req: NextRequest, params: URLSearchParams, returnPath: string) {
  const redirectUrl = new URL(returnPath, req.url);
  redirectUrl.search = params.toString();
  return NextResponse.redirect(redirectUrl);
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const returnPath = normalizeReturnPath(req.nextUrl.searchParams.get('returnTo'));

  if (!hasMetaInstagramConfig()) {
    return redirectBack(
      req,
      new URLSearchParams({ social_error: 'Integração Meta não configurada no servidor.' }),
      returnPath,
    );
  }

  const state = randomUUID();
  const oauthUrl = buildInstagramOAuthUrl(state);
  const response = NextResponse.redirect(oauthUrl);

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 10,
  });

  response.cookies.set(OAUTH_RETURN_COOKIE, returnPath, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 10,
  });

  return response;
}
