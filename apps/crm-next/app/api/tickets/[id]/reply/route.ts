import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function featureEnabled(name: string, fallback = false): boolean {
  const value = (process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  if (!featureEnabled('FEATURE_TICKET_THREAD_SYNC', false)) {
    return NextResponse.json({ error: 'Funcionalidade desabilitada' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || '').trim();
  const authorName = String(body?.authorName || 'Equipe CRM').trim();
  const visibility = String(body?.visibility || 'BOTH').trim().toUpperCase();

  if (!message) {
    return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 422 });
  }
  if (!['BOTH', 'INTERNAL', 'CLIENT'].includes(visibility)) {
    return NextResponse.json({ error: 'Visibilidade inválida' }, { status: 422 });
  }

  const ticket = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text
    FROM client.tickets
    WHERE id = ${params.id}::uuid
    LIMIT 1
  `;
  if (!ticket.length) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
  }

  const created = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
    INSERT INTO client.ticket_messages(ticket_id, source, author_name, message, visibility)
    VALUES(${params.id}::uuid, 'CRM', ${authorName}, ${message}, ${visibility})
    RETURNING id::text, created_at
  `;

  await prisma.$executeRaw`
    UPDATE client.tickets
    SET updated_at = now()
    WHERE id = ${params.id}::uuid
  `;

  return NextResponse.json({
    ok: true,
    messageId: created[0]?.id || null,
    createdAt: created[0]?.created_at || null,
  });
}
