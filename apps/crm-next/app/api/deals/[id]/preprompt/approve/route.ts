import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { buildOrgSlug, buildVsCodeLinks, ensureProjectFolder, resolveProjectPath } from '@/lib/site24h';

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
        },
      });

      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Aprovação de pré-prompt disponível somente para hospedagem');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Deal ainda não fechado para operação');
      if (!deal.organizationId) throw new Error('Deal sem organização vinculada');

      const orgSlug = buildOrgSlug(deal.organization?.legalName, deal.organizationId);
      const projectPath = resolveProjectPath(orgSlug);
      await ensureProjectFolder(projectPath);

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
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        revisionId: revision.id,
        version: revision.version,
        projectPath,
        promptFile,
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

