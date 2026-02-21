import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { buildProposalLines, buildProposalValueCents, renderSimpleProposalPdf } from '@/lib/proposals';
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
              legalName: true,
              billingEmail: true,
            },
          },
        },
      },
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; proposalId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const proposal = await getProposal(params.id, params.proposalId);
  if (!proposal) {
    return NextResponse.json({ error: 'Proposta não encontrada para este deal' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const snapshot = (proposal.snapshot && typeof proposal.snapshot === 'object' ? proposal.snapshot : {}) as Record<string, unknown>;

  const title = String(body.title || proposal.title || 'Proposta comercial KoddaHub').trim();
  const scope = body.scope !== undefined ? String(body.scope || '') : String(proposal.scope || '');
  const proposalType = String(body.proposalType || snapshot.proposalType || (proposal.deal.dealType === 'HOSPEDAGEM' ? 'hospedagem' : 'personalizado')).toLowerCase();
  const planCode = String(body.planCode || snapshot.planCode || proposal.deal.planCode || 'basic').toLowerCase();
  const projectType = String(body.projectType || snapshot.projectType || proposal.deal.productCode || proposal.deal.intent || '-');
  const paymentCondition = String(body.paymentCondition || snapshot.paymentCondition || 'avista');
  const notes = String(body.notes || snapshot.notes || '');

  const features = Array.isArray(body.features)
    ? body.features.map((item: unknown) => String(item).trim()).filter(Boolean)
    : Array.isArray(snapshot.features)
      ? snapshot.features.map((item) => String(item).trim()).filter(Boolean)
      : [];

  const valueCents = buildProposalValueCents({
    proposalType,
    planCode,
    baseValue: body.baseValue !== undefined ? body.baseValue : snapshot.baseValue,
    features,
  });

  const lines = buildProposalLines({
    title,
    customer: proposal.deal.contactName || proposal.deal.organization?.legalName || proposal.deal.title,
    email: proposal.deal.contactEmail || proposal.deal.organization?.billingEmail || '-',
    proposalType,
    planCode,
    projectType,
    paymentCondition,
    scope,
    notes,
    valueCents,
    features,
  });

  const pdfBuffer = renderSimpleProposalPdf(lines);
  await fs.mkdir(PROPOSALS_DIR, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}-proposta-${params.id}.pdf`;
  const fullPath = path.join(PROPOSALS_DIR, storedName);
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
        features,
        notes,
        valueCents,
      },
      pdfPath: storageRelativePath('proposals', storedName),
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
