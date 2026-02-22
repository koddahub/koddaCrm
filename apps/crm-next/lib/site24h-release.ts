import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { buildPreviewUrl } from '@/lib/site24h';
import { getTemplateModelByCode } from '@/lib/site24h-operation';

export type SiteVariantCode = 'V1' | 'V2' | 'V3';

export const SITE_VARIANTS: SiteVariantCode[] = ['V1', 'V2', 'V3'];

export function normalizeVariantCode(input: unknown): SiteVariantCode {
  const value = String(input || '').trim().toUpperCase();
  if (value === 'V2') return 'V2';
  if (value === 'V3') return 'V3';
  return 'V1';
}

export function normalizeReleaseVersion(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw.startsWith('v') ? raw.slice(1) : raw;
  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

export function variantFolderName(code: SiteVariantCode): string {
  if (code === 'V2') return 'modelo_v2';
  if (code === 'V3') return 'modelo_v3';
  return 'modelo_v1';
}

export function variantCodeFromFolder(folder: string): SiteVariantCode {
  const normalized = String(folder || '').toLowerCase();
  if (normalized === 'modelo_v2' || normalized === 'v2') return 'V2';
  if (normalized === 'modelo_v3' || normalized === 'v3') return 'V3';
  return 'V1';
}

export function parseReleaseVariantFromPath(projectPath: string): {
  releaseVersion: number | null;
  releaseLabel: string | null;
  variantCode: SiteVariantCode | null;
} {
  const normalized = String(projectPath || '').replace(/\\/g, '/');
  const releaseMatch = normalized.match(/\/releases\/v(\d+)(?:\/|$)/i);
  const folderMatch = normalized.match(/\/(modelo_v[123])(?:\/|$)/i);
  const releaseVersion = releaseMatch ? Number.parseInt(releaseMatch[1], 10) : null;
  const releaseLabel = releaseVersion ? `v${releaseVersion}` : null;
  const variantCode = folderMatch ? variantCodeFromFolder(folderMatch[1]) : null;
  return { releaseVersion, releaseLabel, variantCode };
}

export async function ensureSiteReleaseSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_site_release (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      version INT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      project_root VARCHAR(500) NOT NULL,
      assets_path VARCHAR(500) NOT NULL,
      prompt_md_path VARCHAR(500),
      prompt_json_path VARCHAR(500),
      created_by VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (deal_id, version)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
      ON crm.deal_site_release(deal_id, version DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_status
      ON crm.deal_site_release(deal_id, status)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_site_variant (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      variant_code VARCHAR(10) NOT NULL,
      folder_path VARCHAR(500) NOT NULL,
      entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
      preview_url VARCHAR(500),
      source_hash VARCHAR(128),
      status VARCHAR(40) NOT NULL DEFAULT 'BASE_PREPARED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (release_id, variant_code)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_variant_release_status
      ON crm.deal_site_variant(release_id, status)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      asset_type VARCHAR(40) NOT NULL,
      original_path VARCHAR(500) NOT NULL,
      release_path VARCHAR(500) NOT NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_asset_release_type
      ON crm.deal_prompt_asset(release_id, asset_type)
  `);
}

export type DealSiteReleaseRow = {
  id: string;
  deal_id: string;
  version: number;
  status: string;
  project_root: string;
  assets_path: string;
  prompt_md_path: string | null;
  prompt_json_path: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type DealSiteVariantRow = {
  id: string;
  release_id: string;
  variant_code: SiteVariantCode;
  folder_path: string;
  entry_file: string;
  preview_url: string | null;
  source_hash: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export async function listDealSiteReleases(dealId: string): Promise<Array<DealSiteReleaseRow & { variants: DealSiteVariantRow[] }>> {
  await ensureSiteReleaseSchema();

  const releaseRows = await prisma.$queryRaw<Array<DealSiteReleaseRow>>`
    SELECT
      id::text,
      deal_id::text,
      version,
      status,
      project_root,
      assets_path,
      prompt_md_path,
      prompt_json_path,
      created_by,
      created_at,
      updated_at
    FROM crm.deal_site_release
    WHERE deal_id = ${dealId}::uuid
    ORDER BY version DESC
  `;

  if (releaseRows.length === 0) return [];

  const variants = await prisma.$queryRaw<Array<DealSiteVariantRow>>`
    SELECT
      id::text,
      release_id::text,
      UPPER(variant_code)::text AS variant_code,
      folder_path,
      entry_file,
      preview_url,
      source_hash,
      status,
      created_at,
      updated_at
    FROM crm.deal_site_variant
    WHERE release_id IN (
      SELECT id
      FROM crm.deal_site_release
      WHERE deal_id = ${dealId}::uuid
    )
    ORDER BY created_at ASC
  `;

  const byRelease = new Map<string, DealSiteVariantRow[]>();
  for (const variant of variants) {
    const arr = byRelease.get(variant.release_id) || [];
    arr.push({
      ...variant,
      variant_code: normalizeVariantCode(variant.variant_code),
    });
    byRelease.set(variant.release_id, arr);
  }

  return releaseRows.map((release) => ({
    ...release,
    variants: (byRelease.get(release.id) || []).sort((a, b) => a.variant_code.localeCompare(b.variant_code)),
  }));
}

export async function getDealRelease(dealId: string, releaseVersion?: number | null): Promise<(DealSiteReleaseRow & { variants: DealSiteVariantRow[] }) | null> {
  const releases = await listDealSiteReleases(dealId);
  if (releases.length === 0) return null;
  if (!releaseVersion) return releases[0];
  return releases.find((item) => item.version === releaseVersion) || null;
}

export async function resolveDealReleaseVariant(params: {
  dealId: string;
  releaseVersion?: number | null;
  variantCode?: SiteVariantCode | null;
}): Promise<{ release: DealSiteReleaseRow & { variants: DealSiteVariantRow[] }; variant: DealSiteVariantRow } | null> {
  const variantCode = params.variantCode || 'V1';
  const release = await getDealRelease(params.dealId, params.releaseVersion || null);
  if (!release) return null;
  const variant = release.variants.find((item) => item.variant_code === variantCode) || release.variants.find((item) => item.variant_code === 'V1') || release.variants[0];
  if (!variant) return null;
  return { release, variant };
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function dirEntries(targetPath: string) {
  try {
    return await fs.readdir(targetPath);
  } catch {
    return [];
  }
}

async function backupFolder(folderPath: string) {
  const entries = await dirEntries(folderPath);
  if (entries.length === 0) return null;
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const backupPath = path.resolve(folderPath, `_backup_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`);
  await fs.mkdir(backupPath, { recursive: true });
  let moved = 0;
  for (const entry of entries) {
    if (entry.startsWith('_backup_')) continue;
    const from = path.resolve(folderPath, entry);
    const to = path.resolve(backupPath, entry);
    await fs.rename(from, to);
    moved += 1;
  }
  if (!moved) {
    await fs.rm(backupPath, { recursive: true, force: true });
    return null;
  }
  return backupPath;
}

function templateCodeForVariant(variantCode: SiteVariantCode) {
  if (variantCode === 'V2') return 'template_v2_institucional_3paginas';
  if (variantCode === 'V3') return 'template_v3_institucional_chatbot';
  return 'template_v1_institucional_1pagina';
}

export async function ensureReleaseVariantsPrepared(params: {
  dealId: string;
  releaseVersion?: number | null;
  copyMode: 'if_empty_or_missing' | 'replace';
  orgSlug: string;
}): Promise<{ releaseVersion: number; releaseLabel: string; applied: boolean; backups: string[]; variants: DealSiteVariantRow[] }> {
  await ensureSiteReleaseSchema();

  const resolved = await resolveDealReleaseVariant({
    dealId: params.dealId,
    releaseVersion: params.releaseVersion || null,
    variantCode: 'V1',
  });
  if (!resolved) {
    throw new Error('Nenhuma release encontrada para este deal. Envie um novo briefing para provisionar a release.');
  }

  const release = resolved.release;
  const backups: string[] = [];
  let applied = false;

  for (const variantCode of SITE_VARIANTS) {
    const variant = release.variants.find((row) => row.variant_code === variantCode);
    if (!variant) continue;

    const templateModel = await getTemplateModelByCode(templateCodeForVariant(variantCode));
    if (!templateModel || !(await pathExists(templateModel.rootPath))) {
      continue;
    }

    const entryFile = variant.entry_file || templateModel.entryFile || 'index.html';
    const entryPath = path.resolve(variant.folder_path, entryFile.replace(/^\/+/, ''));
    const hasEntry = await pathExists(entryPath);
    const hasItems = (await dirEntries(variant.folder_path)).length > 0;

    if (params.copyMode === 'if_empty_or_missing' && hasEntry && hasItems) {
      const previewUrl = buildPreviewUrl(params.orgSlug, entryFile, { releaseVersion: release.version, variantCode });
      await prisma.$executeRaw`
        UPDATE crm.deal_site_variant
        SET preview_url = ${previewUrl}, entry_file = ${entryFile}, updated_at = now()
        WHERE id = ${variant.id}::uuid
      `;
      continue;
    }

    await fs.mkdir(variant.folder_path, { recursive: true });
    if (params.copyMode === 'replace' && hasItems) {
      const backupPath = await backupFolder(variant.folder_path);
      if (backupPath) backups.push(backupPath);
    }

    const sourceEntries = await fs.readdir(templateModel.rootPath, { withFileTypes: true });
    for (const item of sourceEntries) {
      const from = path.resolve(templateModel.rootPath, item.name);
      const to = path.resolve(variant.folder_path, item.name);
      await fs.cp(from, to, { recursive: true, force: true });
    }

    const previewUrl = buildPreviewUrl(params.orgSlug, entryFile, { releaseVersion: release.version, variantCode });
    await prisma.$executeRaw`
      UPDATE crm.deal_site_variant
      SET preview_url = ${previewUrl}, entry_file = ${entryFile}, updated_at = now(), status = 'BASE_PREPARED'
      WHERE id = ${variant.id}::uuid
    `;

    applied = true;
  }

  return {
    releaseVersion: release.version,
    releaseLabel: `v${release.version}`,
    applied,
    backups,
    variants: (await getDealRelease(params.dealId, release.version))?.variants || release.variants,
  };
}

export async function updateReleaseStatus(releaseId: string, status: string) {
  await ensureSiteReleaseSchema();
  await prisma.$executeRaw`
    UPDATE crm.deal_site_release
    SET status = ${status}, updated_at = now()
    WHERE id = ${releaseId}::uuid
  `;
}

export async function updateVariantStatus(variantId: string, status: string) {
  await ensureSiteReleaseSchema();
  await prisma.$executeRaw`
    UPDATE crm.deal_site_variant
    SET status = ${status}, updated_at = now()
    WHERE id = ${variantId}::uuid
  `;
}

export async function markApprovalSelection(params: {
  dealId: string;
  templateRevisionId: string;
  releaseVersion: number | null;
  variantCode: SiteVariantCode | null;
}) {
  const metadata = {
    templateRevisionId: params.templateRevisionId,
    releaseVersion: params.releaseVersion,
    variantCode: params.variantCode,
  };
  await prisma.dealActivity.create({
    data: {
      dealId: params.dealId,
      activityType: 'APPROVAL_VARIANT_SELECTED',
      content: 'Variante selecionada para aprovação do cliente.',
      metadata,
      createdBy: 'ADMIN',
    },
  });
}
