import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function dispatchMode() {
  return String(process.env.FREELAS_DISPATCH_MODE || 'DRY_RUN').trim().toUpperCase();
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const reviewNotes = String(body.reviewNotes || '').trim() || null;

  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      deal_id: string;
      status: string;
      project_link: string;
      project_title: string;
      offer_amount_cents: number | null;
      final_offer_amount_cents: number | null;
      estimated_duration_text: string | null;
      details_text: string;
    }>>`
      SELECT
        id::text,
        deal_id::text,
        status,
        project_link,
        project_title,
        offer_amount_cents,
        final_offer_amount_cents,
        estimated_duration_text,
        details_text
      FROM crm.freelas_proposal_ticket
      WHERE id = ${params.id}::uuid
      LIMIT 1
    `;

    const ticket = rows[0];
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    const missing: string[] = [];
    if (!Number.isFinite(ticket.offer_amount_cents ?? NaN)) missing.push('offerAmountCents');
    if (!Number.isFinite(ticket.final_offer_amount_cents ?? NaN)) missing.push('finalOfferAmountCents');
    if (!String(ticket.estimated_duration_text || '').trim()) missing.push('estimatedDurationText');
    if (!String(ticket.details_text || '').trim()) missing.push('detailsText');

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'Campos obrigatórios ausentes para aprovar',
          missing,
        },
        { status: 422 },
      );
    }

    const mode = dispatchMode();
    if (mode !== 'DRY_RUN') {
      return NextResponse.json(
        { error: 'Envio real bloqueado neste ambiente. Ajuste FREELAS_DISPATCH_MODE=DRY_RUN.' },
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const dispatchRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        INSERT INTO crm.freelas_proposal_dispatch (
          ticket_id,
          mode,
          status,
          request_payload,
          response_payload,
          error_text,
          created_at,
          updated_at
        )
        VALUES (
          ${ticket.id}::uuid,
          'DRY_RUN',
          'SIMULATED',
          ${JSON.stringify({
            projectLink: ticket.project_link,
            projectTitle: ticket.project_title,
            offerAmountCents: ticket.offer_amount_cents,
            finalOfferAmountCents: ticket.final_offer_amount_cents,
            estimatedDurationText: ticket.estimated_duration_text,
            detailsText: ticket.details_text,
            requestedBy: 'ADMIN',
          })}::jsonb,
          ${JSON.stringify({ simulated: true, at: new Date().toISOString() })}::jsonb,
          NULL,
          now(),
          now()
        )
        RETURNING id::text, status
      `;

      await tx.$executeRaw`
        UPDATE crm.freelas_proposal_ticket
        SET
          status = 'DISPATCH_SIMULATED',
          review_notes = COALESCE(${reviewNotes}, review_notes),
          approved_by = 'ADMIN',
          approved_at = now(),
          updated_at = now()
        WHERE id = ${ticket.id}::uuid
      `;

      await tx.dealActivity.create({
        data: {
          dealId: ticket.deal_id,
          activityType: 'FREELAS_DISPATCH_SIMULATED',
          content: `Proposta Freelas aprovada e simulada (ticket ${ticket.id}).`,
          metadata: {
            ticketId: ticket.id,
            dispatchId: dispatchRows[0].id,
            mode: 'DRY_RUN',
            status: 'SIMULATED',
          },
          createdBy: 'ADMIN',
        },
      });

      return dispatchRows[0];
    });

    return NextResponse.json({ ok: true, dispatch: result, mode: 'DRY_RUN' });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao aprovar ticket', details: String(error) }, { status: 500 });
  }
}
