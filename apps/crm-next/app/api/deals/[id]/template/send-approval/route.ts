import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { buildPortalApprovalUrl } from '@/lib/site24h';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const templateRevisionId = body.templateRevisionId ? String(body.templateRevisionId) : null;
  const expiresHours = Math.max(1, Number(body.expiresHours || 72));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        include: {
          organization: {
            select: {
              id: true,
              legalName: true,
              billingEmail: true,
            },
          },
          templateRevisions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Envio de aprovação disponível somente para hospedagem');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Deal precisa estar fechado para aprovação do cliente');

      const revision = templateRevisionId
        ? await tx.dealTemplateRevision.findFirst({
            where: { id: templateRevisionId, dealId: deal.id },
          })
        : deal.templateRevisions[0];

      if (!revision) throw new Error('Nenhuma revisão de template disponível para envio');

      await tx.dealClientApproval.updateMany({
        where: { dealId: deal.id, status: 'PENDING' },
        data: {
          status: 'EXPIRED',
          updatedAt: new Date(),
        },
      });

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

      const approval = await tx.dealClientApproval.create({
        data: {
          dealId: deal.id,
          templateRevisionId: revision.id,
          tokenHash,
          expiresAt,
          status: 'PENDING',
        },
      });

      await tx.dealTemplateRevision.update({
        where: { id: revision.id },
        data: {
          status: 'SENT_CLIENT',
          updatedAt: new Date(),
        },
      });

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'aprovacao_cliente');

      const approvalLink = buildPortalApprovalUrl(rawToken);
      const emailTo = deal.contactEmail || deal.organization?.billingEmail;
      if (emailTo) {
        await tx.emailQueue.create({
          data: {
            organizationId: deal.organizationId || null,
            emailTo,
            subject: '[KoddaHub] Aprovação da versão do seu site',
            body: `Olá!\n\nSua versão do site está pronta para aprovação.\n\nAcesse o link abaixo e aprove ou solicite micro ajustes:\n${approvalLink}\n\nEste link expira em ${expiresHours}h.\n\nEquipe KoddaHub.`,
            status: 'PENDING',
          },
        });
      }

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'CLIENT_APPROVAL_REQUESTED',
          content: 'Link de aprovação enviado ao cliente.',
          metadata: {
            approvalId: approval.id,
            templateRevisionId: revision.id,
            expiresAt,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        approvalId: approval.id,
        approvalLink,
        expiresAt,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao enviar aprovação ao cliente', details: String(error) }, { status: 500 });
  }
}

