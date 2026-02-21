import path from 'path';

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/storage';

export function storageRoot() {
  return path.resolve(STORAGE_ROOT);
}

export function uploadsDir(...segments: string[]) {
  return path.resolve(storageRoot(), 'uploads', ...segments);
}

export function storageRelativePath(...segments: string[]) {
  const rel = path.join('uploads', ...segments).replace(/\\/g, '/');
  return rel;
}

export function absoluteFromStoredPath(storedPath: string) {
  const clean = (storedPath || '').replace(/^storage\//, '').replace(/^\/+/, '');
  return path.resolve(storageRoot(), clean);
}

