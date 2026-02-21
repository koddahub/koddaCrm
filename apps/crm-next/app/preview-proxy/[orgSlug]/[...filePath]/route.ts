import { NextRequest, NextResponse } from 'next/server';
import { readPreviewProjectFile } from '@/lib/preview-proxy';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { orgSlug: string; filePath: string[] } }) {
  try {
    const relativePath = (params.filePath || []).join('/');
    const output = await readPreviewProjectFile(params.orgSlug, relativePath);
    return new NextResponse(output.file, {
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
