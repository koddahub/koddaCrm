import { promises as fs } from 'fs';
import path from 'path';
import { CLIENT_PROJECTS_ROOT, resolveProjectPath } from '@/lib/site24h';

function sanitizeOrgSlug(input: string) {
  return String(input || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function sanitizeEntryPath(input: string | null | undefined) {
  const normalized = String(input || 'index.html').replace(/^\/+/, '').trim() || 'index.html';
  if (normalized.includes('..') || normalized.includes('\0')) return 'index.html';
  return normalized;
}

function sanitizeReleaseLabel(input: string | null | undefined) {
  const normalized = String(input || '').trim().toLowerCase();
  if (!normalized) return null;
  const candidate = normalized.startsWith('v') ? normalized : `v${normalized}`;
  if (!/^v\d+$/.test(candidate)) return null;
  return candidate;
}

function sanitizeVariant(input: string | null | undefined) {
  const normalized = String(input || '').trim().toLowerCase();
  if (normalized === 'v2' || normalized === 'modelo_v2') return 'v2';
  if (normalized === 'v3' || normalized === 'modelo_v3') return 'v3';
  return 'v1';
}

function variantFolder(variant: string) {
  if (variant === 'v2') return 'modelo_v2';
  if (variant === 'v3') return 'modelo_v3';
  return 'modelo_v1';
}

async function latestReleaseLabel(projectRoot: string) {
  const releasesRoot = path.resolve(projectRoot, 'releases');
  const entries = await fs.readdir(releasesRoot, { withFileTypes: true }).catch(() => []);
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map((name) => {
      const match = name.match(/^v(\d+)$/i);
      return match ? Number.parseInt(match[1], 10) : null;
    })
    .filter((value): value is number => Number.isFinite(value));
  if (versions.length === 0) return null;
  versions.sort((a, b) => b - a);
  return `v${versions[0]}`;
}

async function resolvePreviewRoot(projectRoot: string, releaseRaw?: string | null, variantRaw?: string | null) {
  const explicitRelease = sanitizeReleaseLabel(releaseRaw);
  const resolvedRelease = explicitRelease || (await latestReleaseLabel(projectRoot));
  const variant = sanitizeVariant(variantRaw);
  if (!resolvedRelease) {
    return {
      rootPath: projectRoot,
      releaseLabel: null as string | null,
      variant,
    };
  }
  return {
    rootPath: path.resolve(projectRoot, 'releases', resolvedRelease, variantFolder(variant)),
    releaseLabel: resolvedRelease,
    variant,
  };
}

export function contentTypeByPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.txt':
    case '.md':
      return 'text/plain; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.map':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export async function readPreviewProjectFile(
  orgSlugRaw: string,
  relativePathRaw?: string | null,
  options?: {
    release?: string | null;
    variant?: string | null;
  },
) {
  const orgSlug = sanitizeOrgSlug(orgSlugRaw);
  if (!orgSlug) throw new Error('preview_org_slug_invalid');

  const projectRoot = resolveProjectPath(orgSlug);
  const resolvedRoot = await resolvePreviewRoot(projectRoot, options?.release, options?.variant);
  const root = path.resolve(resolvedRoot.rootPath);
  const relativePath = sanitizeEntryPath(relativePathRaw || 'index.html');
  const requestedPath = path.resolve(root, relativePath);
  if (!(requestedPath === root || requestedPath.startsWith(`${root}${path.sep}`))) {
    throw new Error('preview_path_outside_root');
  }

  let finalPath = requestedPath;
  let stat = await fs.stat(finalPath).catch(() => null);
  if (!stat) throw new Error('preview_file_not_found');
  if (stat.isDirectory()) {
    finalPath = path.resolve(finalPath, 'index.html');
    stat = await fs.stat(finalPath).catch(() => null);
    if (!stat || !stat.isFile()) throw new Error('preview_file_not_found');
  }
  if (!stat.isFile()) throw new Error('preview_file_not_found');

  const file = await fs.readFile(finalPath);
  const type = contentTypeByPath(finalPath);
  return {
    file,
    type,
    fullPath: finalPath,
    root: path.resolve(CLIENT_PROJECTS_ROOT),
    relativePath,
    release: resolvedRoot.releaseLabel,
    variant: resolvedRoot.variant,
  };
}
