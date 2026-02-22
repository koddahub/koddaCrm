import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { buildOrgSlug, buildPreviewUrl, ensureProjectFolder, hashTemplateFile } from '@/lib/site24h';
import {
  ensureSiteReleaseSchema,
  normalizeReleaseVersion,
  normalizeVariantCode,
  resolveDealReleaseVariant,
  updateReleaseStatus,
  updateVariantStatus,
} from '@/lib/site24h-release';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;
  await ensureSiteReleaseSchema();

  const body = await req.json().catch(() => ({}));
  const variantInput = String(body.variantCode || '').trim();
  if (!variantInput) {
    return NextResponse.json({ error: 'variantCode é obrigatório (V1|V2|V3).' }, { status: 422 });
  }
  const variantCode = normalizeVariantCode(variantInput);
  const releaseVersion = normalizeReleaseVersion(body.releaseVersion);

  const incomingEntry = String(body.entryFile || '').replace(/^\/+/, '').trim();
  const incomingHash = typeof body.sourceHash === 'string' ? body.sourceHash.trim() : '';
  const desiredStatus = typeof body.status === 'string' ? body.status.trim().toUpperCase() : 'GENERATED';
  const status = ['GENERATED', 'IN_ADJUSTMENT', 'APPROVED_INTERNAL'].includes(desiredStatus) ? desiredStatus : 'GENERATED';

  try {
    const payload = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        include: {
          organization: {
            select: {
              id: true,
              legalName: true,
            },
          },
          templateRevisions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Template disponível somente para hospedagem');
      if (!deal.organizationId) throw new Error('Deal sem organização vinculada');

      const releaseVariant = await resolveDealReleaseVariant({
        dealId: deal.id,
        releaseVersion,
        variantCode,
      });
      if (!releaseVariant) {
        throw new Error('Nenhuma release/variante disponível. Envie briefing novo para provisionar V1/V2/V3.');
      }

      const orgSlug = buildOrgSlug(deal.organization?.legalName, deal.organizationId);
      const projectPath = releaseVariant.variant.folder_path;
      await ensureProjectFolder(projectPath);

      const entryFile = incomingEntry || releaseVariant.variant.entry_file || 'index.html';
      let sourceHash = incomingHash || null;
      if (!sourceHash) {
        try {
          sourceHash = await hashTemplateFile(projectPath, entryFile);
        } catch {
          sourceHash = null;
        }
      }

      const previewUrl = buildPreviewUrl(orgSlug, entryFile, {
        releaseVersion: releaseVariant.release.version,
        variantCode,
      });
      const nextVersion = (deal.templateRevisions[0]?.version || 0) + 1;

      const revision = await tx.dealTemplateRevision.create({
        data: {
          dealId: deal.id,
          version: nextVersion,
          projectPath,
          entryFile,
          previewUrl,
          sourceHash,
          status,
          generatedBy: 'ADMIN',
        },
      });

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, status === 'IN_ADJUSTMENT' ? 'ajustes' : 'template_v1');

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'TEMPLATE_REVISION_CREATED',
          content: `Template revision v${revision.version} registrada para ${variantCode} (${`v${releaseVariant.release.version}`}).`,
          metadata: {
            revisionId: revision.id,
            releaseId: releaseVariant.release.id,
            releaseVersion: releaseVariant.release.version,
            variantId: releaseVariant.variant.id,
            variantCode,
            projectPath,
            entryFile,
            previewUrl,
            sourceHash,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        revision,
        release: releaseVariant.release,
        variant: releaseVariant.variant,
      };
    });

    const variantStatus = status === 'APPROVED_INTERNAL' ? 'APPROVED_INTERNAL' : (status === 'IN_ADJUSTMENT' ? 'IN_ADJUSTMENT' : 'BASE_PREPARED');
    await updateVariantStatus(payload.variant.id, variantStatus);
    await updateReleaseStatus(payload.release.id, status === 'APPROVED_INTERNAL' ? 'IN_REVIEW' : 'READY');

    return NextResponse.json({
      ok: true,
      revision: payload.revision,
      release: {
        id: payload.release.id,
        version: payload.release.version,
        label: `v${payload.release.version}`,
      },
      variant: {
        id: payload.variant.id,
        variantCode,
        folderPath: payload.variant.folder_path,
        entryFile: payload.revision.entryFile,
        previewUrl: payload.revision.previewUrl,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao registrar template', details: String(error) }, { status: 500 });
  }
}
