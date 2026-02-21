import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { ensureSite24hOperationSchema, getTemplateModelByCode } from '@/lib/site24h-operation';
import {
  buildOrgSlug,
  buildPreviewUrl,
  buildVsCodeLinks,
  ensureProjectFolder,
  hashTemplateFile,
  resolveProjectPath,
} from '@/lib/site24h';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;
  await ensureSite24hOperationSchema();

  const body = await req.json().catch(() => ({}));
  const templateModelCode = String(body.templateModelCode || '').trim().toLowerCase() || null;
  const selectedModel = await getTemplateModelByCode(templateModelCode);
  const defaultEntry = selectedModel?.entryFile || 'index.html';
  const entryFile = String(body.entryFile || defaultEntry).replace(/^\/+/, '').trim() || defaultEntry;
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
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Template V1 disponível somente para hospedagem');
      if (!deal.organizationId) throw new Error('Deal sem organização vinculada');

      const orgSlug = buildOrgSlug(deal.organization?.legalName, deal.organizationId);
      const projectPath = deal.templateRevisions[0]?.projectPath || resolveProjectPath(orgSlug);
      await ensureProjectFolder(projectPath);

      let sourceHash = incomingHash || null;
      if (!sourceHash) {
        try {
          sourceHash = await hashTemplateFile(projectPath, entryFile);
        } catch {
          sourceHash = null;
        }
      }

      const previewUrl = buildPreviewUrl(orgSlug, entryFile);
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
          content: `Template revision v${revision.version} registrada.`,
          metadata: {
            revisionId: revision.id,
            projectPath,
            templateModelCode: selectedModel?.code || null,
            templateModelName: selectedModel?.name || null,
            templateModelRoot: selectedModel?.rootPath || null,
            entryFile,
            previewUrl,
            sourceHash,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        revision,
        projectPath,
      };
    });

    return NextResponse.json({
      ok: true,
      revision: payload.revision,
      templateModel: selectedModel,
      vscode: buildVsCodeLinks(payload.projectPath),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao registrar template', details: String(error) }, { status: 500 });
  }
}
