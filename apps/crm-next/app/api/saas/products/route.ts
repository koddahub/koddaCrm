import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { listSaasProducts, upsertSaasProduct } from '@/lib/saas';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    const items = await listSaasProducts();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao carregar produtos SaaS', details: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  try {
    const id = await upsertSaasProduct({
      id: body.id ? String(body.id) : undefined,
      name: String(body.name || ''),
      slug: body.slug ? String(body.slug) : undefined,
      category: body.category ? String(body.category) : undefined,
      status: body.status ? String(body.status) : undefined,
      description: body.description ? String(body.description) : undefined,
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 422 });
  }
}
