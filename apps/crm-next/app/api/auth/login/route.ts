import { NextRequest, NextResponse } from 'next/server';
import { isValidAdminCredential, setAuthCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (!isValidAdminCredential(email, password)) {
    return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 });
  }

  setAuthCookie();
  return NextResponse.json({ ok: true });
}
