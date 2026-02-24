import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const requestedDomain = String(body.domain || '').trim().toLowerCase();

  try {
    const output = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        include: {
          organization: {
            select: {
              id: true,
              domain: true,
            },
          },
          clientApprovals: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          templateRevisions: {
            orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
            take: 5,
          },
        },
      });

      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Monitor de publicação disponível somente para hospedagem');

      const latestApproved = deal.clientApprovals.find((item) => String(item.status || '').toUpperCase() === 'APPROVED') || null;
      const templateRevision = latestApproved
        ? deal.templateRevisions.find((item) => item.id === latestApproved.templateRevisionId) || null
        : deal.templateRevisions[0] || null;

      if (!templateRevision) {
        throw new Error('Nenhuma revisão de template encontrada para iniciar monitoramento');
      }

      const domain = requestedDomain || String(deal.organization?.domain || '').trim().toLowerCase();
      if (!domain) {
        throw new Error('Domínio não informado para monitoramento');
      }

      if (deal.organizationId && domain && domain !== String(deal.organization?.domain || '').trim().toLowerCase()) {
        await tx.organization.update({
          where: { id: deal.organizationId },
          data: { domain },
        });
      }

      const existing = await tx.dealPublishCheck.findFirst({
        where: {
          dealId: deal.id,
          targetDomain: domain,
        },
        orderBy: { checkedAt: 'desc' },
      });

      const check = existing || await tx.dealPublishCheck.create({
        data: {
          dealId: deal.id,
          templateRevisionId: templateRevision.id,
          targetDomain: domain,
          expectedHash: templateRevision.sourceHash || null,
          lastLiveHash: null,
          lastHttpStatus: null,
          matches: false,
        },
      });

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PUBLICATION_MONITOR_STARTED',
          content: `Monitoramento de domínio iniciado para ${domain}.`,
          metadata: {
            domain,
            publishCheckId: check.id,
            templateRevisionId: templateRevision.id,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        checkId: check.id,
        domain,
        checkedAt: check.checkedAt,
      };
    });

    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao iniciar monitoramento de publicação', details: String(error) }, { status: 500 });
  }
}
