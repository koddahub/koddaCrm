import { Prisma } from '@prisma/client';
import { lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { normalizeIntent, normalizePhone } from '@/lib/domain';
import { prisma } from '@/lib/prisma';

const PROJECT_TYPES = new Set(['hospedagem', 'ecommerce', 'landingpage', 'institucional']);
const PROJECT_STATUSES = new Set(['PENDING', 'ACTIVE', 'PAUSED', 'CANCELED']);
const ITEM_STATUSES = new Set(['PENDING', 'ACTIVE', 'CANCELED']);

export class CreateProjectForOrganizationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type CreateProjectForOrganizationInput = {
  organizationId: string;
  domain?: string;
  projectTag?: string;
  projectType: string;
  planCode: string;
  projectStatus?: string | null;
  itemStatus?: string | null;
  priceOverride?: number | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateProjectForOrganizationResult = {
  organizationId: string;
  projectId: string;
  subscriptionItemId: string;
  leadId: string;
  dealId: string;
  subscriptionId: string | null;
  domain: string;
  planCode: string;
  projectType: string;
  projectStatus: string;
  itemStatus: string;
  effectivePrice: number;
};

function normalizeDomain(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function isDomainValid(value: string): boolean {
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(String(value || ''));
}

function normalizeProjectTag(value: string): string {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const clean = raw.replace(/[^A-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  if (!clean) return '';
  return clean.startsWith('PRJ-') ? clean.slice(0, 190) : `PRJ-${clean}`.slice(0, 190);
}

function buildAutoProjectTag(seed: string): string {
  return `PRJ-${String(seed || '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase().padEnd(4, '0')}`;
}

function normalizeProjectType(value: string): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (normalized === 'landing' || normalized === 'landingpage') return 'landingpage';
  if (normalized === 'siteinstitucional' || normalized === 'institucional') return 'institucional';
  if (normalized === 'ecommerce') return 'ecommerce';
  return 'hospedagem';
}

function normalizeProjectStatus(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (PROJECT_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function normalizeItemStatus(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (ITEM_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function stageCodeByProjectStatus(projectStatus: string): string {
  if (projectStatus === 'ACTIVE') return 'pagamento_pendente';
  if (projectStatus === 'CANCELED') return 'perdido';
  return 'cadastro_iniciado';
}

function parsePriceOverride(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CreateProjectForOrganizationError('PRICE_OVERRIDE_INVALID', 'priceOverride inválido.', 422);
  }
  return new Prisma.Decimal(parsed.toFixed(2));
}

export async function createProjectForOrganization(
  input: CreateProjectForOrganizationInput,
): Promise<CreateProjectForOrganizationResult> {
  const organizationId = String(input.organizationId || '').trim();
  let domain = normalizeDomain(input.domain || '');
  const projectTag = normalizeProjectTag(String(input.projectTag || ''));
  const projectType = normalizeProjectType(input.projectType);
  const planCode = String(input.planCode || '').trim().toLowerCase();
  const projectStatus = normalizeProjectStatus(input.projectStatus, 'PENDING');
  const itemStatus = normalizeItemStatus(input.itemStatus, 'ACTIVE');

  if (!organizationId) {
    throw new CreateProjectForOrganizationError('ORGANIZATION_REQUIRED', 'organization_id é obrigatório.', 422);
  }
  if (!domain) {
    domain = projectTag || buildAutoProjectTag(organizationId);
  }
  if (domain && !isDomainValid(domain)) {
    domain = normalizeProjectTag(domain) || buildAutoProjectTag(organizationId);
  }
  if (!PROJECT_TYPES.has(projectType)) {
    throw new CreateProjectForOrganizationError('PROJECT_TYPE_INVALID', 'project_type inválido.', 422);
  }
  if (!planCode) {
    throw new CreateProjectForOrganizationError('PLAN_REQUIRED', 'plan_code é obrigatório.', 422);
  }

  const source = String(input.source || 'CRM_PROJECT_FOR_ORGANIZATION').trim().toUpperCase();
  const priceOverride = parsePriceOverride(input.priceOverride);
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};

  const pipeline = await resolvePipelineAndStages('hospedagem');

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        legalName: true,
        billingEmail: true,
        whatsapp: true,
      },
    });
    if (!organization) {
      throw new CreateProjectForOrganizationError('ORGANIZATION_NOT_FOUND', 'Organização não encontrada.', 404);
    }

    const plan = await tx.plan.findFirst({
      where: { code: planCode, isActive: true },
      select: { id: true, code: true, name: true, monthlyPrice: true },
    });
    if (!plan) {
      throw new CreateProjectForOrganizationError('PLAN_NOT_FOUND', 'Plano não encontrado/ativo.', 404);
    }

    const duplicatedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id
      FROM client.projects
      WHERE organization_id = ${organizationId}::uuid
        AND lower(coalesce(domain, '')) = lower(${domain})
      LIMIT 1
    `;
    if (duplicatedRows.length > 0) {
      throw new CreateProjectForOrganizationError('PROJECT_EXISTS', 'Já existe projeto com este domínio para a organização.', 409);
    }

    const subscription = await tx.subscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const createdProjectRows = await tx.$queryRaw<Array<{
      id: string;
      domain: string | null;
      project_type: string;
      status: string;
    }>>`
      INSERT INTO client.projects (organization_id, domain, project_type, status, created_at, updated_at)
      VALUES (${organizationId}::uuid, ${domain}, ${projectType}, ${projectStatus}, now(), now())
      RETURNING id::text AS id, domain, project_type, status
    `;
    const project = createdProjectRows[0];
    if (!project?.id) {
      throw new CreateProjectForOrganizationError('PROJECT_CREATE_FAILED', 'Não foi possível criar o projeto.', 500);
    }

    const createdItemRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO client.subscription_items (organization_id, project_id, plan_id, status, price_override, created_at, updated_at)
      VALUES (${organizationId}::uuid, ${project.id}::uuid, ${plan.id}::uuid, ${itemStatus}, ${priceOverride}, now(), now())
      RETURNING id::text AS id
    `;
    const subscriptionItem = createdItemRows[0];
    if (!subscriptionItem?.id) {
      throw new CreateProjectForOrganizationError('SUBSCRIPTION_ITEM_CREATE_FAILED', 'Não foi possível criar item de assinatura do projeto.', 500);
    }

    const stageCode = stageCodeByProjectStatus(projectStatus);
    const stage = pipeline.stages.find((row) => row.code === stageCode) || pipeline.stages[0];
    const lifecycle = lifecycleByStageCode(stage.code);

    const positionIndex = await tx.deal.count({
      where: {
        pipelineId: pipeline.id,
        stageId: stage.id,
        lifecycleStatus: { not: 'CLIENT' },
      },
    });

    const contactName = domain || organization.legalName;
    const contactPhone = normalizePhone(organization.whatsapp || '');
    const effectivePrice = Number((priceOverride ?? plan.monthlyPrice).toString());
    const valueCents = Math.round(effectivePrice * 100);
    const intent = normalizeIntent(`hospedagem_${plan.code}`);

    const lead = await tx.lead.create({
      data: {
        source: 'manual',
        sourceRef: source,
        name: contactName,
        email: organization.billingEmail,
        phone: contactPhone || null,
        interest: intent,
        payload: {
          organizationId,
          domain,
          projectType,
          planCode: plan.code,
          projectStatus,
          itemStatus,
          source,
          ...metadata,
        },
        stage: 'NOVO',
      },
      select: { id: true },
    });

    const deal = await tx.deal.create({
      data: {
        pipelineId: pipeline.id,
        stageId: stage.id,
        leadId: lead.id,
        organizationId,
        subscriptionId: subscription?.id || null,
        title: `${contactName} - ${plan.name}`,
        contactName,
        contactEmail: organization.billingEmail,
        contactPhone: contactPhone || null,
        dealType: 'HOSPEDAGEM',
        category: 'RECORRENTE',
        intent,
        origin: source,
        planCode: plan.code,
        productCode: projectType,
        valueCents,
        positionIndex,
        lifecycleStatus: lifecycle.lifecycleStatus,
        isClosed: lifecycle.isClosed,
        closedAt: lifecycle.closedAt,
        metadata: {
          source: 'crm_project_for_organization',
          project_id: project.id,
          project_domain: domain,
          project_type: projectType,
          project_status: projectStatus,
          item_status: itemStatus,
          ...metadata,
        },
      },
      select: { id: true },
    });

    await tx.dealStageHistory.create({
      data: {
        dealId: deal.id,
        fromStageId: null,
        toStageId: stage.id,
        changedBy: 'ADMIN',
        reason: 'Projeto criado para organização existente',
      },
    });

    await tx.dealActivity.create({
      data: {
        dealId: deal.id,
        activityType: 'FLOW_UPDATE',
        content: 'Projeto criado no CRM para organização existente.',
        metadata: {
          project_id: project.id,
          project_domain: domain,
          project_type: projectType,
          plan_code: plan.code,
          item_status: itemStatus,
          source,
        },
        createdBy: 'ADMIN',
      },
    });

    return {
      organizationId,
      projectId: project.id,
      subscriptionItemId: subscriptionItem.id,
      leadId: lead.id,
      dealId: deal.id,
      subscriptionId: subscription?.id || null,
      domain,
      planCode: plan.code,
      projectType,
      projectStatus,
      itemStatus,
      effectivePrice,
    };
  });
}
