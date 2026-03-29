import { NextRequest, NextResponse } from 'next/server';
import { dispatchRelayEmail } from '@/lib/email-relay';
import { ensureServerToServerAuth } from '@/lib/server-to-server-auth';

// Regra central da integração:
// o CRM é sempre o responsável pelo envio real do e-mail.
// O consumidor (Praja) apenas delega o dispatch com contexto já calculado.
function toMetadata(value: unknown, slug: string): Record<string, unknown> {
  const base =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  const origin = typeof base.origin === 'string' && base.origin.trim() ? base.origin.trim() : 'praja_backend_transactional_email';
  const templateSlug =
    typeof base.template_slug === 'string' && base.template_slug.trim() ? base.template_slug.trim() : slug;
  const flow = typeof base.flow === 'string' && base.flow.trim() ? base.flow.trim() : 'transactional_email_relay';

  return {
    ...base,
    origin,
    template_slug: templateSlug,
    flow,
  };
}

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
      Allow: 'POST,OPTIONS',
    },
  });
}

export async function POST(req: NextRequest) {
  const denied = ensureServerToServerAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: 'Body JSON inválido',
      },
      {
        status: 400,
        headers: jsonHeaders(),
      },
    );
  }

  const payload = body as Record<string, unknown>;
  const slug = String(payload.slug || '').trim();

  try {
    const dispatched = await dispatchRelayEmail({
      product: String(payload.product || ''),
      site: payload.site ? String(payload.site) : undefined,
      slug,
      to: String(payload.to || ''),
      subject: String(payload.subject || ''),
      html: payload.html ? String(payload.html) : undefined,
      text: payload.text ? String(payload.text) : undefined,
      trackToInbox: Boolean(payload.trackToInbox),
      metadata: toMetadata(payload.metadata, slug),
    });

    if (!dispatched.ok) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: dispatched.message,
        },
        {
          status: dispatched.statusCode,
          headers: jsonHeaders(),
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        success: true,
        message: dispatched.message,
      },
      {
        status: 201,
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : 'Falha ao despachar e-mail',
      },
      {
        status: 500,
        headers: jsonHeaders(),
      },
    );
  }
}
