import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { renderProposalPdfBuffer } from '@/lib/proposal-pdf';
import { buildProposalPresentation, computePersistedValueCents, type PaymentCondition, type ProposalType } from '@/lib/proposal-template';
import { prisma } from '@/lib/prisma';
import { absoluteFromStoredPath, storageRelativePath, uploadsDir } from '@/lib/storage';

export const runtime = 'nodejs';

const PROPOSALS_DIR = uploadsDir('proposals');

async function getProposal(dealId: string, proposalId: string) {
  return prisma.dealProposal.findFirst({
    where: { id: proposalId, dealId },
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
}

function normalizeProposalType(value: unknown, fallback: ProposalType): ProposalType {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'personalizado') return 'personalizado';
  if (normalized === 'hospedagem') return 'hospedagem';
  return fallback;
}

function normalizePaymentCondition(value: unknown): PaymentCondition {
  return String(value || '').toLowerCase() === '6x' ? '6x' : 'avista';
}

function parseSelectedFeatures(body: Record<string, unknown>, snapshot: Record<string, unknown>) {
  if (Array.isArray(body.selectedFeatures)) {
    return body.selectedFeatures.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(body.features)) {
    return body.features.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(snapshot.selectedFeatures)) {
    return snapshot.selectedFeatures.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(snapshot.features)) {
    return snapshot.features.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function parseBaseValueCents(bodyValue: unknown, snapshotValue: unknown) {
  const target = bodyValue === undefined ? snapshotValue : bodyValue;
  if (target === null || target === undefined || target === '') return null;
  const asNumber = Number(target);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.round(asNumber * 100);
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; proposalId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const proposal = await getProposal(params.id, params.proposalId);
  if (!proposal) {
    return NextResponse.json({ error: 'Proposta não encontrada para este deal' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const snapshot = (proposal.snapshot && typeof proposal.snapshot === 'object' ? proposal.snapshot : {}) as Record<string, unknown>;

  const title = String(body.title || proposal.title || 'Proposta comercial KoddaHub').trim();
  const scope = body.scope !== undefined ? String(body.scope || '') : String(proposal.scope || '');
  const defaultProposalType: ProposalType = proposal.deal.dealType === 'HOSPEDAGEM' ? 'hospedagem' : 'personalizado';
  const proposalType = normalizeProposalType(body.proposalType || snapshot.proposalType, defaultProposalType);
  const planCode = String(body.planCode || snapshot.planCode || proposal.deal.planCode || 'basic').toLowerCase();
  const projectType = String(body.projectType || snapshot.projectType || proposal.deal.productCode || proposal.deal.intent || 'Institucional');
  const paymentCondition = normalizePaymentCondition(body.paymentCondition || snapshot.paymentCondition);
  const notes = String(body.notes || snapshot.notes || '');
  const domainOwn = String(body.domainOwn || snapshot.domainOwn || 'sim') === 'nao' ? 'nao' : 'sim';
  const migration = String(body.migration || snapshot.migration || 'nao') === 'sim' ? 'sim' : 'nao';
  const emailProfessional = String(body.emailProfessional || snapshot.emailProfessional || 'sim') === 'nao' ? 'nao' : 'sim';
  const pages = String(body.pages || snapshot.pages || '1');
  const selectedFeatures = parseSelectedFeatures(body, snapshot);
  const baseValueCents = parseBaseValueCents(body.baseValue, snapshot.baseValueCents);

  const clientName = String(body.clientName || snapshot.clientName || proposal.deal.contactName || proposal.deal.title || 'Cliente');
  const companyName = String(body.companyName || snapshot.companyName || proposal.deal.organization?.legalName || '-');

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
    dealType: proposal.deal.dealType,
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

  const organizationKey = proposal.deal.organizationId || 'no-org';
  const targetDir = path.join(PROPOSALS_DIR, organizationKey, params.id);
  await fs.mkdir(targetDir, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}-proposta.pdf`;
  const fullPath = path.join(targetDir, storedName);
  await fs.writeFile(fullPath, pdfBuffer);

  if (proposal.pdfPath) {
    const previousFullPath = absoluteFromStoredPath(proposal.pdfPath);
    await fs.unlink(previousFullPath).catch(() => null);
  }

  const updated = await prisma.dealProposal.update({
    where: { id: proposal.id },
    data: {
      title,
      scope,
      valueCents,
      snapshot: {
        proposalType,
        planCode,
        projectType,
        paymentCondition,
        selectedFeatures,
        notes,
        domainOwn,
        migration,
        pages,
        emailProfessional,
        clientName,
        companyName,
        baseValueCents,
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
      pdfPath: storageRelativePath('proposals', organizationKey, params.id, storedName),
      status: 'GERADA',
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, proposal: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; proposalId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const proposal = await getProposal(params.id, params.proposalId);
  if (!proposal) {
    return NextResponse.json({ error: 'Proposta não encontrada para este deal' }, { status: 404 });
  }

  await prisma.dealProposal.delete({ where: { id: proposal.id } });

  if (proposal.pdfPath) {
    const fullPath = absoluteFromStoredPath(proposal.pdfPath);
    await fs.unlink(fullPath).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
