import path from 'path';
import { prisma } from '@/lib/prisma';

export const SITE24H_TEMPLATE_LIBRARY_ROOT =
  process.env.SITE24H_TEMPLATE_LIBRARY_ROOT ||
  '/home/server/projects/projero-area-cliente/storage/site-models';

export const PUBLICATION_SUBSTEPS = [
  { code: 'dominio_decisao', name: 'Domínio já existe / precisa contratar', order: 1, required: true },
  { code: 'dominio_registro', name: 'Registro/transferência de domínio', order: 2, required: true },
  { code: 'dns_config', name: 'Configuração de DNS e apontamentos', order: 3, required: true },
  { code: 'hostgator_account', name: 'Cadastro/ajuste na Hostgator', order: 4, required: true },
  { code: 'deploy_ssl', name: 'Deploy + SSL + validação técnica', order: 5, required: true },
  { code: 'go_live_monitor', name: 'Monitoramento de entrada no ar', order: 6, required: true },
] as const;

let schemaEnsured = false;

const OFFICIAL_TEMPLATE_MODELS = [
  {
    code: 'template_v1_institucional_1pagina',
    name: 'V1 - Institucional 1 página',
    folder: 'template_v1_institucional_1pagina',
    entryFile: 'index.html',
    isDefault: true,
  },
  {
    code: 'template_v2_institucional_3paginas',
    name: 'V2 - Institucional 3 páginas',
    folder: 'template_v2_institucional_3paginas',
    entryFile: 'index.html',
    isDefault: false,
  },
  {
    code: 'template_v3_institucional_chatbot',
    name: 'V3 - Institucional com chatbot',
    folder: 'template_v3_institucional_chatbot',
    entryFile: 'index.html',
    isDefault: false,
  },
] as const;

function isInsideRoot(candidatePath: string, rootPath: string) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function sanitizeTemplateRootPath(inputPath: string) {
  const candidate = path.resolve(String(inputPath || '').trim());
  if (!candidate) {
    throw new Error('Caminho do modelo é obrigatório');
  }
  if (!isInsideRoot(candidate, SITE24H_TEMPLATE_LIBRARY_ROOT)) {
    throw new Error(`Caminho do modelo deve estar dentro de ${SITE24H_TEMPLATE_LIBRARY_ROOT}`);
  }
  return candidate;
}

export function sshConfigReference() {
  return [
    'Host server',
    '    HostName ssh.koddahub.com.br',
    '    User server',
    '    ProxyCommand cloudflared access ssh --hostname %h',
    '    IdentityFile ~/.ssh/id_rsa',
    '    ServerAliveInterval 30',
    '    StrictHostKeyChecking no',
    '    UserKnownHostsFile /dev/null',
    '    ConnectTimeout 180',
  ].join('\n');
}

export async function ensureSite24hOperationSchema() {
  if (schemaEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_operation_substep (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      stage_code VARCHAR(80) NOT NULL,
      substep_code VARCHAR(80) NOT NULL,
      substep_name VARCHAR(140) NOT NULL,
      substep_order INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      is_required BOOLEAN NOT NULL DEFAULT true,
      owner VARCHAR(120),
      notes TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (deal_id, stage_code, substep_code)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, stage_code, substep_order)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status
      ON crm.deal_operation_substep(deal_id, stage_code, status)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.template_model_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      root_path VARCHAR(500) NOT NULL,
      entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_template_model_catalog_active
      ON crm.template_model_catalog(is_active, is_default)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_request (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      prompt_revision_id UUID REFERENCES crm.deal_prompt_revision(id) ON DELETE SET NULL,
      subject VARCHAR(220) NOT NULL,
      request_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      message TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      email_queue_id UUID,
      status VARCHAR(20) NOT NULL DEFAULT 'SENT',
      created_by VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_default = false, updated_at = now()
    WHERE is_default = true
  `);

  for (const model of OFFICIAL_TEMPLATE_MODELS) {
    const modelRootPath = sanitizeTemplateRootPath(path.resolve(SITE24H_TEMPLATE_LIBRARY_ROOT, model.folder));
    await prisma.$queryRaw`
      INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
      VALUES (${model.code}, ${model.name}, ${modelRootPath}, ${model.entryFile}, ${model.isDefault}, true, now(), now())
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        root_path = EXCLUDED.root_path,
        entry_file = EXCLUDED.entry_file,
        is_default = EXCLUDED.is_default,
        is_active = true,
        updated_at = now()
    `;
  }

  await prisma.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_active = false, is_default = false, updated_at = now()
    WHERE code = 'institucional_padrao'
  `);

  schemaEnsured = true;
}

export async function listTemplateModels() {
  await ensureSite24hOperationSchema();
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    code: string;
    name: string;
    root_path: string;
    entry_file: string;
    is_default: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    rootPath: row.root_path,
    entryFile: row.entry_file,
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertTemplateModel(params: {
  code: string;
  name: string;
  rootPath: string;
  entryFile?: string;
  isDefault?: boolean;
  isActive?: boolean;
}) {
  await ensureSite24hOperationSchema();
  const code = params.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!code) throw new Error('Código do modelo inválido');
  const name = params.name.trim();
  if (!name) throw new Error('Nome do modelo é obrigatório');
  const rootPath = sanitizeTemplateRootPath(params.rootPath);
  const entryFile = (params.entryFile || 'index.html').replace(/^\/+/, '').trim() || 'index.html';
  const isDefault = Boolean(params.isDefault);
  const isActive = params.isActive === undefined ? true : Boolean(params.isActive);

  if (isDefault) {
    await prisma.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${code}, ${name}, ${rootPath}, ${entryFile}, ${isDefault}, ${isActive}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;

  return rows[0]?.id || null;
}

export async function getTemplateModelByCode(code?: string | null) {
  await ensureSite24hOperationSchema();
  const normalizedCode = String(code || '').trim().toLowerCase();
  const rows = normalizedCode
    ? await prisma.$queryRaw<Array<{
        id: string;
        code: string;
        name: string;
        root_path: string;
        entry_file: string;
        is_default: boolean;
      }>>`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE code = ${normalizedCode}
          AND is_active = true
        LIMIT 1
      `
    : await prisma.$queryRaw<Array<{
        id: string;
        code: string;
        name: string;
        root_path: string;
        entry_file: string;
        is_default: boolean;
      }>>`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE is_active = true
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `;
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    code: rows[0].code,
    name: rows[0].name,
    rootPath: rows[0].root_path,
    entryFile: rows[0].entry_file,
    isDefault: rows[0].is_default,
  };
}

export async function ensurePublicationSubsteps(dealId: string) {
  await ensureSite24hOperationSchema();
  for (const sub of PUBLICATION_SUBSTEPS) {
    await prisma.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${dealId}::uuid, 'publicacao', ${sub.code}, ${sub.name}, ${sub.order}, 'PENDING', ${sub.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `;
  }
}

export async function listPublicationSubsteps(dealId: string) {
  await ensureSite24hOperationSchema();
  return prisma.$queryRaw<Array<{
    id: string;
    deal_id: string;
    stage_code: string;
    substep_code: string;
    substep_name: string;
    substep_order: number;
    status: string;
    is_required: boolean;
    owner: string | null;
    notes: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT
      id::text,
      deal_id::text,
      stage_code,
      substep_code,
      substep_name,
      substep_order,
      status,
      is_required,
      owner,
      notes,
      started_at,
      completed_at,
      created_at,
      updated_at
    FROM crm.deal_operation_substep
    WHERE deal_id = ${dealId}::uuid
      AND stage_code = 'publicacao'
    ORDER BY substep_order ASC, created_at ASC
  `;
}

export async function publicationSubstepsStatus(dealId: string) {
  await ensureSite24hOperationSchema();
  const rows = await prisma.$queryRaw<Array<{
    required_total: number;
    required_completed: number;
    pending_total: number;
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${dealId}::uuid
      AND stage_code = 'publicacao'
  `;

  const item = rows[0] || { required_total: 0, required_completed: 0, pending_total: 0 };
  const requiredTotal = Number(item.required_total || 0);
  const requiredCompleted = Number(item.required_completed || 0);
  const pendingTotal = Number(item.pending_total || 0);

  return {
    requiredTotal,
    requiredCompleted,
    pendingTotal,
    ready: requiredTotal > 0 && pendingTotal === 0,
  };
}
