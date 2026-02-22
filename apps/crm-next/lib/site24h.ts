import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export const CLIENT_PROJECTS_ROOT = process.env.CLIENT_PROJECTS_ROOT || '/home/server/projects/clientes';
export const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || 'https://preview.koddahub.com.br';
export const CRM_PUBLIC_BASE_URL = process.env.CRM_PUBLIC_BASE_URL || 'https://koddacrm.koddahub.com.br';
export const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'http://192.168.25.3:8081';
export const VSCODE_SSH_HOST = process.env.VSCODE_SSH_HOST || 'server';
export const VSCODE_WEB_BASE_URL = process.env.VSCODE_WEB_BASE_URL || '';

export function slugifyName(input: string) {
  const base = (input || '').trim().toLowerCase();
  const normalized = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'cliente';
}

export function buildOrgSlug(legalName: string | null | undefined, orgId: string) {
  const prefix = slugifyName(legalName || 'cliente');
  const suffix = orgId.replace(/-/g, '').slice(0, 8);
  return `${prefix}-${suffix}`;
}

export function resolveProjectPath(orgSlug: string) {
  const candidate = path.resolve(CLIENT_PROJECTS_ROOT, orgSlug);
  const root = path.resolve(CLIENT_PROJECTS_ROOT);
  if (!(candidate === root || candidate.startsWith(`${root}${path.sep}`))) {
    throw new Error('project_path_invalid');
  }
  return candidate;
}

export async function ensureProjectFolder(projectPath: string) {
  const root = path.resolve(CLIENT_PROJECTS_ROOT);
  const resolved = path.resolve(projectPath);
  if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error('project_path_outside_root');
  }
  await fs.mkdir(resolved, { recursive: true });
}

export function buildPreviewUrl(
  orgSlug: string,
  entryFile = 'index.html',
  options?: { releaseVersion?: number | string | null; variantCode?: string | null },
) {
  const base = CRM_PUBLIC_BASE_URL.replace(/\/+$/, '');
  const cleanEntry = entryFile.replace(/^\/+/, '');
  const releaseVersionRaw = options?.releaseVersion ?? null;
  const releaseVersion = releaseVersionRaw !== null && releaseVersionRaw !== undefined
    ? String(releaseVersionRaw).trim().replace(/^v/i, '')
    : '';
  const variantCode = String(options?.variantCode || '').trim().toLowerCase();
  const query = new URLSearchParams();
  if (releaseVersion) query.set('release', `v${releaseVersion}`);
  if (variantCode) query.set('variant', variantCode);
  if (cleanEntry && cleanEntry !== 'index.html') {
    query.set('entry', cleanEntry);
  }
  const queryString = query.toString();
  if (!queryString) {
    return `${base}/${orgSlug}/previewv1`;
  }
  return `${base}/${orgSlug}/previewv1?${queryString}`;
}

export function buildPortalApprovalUrl(token: string) {
  const base = PORTAL_BASE_URL.replace(/\/+$/, '');
  return `${base}/portal/approval/${token}`;
}

export function buildVsCodeLinks(projectPath: string) {
  const safePath = projectPath.replace(/#/g, '%23');
  const deepLink = `vscode://vscode-remote/ssh-remote+${VSCODE_SSH_HOST}${safePath}`;
  const webLink = VSCODE_WEB_BASE_URL
    ? `${VSCODE_WEB_BASE_URL.replace(/\/+$/, '')}/?folder=${encodeURIComponent(safePath)}`
    : null;
  return { deepLink, webLink };
}

export function normalizeHtmlForHash(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\bdata-timestamp="[^"]*"/gi, '')
    .replace(/\bnonce="[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

export async function hashTemplateFile(projectPath: string, entryFile = 'index.html') {
  const full = path.resolve(projectPath, entryFile);
  const root = path.resolve(projectPath);
  if (!(full === root || full.startsWith(`${root}${path.sep}`))) {
    throw new Error('entry_file_invalid');
  }
  const content = await fs.readFile(full, 'utf8');
  return sha256(normalizeHtmlForHash(content));
}
