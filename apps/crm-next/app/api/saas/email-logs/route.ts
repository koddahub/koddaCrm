import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { listTransactionalEmailLogs } from '@/lib/transactional-email';

function parseLimit(value: string | null, fallback = 120) {
  const numeric = Number(value || fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(300, Math.round(numeric)));
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
    const items = await listTransactionalEmailLogs(limit);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Falha ao carregar logs de e-mail',
        details: String(error),
      },
      { status: 500 },
    );
  }
}
