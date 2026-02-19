import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

export const AUTH_COOKIE = 'crm_admin_session';

function adminSessionToken() {
  return process.env.CRM_ADMIN_SESSION_TOKEN || 'koddahub-crm-v2-session';
}

export function isValidAdminCredential(email: string, password: string) {
  const adminEmail = process.env.CRM_ADMIN_EMAIL || 'admin@koddahub.local';
  const adminPassword = process.env.CRM_ADMIN_PASSWORD || 'admin123';
  return email.trim().toLowerCase() === adminEmail.toLowerCase() && password === adminPassword;
}

export function setAuthCookie() {
  cookies().set(AUTH_COOKIE, adminSessionToken(), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 60 * 12,
  });
}

export function clearAuthCookie() {
  cookies().set(AUTH_COOKIE, '', {
    path: '/',
    maxAge: 0,
  });
}

export function isAuthenticatedRequest(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  return token === adminSessionToken();
}

export function isAuthenticatedPage() {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return token === adminSessionToken();
}
