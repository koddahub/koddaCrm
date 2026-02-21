import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { buildOrgSlug, buildVsCodeLinks, ensureProjectFolder, resolveProjectPath } from '@/lib/site24h';
import { getTemplateModelByCode, sanitizeTemplateRootPath } from '@/lib/site24h-operation';

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

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDirSafe(dirPath: string) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function timestampTag(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

async function backupProjectFolder(projectPath: string) {
  const entries = await listDirSafe(projectPath);
  const backupName = `_backup_${timestampTag()}`;
  const backupPath = path.resolve(projectPath, backupName);
  let moved = 0;
  await fs.mkdir(backupPath, { recursive: true });
  for (const entry of entries) {
    if (entry.name === backupName || entry.name.startsWith('_backup_')) continue;
    const from = path.resolve(projectPath, entry.name);
    const to = path.resolve(backupPath, entry.name);
    await fs.rename(from, to);
    moved += 1;
  }
  if (moved === 0) {
    await fs.rm(backupPath, { recursive: true, force: true });
    return null;
  }
  return backupPath;
}

async function copyTemplateToProject(templateRootPath: string, projectPath: string) {
  const sourceEntries = await fs.readdir(templateRootPath, { withFileTypes: true });
  for (const entry of sourceEntries) {
    const sourcePath = path.resolve(templateRootPath, entry.name);
    const targetPath = path.resolve(projectPath, entry.name);
    await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
  }
}

async function applyTemplateToProject(params: {
  templateRootPath: string;
  templateEntryFile: string;
  projectPath: string;
  copyMode: CopyMode;
}) {
  const { templateRootPath, templateEntryFile, projectPath, copyMode } = params;
  await ensureProjectFolder(projectPath);
  const currentEntries = await listDirSafe(projectPath);
  const hasContent = currentEntries.length > 0;
  const currentEntryFile = path.resolve(projectPath, templateEntryFile.replace(/^\/+/, ''));
  const hasEntryFile = await pathExists(currentEntryFile);

  if (copyMode === 'if_empty_or_missing' && hasContent && hasEntryFile) {
    return {
      templateApplied: false,
      backupPath: null as string | null,
      reason: 'project_already_ready',
    };
  }

  let backupPath: string | null = null;
  if (copyMode === 'replace' && hasContent) {
    backupPath = await backupProjectFolder(projectPath);
  }

  await copyTemplateToProject(templateRootPath, projectPath);
  return {
    templateApplied: true,
    backupPath,
    reason: copyMode === 'replace' ? 'project_replaced' : (hasContent ? 'project_incomplete_repaired' : 'project_created'),
  };
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const promptTextInput = typeof body.promptText === 'string' ? body.promptText.trim() : '';
  const promptJsonInput = body.promptJson ?? null;
  const templateModelCode = typeof body.templateModelCode === 'string' ? body.templateModelCode.trim() : '';
  const copyMode: CopyMode = body.copyMode === 'replace' ? 'replace' : 'if_empty_or_missing';

  try {
    const templateModel = await getTemplateModelByCode(templateModelCode || null);
    if (!templateModel) {
      return NextResponse.json({ error: 'Modelo de template não encontrado no catálogo ativo.' }, { status: 422 });
    }
    const templateRootPath = sanitizeTemplateRootPath(templateModel.rootPath);

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
        },
      });

      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Aprovação de pré-prompt disponível somente para hospedagem');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Deal ainda não fechado para operação');
      if (!deal.organizationId) throw new Error('Deal sem organização vinculada');

      const orgSlug = buildOrgSlug(deal.organization?.legalName, deal.organizationId);
      const projectPath = resolveProjectPath(orgSlug);
      await ensureProjectFolder(projectPath);

      const templateSync = await applyTemplateToProject({
        templateRootPath,
        templateEntryFile: templateModel.entryFile || 'index.html',
        projectPath,
        copyMode,
      });

      const latestRevision = await tx.dealPromptRevision.findFirst({
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
        throw new Error('Prompt vazio. Salve o briefing ou edite o texto antes de aprovar.');
      }

      const revision = latestRevision && latestRevision.status !== 'APPROVED'
        ? await tx.dealPromptRevision.update({
            where: { id: latestRevision.id },
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
              version: (latestRevision?.version || 0) + 1,
              promptText,
              promptJson: promptJson as never,
              status: 'APPROVED',
              requestedNotes: null,
              createdBy: 'ADMIN',
            },
          });

      const promptFile = path.resolve(projectPath, `prompt_v${revision.version}.md`);
      await fs.writeFile(promptFile, promptText, 'utf8');

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'template_v1');

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PREPROMPT_APPROVED',
          content: `Pré-prompt aprovado (v${revision.version}) e pronto para Template V1.`,
          metadata: {
            revisionId: revision.id,
            promptFile,
            templateModelCode: templateModel.code,
            templateSourceRoot: templateRootPath,
            templateApplied: templateSync.templateApplied,
            templateCopyReason: templateSync.reason,
            templateBackupPath: templateSync.backupPath,
            copyModeUsed: copyMode,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        revisionId: revision.id,
        version: revision.version,
        projectPath,
        promptFile,
        templateApplied: templateSync.templateApplied,
        templateModel: {
          code: templateModel.code,
          name: templateModel.name,
          rootPath: templateRootPath,
          entryFile: templateModel.entryFile || 'index.html',
        },
        copyModeUsed: copyMode,
        templateBackupPath: templateSync.backupPath,
      };
    });

    return NextResponse.json({
      ok: true,
      ...result,
      vscode: buildVsCodeLinks(result.projectPath),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao aprovar pré-prompt', details: String(error) }, { status: 500 });
  }
}
