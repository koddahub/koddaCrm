import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureIntegrationAuth } from '@/lib/integration-auth';
import {
  createProjectForOrganization,
  CreateProjectForOrganizationError,
} from '@/lib/project-for-organization';

function ensureProjectCreateAuth(req: NextRequest): NextResponse | null {
  const integrationHeader = String(req.headers.get('x-crm-integration-token') || '').trim();
  if (integrationHeader !== '') {
    return ensureIntegrationAuth(req);
  }
  return ensureApiAuth(req);
}

export async function POST(req: NextRequest) {
  const denied = ensureProjectCreateAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  try {
    const result = await createProjectForOrganization({
      organizationId: String(body.organization_id || body.organizationId || '').trim(),
      domain: String(body.domain || '').trim(),
      projectType: String(body.project_type || body.projectType || 'hospedagem').trim(),
      planCode: String(body.plan_code || body.planCode || '').trim(),
      projectStatus: body.project_status ? String(body.project_status) : (body.projectStatus ? String(body.projectStatus) : null),
      itemStatus: body.item_status ? String(body.item_status) : (body.itemStatus ? String(body.itemStatus) : null),
      priceOverride: body.price_override ?? body.priceOverride ?? null,
      source: body.source ? String(body.source) : null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    });

    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    if (error instanceof CreateProjectForOrganizationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: 'Falha ao criar projeto para organização.',
        details: String(error),
      },
      { status: 500 },
    );
  }
}
