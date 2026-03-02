import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function toCents(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().replace(/\s+/g, '');
  if (!raw) return null;

  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const offerAmountCents = body.offerAmountCents !== undefined
    ? toCents(body.offerAmountCents)
    : undefined;
  const finalOfferAmountCents = body.finalOfferAmountCents !== undefined
    ? toCents(body.finalOfferAmountCents)
    : undefined;
  const estimatedDurationText = body.estimatedDurationText !== undefined
    ? String(body.estimatedDurationText || '').trim().slice(0, 120) || null
    : undefined;
  const detailsText = body.detailsText !== undefined
    ? String(body.detailsText || '').trim()
    : undefined;
  const reviewNotes = body.reviewNotes !== undefined
    ? String(body.reviewNotes || '').trim() || null
    : undefined;

  try {
    const exists = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM crm.freelas_proposal_ticket
      WHERE id = ${params.id}::uuid
      LIMIT 1
    `;

    if (exists.length === 0) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    await prisma.$executeRaw`
      UPDATE crm.freelas_proposal_ticket
      SET
        offer_amount_cents = COALESCE(${offerAmountCents}, offer_amount_cents),
        final_offer_amount_cents = COALESCE(${finalOfferAmountCents}, final_offer_amount_cents),
        estimated_duration_text = COALESCE(${estimatedDurationText}, estimated_duration_text),
        details_text = COALESCE(${detailsText}, details_text),
        review_notes = COALESCE(${reviewNotes}, review_notes),
        status = CASE
          WHEN status = 'NEW' THEN 'UNDER_REVIEW'
          ELSE status
        END,
        updated_at = now()
      WHERE id = ${params.id}::uuid
    `;

    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        id::text AS id,
        deal_id::text AS deal_id,
        status,
        project_link,
        project_title,
        proposal_text,
        offer_amount_cents,
        final_offer_amount_cents,
        estimated_duration_text,
        details_text,
        review_notes,
        approved_by,
        approved_at,
        created_at,
        updated_at
      FROM crm.freelas_proposal_ticket
      WHERE id = ${params.id}::uuid
      LIMIT 1
    `;

    return NextResponse.json({ ok: true, ticket: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao atualizar ticket', details: String(error) }, { status: 500 });
  }
}
