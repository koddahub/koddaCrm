import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { absoluteFromStoredPath } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string; proposalId: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const proposal = await prisma.dealProposal.findFirst({
    where: { id: params.proposalId, dealId: params.id },
    select: { id: true, title: true, pdfPath: true },
  });

  if (!proposal || !proposal.pdfPath) {
    return NextResponse.json({ error: 'PDF da proposta não encontrado' }, { status: 404 });
  }

  const fullPath = absoluteFromStoredPath(proposal.pdfPath);
  const fileBuffer = await fs.readFile(fullPath).catch(() => null);
  if (!fileBuffer) {
    return NextResponse.json({ error: 'Arquivo PDF não encontrado no storage' }, { status: 404 });
  }

  const safeName = proposal.title.replace(/[^\w\-]+/g, '_');

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
