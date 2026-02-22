import { NextRequest, NextResponse } from 'next/server';
import { readPreviewProjectFile } from '@/lib/preview-proxy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  try {
    const output = await readPreviewProjectFile(params.orgSlug, 'index.html', {
      release: req.nextUrl.searchParams.get('release'),
      variant: req.nextUrl.searchParams.get('variant'),
    });
    return new NextResponse(output.file, {
      status: 200,
      headers: {
        'Content-Type': output.type,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Preview não encontrado', details: String(error) }, { status: 404 });
  }
}
