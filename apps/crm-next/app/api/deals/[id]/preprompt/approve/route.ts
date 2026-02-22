import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { buildOrgSlug } from '@/lib/site24h';
import {
  ensureReleaseVariantsPrepared,
  getDealRelease,
  normalizeReleaseVersion,
} from '@/lib/site24h-release';

type CopyMode = 'if_empty_or_missing' | 'replace';

async function latestPromptFromPortal(organizationId: string) {
  const rows = await prisma.$queryRaw<Array<{ prompt_text: string | null; prompt_json: unknown }>>`
    SELECT ap.prompt_text, ap.prompt_json
    FROM client.ai_prompts ap
    JOIN client.project_briefs pb ON pb.id = ap.brief_id
    WHERE pb.organization_id = ${organizationId}::uuid
    ORDER BY ap.created_at DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const promptTextInput = typeof body.promptText === 'string' ? body.promptText.trim() : '';
  const promptJsonInput = body.promptJson ?? null;
  const copyMode: CopyMode = body.copyMode === 'replace' ? 'replace' : 'if_empty_or_missing';
  const releaseVersion = normalizeReleaseVersion(body.releaseVersion);

  try {
    const deal = await prisma.deal.findUnique({
      where: { id: params.id },
      include: {
        organization: {
          select: {
            id: true,
            legalName: true,
          },
        },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
    }
    if (deal.dealType !== 'HOSPEDAGEM') {
      return NextResponse.json({ error: 'Aprovação de pré-prompt disponível somente para hospedagem' }, { status: 422 });
    }
    if (deal.lifecycleStatus !== 'CLIENT') {
      return NextResponse.json({ error: 'Deal ainda não fechado para operação' }, { status: 422 });
    }
    if (!deal.organizationId) {
      return NextResponse.json({ error: 'Deal sem organização vinculada' }, { status: 422 });
    }

    const orgSlug = buildOrgSlug(deal.organization?.legalName, deal.organizationId);
    const prepared = await ensureReleaseVariantsPrepared({
      dealId: deal.id,
      releaseVersion,
      copyMode,
      orgSlug,
    });

    const release = await getDealRelease(deal.id, prepared.releaseVersion);
    if (!release) {
      return NextResponse.json({ error: 'Release não encontrada para aprovação de pré-prompt.' }, { status: 422 });
    }

    const assetRows = await prisma.$queryRaw<Array<{ asset_type: string; total: bigint | number }>>`
      SELECT asset_type, count(*)::bigint AS total
      FROM crm.deal_prompt_asset
      WHERE release_id = ${release.id}::uuid
      GROUP BY asset_type
    `;
    const assetCounts = new Map<string, number>();
    for (const row of assetRows) {
      assetCounts.set(String(row.asset_type || '').toLowerCase(), Number(row.total || 0));
    }
    const missing: string[] = [];
    if ((assetCounts.get('logo') || 0) <= 0) {
      missing.push('logo');
    }
    if ((assetCounts.get('manual') || 0) <= 0) {
      missing.push('manual de marca');
    }
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'Aprovação bloqueada por pendências de assets obrigatórios.',
          error_code: 'PREPROMPT_REQUIRED_ASSETS_MISSING',
          action_hint: 'Anexe logo e manual de marca antes de aprovar o pré-prompt.',
          missing_assets: missing,
          release: {
            id: release.id,
            version: release.version,
            label: prepared.releaseLabel,
            assetsPath: release.assets_path,
          },
        },
        { status: 422 },
      );
    }

    const latestRevision = await prisma.dealPromptRevision.findFirst({
      where: { dealId: deal.id },
      orderBy: { version: 'desc' },
    });

    let promptText = promptTextInput || latestRevision?.promptText || '';
    let promptJson: unknown = promptJsonInput ?? latestRevision?.promptJson ?? null;

    if (!promptText) {
      const portalPrompt = await latestPromptFromPortal(deal.organizationId);
      promptText = String(portalPrompt?.prompt_text || '');
      promptJson = portalPrompt?.prompt_json || null;
    }

    if (!promptText) {
      return NextResponse.json({ error: 'Prompt vazio. Salve o briefing ou edite o texto antes de aprovar.' }, { status: 422 });
    }

    const revision = await prisma.$transaction(async (tx) => {
      const current = await tx.dealPromptRevision.findFirst({
        where: { dealId: deal.id },
        orderBy: { version: 'desc' },
      });

      const next = current && current.status !== 'APPROVED'
        ? await tx.dealPromptRevision.update({
            where: { id: current.id },
            data: {
              promptText,
              promptJson: promptJson as never,
              status: 'APPROVED',
              requestedNotes: null,
              updatedAt: new Date(),
            },
          })
        : await tx.dealPromptRevision.create({
            data: {
              dealId: deal.id,
              version: (current?.version || 0) + 1,
              promptText,
              promptJson: promptJson as never,
              status: 'APPROVED',
              requestedNotes: null,
              createdBy: 'ADMIN',
            },
          });

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'template_v1');

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PREPROMPT_APPROVED',
          content: `Pré-prompt aprovado (v${next.version}) com release ${prepared.releaseLabel}.`,
          metadata: {
            revisionId: next.id,
            releaseId: release.id,
            releaseVersion: release.version,
            releaseLabel: prepared.releaseLabel,
            templateAppliedAllVariants: prepared.applied,
            copyModeUsed: copyMode,
            backups: prepared.backups,
          },
          createdBy: 'ADMIN',
        },
      });

      return next;
    });

    const releaseRootNormalized = String(release.project_root || '').replace(/\\/g, '/');
    const releasesMarker = '/releases/';
    const releaseMarkerIndex = releaseRootNormalized.indexOf(releasesMarker);
    const clientRoot = releaseMarkerIndex > 0
      ? releaseRootNormalized.slice(0, releaseMarkerIndex)
      : releaseRootNormalized || path.resolve('/home/server/projects/clientes', orgSlug);

    const promptVersionPath = path.resolve(clientRoot, `prompt_v${revision.version}.md`);
    const promptMdPath = path.resolve(clientRoot, 'prompt_personalizacao.md');
    const promptJsonPath = path.resolve(clientRoot, 'prompt_personalizacao.json');

    await fs.mkdir(clientRoot, { recursive: true });
    await fs.writeFile(promptVersionPath, promptText, 'utf8');
    await fs.writeFile(promptMdPath, promptText, 'utf8');
    await fs.writeFile(
      promptJsonPath,
      JSON.stringify(
        {
          releaseVersion: release.version,
          releaseLabel: prepared.releaseLabel,
          variantInstructions: prepared.variants.map((item) => ({
            variantCode: item.variant_code,
            folderPath: item.folder_path,
            entryFile: item.entry_file,
          })),
          promptJson,
        },
        null,
        2,
      ),
      'utf8',
    );

    await prisma.$executeRaw`
      UPDATE crm.deal_site_release
      SET status = 'READY', prompt_md_path = ${promptMdPath}, prompt_json_path = ${promptJsonPath}, updated_at = now()
      WHERE id = ${release.id}::uuid
    `;

    return NextResponse.json({
      ok: true,
      revisionId: revision.id,
      version: revision.version,
      release: {
        id: release.id,
        version: release.version,
        label: prepared.releaseLabel,
        status: 'READY',
        projectRoot: release.project_root,
        assetsPath: release.assets_path,
        promptMdPath,
        promptJsonPath,
      },
      templateApplied: prepared.applied,
      templateAppliedAllVariants: prepared.applied,
      templateModel: null,
      copyModeUsed: copyMode,
      templateBackupPaths: prepared.backups,
      variants: prepared.variants.map((item) => ({
        id: item.id,
        variantCode: item.variant_code,
        folderPath: item.folder_path,
        entryFile: item.entry_file,
        previewUrl: item.preview_url,
      })),
      paths: {
        releaseRoot: release.project_root,
        clientRoot,
        promptVersionPath,
        promptMdPath,
        promptJsonPath,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao aprovar pré-prompt', details: String(error) }, { status: 500 });
  }
}
