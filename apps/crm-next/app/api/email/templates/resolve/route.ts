import { NextRequest, NextResponse } from 'next/server';
import { resolveRelayTemplate } from '@/lib/email-relay';
import { ensureServerToServerAuth } from '@/lib/server-to-server-auth';

function jsonHeaders() {
  return {
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  } as const;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...jsonHeaders(),
      Allow: 'GET,OPTIONS',
    },
  });
}

export async function GET(req: NextRequest) {
  const denied = ensureServerToServerAuth(req);
  if (denied) return denied;

  const query = req.nextUrl.searchParams;
  const slug = String(query.get('slug') || '').trim();
  const product = String(query.get('product') || '').trim();
  const site = String(query.get('site') || '').trim();

  try {
    const resolved = await resolveRelayTemplate({
      slug,
      product: product || undefined,
      site: site || undefined,
    });

    if (!resolved.ok) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: resolved.message,
        },
        {
          status: resolved.statusCode,
          headers: jsonHeaders(),
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        template: resolved.template,
      },
      { headers: jsonHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : 'Falha ao resolver template',
      },
      {
        status: 500,
        headers: jsonHeaders(),
      },
    );
  }
}
