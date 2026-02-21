import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { buildOrgSlug, buildVsCodeLinks, resolveProjectPath } from '@/lib/site24h';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      organization: {
        select: {
          id: true,
          legalName: true,
          domain: true,
          billingEmail: true,
        },
      },
      operations: {
        orderBy: [{ stageOrder: 'asc' }, { startedAt: 'asc' }],
      },
      promptRevisions: {
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      },
      templateRevisions: {
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      },
      clientApprovals: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      publishChecks: {
        orderBy: { checkedAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }

  let fallbackVsCode: { deepLink: string; webLink: string | null } | null = null;
  if (deal.organizationId) {
    const orgSlug = buildOrgSlug(deal.organization?.legalName, deal.organizationId);
    const projectPath = resolveProjectPath(orgSlug);
    fallbackVsCode = buildVsCodeLinks(projectPath);
  }

  const latestTemplate = deal.templateRevisions[0] || null;
  const templateVsCode = latestTemplate ? buildVsCodeLinks(latestTemplate.projectPath) : fallbackVsCode;

  return NextResponse.json({
    deal: {
      id: deal.id,
      dealType: deal.dealType,
      lifecycleStatus: deal.lifecycleStatus,
      organizationId: deal.organizationId,
      organizationName: deal.organization?.legalName || null,
      organizationDomain: deal.organization?.domain || null,
      billingEmail: deal.organization?.billingEmail || deal.contactEmail || null,
    },
    operation: {
      activeStageCode: deal.operations.find((item) => item.status === 'ACTIVE')?.stageCode || null,
      history: deal.operations,
    },
    prompt: {
      latest: deal.promptRevisions[0] || null,
      revisions: deal.promptRevisions,
    },
    template: {
      latest: latestTemplate,
      revisions: deal.templateRevisions,
      vscode: templateVsCode,
    },
    approval: {
      latest: deal.clientApprovals[0] || null,
      history: deal.clientApprovals,
    },
    publication: {
      checks: deal.publishChecks,
    },
  });
}

