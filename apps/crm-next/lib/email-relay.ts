import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ensureSaasInfra } from '@/lib/saas';

const MIME_PREFIX = 'KH_MIME_V1:';
const MAX_SLUG_LENGTH = 80;
const MAX_PRODUCT_LENGTH = 120;
const MAX_SITE_LENGTH = 190;
const MAX_SUBJECT_LENGTH = 220;
const MAX_HTML_LENGTH = 300_000;
const MAX_TEXT_LENGTH = 120_000;

const SLUG_ALIASES: Record<string, string[]> = {
  welcome_email: ['welcome_email', 'welcome'],
  password_reset: ['password_reset', 'reset_password'],
};

type RelayTemplateRow = {
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
  version: number;
  updated_at: Date;
};

type SenderAccount = {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  site_id: string | null;
  site_domain: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  provider: string;
  is_default: boolean;
};

type RelayLogInput = {
  siteId: string | null;
  templateId: string | null;
  eventKey: string;
  recipient: string;
  subject: string;
  status: string;
  provider: string;
  providerMessageId?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export type ResolveRelayTemplateResult =
  | {
      ok: true;
      template: {
        subject: string;
        html: string;
        variables: string[];
      };
      templateId: string;
      templateKey: string;
      version: number;
      updatedAt: Date;
      scope: {
        product: string | null;
        site: string | null;
      };
    }
  | {
      ok: false;
      statusCode: number;
      message: string;
    };

export type DispatchRelayInput = {
  product: string;
  site?: string;
  slug: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  trackToInbox?: boolean;
  metadata?: Record<string, unknown>;
};

export type DispatchRelayResult =
  | {
      ok: true;
      success: true;
      message: string;
      queueId: string;
      logId: string | null;
      provider: string;
      from: string;
    }
  | {
      ok: false;
      success: false;
      statusCode: number;
      message: string;
      logId?: string | null;
    };

function normalizeDomain(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

function normalizeSlug(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeProductLookup(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeSubject(value: unknown) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function normalizeTextContent(value: unknown) {
  return String(value || '').trim();
}

function sanitizeHtmlInput(value: unknown) {
  const html = String(value || '').trim();
  if (!html) return '';
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const allowed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const safeKey = String(key || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    if (!safeKey) continue;
    if (value === null) {
      allowed[safeKey] = null;
      continue;
    }
    if (typeof value === 'string') {
      allowed[safeKey] = value.slice(0, 500);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      allowed[safeKey] = value;
      continue;
    }
  }

  return allowed;
}

function maskRecipientForLog(email: string) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  if (!local) return `***@${domain}`;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function resolveTemplateCandidates(slug: string) {
  const normalized = normalizeSlug(slug);
  const aliasCandidates = SLUG_ALIASES[normalized] || [];
  const baseCandidates = [normalized, normalized.replace(/-/g, '_')];
  return Array.from(new Set([...baseCandidates, ...aliasCandidates].filter(Boolean)));
}

function extractTemplateVariables(...contents: Array<string | null | undefined>) {
  const set = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  for (const content of contents) {
    const source = String(content || '');
    let match: RegExpExecArray | null = regex.exec(source);
    while (match) {
      const variable = String(match[1] || '').trim();
      if (variable) set.add(variable);
      match = regex.exec(source);
    }
    regex.lastIndex = 0;
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  const raw = String(error || '').trim();
  return raw || fallback;
}

async function createRelayLog(input: RelayLogInput) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO saas.email_log (
      site_id,
      template_id,
      event_key,
      recipient,
      subject,
      provider,
      status,
      provider_message_id,
      request_payload_json,
      response_payload_json,
      error_message,
      created_at
    )
    VALUES (
      ${input.siteId}::uuid,
      ${input.templateId}::uuid,
      ${input.eventKey},
      ${input.recipient},
      ${input.subject},
      ${input.provider},
      ${input.status},
      ${input.providerMessageId || null},
      ${input.requestPayload ? JSON.stringify(input.requestPayload) : null}::jsonb,
      ${input.responsePayload ? JSON.stringify(input.responsePayload) : null}::jsonb,
      ${input.errorMessage || null},
      now()
    )
    RETURNING id::text
  `;

  return rows[0]?.id || null;
}

async function resolveProductByNameOrSlug(product: string) {
  const lookup = normalizeProductLookup(product);
  if (!lookup) return null;

  const productRows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
    SELECT id::text, name, slug
    FROM saas.product
    WHERE lower(name) = ${lookup}
      OR lower(slug) = ${lookup}
    ORDER BY CASE WHEN lower(name) = ${lookup} THEN 0 ELSE 1 END
    LIMIT 1
  `;

  return productRows[0] || null;
}

async function resolveSiteByDomain(site: string, productId: string) {
  const domain = normalizeDomain(site);
  if (!domain) return null;

  const siteRows = await prisma.$queryRaw<Array<{ id: string; domain: string }>>`
    SELECT id::text, domain
    FROM saas.site
    WHERE product_id = ${productId}::uuid
      AND domain = ${domain}
      AND is_active = true
    LIMIT 1
  `;

  return siteRows[0] || null;
}

async function resolveSenderAccount(productId: string, siteId?: string | null): Promise<SenderAccount | null> {
  const scopedSiteId = String(siteId || '').trim() || null;
  const hasScopedSite = Boolean(scopedSiteId);

  const scopedRows = await prisma.$queryRaw<Array<SenderAccount>>`
    SELECT
      a.id::text,
      a.product_id::text,
      p.name AS product_name,
      p.slug AS product_slug,
      a.site_id::text,
      s.domain AS site_domain,
      a.from_name,
      a.from_email,
      a.reply_to,
      a.provider,
      a.is_default,
      a.is_active
    FROM saas.email_account a
    JOIN saas.product p ON p.id = a.product_id
    LEFT JOIN saas.site s ON s.id = a.site_id
    WHERE a.product_id = ${productId}::uuid
      AND a.is_active = true
      AND (
        (${hasScopedSite} = true AND (a.site_id = ${scopedSiteId}::uuid OR a.site_id IS NULL))
        OR (${hasScopedSite} = false AND a.site_id IS NULL)
      )
    ORDER BY
      CASE WHEN ${hasScopedSite} = true AND a.site_id = ${scopedSiteId}::uuid THEN 0 ELSE 1 END,
      CASE WHEN a.is_default THEN 0 ELSE 1 END,
      a.updated_at DESC,
      a.created_at DESC
    LIMIT 1
  `;

  if (scopedRows[0]) return scopedRows[0];

  const fallbackRows = await prisma.$queryRaw<Array<SenderAccount>>`
    SELECT
      a.id::text,
      a.product_id::text,
      p.name AS product_name,
      p.slug AS product_slug,
      a.site_id::text,
      s.domain AS site_domain,
      a.from_name,
      a.from_email,
      a.reply_to,
      a.provider,
      a.is_default,
      a.is_active
    FROM saas.email_account a
    JOIN saas.product p ON p.id = a.product_id
    LEFT JOIN saas.site s ON s.id = a.site_id
    WHERE a.product_id = ${productId}::uuid
      AND a.is_active = true
    ORDER BY CASE WHEN a.is_default THEN 0 ELSE 1 END, a.updated_at DESC, a.created_at DESC
    LIMIT 1
  `;

  return fallbackRows[0] || null;
}

async function resolveTemplateRowByScope(input: {
  slug: string;
  productId?: string;
  siteId?: string;
  productHint?: string;
}) {
  const candidates = resolveTemplateCandidates(input.slug);
  if (candidates.length === 0) return null;

  const candidatesSql = Prisma.join(candidates.map((candidate) => Prisma.sql`${candidate}`));
  const productId = String(input.productId || '').trim() || null;
  const siteId = String(input.siteId || '').trim() || null;
  const hasProduct = Boolean(productId);
  const hasSite = Boolean(siteId);
  const productHint = normalizeProductLookup(input.productHint || 'praja');

  const rows = await prisma.$queryRaw<Array<RelayTemplateRow>>`
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
      t.version,
      t.updated_at
    FROM saas.email_template t
    LEFT JOIN saas.product p ON p.id = t.product_id
    LEFT JOIN saas.site s ON s.id = t.site_id
    WHERE t.is_active = true
      AND lower(t.template_key) IN (${candidatesSql})
      AND (${hasProduct} = false OR t.product_id = ${productId}::uuid)
      AND (${hasSite} = false OR t.site_id = ${siteId}::uuid OR t.site_id IS NULL)
    ORDER BY
      CASE
        WHEN ${hasProduct} = true AND t.product_id = ${productId}::uuid THEN 0
        WHEN lower(coalesce(p.slug, '')) = ${productHint} OR lower(coalesce(p.name, '')) = ${productHint} THEN 1
        ELSE 2
      END,
      CASE WHEN ${hasSite} = true AND t.site_id = ${siteId}::uuid THEN 0 ELSE 1 END,
      t.version DESC,
      t.updated_at DESC
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function resolveRelayTemplate(input: {
  slug: string;
  product?: string;
  site?: string;
}): Promise<ResolveRelayTemplateResult> {
  await ensureSaasInfra();

  const slug = normalizeSlug(input.slug);
  if (!slug || slug.length > MAX_SLUG_LENGTH) {
    return {
      ok: false,
      statusCode: 422,
      message: 'slug inválido',
    };
  }

  let productId = '';
  let productName: string | null = null;
  let siteId = '';
  let siteDomain: string | null = null;
  const productRaw = String(input.product || '').trim();
  const siteRaw = String(input.site || '').trim();

  if (productRaw && productRaw.length > MAX_PRODUCT_LENGTH) {
    return {
      ok: false,
      statusCode: 422,
      message: `product inválido (máximo ${MAX_PRODUCT_LENGTH} caracteres)`,
    };
  }

  if (siteRaw && siteRaw.length > MAX_SITE_LENGTH) {
    return {
      ok: false,
      statusCode: 422,
      message: `site inválido (máximo ${MAX_SITE_LENGTH} caracteres)`,
    };
  }

  if (productRaw) {
    const product = await resolveProductByNameOrSlug(productRaw);
    if (!product) {
      return {
        ok: false,
        statusCode: 404,
        message: 'Produto não encontrado para resolver template',
      };
    }
    productId = product.id;
    productName = product.name;

    if (siteRaw) {
      const site = await resolveSiteByDomain(siteRaw, product.id);
      if (!site) {
        return {
          ok: false,
          statusCode: 404,
          message: 'Site não encontrado para o produto informado',
        };
      }
      siteId = site.id;
      siteDomain = site.domain;
    }
  }

  const resolved = await resolveTemplateRowByScope({
    slug,
    productId: productId || undefined,
    siteId: siteId || undefined,
    productHint: productName || input.product || 'praja',
  });

  if (!resolved) {
    return {
      ok: false,
      statusCode: 404,
      message: 'Template não encontrado para o slug informado',
    };
  }

  return {
    ok: true,
    template: {
      subject: resolved.subject,
      html: resolved.html || '',
      variables: extractTemplateVariables(resolved.subject, resolved.html, resolved.text),
    },
    templateId: resolved.id,
    templateKey: resolved.template_key,
    version: resolved.version,
    updatedAt: resolved.updated_at,
    scope: {
      product: resolved.product_name,
      site: resolved.site_domain,
    },
  };
}

export async function dispatchRelayEmail(input: DispatchRelayInput): Promise<DispatchRelayResult> {
  await ensureSaasInfra();

  const productRaw = String(input.product || '').trim();
  const siteRaw = String(input.site || '').trim();
  const slug = normalizeSlug(input.slug);
  const to = normalizeEmail(input.to);
  const subject = normalizeSubject(input.subject);
  const html = sanitizeHtmlInput(input.html);
  const text = normalizeTextContent(input.text);
  const trackToInbox = Boolean(input.trackToInbox);
  const metadata = sanitizeMetadata(input.metadata);

  if (!productRaw) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: 'product é obrigatório',
    };
  }
  if (productRaw.length > MAX_PRODUCT_LENGTH) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: `product inválido (máximo ${MAX_PRODUCT_LENGTH} caracteres)`,
    };
  }
  if (siteRaw.length > MAX_SITE_LENGTH) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: `site inválido (máximo ${MAX_SITE_LENGTH} caracteres)`,
    };
  }
  if (!slug || slug.length > MAX_SLUG_LENGTH) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: 'slug inválido',
    };
  }
  if (!to) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: 'to inválido',
    };
  }
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: `subject inválido (máximo ${MAX_SUBJECT_LENGTH} caracteres)`,
    };
  }
  if (!html && !text) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: 'Informe html ou text para envio',
    };
  }
  if (html.length > MAX_HTML_LENGTH) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: `html excede o limite de ${MAX_HTML_LENGTH} caracteres`,
    };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: `text excede o limite de ${MAX_TEXT_LENGTH} caracteres`,
    };
  }

  const product = await resolveProductByNameOrSlug(productRaw);
  if (!product) {
    return {
      ok: false,
      success: false,
      statusCode: 404,
      message: 'Produto não encontrado',
    };
  }

  let siteId: string | null = null;
  let siteDomain: string | null = null;
  if (siteRaw) {
    const site = await resolveSiteByDomain(siteRaw, product.id);
    if (!site) {
      return {
        ok: false,
        success: false,
        statusCode: 404,
        message: 'Site não encontrado para o produto informado',
      };
    }
    siteId = site.id;
    siteDomain = site.domain;
  }

  const sender = await resolveSenderAccount(product.id, siteId);
  if (!sender) {
    return {
      ok: false,
      success: false,
      statusCode: 422,
      message: 'Nenhum remetente ativo configurado para product/site',
    };
  }

  const resolvedTemplate = await resolveTemplateRowByScope({
    slug,
    productId: product.id,
    siteId: siteId || undefined,
    productHint: product.slug,
  });

  const logEventKey = `relay.${slug}`;
  const safeRequestPayload = {
    product: product.slug,
    site: siteDomain,
    slug,
    toMasked: maskRecipientForLog(to),
    trackToInbox,
    metadata,
  };

  try {
    const packedBody = `${MIME_PREFIX}${JSON.stringify({
      html: html || undefined,
      text: text || undefined,
      fromName: sender.from_name,
      fromEmail: sender.from_email,
      replyTo: sender.reply_to || undefined,
      provider: sender.provider,
      trackToInbox,
      metadata,
      relay: {
        origin: 'crm_email_dispatch_api',
        product: product.slug,
        site: siteDomain,
        slug,
      },
    })}`;

    const queued = await prisma.emailQueue.create({
      data: {
        organizationId: null,
        emailTo: to,
        subject,
        body: packedBody,
        attachments: [],
        status: 'PENDING',
      },
    });

    const logId = await createRelayLog({
      siteId,
      templateId: resolvedTemplate?.id || null,
      eventKey: logEventKey,
      recipient: to,
      subject,
      provider: sender.provider,
      status: 'QUEUED',
      providerMessageId: queued.id,
      requestPayload: safeRequestPayload,
      responsePayload: {
        queueId: queued.id,
        provider: sender.provider,
        fromEmail: sender.from_email,
      },
    });

    return {
      ok: true,
      success: true,
      message: 'Email enfileirado para envio',
      queueId: queued.id,
      logId,
      provider: sender.provider,
      from: sender.from_email,
    };
  } catch (error) {
    const message = getErrorMessage(error, 'Falha ao enfileirar envio de e-mail');
    const logId = await createRelayLog({
      siteId,
      templateId: resolvedTemplate?.id || null,
      eventKey: logEventKey,
      recipient: to,
      subject,
      provider: sender.provider,
      status: 'FAILED',
      requestPayload: safeRequestPayload,
      responsePayload: null,
      errorMessage: message,
    }).catch(() => null);

    return {
      ok: false,
      success: false,
      statusCode: 500,
      message,
      logId,
    };
  }
}
