import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'crm_admin_session';

function adminToken() {
  return process.env.CRM_ADMIN_SESSION_TOKEN || 'koddahub-crm-v2-session';
}

export function ensureApiAuth(req: NextRequest): NextResponse | null {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token !== adminToken()) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }
  return null;
}
