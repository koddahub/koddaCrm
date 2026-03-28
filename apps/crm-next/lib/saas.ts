import { prisma } from '@/lib/prisma';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

let schemaEnsured = false;

function normalizeSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeDomain(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeBoolean(value: unknown, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : '';
}

function requireUuid(id: string, field: string) {
  const value = String(id || '').trim();
  if (!value) throw new Error(`${field} é obrigatório`);
  return value;
}

export async function ensureSaasInfra() {
  if (schemaEnsured) return;

  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS saas`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saas.product (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(120) NOT NULL UNIQUE,
      category VARCHAR(40) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saas.site (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES saas.product(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      domain VARCHAR(190) NOT NULL UNIQUE,
      app_type VARCHAR(40) NOT NULL DEFAULT 'web',
      brand_name VARCHAR(160),
      support_email VARCHAR(190),
      is_active BOOLEAN NOT NULL DEFAULT true,
      env VARCHAR(40) NOT NULL DEFAULT 'production',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saas.email_template (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES saas.product(id) ON DELETE CASCADE,
      site_id UUID REFERENCES saas.site(id) ON DELETE CASCADE,
      template_key VARCHAR(80) NOT NULL,
      subject VARCHAR(220) NOT NULL,
      html TEXT,
      text TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saas.event_binding (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES saas.product(id) ON DELETE CASCADE,
      site_id UUID REFERENCES saas.site(id) ON DELETE CASCADE,
      event_key VARCHAR(120) NOT NULL,
      template_id UUID NOT NULL REFERENCES saas.email_template(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saas.email_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID REFERENCES saas.site(id) ON DELETE SET NULL,
      template_id UUID REFERENCES saas.email_template(id) ON DELETE SET NULL,
      event_key VARCHAR(120) NOT NULL,
      recipient VARCHAR(190) NOT NULL,
      subject VARCHAR(220) NOT NULL,
      provider VARCHAR(80) NOT NULL,
      status VARCHAR(30) NOT NULL,
      provider_message_id VARCHAR(190),
      request_payload_json JSONB,
      response_payload_json JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saas.email_account (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES saas.product(id) ON DELETE CASCADE,
      site_id UUID REFERENCES saas.site(id) ON DELETE SET NULL,
      email_label VARCHAR(160) NOT NULL,
      from_name VARCHAR(190) NOT NULL,
      from_email VARCHAR(190) NOT NULL,
      reply_to VARCHAR(190),
      provider VARCHAR(60) NOT NULL DEFAULT 'smtp',
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_template_scope_key_version
      ON saas.email_template (product_id, COALESCE(site_id, '${ZERO_UUID}'::uuid), template_key, version)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_event_scope_key
      ON saas.event_binding (product_id, COALESCE(site_id, '${ZERO_UUID}'::uuid), event_key)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_product_slug
      ON saas.product(slug)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_site_domain
      ON saas.site(domain)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_template_key
      ON saas.email_template(template_key)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_event_key
      ON saas.event_binding(event_key)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_email_log_created
      ON saas.email_log(created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_email_log_status_created
      ON saas.email_log(status, created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_email_log_site_created
      ON saas.email_log(site_id, created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_email_log_event_created
      ON saas.email_log(event_key, created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_email_account_scope_label
      ON saas.email_account (product_id, COALESCE(site_id, '${ZERO_UUID}'::uuid), email_label)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_email_account_product
      ON saas.email_account(product_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_email_account_site
      ON saas.email_account(site_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saas_email_account_active
      ON saas.email_account(is_active, updated_at DESC)
  `);

  await seedSaasDefaults();

  schemaEnsured = true;
}

async function seedSaasDefaults() {
  const products = [
    { name: 'Astros', slug: 'astros', category: 'blog', status: 'active', description: 'Produto de conteúdo Astros.' },
    { name: 'KoddaHub', slug: 'koddahub', category: 'site_institucional', status: 'active', description: 'Site institucional KoddaHub.' },
    { name: 'Praja', slug: 'praja', category: 'agendamento', status: 'active', description: 'Sistema de agendamento Praja.' },
    { name: 'Leads', slug: 'leads', category: 'leads', status: 'active', description: 'Produto de gestão de leads.' },
    { name: 'Tempero da Ursa', slug: 'tempero-da-ursa', category: 'case', status: 'active', description: 'Case Tempero da Ursa.' },
  ] as const;

  for (const product of products) {
    await prisma.$queryRaw`
      INSERT INTO saas.product (name, slug, category, status, description, created_at, updated_at)
      VALUES (${product.name}, ${product.slug}, ${product.category}, ${product.status}, ${product.description}, now(), now())
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        updated_at = now()
    `;
  }

  const sites = [
    { name: 'Astros', domain: 'astros.koddahub.com.br', slug: 'astros' },
    { name: 'KoddaHub', domain: 'koddahub.com.br', slug: 'koddahub' },
    { name: 'Praja', domain: 'prajakoddahub.com', slug: 'praja' },
    { name: 'Praja', domain: 'praja.koddahub.com.br', slug: 'praja' },
    { name: 'Leads', domain: 'leads.koddahub.com.br', slug: 'leads' },
    { name: 'Tempero da Ursa', domain: 'temperodaursa.com.br', slug: 'tempero-da-ursa' },
  ] as const;

  for (const site of sites) {
    const productRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM saas.product
      WHERE slug = ${site.slug}
      LIMIT 1
    `;
    const productId = productRows[0]?.id;
    if (!productId) continue;

    await prisma.$queryRaw`
      INSERT INTO saas.site (product_id, name, domain, app_type, brand_name, support_email, is_active, env, created_at, updated_at)
      VALUES (${productId}::uuid, ${site.name}, ${site.domain}, 'web', ${site.name}, 'suporte@koddahub.com.br', true, 'production', now(), now())
      ON CONFLICT (domain)
      DO UPDATE SET
        product_id = EXCLUDED.product_id,
        name = EXCLUDED.name,
        brand_name = EXCLUDED.brand_name,
        is_active = true,
        updated_at = now()
    `;
  }

  const templateDefaults = [
    {
      templateKey: 'welcome',
      subject: 'Bem-vindo ao Praja',
      html: [
        '<p>Olá {{name}},</p>',
        '<p>Seu acesso ao Praja foi criado com sucesso.</p>',
        '<p>Use sua conta para organizar agendamentos e acompanhar sua operação em um único lugar.</p>',
        '<p>Se precisar de ajuda, nosso time está por aqui.</p>',
        '<p>Equipe Praja</p>',
      ].join(''),
      text: [
        'Olá {{name}},',
        '',
        'Seu acesso ao Praja foi criado com sucesso.',
        'Use sua conta para organizar agendamentos e acompanhar sua operação em um único lugar.',
        'Se precisar de ajuda, nosso time está por aqui.',
        '',
        'Equipe Praja',
      ].join('\n'),
    },
    {
      templateKey: 'reset_password',
      subject: 'Recuperação de acesso ao Praja',
      html: [
        '<p>Olá {{name}},</p>',
        '<p>Recebemos uma solicitação para redefinir sua senha no Praja.</p>',
        '<p>Para continuar, use este link seguro: <a href="{{resetUrl}}">{{resetUrl}}</a></p>',
        '<p>Se você não reconhece essa solicitação, ignore este e-mail.</p>',
        '<p>Equipe Praja</p>',
      ].join(''),
      text: [
        'Olá {{name}},',
        '',
        'Recebemos uma solicitação para redefinir sua senha no Praja.',
        'Use este link seguro para continuar:',
        '{{resetUrl}}',
        '',
        'Se você não reconhece essa solicitação, ignore este e-mail.',
        '',
        'Equipe Praja',
      ].join('\n'),
    },
  ] as const;

  const prajaSites = await prisma.$queryRaw<Array<{ product_id: string; site_id: string }>>`
    SELECT p.id::text AS product_id, s.id::text AS site_id
    FROM saas.product p
    JOIN saas.site s ON s.product_id = p.id
    WHERE p.slug = 'praja'
      AND s.domain IN ('prajakoddahub.com', 'praja.koddahub.com.br')
  `;

  const prajaProductId = prajaSites[0]?.product_id;
  if (!prajaProductId || prajaSites.length === 0) return;

  const bindings = [
    { eventKey: 'user.created', templateKey: 'welcome' },
    { eventKey: 'auth.password_reset_requested', templateKey: 'reset_password' },
  ] as const;

  for (const prajaSite of prajaSites) {
    for (const template of templateDefaults) {
      const existing = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text
        FROM saas.email_template
        WHERE product_id = ${prajaProductId}::uuid
          AND site_id = ${prajaSite.site_id}::uuid
          AND template_key = ${template.templateKey}
          AND version = 1
        LIMIT 1
      `;

      if (existing[0]?.id) {
        await prisma.$executeRaw`
          UPDATE saas.email_template
          SET subject = ${template.subject}, html = ${template.html}, text = ${template.text}, is_active = true, updated_at = now()
          WHERE id = ${existing[0].id}::uuid
        `;
      } else {
        await prisma.$executeRaw`
          INSERT INTO saas.email_template (product_id, site_id, template_key, subject, html, text, is_active, version, created_at, updated_at)
          VALUES (${prajaProductId}::uuid, ${prajaSite.site_id}::uuid, ${template.templateKey}, ${template.subject}, ${template.html}, ${template.text}, true, 1, now(), now())
        `;
      }
    }

    for (const binding of bindings) {
      const templateRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text
        FROM saas.email_template
        WHERE product_id = ${prajaProductId}::uuid
          AND site_id = ${prajaSite.site_id}::uuid
          AND template_key = ${binding.templateKey}
          AND version = 1
        LIMIT 1
      `;
      const templateId = templateRows[0]?.id;
      if (!templateId) continue;

      const existingBinding = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text
        FROM saas.event_binding
        WHERE product_id = ${prajaProductId}::uuid
          AND site_id = ${prajaSite.site_id}::uuid
          AND event_key = ${binding.eventKey}
        LIMIT 1
      `;

      if (existingBinding[0]?.id) {
        await prisma.$executeRaw`
          UPDATE saas.event_binding
          SET template_id = ${templateId}::uuid, enabled = true, updated_at = now()
          WHERE id = ${existingBinding[0].id}::uuid
        `;
      } else {
        await prisma.$executeRaw`
          INSERT INTO saas.event_binding (product_id, site_id, event_key, template_id, enabled, created_at, updated_at)
          VALUES (${prajaProductId}::uuid, ${prajaSite.site_id}::uuid, ${binding.eventKey}, ${templateId}::uuid, true, now(), now())
        `;
      }
    }
  }
}

export async function listSaasProducts() {
  await ensureSaasInfra();

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    slug: string;
    category: string;
    status: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT id::text, name, slug, category, status, description, created_at, updated_at
    FROM saas.product
    ORDER BY name ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    status: row.status,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertSaasProduct(input: {
  id?: string;
  name: string;
  slug?: string;
  category?: string;
  status?: string;
  description?: string;
}) {
  await ensureSaasInfra();

  const name = normalizeText(input.name);
  if (!name) throw new Error('Nome do produto é obrigatório');

  const slug = normalizeSlug(input.slug || name);
  if (!slug) throw new Error('Slug do produto inválido');

  const category = normalizeText(input.category, 'saas').toLowerCase();
  const status = normalizeText(input.status, 'active').toLowerCase();
  const description = normalizeText(input.description, '');

  if (input.id) {
    const id = requireUuid(input.id, 'id');
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE saas.product
      SET name = ${name}, slug = ${slug}, category = ${category}, status = ${status}, description = ${description || null}, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text
    `;
    if (!rows[0]?.id) throw new Error('Produto não encontrado para atualização');
    return rows[0].id;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO saas.product (name, slug, category, status, description, created_at, updated_at)
    VALUES (${name}, ${slug}, ${category}, ${status}, ${description || null}, now(), now())
    ON CONFLICT (slug)
    DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      updated_at = now()
    RETURNING id::text
  `;

  return rows[0]?.id || null;
}

export async function listSaasSites() {
  await ensureSaasInfra();

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    product_id: string;
    product_name: string;
    product_slug: string;
    name: string;
    domain: string;
    app_type: string;
    brand_name: string | null;
    support_email: string | null;
    is_active: boolean;
    env: string;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT
      s.id::text,
      s.product_id::text,
      p.name AS product_name,
      p.slug AS product_slug,
      s.name,
      s.domain,
      s.app_type,
      s.brand_name,
      s.support_email,
      s.is_active,
      s.env,
      s.created_at,
      s.updated_at
    FROM saas.site s
    JOIN saas.product p ON p.id = s.product_id
    ORDER BY s.domain ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    name: row.name,
    domain: row.domain,
    appType: row.app_type,
    brandName: row.brand_name,
    supportEmail: row.support_email,
    isActive: row.is_active,
    env: row.env,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertSaasSite(input: {
  id?: string;
  productId?: string;
  productSlug?: string;
  name: string;
  domain: string;
  appType?: string;
  brandName?: string;
  supportEmail?: string;
  isActive?: boolean;
  env?: string;
}) {
  await ensureSaasInfra();

  const name = normalizeText(input.name);
  const domain = normalizeDomain(input.domain);
  if (!name) throw new Error('Nome do site é obrigatório');
  if (!domain) throw new Error('Domínio é obrigatório');

  const appType = normalizeText(input.appType, 'web').toLowerCase();
  const brandName = normalizeText(input.brandName, name);
  const supportEmail = normalizeText(input.supportEmail, '');
  const isActive = normalizeBoolean(input.isActive, true);
  const env = normalizeText(input.env, 'production').toLowerCase();

  let productId = normalizeText(input.productId, '');
  const productSlug = normalizeSlug(input.productSlug || '');

  if (!productId && productSlug) {
    const productRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM saas.product
      WHERE slug = ${productSlug}
      LIMIT 1
    `;
    productId = productRows[0]?.id || '';
  }

  if (!productId) throw new Error('productId ou productSlug é obrigatório');

  if (input.id) {
    const id = requireUuid(input.id, 'id');
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE saas.site
      SET
        product_id = ${productId}::uuid,
        name = ${name},
        domain = ${domain},
        app_type = ${appType},
        brand_name = ${brandName || null},
        support_email = ${supportEmail || null},
        is_active = ${isActive},
        env = ${env},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text
    `;
    if (!rows[0]?.id) throw new Error('Site não encontrado para atualização');
    return rows[0].id;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO saas.site (product_id, name, domain, app_type, brand_name, support_email, is_active, env, created_at, updated_at)
    VALUES (${productId}::uuid, ${name}, ${domain}, ${appType}, ${brandName || null}, ${supportEmail || null}, ${isActive}, ${env}, now(), now())
    ON CONFLICT (domain)
    DO UPDATE SET
      product_id = EXCLUDED.product_id,
      name = EXCLUDED.name,
      app_type = EXCLUDED.app_type,
      brand_name = EXCLUDED.brand_name,
      support_email = EXCLUDED.support_email,
      is_active = EXCLUDED.is_active,
      env = EXCLUDED.env,
      updated_at = now()
    RETURNING id::text
  `;

  return rows[0]?.id || null;
}

export async function listSaasTemplates() {
  await ensureSaasInfra();

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    product_id: string | null;
    product_name: string | null;
    product_slug: string | null;
    site_id: string | null;
    site_domain: string | null;
    template_key: string;
    subject: string;
    html: string | null;
    text: string | null;
    is_active: boolean;
    version: number;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT
      t.id::text,
      t.product_id::text,
      p.name AS product_name,
      p.slug AS product_slug,
      t.site_id::text,
      s.domain AS site_domain,
      t.template_key,
      t.subject,
      t.html,
      t.text,
      t.is_active,
      t.version,
      t.created_at,
      t.updated_at
    FROM saas.email_template t
    LEFT JOIN saas.product p ON p.id = t.product_id
    LEFT JOIN saas.site s ON s.id = t.site_id
    ORDER BY t.template_key ASC, t.version DESC
  `;

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    siteId: row.site_id,
    siteDomain: row.site_domain,
    templateKey: row.template_key,
    subject: row.subject,
    html: row.html,
    text: row.text,
    isActive: row.is_active,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertSaasTemplate(input: {
  id?: string;
  productId?: string;
  productSlug?: string;
  siteId?: string;
  siteDomain?: string;
  templateKey: string;
  subject: string;
  html?: string;
  text?: string;
  isActive?: boolean;
  version?: number;
}) {
  await ensureSaasInfra();

  const templateKey = normalizeText(input.templateKey).toLowerCase();
  const subject = normalizeText(input.subject);
  if (!templateKey) throw new Error('templateKey é obrigatório');
  if (!subject) throw new Error('subject é obrigatório');

  const html = normalizeText(input.html, '');
  const text = normalizeText(input.text, '');
  const isActive = normalizeBoolean(input.isActive, true);
  const version = Math.max(1, Number.parseInt(String(input.version || 1), 10) || 1);

  let productId = normalizeText(input.productId, '');
  const productSlug = normalizeSlug(input.productSlug || '');
  let siteId = normalizeText(input.siteId, '');
  const siteDomain = normalizeDomain(input.siteDomain || '');

  if (!siteId && siteDomain) {
    const siteRows = await prisma.$queryRaw<Array<{ id: string; product_id: string }>>`
      SELECT id::text, product_id::text
      FROM saas.site
      WHERE domain = ${siteDomain}
      LIMIT 1
    `;
    siteId = siteRows[0]?.id || '';
    if (!productId) productId = siteRows[0]?.product_id || '';
  }

  if (!productId && productSlug) {
    const productRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM saas.product
      WHERE slug = ${productSlug}
      LIMIT 1
    `;
    productId = productRows[0]?.id || '';
  }

  if (!productId) throw new Error('productId ou productSlug é obrigatório');

  if (input.id) {
    const id = requireUuid(input.id, 'id');
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE saas.email_template
      SET
        product_id = ${productId}::uuid,
        site_id = CASE WHEN ${siteId} <> '' THEN ${siteId}::uuid ELSE NULL END,
        template_key = ${templateKey},
        subject = ${subject},
        html = ${html || null},
        text = ${text || null},
        is_active = ${isActive},
        version = ${version},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text
    `;
    if (!rows[0]?.id) throw new Error('Template não encontrado para atualização');
    return rows[0].id;
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text
    FROM saas.email_template
    WHERE product_id = ${productId}::uuid
      AND (
        (${siteId} = '' AND site_id IS NULL)
        OR (${siteId} <> '' AND site_id = ${siteId}::uuid)
      )
      AND template_key = ${templateKey}
      AND version = ${version}
    LIMIT 1
  `;

  if (existing[0]?.id) {
    await prisma.$executeRaw`
      UPDATE saas.email_template
      SET subject = ${subject}, html = ${html || null}, text = ${text || null}, is_active = ${isActive}, updated_at = now()
      WHERE id = ${existing[0].id}::uuid
    `;
    return existing[0].id;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO saas.email_template (product_id, site_id, template_key, subject, html, text, is_active, version, created_at, updated_at)
    VALUES (${productId}::uuid, CASE WHEN ${siteId} <> '' THEN ${siteId}::uuid ELSE NULL END, ${templateKey}, ${subject}, ${html || null}, ${text || null}, ${isActive}, ${version}, now(), now())
    RETURNING id::text
  `;

  return rows[0]?.id || null;
}

export async function listSaasEventBindings() {
  await ensureSaasInfra();

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    product_id: string | null;
    product_name: string | null;
    product_slug: string | null;
    site_id: string | null;
    site_domain: string | null;
    event_key: string;
    template_id: string;
    template_key: string;
    template_subject: string;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT
      b.id::text,
      b.product_id::text,
      p.name AS product_name,
      p.slug AS product_slug,
      b.site_id::text,
      s.domain AS site_domain,
      b.event_key,
      b.template_id::text,
      t.template_key,
      t.subject AS template_subject,
      b.enabled,
      b.created_at,
      b.updated_at
    FROM saas.event_binding b
    LEFT JOIN saas.product p ON p.id = b.product_id
    LEFT JOIN saas.site s ON s.id = b.site_id
    JOIN saas.email_template t ON t.id = b.template_id
    ORDER BY b.event_key ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    siteId: row.site_id,
    siteDomain: row.site_domain,
    eventKey: row.event_key,
    templateId: row.template_id,
    templateKey: row.template_key,
    templateSubject: row.template_subject,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertSaasEventBinding(input: {
  id?: string;
  productId?: string;
  productSlug?: string;
  siteId?: string;
  siteDomain?: string;
  eventKey: string;
  templateId?: string;
  templateKey?: string;
  enabled?: boolean;
}) {
  await ensureSaasInfra();

  const eventKey = normalizeText(input.eventKey).toLowerCase();
  if (!eventKey) throw new Error('eventKey é obrigatório');

  let productId = normalizeText(input.productId, '');
  const productSlug = normalizeSlug(input.productSlug || '');
  let siteId = normalizeText(input.siteId, '');
  const siteDomain = normalizeDomain(input.siteDomain || '');

  if (!siteId && siteDomain) {
    const siteRows = await prisma.$queryRaw<Array<{ id: string; product_id: string }>>`
      SELECT id::text, product_id::text
      FROM saas.site
      WHERE domain = ${siteDomain}
      LIMIT 1
    `;
    siteId = siteRows[0]?.id || '';
    if (!productId) productId = siteRows[0]?.product_id || '';
  }

  if (!productId && productSlug) {
    const productRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM saas.product
      WHERE slug = ${productSlug}
      LIMIT 1
    `;
    productId = productRows[0]?.id || '';
  }

  let templateId = normalizeText(input.templateId, '');
  const templateKey = normalizeText(input.templateKey, '').toLowerCase();

  if (!templateId && templateKey && productId) {
    const templateRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM saas.email_template
      WHERE product_id = ${productId}::uuid
        AND (
          (${siteId} = '' AND site_id IS NULL)
          OR (${siteId} <> '' AND site_id = ${siteId}::uuid)
        )
        AND template_key = ${templateKey}
      ORDER BY version DESC, updated_at DESC
      LIMIT 1
    `;
    templateId = templateRows[0]?.id || '';
  }

  if (!templateId) throw new Error('templateId ou templateKey é obrigatório');
  if (!productId) throw new Error('productId ou productSlug é obrigatório');

  const enabled = normalizeBoolean(input.enabled, true);

  if (input.id) {
    const id = requireUuid(input.id, 'id');
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE saas.event_binding
      SET
        product_id = ${productId}::uuid,
        site_id = CASE WHEN ${siteId} <> '' THEN ${siteId}::uuid ELSE NULL END,
        event_key = ${eventKey},
        template_id = ${templateId}::uuid,
        enabled = ${enabled},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text
    `;
    if (!rows[0]?.id) throw new Error('Evento não encontrado para atualização');
    return rows[0].id;
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text
    FROM saas.event_binding
    WHERE product_id = ${productId}::uuid
      AND (
        (${siteId} = '' AND site_id IS NULL)
        OR (${siteId} <> '' AND site_id = ${siteId}::uuid)
      )
      AND event_key = ${eventKey}
    LIMIT 1
  `;

  if (existing[0]?.id) {
    await prisma.$executeRaw`
      UPDATE saas.event_binding
      SET template_id = ${templateId}::uuid, enabled = ${enabled}, updated_at = now()
      WHERE id = ${existing[0].id}::uuid
    `;
    return existing[0].id;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO saas.event_binding (product_id, site_id, event_key, template_id, enabled, created_at, updated_at)
    VALUES (${productId}::uuid, CASE WHEN ${siteId} <> '' THEN ${siteId}::uuid ELSE NULL END, ${eventKey}, ${templateId}::uuid, ${enabled}, now(), now())
    RETURNING id::text
  `;

  return rows[0]?.id || null;
}

export async function listSaasEmailAccounts() {
  await ensureSaasInfra();

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    product_id: string;
    product_name: string;
    product_slug: string;
    site_id: string | null;
    site_domain: string | null;
    email_label: string;
    from_name: string;
    from_email: string;
    reply_to: string | null;
    provider: string;
    is_default: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT
      a.id::text,
      a.product_id::text,
      p.name AS product_name,
      p.slug AS product_slug,
      a.site_id::text,
      s.domain AS site_domain,
      a.email_label,
      a.from_name,
      a.from_email,
      a.reply_to,
      a.provider,
      a.is_default,
      a.is_active,
      a.created_at,
      a.updated_at
    FROM saas.email_account a
    JOIN saas.product p ON p.id = a.product_id
    LEFT JOIN saas.site s ON s.id = a.site_id
    ORDER BY a.updated_at DESC, a.created_at DESC
  `;

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    siteId: row.site_id,
    siteDomain: row.site_domain,
    emailLabel: row.email_label,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    provider: row.provider,
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertSaasEmailAccount(input: {
  id?: string;
  productId?: string;
  productSlug?: string;
  siteId?: string;
  siteDomain?: string;
  emailLabel: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  provider?: string;
  isDefault?: boolean;
  isActive?: boolean;
}) {
  await ensureSaasInfra();

  const emailLabel = normalizeText(input.emailLabel);
  const fromName = normalizeText(input.fromName);
  const fromEmail = normalizeEmail(input.fromEmail);
  const replyTo = normalizeEmail(input.replyTo || '');
  const provider = normalizeText(input.provider, 'smtp').toLowerCase();
  const isDefault = normalizeBoolean(input.isDefault, false);
  const isActive = normalizeBoolean(input.isActive, true);

  if (!emailLabel) throw new Error('emailLabel é obrigatório');
  if (!fromName) throw new Error('fromName é obrigatório');
  if (!fromEmail) throw new Error('fromEmail inválido');

  let productId = normalizeText(input.productId, '');
  const productSlug = normalizeSlug(input.productSlug || '');
  let siteId = normalizeText(input.siteId, '');
  const siteDomain = normalizeDomain(input.siteDomain || '');

  if (!siteId && siteDomain) {
    const siteRows = await prisma.$queryRaw<Array<{ id: string; product_id: string }>>`
      SELECT id::text, product_id::text
      FROM saas.site
      WHERE domain = ${siteDomain}
      LIMIT 1
    `;
    siteId = siteRows[0]?.id || '';
    if (!productId) productId = siteRows[0]?.product_id || '';
  }

  if (!productId && productSlug) {
    const productRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text
      FROM saas.product
      WHERE slug = ${productSlug}
      LIMIT 1
    `;
    productId = productRows[0]?.id || '';
  }

  if (!productId) throw new Error('productId ou productSlug é obrigatório');

  if (isDefault) {
    await prisma.$executeRaw`
      UPDATE saas.email_account
      SET is_default = false, updated_at = now()
      WHERE product_id = ${productId}::uuid
        AND (
          (${siteId} = '' AND site_id IS NULL)
          OR (${siteId} <> '' AND site_id = ${siteId}::uuid)
        )
    `;
  }

  if (input.id) {
    const id = requireUuid(input.id, 'id');
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE saas.email_account
      SET
        product_id = ${productId}::uuid,
        site_id = CASE WHEN ${siteId} <> '' THEN ${siteId}::uuid ELSE NULL END,
        email_label = ${emailLabel},
        from_name = ${fromName},
        from_email = ${fromEmail},
        reply_to = ${replyTo || null},
        provider = ${provider},
        is_default = ${isDefault},
        is_active = ${isActive},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text
    `;
    if (!rows[0]?.id) throw new Error('Conta de e-mail não encontrada para atualização');
    return rows[0].id;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO saas.email_account (
      product_id,
      site_id,
      email_label,
      from_name,
      from_email,
      reply_to,
      provider,
      is_default,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      ${productId}::uuid,
      CASE WHEN ${siteId} <> '' THEN ${siteId}::uuid ELSE NULL END,
      ${emailLabel},
      ${fromName},
      ${fromEmail},
      ${replyTo || null},
      ${provider},
      ${isDefault},
      ${isActive},
      now(),
      now()
    )
    RETURNING id::text
  `;

  return rows[0]?.id || null;
}
