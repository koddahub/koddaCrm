import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
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

  const tickets = deal.organizationId
    ? await prisma.$queryRaw<Array<{ id: string; ticket_type: string; subject: string; status: string; created_at: Date }>>`
        SELECT id::text, ticket_type, subject, status, created_at
        FROM client.tickets
        WHERE organization_id = ${deal.organizationId}::uuid
        ORDER BY created_at DESC
        LIMIT 200
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
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      ticketType: ticket.ticket_type,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.created_at,
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
