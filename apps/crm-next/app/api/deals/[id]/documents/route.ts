import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { storageRelativePath, uploadsDir } from '@/lib/storage';

export const runtime = 'nodejs';

const DEAL_UPLOAD_DIR = uploadsDir('deals');

function serializeDocument(doc: {
  id: string;
  dealId: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: bigint | null;
  uploadedBy: string | null;
  createdAt: Date;
}) {
  return {
    ...doc,
    sizeBytes: doc.sizeBytes ? doc.sizeBytes.toString() : null,
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const items = await prisma.dealDocument.findMany({
    where: { dealId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ items: items.map(serializeDocument) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  const deal = await prisma.deal.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!deal) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo é obrigatório' }, { status: 422 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.mkdir(DEAL_UPLOAD_DIR, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedFileName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const diskPath = path.join(DEAL_UPLOAD_DIR, storedFileName);
  await fs.writeFile(diskPath, bytes);

  const item = await prisma.dealDocument.create({
    data: {
      dealId: params.id,
      fileName: safeName,
      storagePath: storageRelativePath('deals', storedFileName),
      mimeType: file.type || null,
      sizeBytes: BigInt(bytes.byteLength),
      uploadedBy: 'ADMIN',
    },
  });

  return NextResponse.json({ ok: true, item: serializeDocument(item) }, { status: 201 });
}
