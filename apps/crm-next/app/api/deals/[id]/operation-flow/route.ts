import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
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
  const latestPromptRevision = deal.promptRevisions[0] || null;
  let templateVsCode = latestTemplate ? buildVsCodeLinks(latestTemplate.projectPath) : fallbackVsCode;
  const stageTabs = operationStagesByDealType(deal.dealType).map((item) => ({
    code: item.code,
    name: item.name,
    order: item.order,
  }));
  const activeStageCode = deal.operations.find((item) => item.status === 'ACTIVE')?.stageCode || stageTabs[0]?.code || null;

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
    identityPath: string | null;
  } = {
    clientRoot: null,
    promptJsonPath: null,
    promptMdPath: null,
    promptV1Path: null,
    promptV2Path: null,
    promptV3Path: null,
    identityPath: null,
  };
  let promptFileMtime: string | null = null;
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
    const identityPath = path.resolve(clientRoot, 'identidade_visual.md');
    promptPaths = {
      clientRoot,
      promptJsonPath,
      promptMdPath,
      promptV1Path,
      promptV2Path,
      promptV3Path,
      identityPath,
    };

    const [rawPromptJson, rawPromptMd, rawV1, rawV2, rawV3, jsonStat, mdStat] = await Promise.all([
      safeReadFile(promptJsonPath),
      safeReadFile(promptMdPath),
      safeReadFile(promptV1Path),
      safeReadFile(promptV2Path),
      safeReadFile(promptV3Path),
      safeStat(promptJsonPath),
      safeStat(promptMdPath),
    ]);

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
      latest: promptLatest,
      revisions: deal.promptRevisions,
      promptSource,
      promptPaths,
      promptFileMtime,
      variantPromptsResolved,
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
