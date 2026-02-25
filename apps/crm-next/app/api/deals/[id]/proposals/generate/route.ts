import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { renderProposalPdfBuffer } from '@/lib/proposal-pdf';
import { buildProposalPresentation, computePersistedValueCents, type PaymentCondition, type ProposalType } from '@/lib/proposal-template';
import { prisma } from '@/lib/prisma';
import { storageRelativePath, uploadsDir } from '@/lib/storage';

export const runtime = 'nodejs';

const PROPOSALS_DIR = uploadsDir('proposals');

function normalizeProposalType(value: unknown, fallback: ProposalType): ProposalType {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'personalizado') return 'personalizado';
  if (normalized === 'hospedagem') return 'hospedagem';
  return fallback;
}

function normalizePaymentCondition(value: unknown): PaymentCondition {
  return String(value || '').toLowerCase() === '6x' ? '6x' : 'avista';
}

function parseSelectedFeatures(body: Record<string, unknown>) {
  if (Array.isArray(body.selectedFeatures)) {
    return body.selectedFeatures.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(body.features)) {
    return body.features.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function parseBaseValueCents(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.round(asNumber * 100);
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

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

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const title = String(body.title || 'Proposta comercial KoddaHub').trim();
  const defaultProposalType: ProposalType = deal.dealType === 'HOSPEDAGEM' ? 'hospedagem' : 'personalizado';
  const proposalType = normalizeProposalType(body.proposalType, defaultProposalType);
  const planCode = String(body.planCode || deal.planCode || 'basic').toLowerCase();
  const projectType = String(body.projectType || deal.productCode || deal.intent || 'Institucional');
  const paymentCondition = normalizePaymentCondition(body.paymentCondition);
  const scope = body.scope ? String(body.scope) : '';
  const notes = body.notes ? String(body.notes) : '';
  const domainOwn = String(body.domainOwn || 'sim') === 'nao' ? 'nao' : 'sim';
  const migration = String(body.migration || 'nao') === 'sim' ? 'sim' : 'nao';
  const emailProfessional = String(body.emailProfessional || 'sim') === 'nao' ? 'nao' : 'sim';
  const pages = String(body.pages || '1');
  const selectedFeatures = parseSelectedFeatures(body);
  const baseValueCents = parseBaseValueCents(body.baseValue);

  const clientName = String(body.clientName || deal.contactName || deal.title || 'Cliente');
  const companyName = String(body.companyName || deal.organization?.legalName || '-');

  const presentation = buildProposalPresentation({
    title,
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
    createdAt: new Date(),
  });

  const valueCents = computePersistedValueCents({
    dealType: deal.dealType,
    proposalType,
    breakdown: presentation.breakdown,
  });

  const pdfBuffer = await renderProposalPdfBuffer({
    title,
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
    createdAt: new Date(),
  });

  const organizationKey = deal.organizationId || 'no-org';
  const targetDir = path.join(PROPOSALS_DIR, organizationKey, params.id);
  await fs.mkdir(targetDir, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}-proposta.pdf`;
  const fullPath = path.join(targetDir, storedName);
  await fs.writeFile(fullPath, pdfBuffer);

  const proposal = await prisma.dealProposal.create({
    data: {
      dealId: params.id,
      title,
      scope,
      snapshot: {
        proposalType,
        planCode,
        projectType,
        paymentCondition,
        selectedFeatures,
        baseValueCents,
        notes,
        domainOwn,
        migration,
        pages,
        emailProfessional,
        clientName,
        companyName,
        breakdown: presentation.breakdown,
        proposalTypeLabel: presentation.proposalTypeLabel,
        paymentLabel: presentation.paymentLabel,
        selectedPlanCode: presentation.selectedPlanCode,
        selectedPlanName: presentation.selectedPlanName,
        selectedPlanMonthlyLabel: presentation.selectedPlanMonthlyLabel,
        selectedPlanHighlights: presentation.selectedPlanHighlights,
        financeSummary: presentation.financeSummary,
        investmentRows: presentation.investmentRows,
      },
      status: 'GERADA',
      valueCents,
      pdfPath: storageRelativePath('proposals', organizationKey, params.id, storedName),
      createdBy: 'ADMIN',
    },
  });

  if (!deal.valueCents || deal.valueCents <= 0) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { valueCents, updatedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, proposal }, { status: 201 });
}
