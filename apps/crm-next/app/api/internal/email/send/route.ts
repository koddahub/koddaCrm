import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureIntegrationAuth } from '@/lib/integration-auth';
import { sendTransactionalEmail } from '@/lib/transactional-email';

function ensureInternalEmailAuth(req: NextRequest) {
  const integrationHeader = String(req.headers.get('x-crm-integration-token') || '').trim();
  if (integrationHeader !== '') {
    return ensureIntegrationAuth(req);
  }
  return ensureApiAuth(req);
}

export async function POST(req: NextRequest) {
  const denied = ensureInternalEmailAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const result = await sendTransactionalEmail({
    site: body.site,
    event: body.event,
    to: body.to,
    variables: body.variables,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        error: result.error,
        logId: result.logId,
      },
      { status: result.statusCode },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    logId: result.logId,
    queueId: result.queueId,
    siteId: result.siteId,
    templateId: result.templateId,
    templateKey: result.templateKey,
  });
}
