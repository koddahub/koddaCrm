const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export type ProposalType = 'hospedagem' | 'personalizado';
export type PaymentCondition = 'avista' | '6x';
export type PlanCode = 'basic' | 'profissional' | 'pro';

export type ProposalPlan = {
  code: PlanCode;
  name: string;
  monthlyCents: number;
  description: string;
  highlights: string[];
};

export type ProjectCatalog = {
  baseCents: number;
  features: string[];
};

export type ProposalInput = {
  title: string;
  clientName: string;
  companyName: string;
  proposalType: ProposalType;
  paymentCondition: PaymentCondition;
  planCode: string;
  projectType: string;
  domainOwn: 'sim' | 'nao';
  migration: 'sim' | 'nao';
  pages: string;
  emailProfessional: 'sim' | 'nao';
  selectedFeatures: string[];
  notes: string;
  scope: string;
  baseValueCents?: number | null;
  createdAt?: Date;
};

export type ProposalScopeItem = {
  title: string;
  description: string;
};

export type ProposalIncludedItem = {
  label: string;
  off: boolean;
};

export type ProposalBreakdown = {
  monthlyCents: number;
  monthlyName: string;
  projectBaseCents: number;
  selectedFeatureCount: number;
  selectedFeatureNames: string[];
  projectTotalCents: number;
};

export type ProposalPresentation = {
  todayLabel: string;
  title: string;
  clientName: string;
  companyName: string;
  proposalTypeLabel: string;
  paymentLabel: string;
  notes: string;
  scope: string;
  planCards: Array<{ code: PlanCode; name: string; monthlyLabel: string; description: string; highlights: string[]; active: boolean }>;
  selectedPlanCode: PlanCode;
  selectedPlanName: string;
  selectedPlanMonthlyLabel: string;
  selectedPlanHighlights: string[];
  scopeItems: ProposalScopeItem[];
  investmentRows: Array<{ label: string; value: string }>;
  financeSummary: string;
  terms: string[];
  includedItems: ProposalIncludedItem[];
  breakdown: ProposalBreakdown;
};

const PLAN_CONFIG: Record<PlanCode, ProposalPlan> = {
  basic: {
    code: 'basic',
    name: 'Básico',
    monthlyCents: 14999,
    description: 'Plano inicial para presença digital essencial.',
    highlights: [
      'Site institucional básico (1 página)',
      'Domínio incluso (se ainda não tiver)',
      'Migração gratuita',
      '1 e-mail profissional',
    ],
  },
  profissional: {
    code: 'profissional',
    name: 'Profissional',
    monthlyCents: 24900,
    description: 'Plano completo para operação comercial online.',
    highlights: [
      'Site institucional até 3 páginas',
      'Formulário de contato + botão WhatsApp',
      'E-mails profissionais ilimitados',
      'Suporte técnico e atualizações',
    ],
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    monthlyCents: 39900,
    description: 'Plano avançado para expansão digital e vendas.',
    highlights: [
      'Chatbot incluso no site',
      'E-commerce básico incluso',
      'Atualização de site industrial com catálogo',
      'Ranqueamento profissional no Google',
    ],
  },
};

const PROJECT_CONFIG: Record<string, ProjectCatalog> = {
  Institucional: {
    baseCents: 180000,
    features: ['Até 5 páginas', 'Blog integrado', 'Galeria de imagens', 'Formulário de contato', 'Mapa interativo', 'WhatsApp integrado'],
  },
  Industrial: {
    baseCents: 280000,
    features: ['Catálogo de produtos', 'Ficha técnica', 'Solicitação de orçamento', 'Área do representante', 'Multilíngue'],
  },
  'E-commerce': {
    baseCents: 380000,
    features: ['Carrinho de compras', 'Pagamentos online', 'Gestor de estoque', 'Cupons de desconto', 'Avaliações', 'Integração com marketplaces'],
  },
  Blog: {
    baseCents: 150000,
    features: ['Editor de posts', 'Categorias', 'Comentários', 'Newsletter', 'SEO otimizado'],
  },
  Sistemas: {
    baseCents: 450000,
    features: ['Área logada', 'Banco de dados', 'Relatórios', 'API integração', 'Dashboard administrativo'],
  },
  'Serviços': {
    baseCents: 220000,
    features: ['Agendamento online', 'Portfólio', 'Depoimentos', 'Orçamento rápido'],
  },
};

const INCLUDED_ITEMS = [
  'Hospedagem com SSL Grátis',
  'Domínio nacional incluso (12 meses)',
  'Suporte Técnico Ilimitado',
  'Backup Diário Automático',
  'Manutenção Mensal',
  'Migração Grátis (se aplicável)',
  'Gestor de Ativos Web',
  'E-mails Profissionais',
] as const;

export const FEATURE_PRICE_CENTS = 15000;

export function currencyLabelFromCents(cents: number) {
  return BRL_FORMATTER.format((cents || 0) / 100);
}

export function getPlanOptions() {
  return Object.values(PLAN_CONFIG);
}

export function getProjectTypeOptions() {
  return Object.keys(PROJECT_CONFIG);
}

export function getProjectFeatures(projectType: string) {
  return (PROJECT_CONFIG[projectType] || PROJECT_CONFIG.Institucional).features;
}

function asPlanCode(value: string): PlanCode {
  const normalized = String(value || '').toLowerCase() as PlanCode;
  if (normalized in PLAN_CONFIG) return normalized;
  return 'basic';
}

function asProjectType(value: string) {
  if (PROJECT_CONFIG[value]) return value;
  return 'Institucional';
}

export function computeProposalBreakdown(input: ProposalInput): ProposalBreakdown {
  const plan = PLAN_CONFIG[asPlanCode(input.planCode)];
  const projectType = asProjectType(input.projectType);
  const catalog = PROJECT_CONFIG[projectType];
  const selected = (input.selectedFeatures || []).map((item) => String(item).trim()).filter(Boolean);
  const uniqueSelected = selected.filter((item, index) => selected.indexOf(item) === index);
  const projectBaseCents = input.baseValueCents && input.baseValueCents > 0 ? input.baseValueCents : catalog.baseCents;
  const projectTotalCents = projectBaseCents + uniqueSelected.length * FEATURE_PRICE_CENTS;

  return {
    monthlyCents: plan.monthlyCents,
    monthlyName: plan.name,
    projectBaseCents,
    selectedFeatureCount: uniqueSelected.length,
    selectedFeatureNames: uniqueSelected,
    projectTotalCents,
  };
}

export function computePersistedValueCents(input: { dealType: string; proposalType: ProposalType; breakdown: ProposalBreakdown }) {
  const normalizedDealType = String(input.dealType || '').toUpperCase();
  if (normalizedDealType === 'HOSPEDAGEM') {
    return input.breakdown.monthlyCents;
  }
  if (input.proposalType === 'personalizado') {
    return input.breakdown.projectTotalCents;
  }
  return input.breakdown.monthlyCents;
}

export function buildProposalPresentation(input: ProposalInput): ProposalPresentation {
  const now = input.createdAt || new Date();
  const planCode = asPlanCode(input.planCode);
  const plan = PLAN_CONFIG[planCode];
  const projectType = asProjectType(input.projectType);
  const proposalType = input.proposalType === 'personalizado' ? 'personalizado' : 'hospedagem';
  const breakdown = computeProposalBreakdown({ ...input, planCode, projectType, proposalType });

  const scopeItems: ProposalScopeItem[] = [
    {
      title: 'Recorrência mensal ativa',
      description: `Plano ${breakdown.monthlyName}: hospedagem, suporte técnico, manutenção mensal e SSL inclusos.`,
    },
    {
      title: 'Domínio',
      description: input.domainOwn === 'nao'
        ? 'Domínio nacional incluso por 12 meses.'
        : 'Configuração do domínio próprio inclusa.',
    },
    {
      title: 'Migração',
      description: input.migration === 'sim'
        ? 'Migração de site existente incluída sem custo.'
        : 'Migração não incluída nesta proposta.',
    },
    {
      title: 'E-mails profissionais',
      description: input.emailProfessional === 'sim'
        ? 'E-mails profissionais incluídos.'
        : 'E-mails profissionais não inclusos.',
    },
    {
      title: 'Site incluso na recorrência',
      description: `Site simples com até ${input.pages || '1'} páginas incluído na recorrência mensal.`,
    },
  ];

  if (proposalType === 'personalizado') {
    scopeItems.push({
      title: `Projeto personalizado ${projectType}`,
      description: `Escopo base de ${currencyLabelFromCents(breakdown.projectBaseCents)}.`,
    });
    scopeItems.push({
      title: 'Funcionalidades extras',
      description: breakdown.selectedFeatureCount > 0
        ? `${breakdown.selectedFeatureCount} selecionada(s): ${breakdown.selectedFeatureNames.join(', ')}.`
        : 'Sem funcionalidades extras adicionadas no momento.',
    });
  }

  const investmentRows: Array<{ label: string; value: string }> = [
    { label: `Recorrência mensal (${breakdown.monthlyName})`, value: `${currencyLabelFromCents(breakdown.monthlyCents)}/mês` },
  ];

  if (proposalType === 'personalizado') {
    investmentRows.push({ label: 'Projeto personalizado', value: 'Ativo' });
    investmentRows.push({ label: 'Tipo de site', value: projectType });
    investmentRows.push({ label: 'Valor base', value: currencyLabelFromCents(breakdown.projectBaseCents) });
    investmentRows.push({
      label: `Funcionalidades (+${currencyLabelFromCents(FEATURE_PRICE_CENTS)} cada)`,
      value: `${breakdown.selectedFeatureCount} selecionada(s)`,
    });

    if (breakdown.selectedFeatureCount > 0) {
      for (const feature of breakdown.selectedFeatureNames) {
        investmentRows.push({ label: `+ ${feature}`, value: currencyLabelFromCents(FEATURE_PRICE_CENTS) });
      }
    } else {
      investmentRows.push({ label: '+ Sem funcionalidades extras', value: currencyLabelFromCents(0) });
    }

    investmentRows.push({ label: 'Total do projeto personalizado', value: currencyLabelFromCents(breakdown.projectTotalCents) });
  } else {
    investmentRows.push({ label: 'Projeto personalizado', value: 'Não incluído' });
  }

  const financeSummary = proposalType === 'personalizado'
    ? input.paymentCondition === '6x'
      ? `Projeto personalizado (${projectType}) com ${breakdown.selectedFeatureCount} plus pode ser pago em 6x de ${currencyLabelFromCents(Math.round(breakdown.projectTotalCents / 6))} sem juros. Recorrência mensal segue ativa em ${currencyLabelFromCents(breakdown.monthlyCents)}/mês.`
      : `Projeto personalizado (${projectType}) com ${breakdown.selectedFeatureCount} plus à vista em ${currencyLabelFromCents(breakdown.projectTotalCents)}. Recorrência mensal segue ativa em ${currencyLabelFromCents(breakdown.monthlyCents)}/mês.`
    : `Sem projeto personalizado nesta proposta. Cobrança apenas recorrente: ${currencyLabelFromCents(breakdown.monthlyCents)}/mês.`;

  const terms = [
    'Tempo de contrato da recorrência: 36 meses.',
    'Renovação automática se não houver manifestação 90 dias antes.',
    `Recorrência mensal (${breakdown.monthlyName}): ${currencyLabelFromCents(breakdown.monthlyCents)}/mês.`,
    proposalType === 'personalizado'
      ? (input.paymentCondition === '6x'
        ? `Projeto personalizado: ${currencyLabelFromCents(breakdown.projectTotalCents)} em 6x sem juros.`
        : `Projeto personalizado: ${currencyLabelFromCents(breakdown.projectTotalCents)} à vista.`)
      : 'Projeto personalizado não contratado nesta proposta.',
    'Validade da proposta: 7 dias corridos.',
  ];

  const includedItems = INCLUDED_ITEMS.map((item) => ({
    label: item,
    off: (item.includes('Migração') && input.migration !== 'sim')
      || (item.includes('Domínio') && input.domainOwn !== 'nao')
      || (item.includes('E-mails') && input.emailProfessional !== 'sim'),
  }));

  const proposalTypeLabel = proposalType === 'personalizado'
    ? `Mensal + Projeto (${projectType})`
    : 'Mensal (sem projeto personalizado)';

  const paymentLabel = proposalType === 'personalizado'
    ? (input.paymentCondition === '6x' ? 'Projeto em 6x' : 'Projeto à vista')
    : 'Não se aplica';

  return {
    todayLabel: now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    title: input.title,
    clientName: input.clientName,
    companyName: input.companyName,
    proposalTypeLabel,
    paymentLabel,
    notes: input.notes,
    scope: input.scope,
    selectedPlanCode: planCode,
    selectedPlanName: plan.name,
    selectedPlanMonthlyLabel: `${currencyLabelFromCents(plan.monthlyCents)}/mês`,
    selectedPlanHighlights: plan.highlights,
    planCards: getPlanOptions().map((plan) => ({
      code: plan.code,
      name: plan.name,
      monthlyLabel: `${currencyLabelFromCents(plan.monthlyCents)}/mês`,
      description: plan.description,
      highlights: plan.highlights,
      active: plan.code === planCode,
    })),
    scopeItems,
    investmentRows,
    financeSummary,
    terms,
    includedItems,
    breakdown,
  };
}
