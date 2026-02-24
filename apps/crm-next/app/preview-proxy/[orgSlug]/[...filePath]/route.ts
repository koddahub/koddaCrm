import { NextRequest, NextResponse } from 'next/server';
import { readPreviewProjectFile } from '@/lib/preview-proxy';

export const runtime = 'nodejs';

function appendContext(urlValue: string, release: string | null, variant: string | null) {
  const original = String(urlValue || '').trim();
  if (!original) return original;
  if (
    original.startsWith('#') ||
    original.startsWith('mailto:') ||
    original.startsWith('tel:') ||
    original.startsWith('data:') ||
    original.startsWith('javascript:')
  ) {
    return original;
  }
  if (/^https?:\/\//i.test(original) || original.startsWith('//')) {
    return original;
  }

  const [base, hash = ''] = original.split('#', 2);
  const [pathPart, queryPart = ''] = base.split('?', 2);
  const params = new URLSearchParams(queryPart);
  if (release && !params.get('release')) params.set('release', release);
  if (variant && !params.get('variant')) params.set('variant', variant);
  const queryString = params.toString();
  const rebuilt = `${pathPart}${queryString ? `?${queryString}` : ''}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

function rewriteHtmlWithPreviewContext(html: string, release: string | null, variant: string | null) {
  if (!release && !variant) return html;
  return html.replace(/\b(href|src)=["']([^"']+)["']/gi, (match, attr, value) => {
    const next = appendContext(value, release, variant);
    if (next === value) return match;
    return `${attr}="${next}"`;
  });
}

function inheritPreviewContext(req: NextRequest) {
  const queryRelease = req.nextUrl.searchParams.get('release');
  const queryVariant = req.nextUrl.searchParams.get('variant');
  if (queryRelease || queryVariant) {
    return {
      release: queryRelease,
      variant: queryVariant,
    };
  }

  const referer = req.headers.get('referer');
  if (!referer) {
    return { release: null, variant: null };
  }
  try {
    const ref = new URL(referer);
    return {
      release: ref.searchParams.get('release'),
      variant: ref.searchParams.get('variant'),
    };
  } catch {
    return { release: null, variant: null };
  }
}

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string; filePath: string[] } }) {
  try {
    const relativePath = (params.filePath || []).join('/');
    const inherited = inheritPreviewContext(req);
    const output = await readPreviewProjectFile(params.orgSlug, relativePath, {
      release: inherited.release,
      variant: inherited.variant,
    });
    const shouldRewriteHtml = output.type.startsWith('text/html');
    const responseBody = shouldRewriteHtml
      ? rewriteHtmlWithPreviewContext(output.file.toString('utf-8'), output.release, output.variant)
      : output.file;
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': output.type,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Arquivo de preview não encontrado', details: String(error) }, { status: 404 });
  }
}
