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
    pathname === '/' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/para-voce') ||
    pathname.startsWith('/seguranca') ||
    pathname.startsWith('/ajuda') ||
    pathname.startsWith('/faq') ||
    pathname.startsWith('/contato') ||
    pathname.startsWith('/status') ||
    pathname.startsWith('/politica-privacidade') ||
    pathname.startsWith('/politica-cookies') ||
    pathname.startsWith('/lgpd') ||
    pathname.startsWith('/termo-uso') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
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
