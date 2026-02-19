import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { getFinanceOverview } from '@/lib/finance';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  try {
    const overview = await getFinanceOverview();
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao carregar overview financeiro', details: String(error) }, { status: 500 });
  }
}
