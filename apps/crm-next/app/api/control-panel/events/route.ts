import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { listSaasEventBindings, upsertSaasEventBinding } from '@/lib/saas';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    const items = await listSaasEventBindings();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao carregar eventos', details: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  try {
    const id = await upsertSaasEventBinding({
      id: body.id ? String(body.id) : undefined,
      productId: body.productId ? String(body.productId) : undefined,
      productSlug: body.productSlug ? String(body.productSlug) : undefined,
      siteId: body.siteId ? String(body.siteId) : undefined,
      siteDomain: body.siteDomain ? String(body.siteDomain) : undefined,
      eventKey: String(body.eventKey || ''),
      templateId: body.templateId ? String(body.templateId) : undefined,
      templateKey: body.templateKey ? String(body.templateKey) : undefined,
      enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 422 });
  }
}
