import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { ensureApiAuth } from '@/lib/api-auth';
import { buildOrgSlug } from '@/lib/site24h';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { getDealRelease } from '@/lib/site24h-release';

function resolveVariantDrafts(promptText: string, promptJson: unknown): Record<'V1' | 'V2' | 'V3', string> {
  const fallback = promptText || '';
  const map = {
    V1: fallback,
    V2: fallback,
    V3: fallback,
  } as Record<'V1' | 'V2' | 'V3', string>;

  if (promptJson && typeof promptJson === 'object') {
    const variantPrompts = (promptJson as { variant_prompts?: Record<string, unknown> }).variant_prompts;
    if (variantPrompts && typeof variantPrompts === 'object') {
      for (const code of ['V1', 'V2', 'V3'] as const) {
        const candidate = variantPrompts[code];
        if (typeof candidate === 'string' && candidate.trim()) {
          map[code] = candidate;
        }
      }
    }
  }

  return map;
}

async function atomicWrite(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
}

function buildIdentityMarkdownFromPromptJson(promptJson: unknown, organizationName: string) {
  const payload = (promptJson && typeof promptJson === 'object' ? promptJson : {}) as Record<string, unknown>;
  const business = (payload.business && typeof payload.business === 'object' ? payload.business : {}) as Record<string, unknown>;
  const style = (payload.style && typeof payload.style === 'object' ? payload.style : {}) as Record<string, unknown>;
  const identity = (payload.identity && typeof payload.identity === 'object' ? payload.identity : {}) as Record<string, unknown>;
  const content = (payload.content && typeof payload.content === 'object' ? payload.content : {}) as Record<string, unknown>;
  const assets = (payload.assets && typeof payload.assets === 'object' ? payload.assets : {}) as Record<string, unknown>;

  const objective = String(business.objetivo_principal || business.objective || 'nao informado');
  const audience = String(business.publico_alvo || business.audience || 'nao informado');
  const tone = String(style.tom_voz || style.tone_of_voice || 'nao informado');
  const cta = String(style.cta_principal || style.cta_text || 'Fale conosco');
  const palette = String(identity.paleta_cores || style.paleta_cores || style.color_palette || 'nao informado');
  const logoStatus = String(assets.logo_status || (identity.possui_logo ? 'received' : 'missing'));
  const manualStatus = String(assets.manual_status || (identity.possui_manual_marca ? 'received' : 'missing'));
  const contentStatus = String(assets.content_status || content.status_conteudo || 'nao informado');

  return [
    '# Identidade Visual - Site24h',
    '',
    `- Cliente: **${organizationName || 'Cliente'}**`,
    `- Atualizado em: **${new Date().toISOString()}**`,
    '',
    '## Diretrizes principais',
    `- Paleta de cores: **${palette}**`,
    `- Tom de voz: **${tone}**`,
    `- CTA principal: **${cta}**`,
    '',
    '## Contexto de negocio',
    `- Objetivo principal: ${objective}`,
    `- Publico-alvo: ${audience}`,
    '',
    '## Status de assets',
    `- Logo: **${logoStatus}**`,
    `- Manual de marca: **${manualStatus}**`,
    `- Conteudo (textos/imagens): **${contentStatus}**`,
    '',
    '## Regras de aplicacao visual',
    '- Aplicar identidade em header/footer de todas as variantes.',
    '- Preservar contraste AA para textos e CTAs.',
    '- Manter responsividade desktop/mobile sem alterar estrutura base.',
    '',
  ].join('\n');
}

function resolveClientRootFromRelease(projectRoot: string, orgSlug: string) {
  const normalized = String(projectRoot || '').replace(/\\/g, '/');
  const marker = '/releases/';
  const idx = normalized.indexOf(marker);
  if (idx > 0) return normalized.slice(0, idx);
  if (normalized.trim()) return normalized;
  return path.resolve('/home/server/projects/clientes', orgSlug);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const promptText = String(body.promptText || '').trim();
  const promptJson = body.promptJson ?? null;
  if (!promptText) {
    return NextResponse.json({ error: 'Prompt é obrigatório para salvar rascunho.' }, { status: 422 });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          dealType: true,
          lifecycleStatus: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              legalName: true,
            },
          },
        },
      });
      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Pré-prompt disponível somente para hospedagem');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Deal ainda não está fechado para operação');

      const latest = await tx.dealPromptRevision.findFirst({
        where: { dealId: deal.id },
        orderBy: { version: 'desc' },
      });

      const revision = latest && latest.status !== 'APPROVED'
        ? await tx.dealPromptRevision.update({
            where: { id: latest.id },
            data: {
              promptText,
              promptJson: promptJson as never,
              status: 'DRAFT',
              updatedAt: new Date(),
            },
          })
        : await tx.dealPromptRevision.create({
            data: {
              dealId: deal.id,
              version: (latest?.version || 0) + 1,
              promptText,
              promptJson: promptJson as never,
              status: 'DRAFT',
              createdBy: 'ADMIN',
            },
          });

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'pre_prompt');
      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PREPROMPT_DRAFT_SAVED',
          content: `Rascunho do pré-prompt salvo (v${revision.version}).`,
          metadata: { revisionId: revision.id },
          createdBy: 'ADMIN',
        },
      });

      return {
        dealId: deal.id,
        organizationId: deal.organizationId,
        organizationName: deal.organization?.legalName || '',
        revisionId: revision.id,
        version: revision.version,
      };
    });

    let draftsPathClientRoot: string | null = null;
    let identityPathClientRoot: string | null = null;
    let fileWarning: string | null = null;
    const savedFiles: string[] = [];
    let identityUpdated = false;
    try {
      const release = await getDealRelease(out.dealId, null);
      const orgSlug = buildOrgSlug(out.organizationName, out.organizationId || out.dealId);
      const projectRoot = release?.project_root || path.resolve('/home/server/projects/clientes', orgSlug, 'releases', 'v1');
      const clientRoot = resolveClientRootFromRelease(projectRoot, orgSlug);
      const variants = resolveVariantDrafts(promptText, promptJson);

      draftsPathClientRoot = clientRoot;

      const releaseFiles: Array<[string, string]> = [
        [path.resolve(clientRoot, 'prompt_v1_draft.md'), variants.V1],
        [path.resolve(clientRoot, 'prompt_v2_draft.md'), variants.V2],
        [path.resolve(clientRoot, 'prompt_v3_draft.md'), variants.V3],
        [path.resolve(clientRoot, 'prompt_personalizacao.md'), promptText],
        [path.resolve(clientRoot, 'prompt_drafts.json'), JSON.stringify(
          {
            savedAt: new Date().toISOString(),
            version: out.version,
            variants,
          },
          null,
          2,
        )],
        [path.resolve(clientRoot, 'prompt_personalizacao.json'), JSON.stringify(
          {
            savedAt: new Date().toISOString(),
            version: out.version,
            variant_prompts: variants,
            prompt_json: promptJson,
          },
          null,
          2,
        )],
      ];
      for (const [target, content] of releaseFiles) {
        await atomicWrite(target, content);
        savedFiles.push(target);
      }

      const identityMd = buildIdentityMarkdownFromPromptJson(promptJson, out.organizationName || 'Cliente');
      identityPathClientRoot = path.resolve(clientRoot, 'identidade_visual.md');
      await atomicWrite(identityPathClientRoot, identityMd);
      savedFiles.push(identityPathClientRoot);
      identityUpdated = true;

    } catch (error) {
      fileWarning = `Rascunho salvo no CRM, mas falhou ao persistir arquivos: ${String(error)}`;
      await prisma.dealActivity.create({
        data: {
          dealId: out.dealId,
          activityType: 'FLOW_WARNING',
          content: 'Falha parcial ao persistir arquivos de pré-prompt no filesystem.',
          metadata: {
            warning: fileWarning,
          },
          createdBy: 'SYSTEM',
        },
      }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      ...out,
      draftsPathClientRoot,
      identityPathClientRoot,
      // Deprecated: manter por 1 versão para compatibilidade.
      draftsPathRelease: draftsPathClientRoot,
      identityPathRelease: identityPathClientRoot,
      identityUpdated,
      savedFiles,
      paths: {
        release: draftsPathClientRoot,
        clientRoot: draftsPathClientRoot,
      },
      fileWarning,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao salvar rascunho do pré-prompt', details: String(error) }, { status: 500 });
  }
}
