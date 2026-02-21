import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { listTemplateModels, upsertTemplateModel } from '@/lib/site24h-operation';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    const items = await listTemplateModels();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao carregar catálogo de modelos', details: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  try {
    const id = await upsertTemplateModel({
      code: String(body.code || ''),
      name: String(body.name || ''),
      rootPath: String(body.rootPath || ''),
      entryFile: String(body.entryFile || 'index.html'),
      isDefault: Boolean(body.isDefault),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 422 });
  }
}
