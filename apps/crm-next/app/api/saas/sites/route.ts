import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { listSaasSites, upsertSaasSite } from '@/lib/saas';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    const items = await listSaasSites();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao carregar sites SaaS', details: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  try {
    const id = await upsertSaasSite({
      id: body.id ? String(body.id) : undefined,
      productId: body.productId ? String(body.productId) : undefined,
      productSlug: body.productSlug ? String(body.productSlug) : undefined,
      name: String(body.name || ''),
      domain: String(body.domain || ''),
      appType: body.appType ? String(body.appType) : undefined,
      brandName: body.brandName ? String(body.brandName) : undefined,
      supportEmail: body.supportEmail ? String(body.supportEmail) : undefined,
      isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
      env: body.env ? String(body.env) : undefined,
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 422 });
  }
}
