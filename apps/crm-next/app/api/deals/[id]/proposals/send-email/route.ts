import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { renderProposalEmailHtml, renderProposalEmailPlainText } from '@/lib/proposal-email';
import { type PaymentCondition, type ProposalType } from '@/lib/proposal-template';
import { prisma } from '@/lib/prisma';

function normalizeProposalType(value: unknown, fallback: ProposalType): ProposalType {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'personalizado') return 'personalizado';
  if (normalized === 'hospedagem') return 'hospedagem';
  return fallback;
}

function normalizePaymentCondition(value: unknown): PaymentCondition {
  return String(value || '').toLowerCase() === '6x' ? '6x' : 'avista';
}

function parseSelectedFeatures(snapshot: Record<string, unknown>) {
  if (Array.isArray(snapshot.selectedFeatures)) {
    return snapshot.selectedFeatures.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(snapshot.features)) {
    return snapshot.features.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function parseBaseValueCents(snapshotValue: unknown) {
  const numeric = Number(snapshotValue);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const proposalId = String(body.proposalId || '').trim();
  if (!proposalId) {
    return NextResponse.json({ error: 'proposalId é obrigatório' }, { status: 422 });
  }

  const proposal = await prisma.dealProposal.findFirst({
    where: { id: proposalId, dealId: params.id },
    include: {
      deal: {
        include: {
          organization: {
            select: {
              id: true,
              legalName: true,
              billingEmail: true,
            },
          },
        },
      },
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: 'Proposta não encontrada para este deal' }, { status: 404 });
  }

  const emailTo = proposal.deal.contactEmail || proposal.deal.organization?.billingEmail;
  if (!emailTo) {
    return NextResponse.json({ error: 'Deal sem e-mail de envio' }, { status: 422 });
  }

  const organizationId = proposal.deal.organization?.id || null;
  const snapshot = (proposal.snapshot && typeof proposal.snapshot === 'object')
    ? proposal.snapshot as Record<string, unknown>
    : {};
  const fallbackProposalType: ProposalType = proposal.deal.dealType === 'HOSPEDAGEM' ? 'hospedagem' : 'personalizado';
  const proposalType = normalizeProposalType(snapshot.proposalType, fallbackProposalType);
  const planCode = String(snapshot.planCode || proposal.deal.planCode || 'basic').toLowerCase();
  const paymentCondition = normalizePaymentCondition(snapshot.paymentCondition);
  const projectType = String(snapshot.projectType || proposal.deal.productCode || proposal.deal.intent || 'Institucional');
  const selectedFeatures = parseSelectedFeatures(snapshot);
  const baseValueCents = parseBaseValueCents(snapshot.baseValueCents);
  const notes = String(snapshot.notes || '');
  const scope = String(snapshot.scope || proposal.scope || '');
  const domainOwn: 'sim' | 'nao' = String(snapshot.domainOwn || 'sim') === 'nao' ? 'nao' : 'sim';
  const migration: 'sim' | 'nao' = String(snapshot.migration || 'nao') === 'sim' ? 'sim' : 'nao';
  const emailProfessional: 'sim' | 'nao' = String(snapshot.emailProfessional || 'sim') === 'nao' ? 'nao' : 'sim';
  const pages = String(snapshot.pages || '1');
  const clientName = String(snapshot.clientName || proposal.deal.contactName || proposal.deal.title || 'Cliente');
  const companyName = String(snapshot.companyName || proposal.deal.organization?.legalName || '-');

  const proposalInput = {
    title: proposal.title,
    clientName,
    companyName,
    proposalType,
    paymentCondition,
    planCode,
    projectType,
    domainOwn,
    migration,
    pages,
    emailProfessional,
    selectedFeatures,
    notes,
    scope,
    baseValueCents,
    createdAt: proposal.createdAt,
  };
  const emailOptions = {
    dealId: proposal.dealId,
    portalBaseUrl: process.env.PORTAL_BASE_URL,
    catalogUrl: 'https://koddahub.com.br',
    whatsappPhone: '5541992272854',
    whatsappMessage: 'Olá! Tenho dúvidas sobre a proposta da KoddaHub e gostaria de falar com o time.',
  };
  const htmlBody = renderProposalEmailHtml(proposalInput, emailOptions);
  const plainBody = renderProposalEmailPlainText(proposalInput, emailOptions);
  const packedBody = `KH_MIME_V1:${JSON.stringify({ html: htmlBody, text: plainBody })}`;

  await prisma.emailQueue.create({
    data: {
      organizationId,
      emailTo,
      subject: `[KoddaHub] ${proposal.title}`,
      body: packedBody,
      attachments: [],
      status: 'PENDING',
    },
  });

  await prisma.dealProposal.update({
    where: { id: proposal.id },
    data: {
      status: 'ENVIADA',
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
