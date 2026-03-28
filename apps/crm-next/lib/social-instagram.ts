import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const FACEBOOK_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
] as const;

const SENSITIVE_FIELDS = new Set([
  'access_token',
  'client_secret',
  'fb_exchange_token',
  'code',
]);

export class MetaGraphRequestError extends Error {
  status: number;
  response: unknown;

  constructor(message: string, status: number, response: unknown) {
    super(message);
    this.name = 'MetaGraphRequestError';
    this.status = status;
    this.response = response;
  }
}

type GraphMethod = 'GET' | 'POST';

type GraphRequestOptions = {
  action: string;
  endpoint: string;
  method?: GraphMethod;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  accountId?: string | null;
  postId?: string | null;
};

type GraphResponse<T> = {
  status: number;
  data: T;
};

export function getMetaGraphApiVersion() {
  const raw = String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim();
  if (!raw) return 'v21.0';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

export function hasMetaInstagramConfig() {
  return Boolean(
    String(process.env.META_APP_ID || '').trim() &&
      String(process.env.META_APP_SECRET || '').trim() &&
      String(process.env.META_REDIRECT_URI || '').trim(),
  );
}

export function getMetaInstagramConfig() {
  const appId = String(process.env.META_APP_ID || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  const redirectUri = String(process.env.META_REDIRECT_URI || '').trim();

  if (!appId || !appSecret || !redirectUri) {
    throw new Error('Configuração Meta ausente (META_APP_ID, META_APP_SECRET, META_REDIRECT_URI).');
  }

  return {
    appId,
    appSecret,
    redirectUri,
    graphApiVersion: getMetaGraphApiVersion(),
  };
}

export function buildInstagramOAuthUrl(state: string) {
  const config = getMetaInstagramConfig();
  const query = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: FACEBOOK_OAUTH_SCOPES.join(','),
    state,
  });

  return `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth?${query.toString()}`;
}

export function parseExpiresAt(expiresIn: unknown) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + Math.round(seconds) * 1000);
}

export async function graphApiRequest<T>(options: GraphRequestOptions): Promise<GraphResponse<T>> {
  const config = getMetaInstagramConfig();
  const method = options.method || 'GET';
  const endpoint = options.endpoint.replace(/^\/+/, '');
  const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/${endpoint}`);

  if (method === 'GET') {
    appendQuery(url.searchParams, options.query || {});
  }

  const requestPayload = {
    query: options.query || null,
    body: options.body || null,
  };

  const fetchInit: RequestInit = {
    method,
  };

  if (method === 'POST') {
    const form = new URLSearchParams();
    appendQuery(form, options.body || {});
    fetchInit.headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    fetchInit.body = form;
  }

  let parsedResponse: unknown = null;
  let statusCode: number | null = null;

  try {
    const response = await fetch(url.toString(), fetchInit);
    statusCode = response.status;
    parsedResponse = await parseResponseBody(response);

    const apiError = pickApiError(parsedResponse);
    const success = response.ok && apiError === null;

    await createInstagramLog({
      action: options.action,
      endpoint: `/${endpoint}`,
      method,
      accountId: options.accountId || null,
      postId: options.postId || null,
      requestPayload,
      responsePayload: parsedResponse,
      statusCode,
      success,
      errorMessage: apiError || null,
    });

    if (!success) {
      throw new MetaGraphRequestError(apiError || `Falha HTTP ${response.status}`, response.status, parsedResponse);
    }

    return {
      status: response.status,
      data: parsedResponse as T,
    };
  } catch (error) {
    if (statusCode === null) {
      await createInstagramLog({
        action: options.action,
        endpoint: `/${endpoint}`,
        method,
        accountId: options.accountId || null,
        postId: options.postId || null,
        requestPayload,
        responsePayload: parsedResponse,
        statusCode: null,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    if (error instanceof MetaGraphRequestError) {
      throw error;
    }

    throw new Error(`Falha na chamada da Meta Graph API: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type CreateInstagramLogInput = {
  action: string;
  endpoint?: string | null;
  method?: string | null;
  accountId?: string | null;
  postId?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  statusCode?: number | null;
  success: boolean;
  errorMessage?: string | null;
};

export async function createInstagramLog(input: CreateInstagramLogInput) {
  try {
    const requestPayload = sanitizeForLog(input.requestPayload);
    const responsePayload = sanitizeForLog(input.responsePayload);

    await prisma.socialInstagramLog.create({
      data: {
        action: input.action,
        endpoint: input.endpoint || null,
        httpMethod: input.method || null,
        accountId: input.accountId || null,
        postId: input.postId || null,
        ...(requestPayload === null ? {} : { requestPayload: requestPayload as Prisma.InputJsonValue }),
        ...(responsePayload === null ? {} : { responsePayload: responsePayload as Prisma.InputJsonValue }),
        statusCode: input.statusCode ?? null,
        success: input.success,
        errorMessage: input.errorMessage || null,
      },
    });
  } catch (error) {
    console.error('[social-instagram] falha ao registrar log', error);
  }
}

function appendQuery(target: URLSearchParams, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === '') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined || item === '') continue;
        target.append(key, String(item));
      }
      continue;
    }

    target.set(key, String(value));
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function pickApiError(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const maybeError = (payload as Record<string, unknown>).error;
  if (!maybeError || typeof maybeError !== 'object') return null;

  const errObj = maybeError as Record<string, unknown>;
  const message = typeof errObj.message === 'string' ? errObj.message : 'Erro da Meta Graph API';
  const type = typeof errObj.type === 'string' ? errObj.type : null;
  if (!type) return message;
  return `${type}: ${message}`;
}

function sanitizeForLog(payload: unknown): Prisma.JsonValue | null {
  if (payload === undefined) return null;
  return sanitizeValue(payload);
}

function sanitizeValue(value: unknown): Prisma.JsonValue {
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const output: Record<string, Prisma.JsonValue> = {};

    for (const [key, nestedValue] of Object.entries(objectValue)) {
      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitizeValue(nestedValue);
      }
    }

    return output;
  }

  if (typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return String(value);
}
