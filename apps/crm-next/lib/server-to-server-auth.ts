import { NextRequest, NextResponse } from 'next/server';

function readBoolEnv(name: string, fallback = false) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readHeaderToken(req: NextRequest) {
  const apiKey = String(req.headers.get('x-api-key') || '').trim();
  const authHeader = String(req.headers.get('authorization') || '').trim();
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  return { apiKey, bearer };
}

export function ensureServerToServerAuth(req: NextRequest): NextResponse | null {
  const expectedApiKey = String(process.env.CRM_S2S_API_KEY || '').trim();
  const expectedBearer = String(process.env.CRM_S2S_BEARER_TOKEN || '').trim();
  const fallbackIntegrationToken = String(process.env.CRM_INTEGRATION_TOKEN || '').trim();
  const authRequiredByFlag = readBoolEnv('CRM_S2S_AUTH_REQUIRED', false);

  const hasConfiguredCredential =
    expectedApiKey !== '' || expectedBearer !== '' || fallbackIntegrationToken !== '';
  const authRequired = authRequiredByFlag || hasConfiguredCredential;

  if (!authRequired) return null;

  const provided = readHeaderToken(req);
  const isApiKeyValid =
    provided.apiKey !== '' &&
    (provided.apiKey === expectedApiKey || provided.apiKey === fallbackIntegrationToken);
  const isBearerValid =
    provided.bearer !== '' &&
    (provided.bearer === expectedBearer || provided.bearer === fallbackIntegrationToken);

  if (!isApiKeyValid && !isBearerValid) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: 'Nao autorizado',
      },
      { status: 401 },
    );
  }

  return null;
}
