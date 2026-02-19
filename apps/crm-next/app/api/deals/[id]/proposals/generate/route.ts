import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { buildProposalLines, buildProposalValueCents, renderSimpleProposalPdf } from '@/lib/proposals';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const PROPOSALS_DIR = path.resolve(process.cwd(), '../../storage/uploads/proposals');

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      organization: {
        select: {
          legalName: true,
          billingEmail: true,
        },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  const title = String(body.title || 'Proposta comercial KoddaHub').trim();
  const proposalType = String(body.proposalType || (deal.dealType === 'HOSPEDAGEM' ? 'hospedagem' : 'personalizado')).toLowerCase();
  const planCode = body.planCode ? String(body.planCode).toLowerCase() : deal.planCode;
  const projectType = body.projectType ? String(body.projectType) : deal.productCode || deal.intent || '-';
  const paymentCondition = body.paymentCondition ? String(body.paymentCondition) : 'avista';
  const scope = body.scope ? String(body.scope) : '';
  const notes = body.notes ? String(body.notes) : '';
  const features = Array.isArray(body.features)
    ? body.features.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];

  const valueCents = buildProposalValueCents({
    proposalType,
    planCode,
    baseValue: body.baseValue,
    features,
  });

  const lines = buildProposalLines({
    title,
    customer: deal.contactName || deal.organization?.legalName || deal.title,
    email: deal.contactEmail || deal.organization?.billingEmail || '-',
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
        features,
        notes,
        valueCents,
      },
      status: 'GERADA',
      valueCents,
      pdfPath: `storage/uploads/proposals/${storedName}`,
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
