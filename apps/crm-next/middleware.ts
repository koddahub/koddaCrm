import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'crm_admin_session';

function adminToken() {
  return process.env.CRM_ADMIN_SESSION_TOKEN || 'koddahub-crm-v2-session';
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPreviewLanding = /^\/[^/]+\/previewv1(?:\/|$)/.test(pathname);
  const isPreviewProxy = pathname.startsWith('/preview-proxy/');

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    isPreviewLanding ||
    isPreviewProxy
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token !== adminToken()) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
