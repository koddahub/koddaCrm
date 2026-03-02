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
  const pick = (obj: Record<string, unknown>, keys: string[], fallback = 'nao informado') => {
    for (const key of keys) {
      const value = obj[key];
      if (value === undefined || value === null) continue;
      const str = String(value).trim();
      if (str) return str;
    }
    return fallback;
  };
  const payload = (promptJson && typeof promptJson === 'object' ? promptJson : {}) as Record<string, unknown>;
  const business = (payload.business && typeof payload.business === 'object' ? payload.business : {}) as Record<string, unknown>;
  const style = (payload.style && typeof payload.style === 'object' ? payload.style : {}) as Record<string, unknown>;
  const identity = (payload.identity && typeof payload.identity === 'object' ? payload.identity : {}) as Record<string, unknown>;
  const content = (payload.content && typeof payload.content === 'object' ? payload.content : {}) as Record<string, unknown>;
  const assets = (payload.assets && typeof payload.assets === 'object' ? payload.assets : {}) as Record<string, unknown>;

  const objective = pick(business, ['objetivo_principal', 'objective']);
  const audience = pick(business, ['publico_alvo', 'audience']);
  const tone = pick(style, ['tom_voz', 'tone_of_voice', 'toneOfVoice'], pick(identity, ['tone_of_voice', 'toneOfVoice']));
  const cta = pick(style, ['cta_principal', 'cta_text', 'cta'], 'Fale conosco');

  const identityPalette = identity.colorPalette;
  const paletteFromArray = Array.isArray(identityPalette)
    ? identityPalette.map((item) => String(item || '').trim()).filter(Boolean).join(', ')
    : '';
  const palette = pick(
    {
      paletteFromArray,
      paleta_cores: identity.paleta_cores,
      color_palette: style.color_palette,
      style_paleta_cores: style.paleta_cores,
      identity_colorPaletteRaw: identity.colorPaletteRaw,
    } as Record<string, unknown>,
    ['paletteFromArray', 'paleta_cores', 'style_paleta_cores', 'color_palette', 'identity_colorPaletteRaw'],
  );

  const logoStatus = pick(
    assets,
    ['logo_status', 'logoStatus'],
    identity.possui_logo || identity.logoStatus === 'received' ? 'received' : 'missing',
  );
  const manualStatus = pick(
    assets,
    ['manual_status', 'manualStatus'],
    identity.possui_manual_marca || identity.manualStatus === 'received' ? 'received' : 'missing',
  );
  const contentStatus = pick(assets, ['content_status', 'contentStatus'], pick(content, ['status_conteudo', 'statusConteudo']));

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

function pickNonEmpty(...values: Array<unknown>) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function normalizeOptionalArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch {
      // keep split fallback below
    }
    return trimmed.split(/\r?\n|,/g).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function hydratePromptJsonWithBrief(promptJson: unknown, brief: Record<string, unknown> | null) {
  const payload = (promptJson && typeof promptJson === 'object' ? promptJson : {}) as Record<string, unknown>;
  if (!brief) return payload;

  const business = (payload.business && typeof payload.business === 'object' ? payload.business : {}) as Record<string, unknown>;
  const style = (payload.style && typeof payload.style === 'object' ? payload.style : {}) as Record<string, unknown>;
  const identity = (payload.identity && typeof payload.identity === 'object' ? payload.identity : {}) as Record<string, unknown>;
  const site = (payload.site && typeof payload.site === 'object' ? payload.site : {}) as Record<string, unknown>;

  const nextBusiness = {
    ...business,
    objective: pickNonEmpty(business.objective, brief.objective),
    audience: pickNonEmpty(business.audience, brief.audience),
    differentials: pickNonEmpty(business.differentials, brief.differentials),
    services: pickNonEmpty(business.services, brief.services),
    integrations: pickNonEmpty(business.integrations, brief.integrations),
    domainTarget: pickNonEmpty(business.domainTarget, brief.domain_target),
    extraRequirements: pickNonEmpty(business.extraRequirements, brief.extra_requirements),
    legalContent: pickNonEmpty(business.legalContent, brief.legal_content),
    visualReferences: pickNonEmpty(business.visualReferences, brief.visual_references),
  };

  const nextStyle = {
    ...style,
    toneOfVoice: pickNonEmpty(style.toneOfVoice, brief.tone_of_voice),
    cta: pickNonEmpty(style.cta, brief.cta_text, 'Fale conosco'),
  };

  const paletteArray = normalizeOptionalArray(identity.colorPalette || brief.color_palette);
  const nextIdentity = {
    ...identity,
    toneOfVoice: pickNonEmpty(identity.toneOfVoice, brief.tone_of_voice),
    colorPalette: paletteArray.length > 0 ? paletteArray : identity.colorPalette,
    colorPaletteRaw: pickNonEmpty(identity.colorPaletteRaw, brief.color_palette),
  };

  const nextSite = {
    ...site,
    sections: Array.isArray(site.sections) && site.sections.length > 0
      ? site.sections
      : ['Hero', 'Sobre', 'Serviços', 'Diferenciais', 'Contato', 'FAQ', 'Rodapé'],
  };

  return {
    ...payload,
    business: nextBusiness,
    style: nextStyle,
    identity: nextIdentity,
    site: nextSite,
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const projectId = String(body.projectId || body.project_id || '').trim();
  const promptText = String(body.promptText || '').trim();
  const promptJson = body.promptJson ?? null;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId é obrigatório para salvar o pré-prompt.' }, { status: 422 });
  }
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
      const ownedProject = deal.organizationId
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id::text
            FROM client.projects
            WHERE id = ${projectId}::uuid
              AND organization_id = ${deal.organizationId}::uuid
            LIMIT 1
          `
        : [];
      if (!ownedProject[0]?.id) throw new Error('Projeto inválido para este cliente');

      const latest = await tx.dealPromptRevision.findFirst({
        where: { dealId: deal.id },
        orderBy: { version: 'desc' },
      });
      const latestBriefRows = deal.organizationId
        ? await tx.$queryRaw<Array<Record<string, unknown>>>`
            SELECT *
            FROM client.project_briefs
            WHERE organization_id = CAST(${deal.organizationId} AS uuid)
              AND project_id = CAST(${projectId} AS uuid)
            ORDER BY created_at DESC
            LIMIT 1
          `
        : [];
      const latestBrief = latestBriefRows[0] || null;
      const hydratedPromptJson = hydratePromptJsonWithBrief(
        promptJson,
        latestBrief,
      );

      const revision = latest && latest.status !== 'APPROVED'
        ? await tx.dealPromptRevision.update({
            where: { id: latest.id },
            data: {
              promptText,
              promptJson: hydratedPromptJson as never,
              status: 'DRAFT',
              updatedAt: new Date(),
            },
          })
        : await tx.dealPromptRevision.create({
            data: {
              dealId: deal.id,
              version: (latest?.version || 0) + 1,
              promptText,
              promptJson: hydratedPromptJson as never,
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
          metadata: {
            revisionId: revision.id,
            project_id: projectId,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        dealId: deal.id,
        organizationId: deal.organizationId,
        organizationName: deal.organization?.legalName || '',
        projectId,
        revisionId: revision.id,
        version: revision.version,
        promptJsonHydrated: hydratedPromptJson,
      };
    });

    let draftsPathClientRoot: string | null = null;
    let identityPathClientRoot: string | null = null;
    let masterPromptPath: string | null = null;
    let fileWarning: string | null = null;
    const savedFiles: string[] = [];
    let identityUpdated = false;
    try {
      const release = await getDealRelease(out.dealId, null, out.projectId);
      const orgSlug = buildOrgSlug(out.organizationName, out.organizationId || out.dealId);
      const projectRoot = release?.project_root || path.resolve('/home/server/projects/clientes', orgSlug, 'releases', 'v1');
      const clientRoot = resolveClientRootFromRelease(projectRoot, orgSlug);
      const variants = resolveVariantDrafts(promptText, out.promptJsonHydrated);

      draftsPathClientRoot = clientRoot;
      masterPromptPath = path.resolve(clientRoot, 'prompt_pai_orquestrador.md');

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
            prompt_json: out.promptJsonHydrated,
          },
          null,
          2,
        )],
      ];
      for (const [target, content] of releaseFiles) {
        await atomicWrite(target, content);
        savedFiles.push(target);
      }

      const identityMd = buildIdentityMarkdownFromPromptJson(out.promptJsonHydrated, out.organizationName || 'Cliente');
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
            project_id: out.projectId,
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
      masterPromptPath,
      masterPromptLocked: true,
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
