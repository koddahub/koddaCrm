import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation, operationStagesByDealType } from '@/lib/deals';
import { buildOrgSlug, buildVsCodeLinks, resolveProjectPath } from '@/lib/site24h';
import {
  ensurePublicationSubsteps,
  listPublicationSubsteps,
  listTemplateModels,
  publicationSubstepsStatus,
  sshConfigReference,
} from '@/lib/site24h-operation';
import { listDealSiteReleases, parseReleaseVariantFromPath } from '@/lib/site24h-release';
import { prisma } from '@/lib/prisma';

function resolveClientRootFromRelease(projectRoot: string, orgSlug: string) {
  const normalized = String(projectRoot || '').replace(/\\/g, '/');
  const marker = '/releases/';
  const idx = normalized.indexOf(marker);
  if (idx > 0) return normalized.slice(0, idx);
  if (normalized.trim()) return normalized;
  return path.resolve('/home/server/projects/clientes', orgSlug);
}

async function safeReadFile(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function safeStat(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function isDomainLike(value: string) {
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(String(value || '').trim());
}

function projectLabelFromDomain(domain: string | null, projectId: string) {
  const raw = String(domain || '').trim();
  if (!raw) return `PRJ-${projectId.slice(0, 4).toUpperCase()}`;
  if (isDomainLike(raw)) return raw.toLowerCase();
  return raw.toUpperCase();
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const bootstrapDeal = await prisma.deal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      dealType: true,
      lifecycleStatus: true,
    },
  });
  if (!bootstrapDeal) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }
  if (bootstrapDeal.lifecycleStatus === 'CLIENT') {
    await prisma.$transaction(async (tx) => {
      await ensureDealOperation(tx, { id: bootstrapDeal.id, dealType: bootstrapDeal.dealType });
    });
  }

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
  const latestPromptRevision = deal.promptRevisions[0] || null;
  let templateVsCode = latestTemplate ? buildVsCodeLinks(latestTemplate.projectPath) : fallbackVsCode;
  const stageTabs = operationStagesByDealType(deal.dealType).map((item) => ({
    code: item.code,
    name: item.name,
    order: item.order,
  }));
  const activeStageCode = deal.operations.find((item) => item.status === 'ACTIVE')?.stageCode || stageTabs[0]?.code || null;
  const requestedProjectId = String(req.nextUrl.searchParams.get('projectId') || '').trim();

  const projectRows = deal.organizationId
    ? await prisma.$queryRaw<Array<{
        id: string;
        domain: string | null;
        project_type: string;
        status: string;
        created_at: Date;
        plan_code: string | null;
        plan_name: string | null;
        item_status: string | null;
        effective_price: number | null;
        operation_stage: string | null;
        operation_updated_at: Date | null;
      }>>`
        SELECT
          p.id::text AS id,
          p.domain,
          p.project_type,
          p.status,
          p.created_at,
          pl.code AS plan_code,
          pl.name AS plan_name,
          si.status AS item_status,
          coalesce(si.price_override, pl.monthly_price)::float AS effective_price,
          pos.stage AS operation_stage,
          pos.updated_at AS operation_updated_at
        FROM client.projects p
        LEFT JOIN client.subscription_items si ON si.project_id = p.id
        LEFT JOIN client.plans pl ON pl.id = si.plan_id
        LEFT JOIN crm.project_operation_state pos ON pos.project_id = p.id
        WHERE p.organization_id = ${deal.organizationId}::uuid
        ORDER BY
          CASE WHEN upper(coalesce(p.status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
          p.created_at DESC
      `
    : [];

  const normalizedProjects = projectRows.map((row) => ({
    id: row.id,
    domain: row.domain ? String(row.domain).toLowerCase() : null,
    label: projectLabelFromDomain(row.domain, row.id),
    projectType: row.project_type,
    status: String(row.status || 'PENDING').toUpperCase(),
    planCode: row.plan_code,
    planName: row.plan_name,
    itemStatus: row.item_status ? String(row.item_status).toUpperCase() : null,
    effectivePrice: row.effective_price !== null ? Number(row.effective_price) : null,
    operationStage: row.operation_stage || null,
    operationUpdatedAt: row.operation_updated_at ? row.operation_updated_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  }));

  const selectedProject = normalizedProjects.find((item) => item.id === requestedProjectId)
    || normalizedProjects.find((item) => item.status === 'ACTIVE')
    || normalizedProjects[0]
    || null;
  const resolvedActiveStageCode = selectedProject?.operationStage || activeStageCode;

  const templateCatalog = await listTemplateModels();
  const siteReleases = await listDealSiteReleases(deal.id);
  const activeRelease = siteReleases[0] || null;

  let promptSource: 'filesystem' | 'database_fallback' = 'database_fallback';
  let promptPaths: {
    clientRoot: string | null;
    promptJsonPath: string | null;
    promptMdPath: string | null;
    promptV1Path: string | null;
    promptV2Path: string | null;
    promptV3Path: string | null;
    masterPromptPath: string | null;
    identityPath: string | null;
  } = {
    clientRoot: null,
    promptJsonPath: null,
    promptMdPath: null,
    promptV1Path: null,
    promptV2Path: null,
    promptV3Path: null,
    masterPromptPath: null,
    identityPath: null,
  };
  let promptFileMtime: string | null = null;
  let masterPromptSource: 'filesystem' | 'database_fallback' = 'database_fallback';
  let variantPromptsResolved: { V1: string; V2: string; V3: string } | null = null;
  let resolvedPromptText: string | null = latestPromptRevision?.promptText || null;
  let resolvedPromptJson: unknown = latestPromptRevision?.promptJson || null;

  if (activeRelease && deal.organizationId) {
    const orgSlug = buildOrgSlug(deal.organization?.legalName, deal.organizationId);
    const clientRoot = resolveClientRootFromRelease(activeRelease.project_root, orgSlug);
    const promptJsonPath = path.resolve(clientRoot, 'prompt_personalizacao.json');
    const promptMdPath = path.resolve(clientRoot, 'prompt_personalizacao.md');
    const promptV1Path = path.resolve(clientRoot, 'prompt_v1_draft.md');
    const promptV2Path = path.resolve(clientRoot, 'prompt_v2_draft.md');
    const promptV3Path = path.resolve(clientRoot, 'prompt_v3_draft.md');
    const masterPromptPath = path.resolve(clientRoot, 'prompt_pai_orquestrador.md');
    const identityPath = path.resolve(clientRoot, 'identidade_visual.md');
    promptPaths = {
      clientRoot,
      promptJsonPath,
      promptMdPath,
      promptV1Path,
      promptV2Path,
      promptV3Path,
      masterPromptPath,
      identityPath,
    };

    const [rawPromptJson, rawPromptMd, rawV1, rawV2, rawV3, rawMasterPrompt, jsonStat, mdStat] = await Promise.all([
      safeReadFile(promptJsonPath),
      safeReadFile(promptMdPath),
      safeReadFile(promptV1Path),
      safeReadFile(promptV2Path),
      safeReadFile(promptV3Path),
      safeReadFile(masterPromptPath),
      safeStat(promptJsonPath),
      safeStat(promptMdPath),
    ]);
    if (rawMasterPrompt && rawMasterPrompt.trim()) {
      masterPromptSource = 'filesystem';
    }

    let parsedPromptJson: unknown = null;
    if (rawPromptJson) {
      try {
        parsedPromptJson = JSON.parse(rawPromptJson);
      } catch {
        parsedPromptJson = null;
      }
    }

    const parsedPromptObject = (parsedPromptJson && typeof parsedPromptJson === 'object') ? parsedPromptJson as Record<string, unknown> : null;
    const parsedVariantPrompts = (parsedPromptObject?.variant_prompts && typeof parsedPromptObject.variant_prompts === 'object')
      ? parsedPromptObject.variant_prompts as Record<string, unknown>
      : null;

    const v1 = String(rawV1 || (typeof parsedVariantPrompts?.V1 === 'string' ? parsedVariantPrompts?.V1 : '') || '').trim();
    const v2 = String(rawV2 || (typeof parsedVariantPrompts?.V2 === 'string' ? parsedVariantPrompts?.V2 : '') || '').trim();
    const v3 = String(rawV3 || (typeof parsedVariantPrompts?.V3 === 'string' ? parsedVariantPrompts?.V3 : '') || '').trim();
    const hasFsPrompt = Boolean(rawPromptMd || rawPromptJson || v1 || v2 || v3);

    if (hasFsPrompt) {
      promptSource = 'filesystem';
      promptFileMtime = (jsonStat?.mtime || mdStat?.mtime || null)?.toISOString() || null;
      variantPromptsResolved = {
        V1: v1,
        V2: v2,
        V3: v3,
      };
      const fallbackText = String(rawPromptMd || resolvedPromptText || v1 || v2 || v3 || '').trim();
      resolvedPromptText = fallbackText || resolvedPromptText || '';
      resolvedPromptJson = parsedPromptObject?.prompt_json ?? parsedPromptJson ?? resolvedPromptJson;
    }
  }

  const promptLatest = latestPromptRevision
    ? {
        ...latestPromptRevision,
        promptText: resolvedPromptText ?? latestPromptRevision.promptText,
        promptJson: resolvedPromptJson ?? latestPromptRevision.promptJson,
        updatedAt: promptSource === 'filesystem' && promptFileMtime ? new Date(promptFileMtime) : latestPromptRevision.updatedAt,
      }
    : (promptSource === 'filesystem'
      ? {
          id: 'filesystem',
          version: 1,
          promptText: resolvedPromptText || '',
          promptJson: resolvedPromptJson || null,
          status: 'DRAFT',
          requestedNotes: null,
          createdAt: promptFileMtime || new Date().toISOString(),
          updatedAt: promptFileMtime || new Date().toISOString(),
        }
      : null);

  const latestApproval = deal.clientApprovals[0] || null;
  const approvalRevision = latestApproval
    ? deal.templateRevisions.find((item) => item.id === latestApproval.templateRevisionId) || null
    : null;
  const selectedFromApproval = approvalRevision ? parseReleaseVariantFromPath(approvalRevision.projectPath) : null;
  const latestRevisionSelection = latestTemplate ? parseReleaseVariantFromPath(latestTemplate.projectPath) : null;
  const selectedApprovalVariant = {
    releaseVersion: selectedFromApproval?.releaseVersion || latestRevisionSelection?.releaseVersion || null,
    variantCode: selectedFromApproval?.variantCode || latestRevisionSelection?.variantCode || null,
  };
  const workspaceVariant = activeRelease?.variants.find((item) => item.variant_code === (selectedApprovalVariant.variantCode || 'V1'))
    || activeRelease?.variants[0]
    || null;
  if (workspaceVariant?.folder_path) {
    templateVsCode = buildVsCodeLinks(workspaceVariant.folder_path);
  }

  const assetRows = activeRelease
    ? await prisma.$queryRaw<Array<{ asset_type: string; total: bigint | number }>>`
        SELECT asset_type, count(*)::bigint AS total
        FROM crm.deal_prompt_asset
        WHERE release_id = ${activeRelease.id}::uuid
        GROUP BY asset_type
      `
    : [];
  const assetMap = new Map<string, number>();
  for (const row of assetRows) {
    assetMap.set(String(row.asset_type || '').toLowerCase(), Number(row.total || 0));
  }
  const logoCount = assetMap.get('logo') || 0;
  const manualCount = assetMap.get('manual') || 0;
  const contentCount = assetMap.get('conteudo') || 0;
  const otherCount = assetMap.get('outro') || 0;

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

  const promptRequests = await prisma.$queryRaw<Array<{
    id: string;
    subject: string;
    request_items: unknown;
    message: string;
    due_at: Date | null;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT id::text, subject, request_items, message, due_at, status, created_at, updated_at
    FROM crm.deal_prompt_request
    WHERE deal_id = ${deal.id}::uuid
    ORDER BY created_at DESC
    LIMIT 20
  `;
  const promptRequestsNormalized = promptRequests.map((item) => ({
    id: item.id,
    subject: item.subject,
    requestItems: Array.isArray(item.request_items)
      ? item.request_items.map((entry) => String(entry || ''))
      : [],
    message: item.message,
    dueAt: item.due_at ? item.due_at.toISOString() : null,
    status: item.status,
    createdAt: item.created_at.toISOString(),
    updatedAt: item.updated_at.toISOString(),
  }));
  const publicationRequests = promptRequestsNormalized.filter((item) => {
    const subject = String(item.subject || '').toLowerCase();
    if (subject.includes('domínio/publicação') || subject.includes('dominio/publicacao')) return true;
    return item.requestItems.some((entry) => String(entry || '').toLowerCase().includes('domínio para publicação')
      || String(entry || '').toLowerCase().includes('dominio para publicacao'));
  });
  const latestPublicationRequest = publicationRequests[0] || null;
  const latestPublicationRequestDomain = (() => {
    if (!latestPublicationRequest) return null;
    const fromItem = latestPublicationRequest.requestItems.find((entry) => String(entry || '').toLowerCase().includes('domínio para publicação')
      || String(entry || '').toLowerCase().includes('dominio para publicacao'));
    const parsed = String(fromItem || '').split(':').slice(1).join(':').trim();
    if (parsed) return parsed;
    const fromMessage = String(latestPublicationRequest.message || '').match(/[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] || '';
    return fromMessage || null;
  })();
  const publicationDecisionActivities = deal.activities.filter((item) => (
    item.activityType === 'CLIENT_PUBLICATION_DOMAIN_APPROVED'
    || item.activityType === 'CLIENT_PUBLICATION_DOMAIN_REJECTED'
  ));
  const latestPublicationDecision = publicationDecisionActivities[0] || null;
  const latestPublicationDecisionMeta = (() => {
    const raw = latestPublicationDecision?.metadata;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
  })();
  const decisionRequestId = String(latestPublicationDecisionMeta.request_id || latestPublicationDecisionMeta.requestId || '').trim() || null;
  const decisionDomain = String(
    latestPublicationDecisionMeta.approved_domain
    || latestPublicationDecisionMeta.domain
    || '',
  ).trim() || null;
  const decisionSuggestedDomain = String(
    latestPublicationDecisionMeta.suggested_domain
    || latestPublicationDecisionMeta.suggestedDomain
    || '',
  ).trim() || null;
  const decisionResponseNote = String(
    latestPublicationDecisionMeta.note
    || latestPublicationDecisionMeta.response_note
    || latestPublicationDecisionMeta.responseNote
    || '',
  ).trim() || null;
  const fallbackRequestReceived = String(latestPublicationRequest?.status || '').toUpperCase() === 'RECEIVED';
  const publicationDecisionStatus = (() => {
    if (!latestPublicationDecision) return fallbackRequestReceived ? 'APPROVED' : 'PENDING';
    if (latestPublicationDecision.activityType === 'CLIENT_PUBLICATION_DOMAIN_APPROVED') return 'APPROVED';
    if (latestPublicationDecision.activityType === 'CLIENT_PUBLICATION_DOMAIN_REJECTED') return 'REJECTED';
    return fallbackRequestReceived ? 'APPROVED' : 'PENDING';
  })();
  const publicationDomainApproval = {
    status: publicationDecisionStatus as 'PENDING' | 'APPROVED' | 'REJECTED',
    domain: (
      publicationDecisionStatus === 'APPROVED'
        ? (decisionDomain || latestPublicationRequestDomain || deal.organization?.domain || null)
        : (latestPublicationRequestDomain || deal.organization?.domain || null)
    ),
    suggestedDomain: publicationDecisionStatus === 'REJECTED' ? (decisionSuggestedDomain || latestPublicationRequestDomain || null) : null,
    requestedAt: latestPublicationRequest?.createdAt || null,
    respondedAt: latestPublicationDecision
      ? latestPublicationDecision.createdAt.toISOString()
      : (fallbackRequestReceived ? latestPublicationRequest?.updatedAt || null : null),
    requestId: decisionRequestId || latestPublicationRequest?.id || null,
    responseNote: decisionResponseNote,
  };

  return NextResponse.json({
    deal: {
      id: deal.id,
      dealType: deal.dealType,
      lifecycleStatus: deal.lifecycleStatus,
      organizationId: deal.organizationId,
      organizationName: deal.organization?.legalName || null,
      organizationDomain: selectedProject?.domain || deal.organization?.domain || null,
      billingEmail: deal.organization?.billingEmail || deal.contactEmail || null,
    },
    projectContext: {
      selectedProjectId: selectedProject?.id || null,
      projects: normalizedProjects,
    },
    operation: {
      activeStageCode: resolvedActiveStageCode,
      stageTabs,
      history: deal.operations,
    },
    prompt: {
      latest: promptLatest,
      revisions: deal.promptRevisions,
      promptSource,
      masterPromptSource,
      promptPaths,
      promptFileMtime,
      variantPromptsResolved,
      requests: promptRequestsNormalized,
    },
    template: {
      latest: latestTemplate,
      revisions: deal.templateRevisions,
      vscode: templateVsCode,
      sshConfig: sshConfigReference(),
      catalog: templateCatalog,
    },
    approval: {
      latest: latestApproval,
      history: deal.clientApprovals,
    },
    releases: siteReleases.map((release) => ({
      id: release.id,
      dealId: release.deal_id,
      version: release.version,
      label: `v${release.version}`,
      status: release.status,
      projectRoot: release.project_root,
      assetsPath: release.assets_path,
      promptMdPath: release.prompt_md_path,
      promptJsonPath: release.prompt_json_path,
      createdBy: release.created_by,
      createdAt: release.created_at,
      updatedAt: release.updated_at,
      variants: release.variants.map((variant) => ({
        id: variant.id,
        releaseId: variant.release_id,
        variantCode: variant.variant_code,
        folderPath: variant.folder_path,
        entryFile: variant.entry_file,
        previewUrl: variant.preview_url,
        sourceHash: variant.source_hash,
        status: variant.status,
        createdAt: variant.created_at,
        updatedAt: variant.updated_at,
      })),
    })),
    activeRelease: activeRelease
      ? {
          id: activeRelease.id,
          version: activeRelease.version,
          label: `v${activeRelease.version}`,
          status: activeRelease.status,
          projectRoot: activeRelease.project_root,
          assetsPath: activeRelease.assets_path,
          promptMdPath: activeRelease.prompt_md_path,
          promptJsonPath: activeRelease.prompt_json_path,
          variants: activeRelease.variants.map((variant) => ({
            id: variant.id,
            variantCode: variant.variant_code,
            folderPath: variant.folder_path,
            entryFile: variant.entry_file,
            previewUrl: variant.preview_url,
            sourceHash: variant.source_hash,
            status: variant.status,
            createdAt: variant.created_at,
            updatedAt: variant.updated_at,
          })),
        }
      : null,
    selectedApprovalVariant,
    assets: {
      releaseId: activeRelease?.id || null,
      releaseLabel: activeRelease ? `v${activeRelease.version}` : null,
      uploadPath: activeRelease?.assets_path || null,
      summary: {
        logo: { count: logoCount, status: logoCount > 0 ? 'received' : 'missing' },
        identidadeVisual: { count: manualCount, status: manualCount > 0 ? 'received' : 'missing' },
        conteudo: { count: contentCount, status: contentCount > 0 ? 'received' : 'missing' },
        outros: { count: otherCount, status: otherCount > 0 ? 'received' : 'missing' },
      },
    },
    publication: {
      checks: deal.publishChecks,
      requests: publicationRequests,
      domainApproval: publicationDomainApproval,
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
