import { NextRequest, NextResponse } from 'next/server';

const INTEGRATION_HEADER = 'x-crm-integration-token';

function integrationToken() {
  return String(process.env.CRM_INTEGRATION_TOKEN || '').trim();
}

export function ensureIntegrationAuth(req: NextRequest): NextResponse | null {
  const expected = integrationToken();
  if (!expected) {
    return NextResponse.json({ error: 'Integração não configurada no servidor' }, { status: 500 });
  }

  const provided = String(req.headers.get(INTEGRATION_HEADER) || '').trim();
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  return null;
}
