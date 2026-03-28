import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { listSaasEmailAccounts, upsertSaasEmailAccount } from '@/lib/saas';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    const items = await listSaasEmailAccounts();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao carregar contas de e-mail', details: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  try {
    const id = await upsertSaasEmailAccount({
      id: body.id ? String(body.id) : undefined,
      productId: body.productId ? String(body.productId) : undefined,
      productSlug: body.productSlug ? String(body.productSlug) : undefined,
      siteId: body.siteId ? String(body.siteId) : undefined,
      siteDomain: body.siteDomain ? String(body.siteDomain) : undefined,
      emailLabel: String(body.emailLabel || ''),
      fromName: String(body.fromName || ''),
      fromEmail: String(body.fromEmail || ''),
      replyTo: body.replyTo ? String(body.replyTo) : undefined,
      provider: body.provider ? String(body.provider) : undefined,
      isDefault: body.isDefault === undefined ? undefined : Boolean(body.isDefault),
      isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 422 });
  }
}
