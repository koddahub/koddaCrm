import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

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
  const attachment = proposal.pdfPath
    ? [{ name: `${proposal.title}.pdf`, path: proposal.pdfPath, mime: 'application/pdf' }]
    : [];

  await prisma.emailQueue.create({
    data: {
      organizationId,
      emailTo,
      subject: `[KoddaHub] ${proposal.title}`,
      body: `Olá,\n\nSegue em anexo sua proposta "${proposal.title}".\n\nQualquer dúvida, responda este e-mail.\n\nEquipe KoddaHub`,
      attachments: attachment,
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
