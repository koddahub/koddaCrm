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

export async function readPreviewProjectFile(orgSlugRaw: string, relativePathRaw?: string | null) {
  const orgSlug = sanitizeOrgSlug(orgSlugRaw);
  if (!orgSlug) throw new Error('preview_org_slug_invalid');

  const projectRoot = resolveProjectPath(orgSlug);
  const root = path.resolve(projectRoot);
  const relativePath = sanitizeEntryPath(relativePathRaw || 'index.html');
  const requestedPath = path.resolve(projectRoot, relativePath);
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
  };
}
