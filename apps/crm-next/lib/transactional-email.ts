import { prisma } from '@/lib/prisma';
import { ensureSaasInfra } from '@/lib/saas';

const EMAIL_PROVIDER = 'crm.email_queue';
const MIME_PREFIX = 'KH_MIME_V1:';

type SendTransactionalEmailInput = {
  site: string;
  event: string;
  to: string;
  variables?: Record<string, unknown>;
};

type ResolvedBinding = {
  siteId: string;
  templateId: string;
  templateKey: string;
  subject: string;
  html: string | null;
  text: string | null;
};

export type SendTransactionalEmailResult =
  | {
      ok: true;
      logId: string | null;
      queueId: string;
      siteId: string;
      templateId: string;
      templateKey: string;
      status: 'QUEUED';
    }
  | {
      ok: false;
      logId: string | null;
      code: string;
      error: string;
      statusCode: number;
    };

function normalizeDomain(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

function normalizeEvent(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : '';
}

function sanitizeVariables(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toFlatKey(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return '';
}

function getPathValue(variables: Record<string, unknown>, path: string) {
  const keys = path.split('.').map((part) => part.trim()).filter(Boolean);
  if (keys.length === 0) return undefined;

  let cursor: unknown = variables;
  for (const key of keys) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }

  return cursor;
}

function buildFlatVariableIndex(variables: Record<string, unknown>) {
  const index = new Map<string, string>();
  for (const [key, value] of Object.entries(variables)) {
    const flatKey = toFlatKey(key);
    if (!flatKey) continue;
    const textValue = toStringValue(value);
    if (textValue !== '') index.set(flatKey, textValue);
  }
  return index;
}

function resolvePlaceholderValue(
  placeholder: string,
  variables: Record<string, unknown>,
  flatIndex: Map<string, string>,
) {
  const byPath = getPathValue(variables, placeholder);
  const byPathText = toStringValue(byPath);
  if (byPathText) return byPathText;

  const key = toFlatKey(placeholder);
  if (!key) return '';
  const direct = flatIndex.get(key);
  if (direct) return direct;

  if (key === 'resetlink' && flatIndex.get('reseturl')) return flatIndex.get('reseturl') || '';
  if (key === 'reseturl' && flatIndex.get('resetlink')) return flatIndex.get('resetlink') || '';
  if (key === 'name') return 'Cliente';

  return '';
}

function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  mode: 'html' | 'text',
) {
  const flatIndex = buildFlatVariableIndex(variables);
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, rawKey: string) => {
    const value = resolvePlaceholderValue(rawKey, variables, flatIndex);
    if (!value) return '';
    return mode === 'html' ? escapeHtml(value) : value;
  });
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveBinding(siteDomain: string, eventKey: string): Promise<ResolvedBinding | null> {
  const siteRows = await prisma.$queryRaw<Array<{ site_id: string; product_id: string }>>`
    SELECT s.id::text AS site_id, s.product_id::text AS product_id
    FROM saas.site s
    WHERE s.domain = ${siteDomain}
      AND s.is_active = true
    LIMIT 1
  `;
  const site = siteRows[0];
  if (!site) return null;

  const bindingRows = await prisma.$queryRaw<Array<{
    template_id: string;
    template_key: string;
    subject: string;
    html: string | null;
    text: string | null;
  }>>`
    SELECT
      t.id::text AS template_id,
      t.template_key,
      t.subject,
      t.html,
      t.text
    FROM saas.event_binding b
    JOIN saas.email_template t ON t.id = b.template_id
    WHERE b.product_id = ${site.product_id}::uuid
      AND b.event_key = ${eventKey}
      AND b.enabled = true
      AND t.is_active = true
      AND (b.site_id = ${site.site_id}::uuid OR b.site_id IS NULL)
    ORDER BY
      CASE WHEN b.site_id = ${site.site_id}::uuid THEN 0 ELSE 1 END,
      t.version DESC,
      t.updated_at DESC
    LIMIT 1
  `;
  const row = bindingRows[0];
  if (!row) return null;

  return {
    siteId: site.site_id,
    templateId: row.template_id,
    templateKey: row.template_key,
    subject: row.subject,
    html: row.html,
    text: row.text,
  };
}

async function createEmailLog(input: {
  siteId: string | null;
  templateId: string | null;
  eventKey: string;
  recipient: string;
  subject: string;
  status: string;
  provider?: string;
  providerMessageId?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
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
      ${input.provider || EMAIL_PROVIDER},
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

export async function sendTransactionalEmail(input: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  await ensureSaasInfra();

  const site = normalizeDomain(input.site);
  const event = normalizeEvent(input.event);
  const to = normalizeEmail(input.to);
  const variables = sanitizeVariables(input.variables);

  if (!site) {
    return { ok: false, logId: null, code: 'SITE_REQUIRED', error: 'site é obrigatório', statusCode: 422 };
  }
  if (!event) {
    return { ok: false, logId: null, code: 'EVENT_REQUIRED', error: 'event é obrigatório', statusCode: 422 };
  }
  if (!to) {
    return { ok: false, logId: null, code: 'RECIPIENT_INVALID', error: 'to inválido', statusCode: 422 };
  }

  const requestPayload = { site, event, to, variables };
  const variableIndex = buildFlatVariableIndex(variables);
  let siteId: string | null = null;
  let templateId: string | null = null;
  let subject = '';

  if (event === 'auth.password_reset_requested') {
    const resetUrl = resolvePlaceholderValue('resetUrl', variables, variableIndex);
    if (!resetUrl) {
      return {
        ok: false,
        logId: null,
        code: 'RESET_URL_REQUIRED',
        error: 'variables.resetUrl é obrigatório para auth.password_reset_requested',
        statusCode: 422,
      };
    }
  }

  try {
    const resolved = await resolveBinding(site, event);
    if (!resolved) {
      const logId = await createEmailLog({
        siteId: null,
        templateId: null,
        eventKey: event,
        recipient: to,
        subject: '(template não encontrado)',
        status: 'FAILED',
        requestPayload,
        errorMessage: 'Nenhum binding/template ativo para site + event',
      });
      return {
        ok: false,
        logId,
        code: 'BINDING_NOT_FOUND',
        error: 'Nenhum binding/template ativo para site + event',
        statusCode: 404,
      };
    }

    siteId = resolved.siteId;
    templateId = resolved.templateId;
    subject = renderTemplate(resolved.subject, variables, 'text').trim() || resolved.subject;
    const html = resolved.html ? renderTemplate(resolved.html, variables, 'html').trim() : '';
    const textRaw = resolved.text ? renderTemplate(resolved.text, variables, 'text').trim() : '';
    const text = textRaw || (html ? stripHtml(html) : '');
    if (!text && !html) {
      throw new Error('Template sem conteúdo renderizável');
    }

    const body = `${MIME_PREFIX}${JSON.stringify({ html: html || undefined, text: text || undefined })}`;
    const queued = await prisma.emailQueue.create({
      data: {
        organizationId: null,
        emailTo: to,
        subject,
        body,
        attachments: [],
        status: 'PENDING',
      },
    });

    const responsePayload = {
      queueId: queued.id,
      queueStatus: queued.status,
      provider: EMAIL_PROVIDER,
    };
    const logId = await createEmailLog({
      siteId,
      templateId,
      eventKey: event,
      recipient: to,
      subject,
      status: 'QUEUED',
      provider: EMAIL_PROVIDER,
      providerMessageId: queued.id,
      requestPayload,
      responsePayload,
    });

    return {
      ok: true,
      logId,
      queueId: queued.id,
      siteId,
      templateId,
      templateKey: resolved.templateKey,
      status: 'QUEUED',
    };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || 'Falha ao processar envio de e-mail');
    const logId = await createEmailLog({
      siteId,
      templateId,
      eventKey: event,
      recipient: to,
      subject: subject || '(sem assunto)',
      status: 'FAILED',
      provider: EMAIL_PROVIDER,
      requestPayload,
      responsePayload: null,
      errorMessage: message,
    }).catch(() => null);

    return {
      ok: false,
      logId,
      code: 'SEND_FAILED',
      error: message,
      statusCode: 500,
    };
  }
}

export async function listTransactionalEmailLogs(limit = 120) {
  await ensureSaasInfra();

  const safeLimit = Math.max(1, Math.min(300, Math.round(Number(limit) || 120)));
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    site_id: string | null;
    site_domain: string | null;
    template_id: string | null;
    template_key: string | null;
    event_key: string;
    recipient: string;
    subject: string;
    provider: string;
    status: string;
    provider_message_id: string | null;
    error_message: string | null;
    created_at: Date;
  }>>`
    SELECT
      l.id::text,
      l.site_id::text,
      s.domain AS site_domain,
      l.template_id::text,
      t.template_key,
      l.event_key,
      l.recipient,
      l.subject,
      l.provider,
      l.status,
      l.provider_message_id,
      l.error_message,
      l.created_at
    FROM saas.email_log l
    LEFT JOIN saas.site s ON s.id = l.site_id
    LEFT JOIN saas.email_template t ON t.id = l.template_id
    ORDER BY l.created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map((row) => ({
    id: row.id,
    siteId: row.site_id,
    siteDomain: row.site_domain,
    templateId: row.template_id,
    templateKey: row.template_key,
    eventKey: row.event_key,
    recipient: row.recipient,
    subject: row.subject,
    provider: row.provider,
    status: row.status,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }));
}
