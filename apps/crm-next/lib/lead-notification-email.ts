import { prisma } from '@/lib/prisma';

const MIME_PREFIX = 'KH_MIME_V1:';
const DEFAULT_LEAD_NOTIFICATION_EMAIL = 'contato@koddahub.com.br';

type LeadNotificationEmailInput = {
  source: 'site_form' | 'manual';
  leadId: string;
  dealId: string;
  name: string;
  email: string | null;
  phone: string | null;
  interest: string | null;
  intent?: string | null;
  category?: string | null;
  dealType?: string | null;
  origin?: string | null;
  payload?: unknown;
};

function normalizeEmail(value: unknown) {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : '';
}

function sanitizeInline(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function notifyNewLeadByEmail(input: LeadNotificationEmailInput) {
  const recipient = normalizeEmail(process.env.LEAD_NOTIFICATION_EMAIL_TO || DEFAULT_LEAD_NOTIFICATION_EMAIL);
  if (!recipient) return null;

  const leadName = sanitizeInline(input.name) || 'Lead sem nome';
  const subject = `[CRM] Novo lead recebido: ${leadName}`;
  const createdAtText = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const payloadText = input.payload ? JSON.stringify(input.payload, null, 2) : '{}';

  const htmlBody = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:18px;">
      <h2 style="margin:0 0 12px;">Novo lead recebido no CRM</h2>
      <p style="margin:0 0 14px;">Um novo lead foi cadastrado e precisa de acompanhamento.</p>
      <table style="border-collapse:collapse;width:100%;background:#ffffff;border:1px solid #e2e8f0;">
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Nome</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(leadName)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>E-mail</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.email || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Telefone</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.phone || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Interesse</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.interest || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Intent</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.intent || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Categoria</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.category || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Tipo de deal</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.dealType || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Origem</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.origin || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Canal</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.source)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Lead ID</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.leadId)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><b>Deal ID</b></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.dealId)}</td></tr>
          <tr><td style="padding:8px;"><b>Recebido em</b></td><td style="padding:8px;">${escapeHtml(createdAtText)}</td></tr>
        </tbody>
      </table>
      <p style="margin:14px 0 6px;"><b>Payload recebido:</b></p>
      <pre style="margin:0;padding:10px;background:#0f172a;color:#e2e8f0;border-radius:8px;overflow:auto;max-height:300px;">${escapeHtml(payloadText)}</pre>
    </div>
  `.trim();

  const textBody = [
    'Novo lead recebido no CRM',
    '',
    `Nome: ${leadName}`,
    `E-mail: ${input.email || '-'}`,
    `Telefone: ${input.phone || '-'}`,
    `Interesse: ${input.interest || '-'}`,
    `Intent: ${input.intent || '-'}`,
    `Categoria: ${input.category || '-'}`,
    `Tipo de deal: ${input.dealType || '-'}`,
    `Origem: ${input.origin || '-'}`,
    `Canal: ${input.source}`,
    `Lead ID: ${input.leadId}`,
    `Deal ID: ${input.dealId}`,
    `Recebido em: ${createdAtText}`,
    '',
    'Payload recebido:',
    payloadText,
  ].join('\n');

  const packedBody = `${MIME_PREFIX}${JSON.stringify({ html: htmlBody, text: textBody })}`;
  const queued = await prisma.emailQueue.create({
    data: {
      organizationId: null,
      emailTo: recipient,
      subject,
      body: packedBody,
      attachments: [],
      status: 'PENDING',
    },
  });

  return queued.id;
}
