import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealSuppressionTable, purgeOrganizationData } from '@/lib/deal-purge';
import { ensureDealOperation } from '@/lib/deals';
import { toCentsFromInput } from '@/lib/money';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      pipeline: { select: { id: true, code: true, name: true } },
      stage: { select: { id: true, code: true, name: true, stageOrder: true } },
      organization: {
        select: {
          id: true,
          legalName: true,
          billingEmail: true,
          whatsapp: true,
          domain: true,
          cpfCnpj: true,
        },
      },
      operations: {
        orderBy: [{ stageOrder: 'asc' }, { startedAt: 'asc' }],
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 200,
      },
      agenda: {
        orderBy: { dueAt: 'asc' },
        take: 200,
      },
      documents: {
        orderBy: { createdAt: 'desc' },
      },
      proposals: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }

  const stageOptions = await prisma.pipelineStage.findMany({
    where: { pipelineId: deal.pipelineId },
    orderBy: { stageOrder: 'asc' },
    select: { id: true, name: true, code: true },
  });

  const subscription = deal.organizationId
    ? await prisma.subscription.findFirst({
        where: { organizationId: deal.organizationId },
        include: {
          plan: {
            select: {
              code: true,
              name: true,
              monthlyPrice: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  const payments = subscription
    ? await prisma.payment.findMany({
        where: { subscriptionId: subscription.id },
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        take: 120,
        select: {
          id: true,
          amount: true,
          status: true,
          dueDate: true,
          paidAt: true,
          billingType: true,
        },
      })
    : [];

  const clientTickets = deal.organizationId
    ? await prisma.$queryRaw<Array<{ id: string; ticket_type: string; subject: string; status: string; created_at: Date }>>`
        SELECT id::text, ticket_type, subject, status, created_at
        FROM client.tickets
        WHERE organization_id = ${deal.organizationId}::uuid
        ORDER BY created_at DESC
        LIMIT 200
      `
    : [];

  const freelasTickets = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    created_at: Date;
    project_title: string;
    project_link: string;
    project_payload: Prisma.JsonValue;
    analysis_payload: Prisma.JsonValue;
    proposal_text: string;
    offer_amount_cents: number | null;
    final_offer_amount_cents: number | null;
    estimated_duration_text: string | null;
    details_text: string;
    review_notes: string | null;
    approved_by: string | null;
    approved_at: Date | null;
  }>>`
    SELECT
      id::text,
      status,
      created_at,
      project_title,
      project_link,
      project_payload,
      analysis_payload,
      proposal_text,
      offer_amount_cents,
      final_offer_amount_cents,
      estimated_duration_text,
      details_text,
      review_notes,
      approved_by,
      approved_at
    FROM crm.freelas_proposal_ticket
    WHERE deal_id = ${deal.id}::uuid
    ORDER BY created_at DESC
    LIMIT 200
  `;

  const ticketMessages = process.env.FEATURE_TICKET_THREAD_SYNC === '1' && deal.organizationId
    ? await prisma.$queryRaw<Array<{ id: string; ticket_id: string; source: string; author_name: string | null; message: string; visibility: string; created_at: Date }>>`
        SELECT tm.id::text, tm.ticket_id::text, tm.source, tm.author_name, tm.message, tm.visibility, tm.created_at
        FROM client.ticket_messages tm
        JOIN client.tickets t ON t.id = tm.ticket_id
        WHERE t.organization_id = ${deal.organizationId}::uuid
        ORDER BY tm.created_at DESC
        LIMIT 300
      `
    : [];

  return NextResponse.json({
    deal: {
      id: deal.id,
      title: deal.title,
      contactName: deal.contactName,
      contactEmail: deal.contactEmail,
      contactPhone: deal.contactPhone,
      planCode: deal.planCode,
      productCode: deal.productCode,
      intent: deal.intent,
      valueCents: deal.valueCents,
      dealType: deal.dealType,
      category: deal.category,
      origin: deal.origin,
      lifecycleStatus: deal.lifecycleStatus,
      isClosed: deal.isClosed,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      pipeline: deal.pipeline,
      stage: deal.stage,
    },
    stageOptions,
    organization: deal.organization,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          paymentMethod: subscription.paymentMethod,
          asaasSubscriptionId: subscription.asaasSubscriptionId,
          nextDueDate: subscription.nextDueDate,
          plan: {
            code: subscription.plan.code,
            name: subscription.plan.name,
            monthlyPrice: Number(subscription.plan.monthlyPrice),
          },
        }
      : null,
    operations: deal.operations,
    activities: deal.activities,
    agenda: deal.agenda,
    documents: deal.documents.map((doc) => ({
      ...doc,
      sizeBytes: doc.sizeBytes ? doc.sizeBytes.toString() : null,
    })),
    proposals: deal.proposals,
    tickets: [
      ...clientTickets.map((ticket) => ({
        id: ticket.id,
        source: 'CLIENT',
        ticketType: ticket.ticket_type,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.created_at,
      })),
      ...freelasTickets.map((ticket) => ({
        id: ticket.id,
        source: 'FREELAS',
        ticketType: 'PROPOSTA_99FREELAS',
        subject: ticket.project_title,
        status: ticket.status,
        createdAt: ticket.created_at,
        freelas: {
          projectLink: ticket.project_link,
          projectTitle: ticket.project_title,
          projectPayload: ticket.project_payload,
          analysisPayload: ticket.analysis_payload,
          proposalText: ticket.proposal_text,
          offerAmountCents: ticket.offer_amount_cents,
          finalOfferAmountCents: ticket.final_offer_amount_cents,
          estimatedDurationText: ticket.estimated_duration_text,
          detailsText: ticket.details_text,
          reviewNotes: ticket.review_notes,
          approvedBy: ticket.approved_by,
          approvedAt: ticket.approved_at,
        },
      })),
    ].sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt))),
    ticketMessages: ticketMessages.map((item) => ({
      id: item.id,
      ticketId: item.ticket_id,
      source: item.source,
      authorName: item.author_name,
      message: item.message,
      visibility: item.visibility,
      createdAt: item.created_at,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      amountCents: Math.round(Number(payment.amount) * 100),
      status: payment.status,
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
      billingType: payment.billingType,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const operationStageCode = body.operationStageCode ? String(body.operationStageCode) : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({ where: { id: params.id } });
      if (!deal) {
        throw new Error('Deal não encontrado');
      }

      let updatedDeal = deal;

      const patch: Record<string, unknown> = {};
      if (typeof body.title === 'string') patch.title = body.title.trim();
      if (typeof body.contactName === 'string') patch.contactName = body.contactName.trim();
      if (typeof body.contactEmail === 'string') patch.contactEmail = body.contactEmail.trim().toLowerCase();
      if (typeof body.contactPhone === 'string') patch.contactPhone = body.contactPhone.trim();
      if (typeof body.intent === 'string') patch.intent = body.intent.trim();
      if (body.value !== undefined) patch.valueCents = toCentsFromInput(body.value);

      if (Object.keys(patch).length > 0) {
        updatedDeal = await tx.deal.update({
          where: { id: deal.id },
          data: {
            ...patch,
            updatedAt: new Date(),
          },
        });
      }

      if (operationStageCode) {
        if (updatedDeal.lifecycleStatus !== 'CLIENT') {
          throw new Error('Operação disponível apenas para deal fechado/cliente');
        }
        await ensureDealOperation(tx, { id: updatedDeal.id, dealType: updatedDeal.dealType }, operationStageCode);
      }

      return updatedDeal;
    });

    return NextResponse.json({ ok: true, deal: result });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao atualizar deal', details: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const scope = req.nextUrl.searchParams.get('scope');
  const fullPurge = scope === 'full';
  const fromGhostList = req.nextUrl.searchParams.get('from') === 'ghost';

  if (fullPurge && !fromGhostList) {
    return NextResponse.json(
      { error: 'Exclusão permanente deve ser feita pela Lista Fantasma.' },
      { status: 403 }
    );
  }

  try {
    await ensureDealSuppressionTable();
    await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        select: { id: true, leadId: true, organizationId: true, subscriptionId: true, dealType: true, lifecycleStatus: true },
      });

      if (!deal) {
        throw new Error('Deal não encontrado');
      }

      if (fullPurge && deal.organizationId && deal.dealType === 'HOSPEDAGEM' && deal.lifecycleStatus === 'CLIENT') {
        await purgeOrganizationData(tx, deal.organizationId);
        return;
      }

      if (deal.organizationId) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO crm.deal_suppression (
              organization_id,
              deal_type,
              subscription_id,
              reason,
              created_by,
              created_at,
              updated_at
            )
            VALUES ($1::uuid, $2::varchar, $3::uuid, $4::text, 'CRM_DELETE', now(), now())
            ON CONFLICT (organization_id, deal_type)
            DO UPDATE SET
              subscription_id = EXCLUDED.subscription_id,
              reason = EXCLUDED.reason,
              created_by = EXCLUDED.created_by,
              updated_at = now()
          `,
          deal.organizationId,
          deal.dealType,
          deal.subscriptionId,
          'Deal excluído manualmente no CRM'
        );
      }

      await tx.dealStageHistory.deleteMany({ where: { dealId: deal.id } });
      await tx.dealOperation.deleteMany({ where: { dealId: deal.id } });
      await tx.dealDocument.deleteMany({ where: { dealId: deal.id } });
      await tx.dealActivity.deleteMany({ where: { dealId: deal.id } });
      await tx.dealAgenda.deleteMany({ where: { dealId: deal.id } });
      await tx.dealProposal.deleteMany({ where: { dealId: deal.id } });
      await tx.financialEntry.deleteMany({ where: { dealId: deal.id } });
      await tx.collectionAction.deleteMany({ where: { dealId: deal.id } });

      await tx.deal.delete({ where: { id: deal.id } });

      if (deal.leadId) {
        const remainingDeals = await tx.deal.count({ where: { leadId: deal.leadId } });
        if (remainingDeals === 0) {
          await tx.leadDedupeKey.deleteMany({ where: { leadId: deal.leadId } });
          await tx.lead.deleteMany({ where: { id: deal.leadId } });
        }
      }
    });

    return NextResponse.json({ ok: true, purge: fullPurge ? 'full' : 'deal' });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao excluir deal', details: String(error) }, { status: 500 });
  }
}
