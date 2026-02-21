import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { operationStagesByDealType } from '@/lib/deals';
import { buildOrgSlug, buildVsCodeLinks, resolveProjectPath } from '@/lib/site24h';
import {
  ensurePublicationSubsteps,
  listPublicationSubsteps,
  listTemplateModels,
  publicationSubstepsStatus,
  sshConfigReference,
} from '@/lib/site24h-operation';
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
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 80,
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
  const stageTabs = operationStagesByDealType(deal.dealType).map((item) => ({
    code: item.code,
    name: item.name,
    order: item.order,
  }));
  const activeStageCode = deal.operations.find((item) => item.status === 'ACTIVE')?.stageCode || stageTabs[0]?.code || null;

  const templateCatalog = await listTemplateModels();

  let publicationSubsteps: Array<{
    id: string;
    deal_id: string;
    stage_code: string;
    substep_code: string;
    substep_name: string;
    substep_order: number;
    status: string;
    is_required: boolean;
    owner: string | null;
    notes: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }> = [];
  let publicationSummary = { requiredTotal: 0, requiredCompleted: 0, pendingTotal: 0, ready: false };

  if (deal.dealType === 'HOSPEDAGEM') {
    await ensurePublicationSubsteps(deal.id);
    publicationSubsteps = await listPublicationSubsteps(deal.id);
    publicationSummary = await publicationSubstepsStatus(deal.id);
  }

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
      activeStageCode,
      stageTabs,
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
      sshConfig: sshConfigReference(),
      catalog: templateCatalog,
    },
    approval: {
      latest: deal.clientApprovals[0] || null,
      history: deal.clientApprovals,
    },
    publication: {
      checks: deal.publishChecks,
      substeps: publicationSubsteps.map((item) => ({
        id: item.id,
        dealId: item.deal_id,
        stageCode: item.stage_code,
        substepCode: item.substep_code,
        substepName: item.substep_name,
        substepOrder: item.substep_order,
        status: item.status,
        isRequired: item.is_required,
        owner: item.owner,
        notes: item.notes,
        startedAt: item.started_at,
        completedAt: item.completed_at,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      summary: publicationSummary,
    },
    operationLogsSummary: {
      totalActivities: deal.activities.length,
      latestActivities: deal.activities.slice(0, 10),
      hint: 'Histórico completo disponível na aba Atividades.',
    },
  });
}
