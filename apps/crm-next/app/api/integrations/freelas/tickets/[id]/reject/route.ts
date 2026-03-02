import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const reviewNotes = String(body.reviewNotes || '').trim() || null;

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; deal_id: string }>>`
      SELECT id::text, deal_id::text
      FROM crm.freelas_proposal_ticket
      WHERE id = ${params.id}::uuid
      LIMIT 1
    `;

    const ticket = rows[0];
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE crm.freelas_proposal_ticket
        SET
          status = 'REJECTED',
          review_notes = ${reviewNotes},
          approved_by = NULL,
          approved_at = NULL,
          updated_at = now()
        WHERE id = ${params.id}::uuid
      `;

      await tx.dealActivity.create({
        data: {
          dealId: ticket.deal_id,
          activityType: 'FREELAS_TICKET_REJECTED',
          content: `Ticket Freelas rejeitado (ticket ${ticket.id}).`,
          metadata: {
            ticketId: ticket.id,
            reviewNotes,
          },
          createdBy: 'ADMIN',
        },
      });
    });

    return NextResponse.json({ ok: true, status: 'REJECTED' });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao rejeitar ticket', details: String(error) }, { status: 500 });
  }
}
