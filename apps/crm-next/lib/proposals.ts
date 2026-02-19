import { toCentsFromInput } from '@/lib/money';

const PLAN_MONTHLY_CENTS: Record<string, number> = {
  basic: 14999,
  profissional: 24900,
  pro: 39900,
};

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildProposalValueCents(input: {
  proposalType: string;
  planCode?: string | null;
  baseValue?: unknown;
  features?: string[];
}) {
  const proposalType = (input.proposalType || '').toLowerCase();
  if (proposalType === 'hospedagem') {
    const key = (input.planCode || 'basic').toLowerCase();
    return PLAN_MONTHLY_CENTS[key] ?? PLAN_MONTHLY_CENTS.basic;
  }

  const base = toCentsFromInput(input.baseValue ?? 0);
  const extras = (input.features || []).length * 8900;
  return base + extras;
}

export function renderSimpleProposalPdf(lines: string[]) {
  const sanitized = lines.map((line) => escapePdfText(line));
  const textOps = sanitized.map((line) => `(${line}) Tj`).join(' T* ');
  const content = `BT\n/F1 12 Tf\n50 800 Td\n16 TL\n${textOps}\nET`;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export function buildProposalLines(input: {
  title: string;
  customer: string;
  email: string;
  proposalType: string;
  planCode?: string | null;
  projectType?: string | null;
  paymentCondition?: string | null;
  scope?: string | null;
  notes?: string | null;
  valueCents: number;
  features: string[];
}) {
  return [
    'KoddaHub - Proposta Comercial',
    `Título: ${input.title}`,
    `Cliente: ${input.customer}`,
    `Contato: ${input.email}`,
    `Tipo: ${input.proposalType}`,
    `Plano: ${input.planCode || '-'}`,
    `Projeto: ${input.projectType || '-'}`,
    `Valor total: R$ ${(input.valueCents / 100).toFixed(2)}`,
    `Condição de pagamento: ${input.paymentCondition || '-'}`,
    `Escopo: ${input.scope || '-'}`,
    `Funcionalidades: ${(input.features || []).join(', ') || '-'}`,
    `Observações: ${input.notes || '-'}`,
    'Validade: 7 dias',
    `Gerada em: ${new Date().toLocaleString('pt-BR')}`,
  ];
}
