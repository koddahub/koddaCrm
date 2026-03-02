import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { renderDemoAccessEmailHtml, renderDemoAccessEmailPlainText } from '@/lib/demo-access-email';
import { prisma } from '@/lib/prisma';

function parseDemoUrl(raw: unknown) {
  const value = String(raw || '').trim();
  const fallback = 'https://ecommerce.koddahub.com.br/index.php';
  const candidate = value || fallback;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseEmail(raw: unknown) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  const valid = /^[^\s@]+@[^\s@]+$/.test(value);
  return valid ? value : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || '[KoddaHub] Acesso à demo da loja').trim() || '[KoddaHub] Acesso à demo da loja';
  const demoUrl = parseDemoUrl(body.demoUrl);
  const accessEmailFromBody = parseEmail(body.accessEmail);
  const additionalMessage = String(body.additionalMessage || '').trim();

  if (!demoUrl) {
    return NextResponse.json({ error: 'Link da demo inválido. Use URL completa com http/https.' }, { status: 422 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      organization: {
        select: {
          id: true,
          legalName: true,
          billingEmail: true,
        },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }

  const registeredEmail = parseEmail(deal.contactEmail || deal.organization?.billingEmail);
  if (!registeredEmail) {
    return NextResponse.json({ error: 'Cliente sem e-mail cadastrado para envio.' }, { status: 422 });
  }

  const accessEmail = accessEmailFromBody || registeredEmail;
  const clientName = String(deal.contactName || deal.title || 'Cliente');

  const htmlBody = renderDemoAccessEmailHtml({
    clientName,
    accessEmail,
    demoUrl,
    additionalMessage,
  });
  const plainBody = renderDemoAccessEmailPlainText({
    clientName,
    accessEmail,
    demoUrl,
    additionalMessage,
  });
  const packedBody = `KH_MIME_V1:${JSON.stringify({ html: htmlBody, text: plainBody })}`;

  await prisma.$transaction(async (tx) => {
    const queued = await tx.emailQueue.create({
      data: {
        organizationId: deal.organizationId || null,
        emailTo: registeredEmail,
        subject,
        body: packedBody,
        attachments: [],
        status: 'PENDING',
      },
    });

    await tx.dealActivity.create({
      data: {
        dealId: deal.id,
        activityType: 'DEMO_ACCESS_EMAIL_SENT',
        content: `E-mail com acesso da demo enviado para ${registeredEmail}.`,
        metadata: {
          emailQueueId: queued.id,
          demoUrl,
          accessEmail,
          subject,
        },
        createdBy: 'ADMIN',
      },
    });
  });

  return NextResponse.json({ ok: true });
}
