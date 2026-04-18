'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DealDetail } from '@/app/ui/shell/deal-detail';
import { CommunicationModule, type CommunicationView } from '@/app/ui/communication/communication-module';

type SectionKey =
  | 'dashboard'
  | 'pipeline_hospedagem'
  | 'pipeline_avulsos'
  | 'clientes'
  | 'saas'
  | 'communication'
  | 'social_accounts'
  | 'social_posts'
  | 'social_logs'
  | 'financeiro'
  | 'tickets'
  | 'config'
  | 'deal';

type MenuItem = {
  key: Exclude<SectionKey, 'deal'>;
  label: string;
  icon: string;
  href: string;
};

type PipelineRow = {
  id: string;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  planCode: string | null;
  productCode: string | null;
  intent: string | null;
  origin: string;
  valueCents: number | null;
  slaDeadline: string | null;
  lifecycleStatus: string;
  isClosed: boolean;
};

type PipelineStage = {
  id: string;
  code: string;
  name: string;
  stageOrder: number;
  rows: PipelineRow[];
};

type PipelineTableData = {
  pipeline: { id: string; code: string; name: string };
  stages: PipelineStage[];
};

type DashboardData = {
  prospeccao: {
    leads24h: number;
    leads7d: number;
    abandonos2h: number;
    ganhosHospedagem: number;
    ganhosAvulsos: number;
    perdidos: number;
  };
  operacao: {
    clientesAtivos: number;
    clientesAtrasados: number;
    clientesInativos: number;
    clientesFantasma: number;
    operacoesEmCurso: number;
    slaRisco: number;
    ticketsAbertos: number;
  };
  financeiro: {
    mrr: number;
    recebidosMes: number;
    inadimplenciaAberta: number;
    dreResultadoMes: number;
  };
  comunicacao: {
    leadNotification: {
      sent24h: number;
      failed24h: number;
      pending24h: number;
      simulated24h: number;
      total24h: number;
      pendingOver10m: number;
      lastSentAt: string | null;
      lastFailedAt: string | null;
    };
  };
};

type ClienteItem = {
  id: string;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  dealType: string;
  planCode: string | null;
  productCode: string | null;
  valueCents: number | null;
  updatedAt: string;
  classStatus: 'ATIVO' | 'ATRASADO' | 'INATIVO';
  daysLate: number;
  lastPaymentStatus: string | null;
  referenceDueDate: string | null;
  nextDueDate: string | null;
  ghostedAt: string | null;
  ticketId: string | null;
  ticketSlaDeadline: string | null;
};

type ClienteStatus = 'ATIVO' | 'ATRASADO' | 'INATIVO' | 'FANTASMA';
type ClienteStatusFilter = ClienteStatus | 'TODOS';

type ClientesApiResponse = {
  status: ClienteStatusFilter;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: {
    ATIVO: number;
    ATRASADO: number;
    INATIVO: number;
    FANTASMA: number;
  };
  items: ClienteItem[];
};

type QuickClientForm = {
  name: string;
  email: string;
  phone: string;
  planCode: string;
  value: string;
};

type EditDealForm = {
  id: string;
  title: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  intent: string;
  value: string;
};

type DeleteTarget = {
  id: string;
  label: string;
} | null;

type FinanceOverview = {
  mrr: number;
  recebidosMes: number;
  inadimplenciaAberta: number;
  avulsoMes: number;
  dre: {
    receitaRecorrente: number;
    receitaAvulsa: number;
    despesasManuais: number;
    resultado: number;
  };
  projecao: {
    d30: number;
    d60: number;
    d90: number;
  };
};

type RecebimentoItem = {
  id: string;
  organization: string;
  plan: string;
  amountCents: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  billingType: string | null;
};

type InadimplenciaItem = {
  id: string;
  organization: string;
  email: string | null;
  amountCents: number;
  dueDate: string | null;
  daysLate: number;
  bucket: string;
  status: string;
};

type TicketItem = {
  id: string;
  queueName: string;
  status: string;
  slaDeadline: string | null;
  createdAt: string;
};

type SocialInstagramAccountItem = {
  id: string;
  pageId: string;
  pageName: string | null;
  instagramId: string;
  instagramUsername: string;
  instagramName: string | null;
  profilePictureUrl: string | null;
  tokenExpiresAt: string | null;
  scopes: string | null;
  status: string;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
};

type SocialInstagramPostItem = {
  id: string;
  accountId: string;
  caption: string;
  mediaUrl: string;
  igCreationId: string | null;
  igMediaId: string | null;
  status: string;
  errorMessage: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account?: {
    id: string;
    instagramUsername: string;
    pageName: string | null;
  } | null;
};

type SocialInstagramLogItem = {
  id: string;
  action: string;
  endpoint: string | null;
  httpMethod: string | null;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
  account?: {
    id: string;
    instagramUsername: string;
    pageName: string | null;
  } | null;
  post?: {
    id: string;
    status: string;
    mediaUrl: string;
    igMediaId: string | null;
  } | null;
};

type SaasTabKey = 'produtos' | 'sites' | 'emails' | 'templates' | 'eventos';
type SaasTemplatesRouteMode = 'embedded' | 'list' | 'create' | 'view' | 'edit';

type SaasProductItem = {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type SaasSiteItem = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  name: string;
  domain: string;
  appType: string;
  brandName: string | null;
  supportEmail: string | null;
  isActive: boolean;
  env: string;
  createdAt: string;
  updatedAt: string;
};

type SaasTemplateItem = {
  id: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  siteId: string | null;
  siteDomain: string | null;
  templateKey: string;
  subject: string;
  html: string | null;
  text: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type SaasTemplateFormState = {
  id: string;
  templateName: string;
  productId: string;
  siteId: string;
  templateKey: string;
  templateCategory: string;
  subject: string;
  description: string;
  html: string;
  text: string;
  availableVariables: string;
  notes: string;
  version: number;
  isActive: boolean;
};

type TemplateModalMode = 'view' | 'edit';
type TemplateModalTab = 'details' | 'html' | 'preview';

type SaasEventItem = {
  id: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  siteId: string | null;
  siteDomain: string | null;
  eventKey: string;
  templateId: string;
  templateKey: string;
  templateSubject: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type SaasEmailAccountItem = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  siteId: string | null;
  siteDomain: string | null;
  emailLabel: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  provider: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type CrmPageProps = {
  section: SectionKey;
  dealId?: string;
  saasInitialTab?: SaasTabKey;
  saasTemplatesRouteMode?: SaasTemplatesRouteMode;
  saasTemplateRouteId?: string;
  communicationView?: CommunicationView;
  communicationRecordId?: string;
};

type KpiSeverity = 'normal' | 'attention' | 'critical' | 'success';

type DashboardMetric = {
  label: string;
  value: string;
  severity?: KpiSeverity;
  emphasis?: boolean;
  hint?: string;
  icon?: string;
};

type DashboardBlock = {
  id: 'prospeccao' | 'financeiro' | 'operacao' | 'comunicacao';
  title: string;
  subtitle: string;
  icon: string;
  metrics: DashboardMetric[];
};

const MENU_ITEMS: MenuItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', href: '/dashboard' },
  { key: 'pipeline_hospedagem', label: 'Jornada Comercial', icon: 'bi-diagram-3-fill', href: '/pipeline/hospedagem' },
  { key: 'pipeline_avulsos', label: 'Funil Comercial', icon: 'bi-grid-1x2-fill', href: '/pipeline/avulsos' },
  { key: 'clientes', label: 'Clientes', icon: 'bi-people-fill', href: '/clientes' },
  { key: 'saas', label: 'Painel de Controle', icon: 'bi-boxes', href: '/painel-de-controle' },
  { key: 'social_accounts', label: 'Social · Contas', icon: 'bi-instagram', href: '/social/contas' },
  { key: 'social_posts', label: 'Social · Posts', icon: 'bi-images', href: '/social/posts' },
  { key: 'social_logs', label: 'Social · Logs', icon: 'bi-journal-code', href: '/social/logs' },
  { key: 'financeiro', label: 'Financeiro', icon: 'bi-cash-stack', href: '/financeiro' },
  { key: 'tickets', label: 'Tickets', icon: 'bi-ticket-detailed-fill', href: '/tickets' },
  { key: 'config', label: 'Configurações', icon: 'bi-sliders2', href: '/config' },
];

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'crm_v2_sidebar_collapsed';
const SAAS_EMAILS_PER_PAGE = 8;
const SAAS_TEMPLATES_PER_PAGE = 6;

function normalizeTemplateKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function displayTemplateName(templateKey: string) {
  const cleaned = String(templateKey || '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return 'Template sem nome';
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapTemplateItemToForm(item: SaasTemplateItem, previous: SaasTemplateFormState): SaasTemplateFormState {
  return {
    ...previous,
    id: item.id,
    templateName: displayTemplateName(item.templateKey),
    productId: item.productId || previous.productId,
    siteId: item.siteId || '',
    templateCategory: item.templateKey.includes('reset') ? 'seguranca' : 'transacional',
    templateKey: item.templateKey,
    subject: item.subject,
    description: '',
    html: item.html || '',
    text: item.text || '',
    availableVariables: '',
    notes: '',
    version: item.version || 1,
    isActive: item.isActive,
  };
}

function currency(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function dateOnly(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function shortDateTime(value?: string | null) {
  if (!value) return 'sem atualização';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sectionTitle(section: SectionKey) {
  switch (section) {
    case 'dashboard':
      return 'Dashboard';
    case 'pipeline_hospedagem':
      return 'Jornada Comercial';
    case 'pipeline_avulsos':
      return 'Funil Comercial';
    case 'clientes':
      return 'Clientes';
    case 'saas':
      return 'Painel de Controle';
    case 'communication':
      return 'Comunicação';
    case 'social_accounts':
      return 'Social · Contas Instagram';
    case 'social_posts':
      return 'Social · Posts Instagram';
    case 'social_logs':
      return 'Social · Logs Instagram';
    case 'financeiro':
      return 'Financeiro';
    case 'tickets':
      return 'Tickets';
    case 'config':
      return 'Configurações';
    case 'deal':
      return 'Área do Cliente/Lead';
    default:
      return 'CRM';
  }
}

function DashboardMetricCard({ metric }: { metric: DashboardMetric }) {
  const severity = metric.severity || 'normal';

  return (
    <article className={`crm-v2-kpi-card is-${severity}${metric.emphasis ? ' is-emphasis' : ''}`} role="listitem">
      <p className="metric-label">
        {metric.icon ? <i className={`bi ${metric.icon}`} aria-hidden="true" /> : null}
        <span>{metric.label}</span>
      </p>
      <strong className="metric-value">{metric.value}</strong>
      <div className="metric-footer">
        {metric.hint ? <small className="metric-hint">{metric.hint}</small> : <span />}
        {severity !== 'normal' ? (
          <span className={`metric-chip is-${severity}`}>
            {severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Saudável'}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function DashboardBlockCard({ block }: { block: DashboardBlock }) {
  return (
    <article className="crm-v2-kpi-block">
      <header className="crm-v2-kpi-block-head">
        <div>
          <h3>
            <i className={`bi ${block.icon}`} aria-hidden="true" />
            <span>{block.title}</span>
          </h3>
          <p>{block.subtitle}</p>
        </div>
        <span className="crm-v2-kpi-count">{block.metrics.length} KPIs</span>
      </header>
      <div className="crm-v2-kpi-grid" role="list" aria-label={`Indicadores de ${block.title}`}>
        {block.metrics.map((metric) => (
          <DashboardMetricCard key={`${block.id}-${metric.label}`} metric={metric} />
        ))}
      </div>
    </article>
  );
}

export function CrmPage({
  section,
  dealId,
  saasInitialTab = 'emails',
  saasTemplatesRouteMode = 'embedded',
  saasTemplateRouteId,
  communicationView,
  communicationRecordId,
}: CrmPageProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(section === 'dashboard');
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardUpdatedAt, setDashboardUpdatedAt] = useState<string | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineTableData | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [clientesItems, setClientesItems] = useState<ClienteItem[]>([]);
  const [clientesCounts, setClientesCounts] = useState({ ATIVO: 0, ATRASADO: 0, INATIVO: 0, FANTASMA: 0 });
  const [clientesPage, setClientesPage] = useState(1);
  const [clientesTotal, setClientesTotal] = useState(0);
  const [clientesTotalPages, setClientesTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClienteStatusFilter>('TODOS');
  const [planFilter, setPlanFilter] = useState('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [createClientModalOpen, setCreateClientModalOpen] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState<QuickClientForm>({
    name: '',
    email: '',
    phone: '',
    planCode: 'basic',
    value: '',
  });
  const [wonStageId, setWonStageId] = useState<string | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [ghostTarget, setGhostTarget] = useState<DeleteTarget>(null);
  const [restoreTarget, setRestoreTarget] = useState<DeleteTarget>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeleteTarget>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const clientsSelectAllRef = useRef<HTMLInputElement | null>(null);
  const templatesSelectAllRef = useRef<HTMLInputElement | null>(null);
  const [financeOverview, setFinanceOverview] = useState<FinanceOverview | null>(null);
  const [recebimentos, setRecebimentos] = useState<RecebimentoItem[]>([]);
  const [inadimplencia, setInadimplencia] = useState<InadimplenciaItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialInstagramAccountItem[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialInstagramPostItem[]>([]);
  const [socialLogs, setSocialLogs] = useState<SocialInstagramLogItem[]>([]);
  const [socialMetaConfigured, setSocialMetaConfigured] = useState(true);
  const [socialConnectUrl, setSocialConnectUrl] = useState('/api/social/instagram/oauth/start?returnTo=/social/contas');
  const [socialPublishing, setSocialPublishing] = useState(false);
  const [socialPostForm, setSocialPostForm] = useState({
    accountId: '',
    mediaUrl: '',
    caption: '',
  });
  const [saasTab, setSaasTab] = useState<SaasTabKey>(saasInitialTab);
  const [saasLoading, setSaasLoading] = useState(section === 'saas');
  const [saasSaving, setSaasSaving] = useState(false);
  const [saasProducts, setSaasProducts] = useState<SaasProductItem[]>([]);
  const [saasSites, setSaasSites] = useState<SaasSiteItem[]>([]);
  const [saasEmailAccounts, setSaasEmailAccounts] = useState<SaasEmailAccountItem[]>([]);
  const [saasTemplates, setSaasTemplates] = useState<SaasTemplateItem[]>([]);
  const [saasEvents, setSaasEvents] = useState<SaasEventItem[]>([]);
  const [saasProductForm, setSaasProductForm] = useState({
    name: '',
    slug: '',
    isActive: true,
  });
  const [saasSiteForm, setSaasSiteForm] = useState({
    productId: '',
    name: '',
    domain: '',
    appType: 'web',
    brandName: '',
    supportEmail: '',
    env: 'production',
    isActive: true,
  });
  const [saasTemplateForm, setSaasTemplateForm] = useState<SaasTemplateFormState>({
    id: '',
    templateName: 'Boas-vindas',
    productId: '',
    siteId: '',
    templateKey: 'welcome',
    templateCategory: 'transacional',
    subject: '',
    description: '',
    html: '',
    text: '',
    availableVariables: '',
    notes: '',
    version: 1,
    isActive: true,
  });
  const [saasEventForm, setSaasEventForm] = useState({
    productId: '',
    siteId: '',
    eventKey: 'user.created',
    templateId: '',
    enabled: true,
  });
  const [saasEmailForm, setSaasEmailForm] = useState({
    productId: '',
    siteId: '',
    emailLabel: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    provider: 'smtp',
    isDefault: false,
    isActive: true,
  });
  const [saasEmailPage, setSaasEmailPage] = useState(1);
  const [saasTemplatePage, setSaasTemplatePage] = useState(1);
  const [saasTemplateSearch, setSaasTemplateSearch] = useState('');
  const [saasTemplateStatusFilter, setSaasTemplateStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [saasTemplatePreviewOpen, setSaasTemplatePreviewOpen] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [showTemplateBulkRemoveModal, setShowTemplateBulkRemoveModal] = useState(false);
  const [saasTemplateBulkRemoving, setSaasTemplateBulkRemoving] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateModalMode, setTemplateModalMode] = useState<TemplateModalMode>('view');
  const [templateModalTab, setTemplateModalTab] = useState<TemplateModalTab>('details');
  const [templateModalSource, setTemplateModalSource] = useState<SaasTemplateItem | null>(null);
  const [templateModalSnapshot, setTemplateModalSnapshot] = useState<SaasTemplateFormState | null>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const isTemplateRouteMode = section === 'saas' && saasTemplatesRouteMode !== 'embedded';
  const isTemplateListRoute = saasTemplatesRouteMode === 'list';
  const isTemplateCreateRoute = saasTemplatesRouteMode === 'create';
  const isTemplateViewRoute = saasTemplatesRouteMode === 'view';
  const isTemplateEditRoute = saasTemplatesRouteMode === 'edit';
  const isModernControlPanel = section === 'saas' && Boolean(communicationView);

  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [leadForm, setLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    planCode: 'basic',
    productCode: 'site_institucional',
    value: '',
    intent: '',
  });
  const [editForm, setEditForm] = useState<EditDealForm>({
    id: '',
    title: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    intent: '',
    value: '',
  });

  const [financialForm, setFinancialForm] = useState({
    entryType: 'RECEITA',
    category: 'OUTROS',
    amount: '',
    entryDate: new Date().toISOString().slice(0, 10),
    description: '',
    dealId: '',
    organizationId: '',
  });

  const [collectionForm, setCollectionForm] = useState({
    actionType: 'COBRANCA',
    channel: 'WHATSAPP',
    outcome: '',
    notes: '',
    nextActionAt: '',
    dealId: '',
    organizationId: '',
  });

  const pipelineType = useMemo(() => {
    if (section === 'pipeline_hospedagem') return 'hospedagem';
    if (section === 'pipeline_avulsos') return 'avulsos';
    return null;
  }, [section]);

  const dashboardBlocks = useMemo<DashboardBlock[]>(() => {
    if (!dashboardData) return [];

    const abandonos = dashboardData.prospeccao.abandonos2h;
    const perdidos = dashboardData.prospeccao.perdidos;
    const inadimplencia = dashboardData.financeiro.inadimplenciaAberta;
    const atrasados = dashboardData.operacao.clientesAtrasados;
    const inativos = dashboardData.operacao.clientesInativos;
    const fantasma = dashboardData.operacao.clientesFantasma;
    const slaRisco = dashboardData.operacao.slaRisco;
    const leadNotification = dashboardData.comunicacao?.leadNotification || {
      sent24h: 0,
      failed24h: 0,
      pending24h: 0,
      simulated24h: 0,
      total24h: 0,
      pendingOver10m: 0,
      lastSentAt: null,
      lastFailedAt: null,
    };

    const severityByCount = (value: number, attentionThreshold = 1, criticalThreshold = 5): KpiSeverity => {
      if (value >= criticalThreshold) return 'critical';
      if (value >= attentionThreshold) return 'attention';
      return 'normal';
    };

    return [
      {
        id: 'prospeccao',
        title: 'Prospecção',
        subtitle: 'Entrada, ganho e risco de conversão no funil comercial.',
        icon: 'bi-graph-up-arrow',
        metrics: [
          { label: 'Leads 24h', value: String(dashboardData.prospeccao.leads24h), emphasis: true, severity: 'success', icon: 'bi-lightning-charge' },
          { label: 'Leads 7d', value: String(dashboardData.prospeccao.leads7d), severity: 'normal', icon: 'bi-calendar-week' },
          {
            label: 'Abandonos +2h',
            value: String(abandonos),
            severity: severityByCount(abandonos, 1, 3),
            hint: abandonos > 0 ? 'Necessita recuperação ativa' : 'Dentro do esperado',
            icon: 'bi-exclamation-triangle',
          },
          { label: 'Ganhos hospedagem', value: String(dashboardData.prospeccao.ganhosHospedagem), severity: 'success', icon: 'bi-check2-circle' },
          { label: 'Ganhos avulsos', value: String(dashboardData.prospeccao.ganhosAvulsos), severity: 'success', icon: 'bi-check2-circle' },
          {
            label: 'Perdidos',
            value: String(perdidos),
            severity: severityByCount(perdidos, 1, 4),
            hint: perdidos > 0 ? 'Revisar motivo de perda' : 'Sem perdas no período',
            icon: 'bi-x-circle',
          },
        ],
      },
      {
        id: 'financeiro',
        title: 'Financeiro',
        subtitle: 'Resultado de receita recorrente e saúde de recebíveis.',
        icon: 'bi-cash-coin',
        metrics: [
          { label: 'MRR', value: currency(dashboardData.financeiro.mrr), emphasis: true, severity: 'success', icon: 'bi-bar-chart-line' },
          { label: 'Recebido no mês', value: currency(dashboardData.financeiro.recebidosMes), severity: 'success', icon: 'bi-wallet2' },
          {
            label: 'Inadimplência',
            value: currency(inadimplencia),
            severity: inadimplencia > 0 ? (inadimplencia >= 1_000_000 ? 'critical' : 'attention') : 'normal',
            hint: inadimplencia > 0 ? 'Priorizar cobrança' : 'Sem pendências relevantes',
            icon: 'bi-exclamation-diamond',
          },
          {
            label: 'Resultado DRE',
            value: currency(dashboardData.financeiro.dreResultadoMes),
            severity: dashboardData.financeiro.dreResultadoMes > 0 ? 'success' : 'attention',
            hint: dashboardData.financeiro.dreResultadoMes > 0 ? 'Resultado positivo' : 'Acompanhar margem',
            icon: 'bi-activity',
          },
        ],
      },
      {
        id: 'operacao',
        title: 'Operação',
        subtitle: 'Estabilidade da carteira ativa e alertas de suporte/SLA.',
        icon: 'bi-diagram-3',
        metrics: [
          { label: 'Clientes ativos', value: String(dashboardData.operacao.clientesAtivos), emphasis: true, severity: 'success', icon: 'bi-people' },
          { label: 'Clientes atrasados', value: String(atrasados), severity: severityByCount(atrasados, 1, 6), icon: 'bi-clock-history' },
          { label: 'Clientes inativos', value: String(inativos), severity: severityByCount(inativos, 1, 4), icon: 'bi-person-dash' },
          { label: 'Lista fantasma', value: String(fantasma), severity: severityByCount(fantasma, 1, 3), icon: 'bi-archive' },
          { label: 'Operações em curso', value: String(dashboardData.operacao.operacoesEmCurso), severity: 'normal', icon: 'bi-kanban' },
          { label: 'SLA em risco', value: String(slaRisco), severity: severityByCount(slaRisco, 1, 2), icon: 'bi-alarm' },
          { label: 'Tickets abertos', value: String(dashboardData.operacao.ticketsAbertos), severity: severityByCount(dashboardData.operacao.ticketsAbertos, 1, 8), icon: 'bi-ticket-detailed' },
        ],
      },
      {
        id: 'comunicacao',
        title: 'Comunicação',
        subtitle: 'Saúde do alerta de novo lead para contato@koddahub.com.br.',
        icon: 'bi-envelope-check',
        metrics: [
          {
            label: 'Alertas enviados 24h',
            value: String(leadNotification.sent24h),
            emphasis: true,
            severity: leadNotification.sent24h > 0 ? 'success' : 'normal',
            icon: 'bi-send-check',
          },
          {
            label: 'Falhas 24h',
            value: String(leadNotification.failed24h),
            severity: severityByCount(leadNotification.failed24h, 1, 3),
            hint: leadNotification.failed24h > 0 ? 'Verificar worker/SMTP' : 'Sem falhas recentes',
            icon: 'bi-exclamation-octagon',
          },
          {
            label: 'Pendentes 24h',
            value: String(leadNotification.pending24h),
            severity: severityByCount(leadNotification.pending24h, 1, 5),
            hint: leadNotification.pending24h > 0 ? 'Há mensagens aguardando processamento' : 'Fila em dia',
            icon: 'bi-hourglass-split',
          },
          {
            label: 'Pendentes +10min',
            value: String(leadNotification.pendingOver10m),
            severity: leadNotification.pendingOver10m > 0 ? 'critical' : 'success',
            hint: leadNotification.pendingOver10m > 0 ? 'Possível atraso de worker' : 'Sem atraso relevante',
            icon: 'bi-alarm',
          },
          {
            label: 'Simulados 24h',
            value: String(leadNotification.simulated24h),
            severity: leadNotification.simulated24h > 0 ? 'attention' : 'normal',
            hint: leadNotification.simulated24h > 0 ? 'Envio em modo simulado detectado' : 'Sem envios simulados',
            icon: 'bi-bezier2',
          },
          {
            label: 'Último envio',
            value: shortDateTime(leadNotification.lastSentAt),
            severity: leadNotification.lastSentAt ? 'success' : 'attention',
            hint: leadNotification.lastFailedAt
              ? `Última falha: ${shortDateTime(leadNotification.lastFailedAt)}`
              : 'Sem falhas recentes',
            icon: 'bi-clock-history',
          },
        ],
      },
    ];
  }, [dashboardData]);

  const dashboardCriticalCount = useMemo(
    () =>
      dashboardBlocks.reduce(
        (acc, block) => acc + block.metrics.filter((metric) => metric.severity === 'critical').length,
        0,
      ),
    [dashboardBlocks],
  );

  function resetTransientOverlays() {
    setShowLeadModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setShowBulkDeleteModal(false);
    setCreateClientModalOpen(false);
    setShowPurgeModal(false);
    setDeleteTarget(null);
    setGhostTarget(null);
    setRestoreTarget(null);
    setPurgeTarget(null);
    setPurgeConfirm('');
    setShowTemplateBulkRemoveModal(false);
    setShowTemplateModal(false);
    setTemplateModalMode('view');
    setTemplateModalTab('details');
    setTemplateModalSource(null);
    setTemplateModalSnapshot(null);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  async function runReconcile() {
    setLoading(true);
    const res = await fetch('/api/automation/reconcile', { method: 'POST' });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setNotice(data.error || 'Erro na reconciliação');
      return;
    }
    setNotice(`Reconciliação concluída: ${data.summary || 'OK'}`);
    await reloadSection();
  }

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError('');

    try {
      const res = await fetch('/api/dashboard/kpis');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDashboardData(null);
        setDashboardError(data.error || 'Não foi possível carregar os indicadores do dashboard.');
        return;
      }

      setDashboardData(data);
      setDashboardUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('[crm-dashboard] erro ao carregar KPIs', error);
      setDashboardData(null);
      setDashboardError('Falha de conexão ao carregar KPIs. Tente novamente.');
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadPipeline(type: 'hospedagem' | 'avulsos') {
    const res = await fetch(`/api/pipeline-table/${type}`);
    const data = await res.json();
    if (res.ok) {
      setPipelineData(data);
      const visibleLeadIds = new Set<string>(
        (data?.stages || []).flatMap((stage: PipelineStage) => (stage.rows || []).map((row) => row.id)),
      );
      setSelectedLeadIds((prev) => {
        let changed = false;
        const next = new Set<string>();
        prev.forEach((id) => {
          if (visibleLeadIds.has(id)) {
            next.add(id);
            return;
          }
          changed = true;
        });
        if (!changed && next.size === prev.size) return prev;
        return next;
      });
      return;
    }
    setNotice(data.error || 'Falha ao carregar pipeline');
  }

  async function resolveWonStageId() {
    if (wonStageId) return wonStageId;
    const res = await fetch('/api/pipeline-table/hospedagem');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao carregar pipeline de hospedagem');
    }
    const stage = (data.stages || []).find((item: { code?: string; id?: string }) =>
      ['fechado_ganho', 'assinatura_ativa_ganho'].includes(String(item.code || '')),
    );
    if (!stage?.id) {
      throw new Error('Estágio de fechamento não encontrado no pipeline de hospedagem');
    }
    setWonStageId(stage.id);
    return stage.id;
  }

  async function loadClientes() {
    const qs = new URLSearchParams({
      status: statusFilter,
      search: searchTerm.trim(),
      page: String(clientesPage),
      pageSize: '10',
    });
    if (planFilter.trim()) qs.set('plan', planFilter.trim());

    const res = await fetch(`/api/clientes?${qs.toString()}`);
    const data = (await res.json()) as ClientesApiResponse & { error?: string };
    if (!res.ok) {
      setNotice(data.error || 'Falha ao carregar clientes');
      return;
    }

    setClientesItems(data.items || []);
    setClientesCounts(data.counts || { ATIVO: 0, ATRASADO: 0, INATIVO: 0, FANTASMA: 0 });
    setClientesTotal(data.total ?? 0);
    setClientesTotalPages(Math.max(1, data.totalPages ?? 1));
  }

  async function loadFinanceiro() {
    const [overviewRes, recebimentosRes, inadRes] = await Promise.all([
      fetch('/api/financeiro/overview'),
      fetch('/api/financeiro/recebimentos'),
      fetch('/api/financeiro/inadimplencia'),
    ]);

    const [overviewData, recebData, inadData] = await Promise.all([
      overviewRes.json(),
      recebimentosRes.json(),
      inadRes.json(),
    ]);

    if (overviewRes.ok) setFinanceOverview(overviewData);
    if (recebimentosRes.ok) setRecebimentos(recebData.items || []);
    if (inadRes.ok) setInadimplencia(inadData.items || []);
  }

  async function loadTickets() {
    const res = await fetch('/api/automation/reconcile?mode=tickets');
    const data = await res.json();
    if (res.ok) setTickets(data.items || []);
  }

  async function loadSocialAccounts() {
    const res = await fetch('/api/social/instagram/accounts');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(data.error || 'Falha ao carregar contas Instagram.');
      return;
    }

    setSocialAccounts(data.items || []);
    setSocialMetaConfigured(Boolean(data.metaConfigured));
    setSocialConnectUrl(
      String(data.connectUrl || '/api/social/instagram/oauth/start?returnTo=/social/contas'),
    );
  }

  async function loadSocialPosts() {
    const res = await fetch('/api/social/instagram/posts?limit=60');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(data.error || 'Falha ao carregar posts Instagram.');
      return;
    }

    setSocialPosts(data.items || []);
  }

  async function loadSocialLogs() {
    const res = await fetch('/api/social/instagram/logs?limit=120');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(data.error || 'Falha ao carregar logs Instagram.');
      return;
    }

    setSocialLogs(data.items || []);
  }

  async function submitSocialPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!socialPostForm.mediaUrl.trim()) {
      setNotice('Informe a URL pública da imagem para publicar.');
      return;
    }

    setSocialPublishing(true);
    const payload = {
      accountId: socialPostForm.accountId || undefined,
      mediaUrl: socialPostForm.mediaUrl.trim(),
      caption: socialPostForm.caption.trim(),
    };

    const res = await fetch('/api/social/instagram/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSocialPublishing(false);

    if (!res.ok) {
      setNotice(data.error || data.details || 'Falha ao publicar imagem no Instagram.');
      await Promise.all([loadSocialPosts(), loadSocialLogs()]);
      return;
    }

    setNotice('Imagem publicada no Instagram com sucesso.');
    setSocialPostForm((prev) => ({
      ...prev,
      mediaUrl: '',
      caption: '',
    }));
    await Promise.all([loadSocialPosts(), loadSocialLogs()]);
  }

  async function loadSaas() {
    setSaasLoading(true);
    try {
      const [productsRes, sitesRes, emailAccountsRes, templatesRes, eventsRes] = await Promise.all([
        fetch('/api/control-panel/products'),
        fetch('/api/control-panel/sites'),
        fetch('/api/control-panel/email-accounts'),
        fetch('/api/control-panel/templates'),
        fetch('/api/control-panel/events'),
      ]);

      const [productsData, sitesData, emailAccountsData, templatesData, eventsData] = await Promise.all([
        productsRes.json().catch(() => ({})),
        sitesRes.json().catch(() => ({})),
        emailAccountsRes.json().catch(() => ({})),
        templatesRes.json().catch(() => ({})),
        eventsRes.json().catch(() => ({})),
      ]);

      if (!productsRes.ok) {
        setNotice(productsData.error || 'Falha ao carregar produtos do Painel de Controle');
        return;
      }
      if (!sitesRes.ok) {
        setNotice(sitesData.error || 'Falha ao carregar sites do Painel de Controle');
        return;
      }
      if (!emailAccountsRes.ok) {
        setNotice(emailAccountsData.error || 'Falha ao carregar e-mails do Painel de Controle');
        return;
      }
      if (!templatesRes.ok) {
        setNotice(templatesData.error || 'Falha ao carregar templates do Painel de Controle');
        return;
      }
      if (!eventsRes.ok) {
        setNotice(eventsData.error || 'Falha ao carregar eventos do Painel de Controle');
        return;
      }

      setSaasProducts(productsData.items || []);
      setSaasSites(sitesData.items || []);
      setSaasEmailAccounts(emailAccountsData.items || []);
      setSaasTemplates(templatesData.items || []);
      setSaasEvents(eventsData.items || []);
    } catch (error) {
      setNotice(`Falha ao carregar Painel de Controle: ${String(error)}`);
    } finally {
      setSaasLoading(false);
    }
  }

  async function submitSaasProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaasSaving(true);

    const payload = {
      name: saasProductForm.name,
      slug: saasProductForm.slug,
      category: 'produto',
      status: saasProductForm.isActive ? 'active' : 'inactive',
    };

    const res = await fetch('/api/control-panel/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    setSaasSaving(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao salvar produto');
      return;
    }

    setNotice('Produto salvo com sucesso.');
    setSaasProductForm({
      name: '',
      slug: '',
      isActive: true,
    });
    await loadSaas();
  }

  async function submitSaasSite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaasSaving(true);

    const res = await fetch('/api/control-panel/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saasSiteForm),
    });
    const data = await res.json().catch(() => ({}));

    setSaasSaving(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao salvar site');
      return;
    }

    setNotice('Site salvo com sucesso.');
    setSaasSiteForm((prev) => ({
      ...prev,
      name: '',
      domain: '',
      brandName: '',
      supportEmail: '',
    }));
    await loadSaas();
  }

  async function submitSaasTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaasSaving(true);

    const res = await fetch('/api/control-panel/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saasTemplateForm),
    });
    const data = await res.json().catch(() => ({}));

    setSaasSaving(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao salvar template');
      return;
    }

    setNotice('Template salvo com sucesso.');
    setSaasTemplateForm((prev) => ({
      ...prev,
      id: '',
      templateName: displayTemplateName(prev.templateKey),
      templateCategory: 'transacional',
      subject: '',
      description: '',
      html: '',
      text: '',
      availableVariables: '',
      notes: '',
      version: 1,
      isActive: true,
    }));
    setSaasTemplatePreviewOpen(false);
    setSaasTemplatePage(1);
    await loadSaas();
  }

  async function saveTemplateFromModal() {
    if (!saasTemplateForm.id) {
      setNotice('Selecione um template válido para editar.');
      return;
    }

    setSaasSaving(true);
    const res = await fetch('/api/control-panel/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saasTemplateForm),
    });
    const data = await res.json().catch(() => ({}));

    setSaasSaving(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao salvar alterações do template');
      return;
    }

    setNotice('Template atualizado com sucesso.');
    setShowTemplateModal(false);
    setTemplateModalMode('view');
    setTemplateModalTab('details');
    setTemplateModalSource(null);
    setTemplateModalSnapshot(null);
    setSaasTemplatePage(1);
    await loadSaas();
  }

  function resetSaasTemplateEditor() {
    setSaasTemplateForm((prev) => ({
      ...prev,
      id: '',
      templateName: displayTemplateName(prev.templateKey),
      templateCategory: 'transacional',
      subject: '',
      description: '',
      html: '',
      text: '',
      availableVariables: '',
      notes: '',
      version: 1,
      isActive: true,
    }));
    setSaasTemplatePreviewOpen(false);
    setTemplateModalMode('view');
  }

  function startSaasTemplateEdit(item: SaasTemplateItem) {
    setSaasTemplateForm((prev) => mapTemplateItemToForm(item, prev));
    setSaasTemplatePreviewOpen(false);
    setTemplateModalSource(item);
    setTemplateModalSnapshot((prev) => mapTemplateItemToForm(item, prev || saasTemplateForm));
    setShowTemplateModal(false);
    setTemplateModalMode('view');
    setTemplateModalTab('details');
    setSaasTab('templates');
  }

  function openTemplateModal(item: SaasTemplateItem, mode: TemplateModalMode = 'view') {
    const nextForm = mapTemplateItemToForm(item, saasTemplateForm);
    setSaasTemplateForm(nextForm);
    setTemplateModalSource(item);
    setTemplateModalSnapshot(nextForm);
    setTemplateModalMode(mode);
    setTemplateModalTab('details');
    setShowTemplateModal(true);
    setSaasTemplatePreviewOpen(false);
  }

  function closeTemplateModal() {
    if (templateModalMode === 'edit' && templateModalSnapshot) {
      setSaasTemplateForm(templateModalSnapshot);
    }
    setShowTemplateModal(false);
    setTemplateModalMode('view');
    setTemplateModalTab('details');
    setTemplateModalSource(null);
    setTemplateModalSnapshot(null);
  }

  function cancelTemplateModalEdit() {
    if (templateModalSnapshot) {
      setSaasTemplateForm(templateModalSnapshot);
    }
    setTemplateModalMode('view');
    setTemplateModalTab('details');
  }

  function toggleTemplateSelection(templateId: string) {
    setSelectedTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId],
    );
  }

  function toggleSelectAllVisibleTemplates() {
    const visibleIds = saasTemplateVisibleItems.map((item) => item.id);
    if (visibleIds.length === 0) return;
    const allSelected = visibleIds.every((id) => selectedTemplateIds.includes(id));
    if (allSelected) {
      setSelectedTemplateIds([]);
      return;
    }
    setSelectedTemplateIds(visibleIds);
  }

  async function removeSelectedTemplatesInBulk() {
    const selectedOnPage = saasTemplateVisibleItems.filter((item) => selectedTemplateIds.includes(item.id));
    if (selectedOnPage.length === 0) {
      setShowTemplateBulkRemoveModal(false);
      setSelectedTemplateIds([]);
      return;
    }

    setSaasTemplateBulkRemoving(true);
    const results = await Promise.allSettled(
      selectedOnPage.map(async (item) => {
        if (!item.productId) throw new Error(`Template ${item.templateKey} sem productId`);

        const payload = {
          id: item.id,
          productId: item.productId,
          siteId: item.siteId || '',
          templateKey: item.templateKey,
          subject: item.subject,
          html: item.html || '',
          text: item.text || '',
          version: item.version || 1,
          isActive: false,
        };

        const res = await fetch('/api/control-panel/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Falha ao remover template ${item.templateKey}`);
        }
        return item.id;
      }),
    );

    const successIds = results
      .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failureCount = results.length - successIds.length;

    if (successIds.length > 0) {
      setSaasTemplates((prev) => prev.filter((item) => !successIds.includes(item.id)));
      setSelectedTemplateIds((prev) => prev.filter((id) => !successIds.includes(id)));
    }

    setShowTemplateBulkRemoveModal(false);
    setSaasTemplateBulkRemoving(false);

    if (failureCount > 0) {
      setNotice(`${successIds.length} template(s) removido(s) e ${failureCount} falha(s) na remoção em lote.`);
      return;
    }

    setNotice(`${successIds.length} template(s) removido(s) com sucesso.`);
  }

  async function removeSingleTemplate(item: SaasTemplateItem) {
    if (!item.productId) {
      setNotice(`Template ${item.templateKey} sem productId.`);
      return;
    }

    const shouldRemove = window.confirm(
      `Deseja remover o template "${displayTemplateName(item.templateKey)}" da listagem ativa?`,
    );
    if (!shouldRemove) return;

    setSaasSaving(true);
    const payload = {
      id: item.id,
      productId: item.productId,
      siteId: item.siteId || '',
      templateKey: item.templateKey,
      subject: item.subject,
      html: item.html || '',
      text: item.text || '',
      version: item.version || 1,
      isActive: false,
    };

    const res = await fetch('/api/control-panel/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaasSaving(false);

    if (!res.ok) {
      setNotice(data.error || `Falha ao remover template ${item.templateKey}`);
      return;
    }

    setNotice(`Template ${displayTemplateName(item.templateKey)} removido com sucesso.`);
    await loadSaas();
  }

  async function submitSaasEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaasSaving(true);

    const res = await fetch('/api/control-panel/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saasEventForm),
    });
    const data = await res.json().catch(() => ({}));

    setSaasSaving(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao salvar evento');
      return;
    }

    setNotice('Evento salvo com sucesso.');
    await loadSaas();
  }

  async function submitSaasEmailAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaasSaving(true);

    const payload = {
      productId: saasEmailForm.productId,
      siteId: saasEmailForm.siteId || null,
      emailLabel: saasEmailForm.emailLabel,
      fromName: saasEmailForm.fromName,
      fromEmail: saasEmailForm.fromEmail,
      replyTo: saasEmailForm.replyTo || null,
      provider: saasEmailForm.provider,
      isDefault: saasEmailForm.isDefault,
      isActive: saasEmailForm.isActive,
    };

    const res = await fetch('/api/control-panel/email-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaasSaving(false);

    if (!res.ok) {
      setNotice(data.error || 'Falha ao salvar configuração de e-mail');
      return;
    }

    setNotice('Configuração de e-mail salva com sucesso.');
    setSaasEmailForm((prev) => ({
      ...prev,
      siteId: '',
      emailLabel: '',
      fromName: '',
      fromEmail: '',
      replyTo: '',
      provider: 'smtp',
      isDefault: false,
      isActive: true,
    }));
    await loadSaas();
  }

  async function reloadSection() {
    if (section === 'dashboard') {
      await loadDashboard();
      return;
    }
    if (pipelineType) {
      await loadPipeline(pipelineType);
      return;
    }
    if (section === 'clientes') {
      await loadClientes();
      return;
    }
    if (section === 'saas') {
      await loadSaas();
      return;
    }
    if (section === 'social_accounts') {
      await loadSocialAccounts();
      return;
    }
    if (section === 'social_posts') {
      await Promise.all([loadSocialAccounts(), loadSocialPosts()]);
      return;
    }
    if (section === 'social_logs') {
      await loadSocialLogs();
      return;
    }
    if (section === 'financeiro') {
      await loadFinanceiro();
      return;
    }
    if (section === 'tickets') {
      await loadTickets();
    }
  }

  useEffect(() => {
    reloadSection();
  }, [section, pipelineType]);

  useEffect(() => {
    document.body.classList.add('crm-v2-internal');
    return () => {
      document.body.classList.remove('crm-v2-internal');
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 980px)');
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateViewport);
      return () => mediaQuery.removeEventListener('change', updateViewport);
    }

    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    setIsSidebarCollapsed(stored === '1');
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    resetTransientOverlays();
    setIsSidebarDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onPageShow = () => resetTransientOverlays();
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    if (!isSidebarDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSidebarDrawerOpen]);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsSidebarDrawerOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    if (section !== 'social_accounts') return;
    const params = new URLSearchParams(window.location.search);
    const socialErrorParam = params.get('social_error');
    const socialNoticeParam = params.get('social_notice');

    if (socialErrorParam) {
      setNotice(socialErrorParam);
      return;
    }
    if (socialNoticeParam) {
      setNotice(socialNoticeParam);
    }
  }, [section, pathname]);

  useEffect(() => {
    if (section === 'clientes') {
      loadClientes();
    }
  }, [
    section,
    searchTerm,
    statusFilter,
    planFilter,
    clientesPage,
  ]);

  useEffect(() => {
    setClientesPage(1);
  }, [searchTerm, statusFilter, planFilter]);

  useEffect(() => {
    setSelectedClients([]);
  }, [clientesPage, searchTerm, statusFilter, planFilter]);

  useEffect(() => {
    if (!clientsSelectAllRef.current) return;
    const currentPageIds = clientesItems.map((item) => item.id);
    const selectedOnPage = currentPageIds.filter((id) => selectedClients.includes(id)).length;
    clientsSelectAllRef.current.indeterminate =
      selectedOnPage > 0 && selectedOnPage < currentPageIds.length;
  }, [clientesItems, selectedClients]);

  useEffect(() => {
    if (saasProducts.length === 0) return;
    const firstProductId = saasProducts[0].id;
    if (!saasEmailForm.productId) {
      setSaasEmailForm((prev) => ({ ...prev, productId: firstProductId }));
    }
    if (!saasSiteForm.productId) {
      setSaasSiteForm((prev) => ({ ...prev, productId: firstProductId }));
    }
    if (!saasTemplateForm.productId) {
      setSaasTemplateForm((prev) => ({ ...prev, productId: firstProductId }));
    }
    if (!saasEventForm.productId) {
      setSaasEventForm((prev) => ({ ...prev, productId: firstProductId }));
    }
  }, [saasProducts, saasEmailForm.productId, saasSiteForm.productId, saasTemplateForm.productId, saasEventForm.productId]);

  useEffect(() => {
    if (saasSites.length === 0) return;
    const firstSiteId = saasSites[0].id;
    if (!saasTemplateForm.siteId) {
      setSaasTemplateForm((prev) => ({ ...prev, siteId: firstSiteId }));
    }
    if (!saasEventForm.siteId) {
      setSaasEventForm((prev) => ({ ...prev, siteId: firstSiteId }));
    }
  }, [saasSites, saasTemplateForm.siteId, saasEventForm.siteId]);

  useEffect(() => {
    if (saasTemplates.length === 0) return;
    if (!saasEventForm.templateId) {
      setSaasEventForm((prev) => ({ ...prev, templateId: saasTemplates[0].id }));
    }
  }, [saasTemplates, saasEventForm.templateId]);

  useEffect(() => {
    if (saasTab !== 'emails') return;
    setSaasEmailPage(1);
  }, [saasTab]);

  useEffect(() => {
    if (saasTab !== 'templates') return;
    setSaasTemplatePage(1);
  }, [saasTab]);

  useEffect(() => {
    setSaasTemplatePage(1);
  }, [saasTemplateSearch, saasTemplateStatusFilter]);

  useEffect(() => {
    if (saasTab !== 'templates') return;
    setSelectedTemplateIds([]);
  }, [saasTemplatePage, saasTab, saasTemplateSearch, saasTemplateStatusFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(saasEmailAccounts.length / SAAS_EMAILS_PER_PAGE));
    if (saasEmailPage <= totalPages) return;
    setSaasEmailPage(totalPages);
  }, [saasEmailAccounts.length, saasEmailPage]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(saasTemplates.length / SAAS_TEMPLATES_PER_PAGE));
    if (saasTemplatePage <= totalPages) return;
    setSaasTemplatePage(totalPages);
  }, [saasTemplates.length, saasTemplatePage]);

  useEffect(() => {
    if (socialAccounts.length === 0) return;
    if (socialPostForm.accountId) return;
    setSocialPostForm((prev) => ({ ...prev, accountId: socialAccounts[0].id }));
  }, [socialAccounts, socialPostForm.accountId]);

  useEffect(() => {
    if (!isTemplateRouteMode) return;
    setSaasTab('templates');
  }, [isTemplateRouteMode]);

  useEffect(() => {
    if (!isTemplateRouteMode || !saasTemplateRouteId) return;
    if (saasLoading) return;

    const matched = saasTemplates.find((item) => item.id === saasTemplateRouteId);
    if (!matched) {
      setNotice('Template não encontrado para o caminho informado.');
      return;
    }

    setTemplateModalSource(matched);
    setTemplateModalSnapshot((prev) => mapTemplateItemToForm(matched, prev || saasTemplateForm));
    setSaasTemplateForm((prev) => mapTemplateItemToForm(matched, prev));
    setSaasTemplatePreviewOpen(false);
  }, [isTemplateRouteMode, saasLoading, saasTemplateRouteId, saasTemplates]);

  useEffect(() => {
    if (!isTemplateCreateRoute) return;
    setTemplateModalSource(null);
    setTemplateModalSnapshot(null);
    setSaasTemplatePreviewOpen(false);
    setSaasTemplateForm((prev) => ({
      ...prev,
      id: '',
      templateName: prev.templateName || 'Boas-vindas',
      templateCategory: 'transacional',
      subject: '',
      description: '',
      html: '',
      text: '',
      availableVariables: '',
      notes: '',
      version: 1,
      isActive: true,
    }));
  }, [isTemplateCreateRoute]);

  async function updateStage(dealIdValue: string, stageId: string) {
    const res = await fetch(`/api/deals/${dealIdValue}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, reason: 'Mudança manual no pipeline' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error || 'Falha ao mover estágio');
      return;
    }
    setNotice('Estágio atualizado com sucesso.');
    if (pipelineType) await loadPipeline(pipelineType);
  }

  async function moveToAdjacentStage(dealIdValue: string, currentStageId: string, direction: 'prev' | 'next') {
    const stages = pipelineData?.stages || [];
    const currentIndex = stages.findIndex((item) => item.id === currentStageId);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) {
      setNotice(direction === 'prev' ? 'Este lead já está no primeiro estágio.' : 'Este lead já está no último estágio.');
      return;
    }

    await updateStage(dealIdValue, stages[targetIndex].id);
  }

  async function reorderDeal(dealIdValue: string, stageId: string, positionIndex: number) {
    const res = await fetch(`/api/deals/${dealIdValue}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, positionIndex }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error || 'Falha ao reordenar linha');
      return;
    }
    setNotice('Linha reordenada com sucesso.');
    if (pipelineType) await loadPipeline(pipelineType);
  }

  async function createManualLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const payload = {
      pipelineType,
      name: leadForm.name,
      email: leadForm.email,
      phone: leadForm.phone,
      planCode: pipelineType === 'hospedagem' ? leadForm.planCode : null,
      productCode: pipelineType === 'avulsos' ? leadForm.productCode : null,
      value: leadForm.value,
      intent: leadForm.intent,
    };

    const res = await fetch('/api/deals/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setNotice(data.error || 'Falha ao cadastrar lead');
      return;
    }

    const notificationQueued = data?.leadNotification?.queued !== false;
    if (notificationQueued) {
      setNotice('Lead cadastrado com sucesso.');
    } else {
      setNotice('Lead cadastrado, mas o alerta por e-mail não foi enfileirado. Verifique worker/SMTP.');
    }
    setShowLeadModal(false);
    setLeadForm({
      name: '',
      email: '',
      phone: '',
      planCode: 'basic',
      productCode: 'site_institucional',
      value: '',
      intent: '',
    });

    if (pipelineType) await loadPipeline(pipelineType);
  }

  async function createQuickClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasContact = quickClientForm.email.trim() || quickClientForm.phone.trim();
    if (!quickClientForm.name.trim() || !hasContact) {
      setNotice('Nome e pelo menos e-mail ou telefone são obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      const createRes = await fetch('/api/deals/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineType: 'hospedagem',
          name: quickClientForm.name.trim(),
          email: quickClientForm.email.trim(),
          phone: quickClientForm.phone.trim(),
          planCode: quickClientForm.planCode,
          value: quickClientForm.value,
          intent: `cliente_${quickClientForm.planCode}`,
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createData?.dealId) {
        setNotice(createData.error || 'Falha ao cadastrar cliente rápido');
        return;
      }

      const targetStageId = await resolveWonStageId();
      const closeRes = await fetch(`/api/deals/${createData.dealId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: targetStageId,
          reason: 'Cadastro rápido de cliente pela aba Clientes',
        }),
      });
      const closeData = await closeRes.json().catch(() => ({}));
      if (!closeRes.ok) {
        setNotice(closeData.error || 'Cliente criado, mas falhou ao finalizar como cliente ativo.');
        return;
      }

      setCreateClientModalOpen(false);
      setQuickClientForm({
        name: '',
        email: '',
        phone: '',
        planCode: 'basic',
        value: '',
      });
      setNotice('Cliente cadastrado com sucesso.');
      await loadClientes();
    } catch (error) {
      setNotice(`Falha ao cadastrar cliente rápido: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  function toggleOne(id: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllVisible(visibleIds: string[]) {
    if (visibleIds.length === 0) return;
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      const allVisibleSelected = visibleIds.every((id) => next.has(id));
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleClientSelection(clientId: string) {
    setSelectedClients((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  }

  function toggleSelectAllClients() {
    const currentIds = clientesItems.map((item) => item.id);
    const allSelected = currentIds.length > 0 && currentIds.every((id) => selectedClients.includes(id));
    setSelectedClients((prev) => {
      if (allSelected) return prev.filter((id) => !currentIds.includes(id));
      return Array.from(new Set([...prev, ...currentIds]));
    });
  }

  async function confirmBulkDeleteClients() {
    if (selectedClients.length === 0) return;
    setBulkDeleteLoading(true);

    const results = await Promise.all(
      selectedClients.map(async (dealIdValue) => {
        const res = await fetch(`/api/deals/${dealIdValue}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        return { dealIdValue, ok: res.ok, error: data.error || 'Falha ao excluir' };
      }),
    );

    const failures = results.filter((item) => !item.ok);
    const successCount = results.length - failures.length;

    if (failures.length === 0) {
      setNotice(`${successCount} cliente(s) removido(s) com sucesso.`);
      setSelectedClients([]);
      setShowBulkDeleteModal(false);
    } else {
      setNotice(
        `Removidos ${successCount} cliente(s). ${failures.length} falharam e permaneceram selecionados.`,
      );
      setSelectedClients(failures.map((item) => item.dealIdValue));
    }

    setBulkDeleteLoading(false);
    await loadClientes();
  }

  async function submitFinancialEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch('/api/financeiro/lancamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(financialForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error || 'Falha ao lançar entrada');
      return;
    }
    setNotice('Lançamento financeiro registrado.');
    setFinancialForm((prev) => ({ ...prev, amount: '', description: '' }));
    await loadFinanceiro();
  }

  async function submitCollectionAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch('/api/financeiro/cobranca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectionForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error || 'Falha ao registrar cobrança');
      return;
    }
    setNotice('Ação de cobrança registrada.');
    setCollectionForm((prev) => ({ ...prev, notes: '', outcome: '' }));
  }

  function openEditDeal(data: {
    id: string;
    title?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    intent?: string | null;
    valueCents?: number | null;
  }) {
    setEditForm({
      id: data.id,
      title: data.title || '',
      contactName: data.contactName || '',
      contactEmail: data.contactEmail || '',
      contactPhone: data.contactPhone || '',
      intent: data.intent || '',
      value: data.valueCents !== null && data.valueCents !== undefined ? String(data.valueCents / 100) : '',
    });
    setShowEditModal(true);
  }

  async function submitEditDeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm.id) return;

    setLoading(true);
    const res = await fetch(`/api/deals/${editForm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editForm.title,
        contactName: editForm.contactName,
        contactEmail: editForm.contactEmail,
        contactPhone: editForm.contactPhone,
        intent: editForm.intent,
        value: editForm.value,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setNotice(data.error || 'Falha ao editar registro');
      return;
    }

    setShowEditModal(false);
    setNotice('Registro atualizado com sucesso.');
    await reloadSection();
  }

  function openDeleteDealModal(dealIdValue: string, label: string) {
    setDeleteTarget({ id: dealIdValue, label });
    setShowDeleteModal(true);
  }

  async function confirmDeleteDeal() {
    if (!deleteTarget?.id) return;
    setLoading(true);
    const deleteUrl = `/api/deals/${deleteTarget.id}`;
    const res = await fetch(deleteUrl, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setNotice(data.error || 'Falha ao excluir registro');
      return;
    }

    setShowDeleteModal(false);
    setDeleteTarget(null);
    setNotice('Registro excluído com sucesso.');
    await reloadSection();
  }

  async function moveToGhost() {
    if (!ghostTarget?.id) return;
    setLoading(true);
    const res = await fetch(`/api/clientes/${ghostTarget.id}/ghost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Movido manualmente para lista fantasma' }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao mover cliente para fantasma');
      return;
    }
    setGhostTarget(null);
    setNotice('Cliente movido para lista fantasma.');
    await loadClientes();
  }

  async function restoreFromGhost() {
    if (!restoreTarget?.id) return;
    setLoading(true);
    const res = await fetch(`/api/clientes/${restoreTarget.id}/restore`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao restaurar cliente');
      return;
    }
    setRestoreTarget(null);
    setNotice('Cliente restaurado para lista principal.');
    await loadClientes();
  }

  async function purgeGhostClient() {
    if (!purgeTarget?.id) return;
    if (purgeConfirm.trim().toUpperCase() !== 'EXCLUIR PERMANENTEMENTE') {
      setNotice('Digite "EXCLUIR PERMANENTEMENTE" para confirmar.');
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/clientes/${purgeTarget.id}/purge`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setNotice(data.error || 'Falha ao excluir permanentemente');
      return;
    }
    setPurgeTarget(null);
    setPurgeConfirm('');
    setShowPurgeModal(false);
    setNotice('Cliente removido permanentemente com sucesso.');
    await loadClientes();
  }

  const activeMenu = MENU_ITEMS.find((item) => pathname.startsWith(item.href))?.key || (section === 'deal' ? 'clientes' : section);
  const topbarDescription =
    section === 'dashboard'
      ? 'Visão rápida da saúde comercial, financeira e operacional.'
      : section === 'pipeline_avulsos'
        ? 'Gestão Comercial de Oportunidades com visão por etapa e ações rápidas.'
        : section === 'pipeline_hospedagem'
          ? 'Jornada Comercial de hospedagem com acompanhamento por etapa.'
      : section === 'saas'
        ? isModernControlPanel
          ? 'Central de Comunicação/Engajamento aplicada no Painel de Controle com listagem como foco principal.'
          : 'Centralize produtos, sites, e-mails, templates e eventos automáticos em uma visão operacional única.'
        : section === 'communication'
          ? 'Central de Comunicação/Engajamento com listagens, filtros e cadastros separados por domínio.'
        : section === 'social_accounts' || section === 'social_posts' || section === 'social_logs'
          ? 'Instagram via Meta Graph API: conexão OAuth, publicação de imagem e trilha de auditoria.'
        : 'KoddaCRM: tabela por estágio, área do cliente, operação integrada e financeiro avançado.';
  const currentHour = new Date().getHours();
  const periodLabel = currentHour < 12 ? 'Manhã' : currentHour < 18 ? 'Tarde' : 'Noite';
  const currentPageClientIds = clientesItems.map((item) => item.id);
  const allClientsOnPageSelected =
    currentPageClientIds.length > 0 && currentPageClientIds.every((id) => selectedClients.includes(id));
  const saasSitesByProductId = useMemo(
    () =>
      saasSites.reduce<Record<string, number>>((acc, site) => {
        acc[site.productId] = (acc[site.productId] || 0) + 1;
        return acc;
      }, {}),
    [saasSites],
  );
  const saasEmailTotalPages = useMemo(
    () => Math.max(1, Math.ceil(saasEmailAccounts.length / SAAS_EMAILS_PER_PAGE)),
    [saasEmailAccounts.length],
  );
  const saasEmailVisibleItems = useMemo(() => {
    const start = (saasEmailPage - 1) * SAAS_EMAILS_PER_PAGE;
    return saasEmailAccounts.slice(start, start + SAAS_EMAILS_PER_PAGE);
  }, [saasEmailAccounts, saasEmailPage]);
  const saasEmailRangeStart = saasEmailAccounts.length === 0 ? 0 : (saasEmailPage - 1) * SAAS_EMAILS_PER_PAGE + 1;
  const saasEmailRangeEnd =
    saasEmailAccounts.length === 0 ? 0 : Math.min(saasEmailRangeStart + saasEmailVisibleItems.length - 1, saasEmailAccounts.length);
  const saasTemplateFilteredItems = useMemo(() => {
    const normalizedSearch = saasTemplateSearch.trim().toLowerCase();

    return saasTemplates.filter((item) => {
      if (saasTemplateStatusFilter === 'active' && !item.isActive) return false;
      if (saasTemplateStatusFilter === 'inactive' && item.isActive) return false;

      if (!normalizedSearch) return true;
      const haystack = [
        item.templateKey,
        displayTemplateName(item.templateKey),
        item.subject,
        item.productName || '',
        item.siteDomain || '',
        `v${item.version}`,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [saasTemplateSearch, saasTemplateStatusFilter, saasTemplates]);
  const saasTemplateTotalPages = useMemo(
    () => Math.max(1, Math.ceil(saasTemplateFilteredItems.length / SAAS_TEMPLATES_PER_PAGE)),
    [saasTemplateFilteredItems.length],
  );
  const saasTemplateVisibleItems = useMemo(() => {
    const start = (saasTemplatePage - 1) * SAAS_TEMPLATES_PER_PAGE;
    return saasTemplateFilteredItems.slice(start, start + SAAS_TEMPLATES_PER_PAGE);
  }, [saasTemplateFilteredItems, saasTemplatePage]);
  const saasTemplateRangeStart =
    saasTemplateFilteredItems.length === 0 ? 0 : (saasTemplatePage - 1) * SAAS_TEMPLATES_PER_PAGE + 1;
  const saasTemplateRangeEnd =
    saasTemplateFilteredItems.length === 0
      ? 0
      : Math.min(saasTemplateRangeStart + saasTemplateVisibleItems.length - 1, saasTemplateFilteredItems.length);
  const saasTemplateVisibleIds = useMemo(() => saasTemplateVisibleItems.map((item) => item.id), [saasTemplateVisibleItems]);
  const saasTemplateSelectedCount = saasTemplateVisibleIds.filter((id) => selectedTemplateIds.includes(id)).length;
  const allVisibleTemplatesSelected =
    saasTemplateVisibleIds.length > 0 && saasTemplateSelectedCount === saasTemplateVisibleIds.length;
  const templateModalHasHtml = (saasTemplateForm.html || '').trim().length > 0;
  const templateModalPreviewMarkup = useMemo(() => {
    if (templateModalHasHtml) {
      return String(saasTemplateForm.html || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    }
    return `<pre style="margin:0;white-space:pre-wrap;line-height:1.6;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${saasTemplateForm.text || 'Nenhum conteúdo disponível.'}</pre>`;
  }, [templateModalHasHtml, saasTemplateForm.html, saasTemplateForm.text]);
  const templateRouteItem = useMemo(
    () => (saasTemplateRouteId ? saasTemplates.find((item) => item.id === saasTemplateRouteId) || null : null),
    [saasTemplateRouteId, saasTemplates],
  );

  useEffect(() => {
    if (saasTemplatePage <= saasTemplateTotalPages) return;
    setSaasTemplatePage(saasTemplateTotalPages);
  }, [saasTemplatePage, saasTemplateTotalPages]);

  useEffect(() => {
    setSelectedTemplateIds((prev) => {
      const next = prev.filter((id) => saasTemplateVisibleIds.includes(id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [saasTemplateVisibleIds]);

  useEffect(() => {
    if (!templatesSelectAllRef.current) return;
    templatesSelectAllRef.current.indeterminate =
      saasTemplateSelectedCount > 0 && saasTemplateSelectedCount < saasTemplateVisibleIds.length;
  }, [saasTemplateSelectedCount, saasTemplateVisibleIds.length]);

  function resolveClientStatus(item: ClienteItem): ClienteStatus {
    if (item.ghostedAt) return 'FANTASMA';
    return item.classStatus;
  }

  function socialPostStatusClass(status: string) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'PUBLISHED') return 'ativo';
    if (normalized === 'FAILED') return 'atrasado';
    return 'inativo';
  }

  function toggleSidebar() {
    if (isMobileViewport) {
      setIsSidebarDrawerOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => !prev);
  }

  return (
    <div className={`crm-v2-layout${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}${isSidebarDrawerOpen ? ' is-sidebar-open' : ''}`}>
      <aside id="crm-v2-sidebar" className={`crm-v2-sidebar${isSidebarCollapsed ? ' is-collapsed' : ''}`}>
        <div className="crm-v2-sidebar-head">
          <Link className="crm-v2-brand" href="/dashboard" aria-label="KoddaCRM">
            <img src="/koddahub-logo-v2.png" alt="KoddaHub" />
            <span className="crm-v2-brand-text">
              <span className="kodda">Kodda</span>
              <span className="hub">Hub</span>
            </span>
          </Link>
          <button
            type="button"
            className="crm-v2-sidebar-toggle is-inline"
            onClick={toggleSidebar}
            aria-label={
              isMobileViewport
                ? isSidebarDrawerOpen
                  ? 'Fechar menu lateral'
                  : 'Abrir menu lateral'
                : isSidebarCollapsed
                  ? 'Expandir menu lateral'
                  : 'Recolher menu lateral'
            }
            aria-expanded={isMobileViewport ? isSidebarDrawerOpen : !isSidebarCollapsed}
            aria-controls="crm-v2-sidebar"
          >
            <i className={`bi ${isMobileViewport ? (isSidebarDrawerOpen ? 'bi-x-lg' : 'bi-list') : isSidebarCollapsed ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar'}`} aria-hidden="true" />
          </button>
        </div>

        <nav className="crm-v2-menu" aria-label="Navegação principal CRM">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={activeMenu === item.key ? 'active' : ''}
              aria-current={activeMenu === item.key ? 'page' : undefined}
              title={isSidebarCollapsed ? item.label : undefined}
            >
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              <span className="crm-v2-menu-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="crm-v2-sidebar-footer">
          <button type="button" onClick={runReconcile} className="secondary-btn" disabled={loading}>
            <i className="bi bi-arrow-repeat" aria-hidden="true" /> <span className="crm-v2-sidebar-btn-label">Reconciliar</span>
          </button>
          <button type="button" onClick={logout} className="danger-btn">
            <i className="bi bi-box-arrow-right" aria-hidden="true" /> <span className="crm-v2-sidebar-btn-label">Sair</span>
          </button>
        </div>
      </aside>

      <button
        type="button"
        className="crm-v2-sidebar-backdrop"
        aria-label="Fechar menu lateral"
        onClick={() => setIsSidebarDrawerOpen(false)}
      />

      <main className="crm-v2-main">
        <header className="crm-v2-topbar">
          <div className="crm-v2-topbar-title">
            <button
              type="button"
              className="crm-v2-sidebar-toggle"
              onClick={toggleSidebar}
              aria-label={
                isMobileViewport
                  ? isSidebarDrawerOpen
                    ? 'Fechar menu lateral'
                    : 'Abrir menu lateral'
                  : isSidebarCollapsed
                    ? 'Expandir menu lateral'
                    : 'Recolher menu lateral'
              }
              aria-expanded={isMobileViewport ? isSidebarDrawerOpen : !isSidebarCollapsed}
              aria-controls="crm-v2-sidebar"
            >
              <i className={`bi ${isMobileViewport ? (isSidebarDrawerOpen ? 'bi-x-lg' : 'bi-list') : isSidebarCollapsed ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar'}`} aria-hidden="true" />
            </button>
            <div className="crm-v2-topbar-main">
              <h1>{sectionTitle(section)}</h1>
              <p>{topbarDescription}</p>
            </div>
          </div>
          {section === 'dashboard' ? (
            <div className="crm-v2-topbar-meta" aria-live="polite">
              <span className="crm-v2-chip">{periodLabel}</span>
              <span className="crm-v2-chip">Críticos: {dashboardCriticalCount}</span>
              <span className="crm-v2-chip is-muted">Atualizado: {shortDateTime(dashboardUpdatedAt)}</span>
            </div>
          ) : null}
        </header>

        {notice ? <div className="crm-v2-notice">{notice}</div> : null}

        {section === 'deal' && dealId ? <DealDetail dealId={dealId} setNotice={setNotice} /> : null}

        {section === 'dashboard' ? (
          <section className="crm-v2-dashboard-shell" aria-live="polite">
            {dashboardLoading ? (
              <div className="crm-v2-dashboard-grid">
                {Array.from({ length: 3 }).map((_, index) => (
                  <article key={`skeleton-${index}`} className="crm-v2-kpi-block is-loading" aria-hidden="true">
                    <header className="crm-v2-kpi-block-head">
                      <div>
                        <h3>
                          <i className="bi bi-activity" aria-hidden="true" />
                          <span>Carregando...</span>
                        </h3>
                        <p>Atualizando indicadores</p>
                      </div>
                    </header>
                    <div className="crm-v2-kpi-grid">
                      {Array.from({ length: 6 }).map((__, metricIndex) => (
                        <div key={`skeleton-metric-${metricIndex}`} className="crm-v2-kpi-card-skeleton" />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {!dashboardLoading && dashboardError ? (
              <article className="crm-v2-dashboard-state is-error" role="alert">
                <h3>Não foi possível carregar o dashboard</h3>
                <p>{dashboardError}</p>
                <button type="button" className="secondary-btn" onClick={() => void loadDashboard()}>
                  Tentar novamente
                </button>
              </article>
            ) : null}

            {!dashboardLoading && !dashboardError && dashboardBlocks.length === 0 ? (
              <article className="crm-v2-dashboard-state">
                <h3>Nenhum KPI disponível</h3>
                <p>Não há dados para exibir neste momento. Tente novamente em instantes.</p>
                <button type="button" className="secondary-btn" onClick={() => void loadDashboard()}>
                  Atualizar indicadores
                </button>
              </article>
            ) : null}

            {!dashboardLoading && !dashboardError && dashboardBlocks.length > 0 ? (
              <div className="crm-v2-dashboard-grid">
                {dashboardBlocks.map((block) => (
                  <DashboardBlockCard key={block.id} block={block} />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {pipelineType ? (
          <section className="crm-v2-panel">
            <div className="table-header-actions">
              <div>
                <h3>{pipelineType === 'avulsos' ? 'Funil Comercial' : 'Jornada Comercial'}</h3>
                <p>
                  {pipelineType === 'avulsos'
                    ? 'Oportunidades organizadas por etapa com movimentação livre.'
                    : 'Gestão Comercial de hospedagem em uma jornada por etapa.'}
                </p>
              </div>
              <button type="button" className="primary-btn" onClick={() => setShowLeadModal(true)}>
                <i className="bi bi-plus-circle" aria-hidden="true" /> Novo lead
              </button>
            </div>

            {(pipelineData?.stages || []).map((stage) => {
              const visibleIds = stage.rows.map((row) => row.id);
              const selectedVisibleCount = visibleIds.filter((id) => selectedLeadIds.has(id)).length;
              const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
              const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;

              return (
                <div
                  key={stage.id}
                  className="stage-table-block"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async () => {
                    if (dragDealId) {
                      await reorderDeal(dragDealId, stage.id, stage.rows.length);
                      setDragDealId(null);
                    }
                  }}
                >
                  <div className="stage-table-head">
                    <h4>{stage.name}</h4>
                    <span>{stage.rows.length}</span>
                  </div>

                  <div className="table-wrap">
                    <table className="pipeline-main-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              ref={(input) => {
                                if (input) input.indeterminate = someVisibleSelected;
                              }}
                              onChange={() => toggleAllVisible(visibleIds)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Selecionar todos os leads visíveis no estágio ${stage.name}`}
                            />
                          </th>
                          <th>Nome</th>
                          <th>E-mail</th>
                          <th>Plano/Produto</th>
                          <th>Valor</th>
                          <th>SLA</th>
                          <th>Origem</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stage.rows.map((row, index) => (
                          <tr
                            key={row.id}
                            draggable
                            onDragStart={() => setDragDealId(row.id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={async (event) => {
                              event.stopPropagation();
                              if (dragDealId) {
                                await reorderDeal(dragDealId, stage.id, index);
                                setDragDealId(null);
                              }
                            }}
                            onClick={() => router.push(`/deals/${row.id}`)}
                            className={`table-clickable-row${selectedLeadIds.has(row.id) ? ' is-selected' : ''}`}
                          >
                            <td onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(row.id)}
                                onChange={() => toggleOne(row.id)}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Selecionar lead ${row.contactName || row.title}`}
                              />
                            </td>
                            <td>{row.contactName || row.title}</td>
                            <td>{row.contactEmail || '-'}</td>
                            <td>{row.planCode || row.productCode || row.intent || '-'}</td>
                            <td>{currency(row.valueCents)}</td>
                            <td>{dateTime(row.slaDeadline)}</td>
                            <td>{row.origin}</td>
                            <td>
                              <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                <select
                                  aria-label="Mover estágio"
                                  value={stage.id}
                                  onChange={(e) => updateStage(row.id, e.target.value)}
                                >
                                  {(pipelineData?.stages || []).map((st) => (
                                    <option key={st.id} value={st.id}>{st.name}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => moveToAdjacentStage(row.id, stage.id, 'prev')}
                                >
                                  <i className="bi bi-arrow-up" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveToAdjacentStage(row.id, stage.id, 'next')}
                                >
                                  <i className="bi bi-arrow-down" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Editar lead"
                                  title="Editar"
                                  onClick={() =>
                                    openEditDeal({
                                      id: row.id,
                                      title: row.title,
                                      contactName: row.contactName,
                                      contactEmail: row.contactEmail,
                                      contactPhone: row.contactPhone,
                                      intent: row.intent,
                                      valueCents: row.valueCents,
                                    })
                                  }
                                >
                                  <i className="bi bi-pencil-square" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  className="danger-inline-btn"
                                  aria-label="Excluir lead"
                                  title="Excluir"
                                  onClick={() => openDeleteDealModal(row.id, row.contactName || row.title)}
                                >
                                  <i className="bi bi-trash3" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}

        {section === 'clientes' ? (
          <section className="crm-v2-panel clientes-operacao-panel">
            <div className="table-header-actions">
              <div>
                <h3>Carteira de Clientes</h3>
                <p>Operação unificada: busca rápida, filtros e ações em massa.</p>
              </div>
              <div className="clientes-actions-group">
                <span className="status-chip ativo" title="Clientes ativos">{clientesCounts.ATIVO}</span>
                <span className="status-chip atrasado" title="Clientes atrasados">{clientesCounts.ATRASADO}</span>
                <span className="status-chip inativo" title="Clientes inativos">{clientesCounts.INATIVO}</span>
                <span className="status-chip fantasma" title="Lista fantasma">{clientesCounts.FANTASMA}</span>
                <button
                  type="button"
                  className="primary-btn icon-only-add-btn"
                  aria-label="Cadastro rápido de cliente"
                  title="Cadastro rápido de cliente"
                  onClick={() => setCreateClientModalOpen(true)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="clientes-toolbar-inline">
              <input
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Buscar cliente"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ClienteStatusFilter)}
                aria-label="Filtrar por status"
              >
                <option value="TODOS">Todos os status</option>
                <option value="ATIVO">Ativos</option>
                <option value="ATRASADO">Atrasados</option>
                <option value="INATIVO">Inativos</option>
                <option value="FANTASMA">Fantasma</option>
              </select>
              <input
                placeholder="Filtrar plano/produto..."
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                aria-label="Filtrar por plano"
              />
            </div>

            {selectedClients.length > 0 ? (
              <div className="clientes-bulk-actions" role="status" aria-live="polite">
                <strong>{selectedClients.length} selecionado(s)</strong>
                <div className="clientes-bulk-actions-buttons">
                  <button type="button" className="secondary-btn" onClick={() => setSelectedClients([])}>
                    Limpar seleção
                  </button>
                  <button type="button" className="danger-btn" onClick={() => setShowBulkDeleteModal(true)}>
                    Remover em massa
                  </button>
                </div>
              </div>
            ) : null}

            <div className="table-wrap">
              <table className="clientes-main-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        ref={clientsSelectAllRef}
                        type="checkbox"
                        checked={allClientsOnPageSelected}
                        onChange={toggleSelectAllClients}
                        aria-label="Selecionar todos os clientes da página"
                      />
                    </th>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Plano</th>
                    <th className="hide-on-mobile">Valor</th>
                    <th className="hide-on-mobile">Vencimento</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesItems.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="clientes-empty-state">
                          Nenhum cliente encontrado para os filtros atuais.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    clientesItems.map((item) => {
                      const itemStatus = resolveClientStatus(item);
                      const statusClass =
                        itemStatus === 'ATIVO'
                          ? 'ativo'
                          : itemStatus === 'ATRASADO'
                            ? 'atrasado'
                            : itemStatus === 'INATIVO'
                              ? 'inativo'
                              : 'fantasma';

                      return (
                        <tr key={item.id} className="table-clickable-row" onClick={() => router.push(`/deals/${item.id}`)}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedClients.includes(item.id)}
                              onChange={() => toggleClientSelection(item.id)}
                              aria-label={`Selecionar ${item.contactName || item.title}`}
                            />
                          </td>
                          <td>{item.contactName || item.title}</td>
                          <td>{item.contactEmail || '-'}</td>
                          <td>{item.planCode || item.productCode || '-'}</td>
                          <td className="hide-on-mobile">{currency(item.valueCents)}</td>
                          <td className="hide-on-mobile">{dateOnly(item.nextDueDate || item.referenceDueDate)}</td>
                          <td><span className={`status-chip ${statusClass}`}>{itemStatus}</span></td>
                          <td>
                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                aria-label="Editar cliente"
                                title="Editar"
                                onClick={() =>
                                  openEditDeal({
                                    id: item.id,
                                    title: item.title,
                                    contactName: item.contactName,
                                    contactEmail: item.contactEmail,
                                    valueCents: item.valueCents,
                                  })
                                }
                              >
                                <i className="bi bi-pencil-square" aria-hidden="true" />
                              </button>

                              {itemStatus === 'INATIVO' ? (
                                <button
                                  type="button"
                                  className="danger-inline-btn"
                                  aria-label="Mover para lista fantasma"
                                  title="Mover para lista fantasma"
                                  onClick={() => setGhostTarget({ id: item.id, label: item.contactName || item.title })}
                                >
                                  <i className="bi bi-archive-fill" aria-hidden="true" />
                                </button>
                              ) : null}

                              {itemStatus === 'FANTASMA' ? (
                                <>
                                  <button
                                    type="button"
                                    aria-label="Restaurar cliente"
                                    title="Restaurar"
                                    onClick={() => setRestoreTarget({ id: item.id, label: item.contactName || item.title })}
                                  >
                                    <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-inline-btn"
                                    aria-label="Excluir permanentemente"
                                    title="Excluir permanentemente"
                                    onClick={() => {
                                      setPurgeTarget({ id: item.id, label: item.contactName || item.title });
                                      setShowPurgeModal(true);
                                    }}
                                  >
                                    <i className="bi bi-trash3-fill" aria-hidden="true" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="danger-inline-btn"
                                  aria-label="Excluir cliente"
                                  title="Excluir"
                                  onClick={() => openDeleteDealModal(item.id, item.contactName || item.title)}
                                >
                                  <i className="bi bi-trash3" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="clientes-pagination">
              <button type="button" onClick={() => setClientesPage((p) => Math.max(1, p - 1))} disabled={clientesPage <= 1}>Anterior</button>
              <span>Página {clientesPage} de {clientesTotalPages} ({clientesTotal} registros)</span>
              <button type="button" onClick={() => setClientesPage((p) => Math.min(clientesTotalPages, p + 1))} disabled={clientesPage >= clientesTotalPages}>Próxima</button>
            </div>
          </section>
        ) : null}

        {section === 'communication' || isModernControlPanel ? (
          <CommunicationModule view={communicationView || 'overview'} recordId={communicationRecordId} setNotice={setNotice} />
        ) : null}

        {section === 'saas' && !isModernControlPanel ? (
          <section className="crm-v2-panel saas-v2-panel">
            <div className="saas-hero">
              <div>
                <span className="saas-hero-kicker">{isTemplateRouteMode ? 'Gestão de templates' : 'Painel administrativo'}</span>
                <h3>{isTemplateRouteMode ? 'Painel de Controle · Templates' : 'Painel de Controle'}</h3>
                <p>
                  {isTemplateRouteMode
                    ? 'Gerencie templates com foco em listagem, contexto de produto e navegação dedicada para criação.'
                    : 'Centralize produtos, sites, e-mails, templates e eventos automáticos em uma visão operacional única.'}
                </p>
              </div>
              <span className="saas-hero-chip">
                {isTemplateRouteMode
                  ? `${saasTemplateFilteredItems.length} template(s) filtrado(s)`
                  : `${saasProducts.length} produtos • ${saasEmailAccounts.length} e-mails`}
              </span>
            </div>

            {!isTemplateRouteMode ? (
              <div className="saas-tabbar" role="tablist" aria-label="Subseções do Painel de Controle">
                <button type="button" role="tab" aria-selected={saasTab === 'produtos'} className={saasTab === 'produtos' ? 'active' : ''} onClick={() => setSaasTab('produtos')}>Produtos</button>
                <button type="button" role="tab" aria-selected={saasTab === 'sites'} className={saasTab === 'sites' ? 'active' : ''} onClick={() => setSaasTab('sites')}>Sites</button>
                <button type="button" role="tab" aria-selected={saasTab === 'emails'} className={saasTab === 'emails' ? 'active' : ''} onClick={() => setSaasTab('emails')}>E-mails</button>
                <Link href="/painel-de-controle/templates" role="tab" aria-selected={false} className="saas-tab-link">Templates</Link>
                <button type="button" role="tab" aria-selected={saasTab === 'eventos'} className={saasTab === 'eventos' ? 'active' : ''} onClick={() => setSaasTab('eventos')}>Eventos</button>
              </div>
            ) : (
              <nav className="saas-template-breadcrumbs" aria-label="Breadcrumb templates">
                <Link href="/painel-de-controle">Painel de Controle</Link>
                <span>/</span>
                <Link href="/painel-de-controle/templates">Templates</Link>
                {isTemplateCreateRoute ? (
                  <>
                    <span>/</span>
                    <span>Novo</span>
                  </>
                ) : null}
                {isTemplateEditRoute ? (
                  <>
                    <span>/</span>
                    <span>Editar</span>
                  </>
                ) : null}
                {isTemplateViewRoute ? (
                  <>
                    <span>/</span>
                    <span>Detalhes</span>
                  </>
                ) : null}
              </nav>
            )}

            {saasLoading ? <p className="saas-loading">Carregando Painel de Controle...</p> : null}

            {!saasLoading && isTemplateRouteMode ? (
              <div className="saas-template-route-shell">
                {isTemplateListRoute ? (
                  <article className="saas-box saas-template-table-card saas-template-management-card">
                    <div className="saas-template-management-head">
                      <div>
                        <h4>Gestão de templates</h4>
                        <p>Listagem focada em consulta, busca, manutenção e vínculo com produto/site.</p>
                      </div>
                      <Link href="/painel-de-controle/templates/novo" className="primary-btn saas-create-template-btn">
                        + Novo template
                      </Link>
                    </div>

                    <div className="saas-template-toolbar">
                      <label className="saas-field-group">
                        <span className="saas-field-label">Busca</span>
                        <input
                          className="saas-input"
                          value={saasTemplateSearch}
                          onChange={(event) => setSaasTemplateSearch(event.target.value)}
                          placeholder="Buscar por template, assunto, produto, domínio ou versão"
                        />
                      </label>
                      <label className="saas-field-group">
                        <span className="saas-field-label">Status</span>
                        <select
                          className="saas-input"
                          value={saasTemplateStatusFilter}
                          onChange={(event) =>
                            setSaasTemplateStatusFilter(event.target.value as 'all' | 'active' | 'inactive')
                          }
                        >
                          <option value="all">Todos</option>
                          <option value="active">Ativos</option>
                          <option value="inactive">Inativos</option>
                        </select>
                      </label>
                      <button type="button" className="secondary-btn saas-template-refresh-btn" onClick={() => void loadSaas()}>
                        Atualizar
                      </button>
                    </div>

                    {saasTemplateSelectedCount > 0 ? (
                      <div className="saas-bulk-toolbar" role="status" aria-live="polite">
                        <strong>{saasTemplateSelectedCount} template(s) selecionado(s)</strong>
                        <div className="saas-bulk-toolbar-actions">
                          <button type="button" className="secondary-btn" onClick={() => setSelectedTemplateIds([])}>
                            Desmarcar
                          </button>
                          <button type="button" className="danger-btn" onClick={() => setShowTemplateBulkRemoveModal(true)}>
                            Remover selecionados
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {saasTemplateFilteredItems.length === 0 ? (
                      <div className="saas-empty-inline saas-empty-rich" role="status" aria-live="polite">
                        <strong>Nenhum template encontrado</strong>
                        <span>Ajuste os filtros ou cadastre um novo template para começar.</span>
                      </div>
                    ) : (
                      <>
                        <div className="saas-template-table-desktop">
                          <div className="saas-table-wrap">
                            <table className="saas-table">
                              <thead>
                                <tr>
                                  <th scope="col" className="saas-checkbox-cell">
                                    <input
                                      ref={templatesSelectAllRef}
                                      type="checkbox"
                                      className="saas-template-check"
                                      checked={allVisibleTemplatesSelected}
                                      onChange={toggleSelectAllVisibleTemplates}
                                      aria-label="Selecionar todos os templates visíveis"
                                    />
                                  </th>
                                  <th scope="col">Template</th>
                                  <th scope="col">Nome interno</th>
                                  <th scope="col">Produto</th>
                                  <th scope="col">Site/Domínio</th>
                                  <th scope="col">Assunto</th>
                                  <th scope="col">Versão</th>
                                  <th scope="col">Status</th>
                                  <th scope="col">Atualizado</th>
                                  <th scope="col">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {saasTemplateVisibleItems.map((item) => (
                                  <tr key={item.id} className={selectedTemplateIds.includes(item.id) ? 'saas-row-selected' : undefined}>
                                    <td className="saas-checkbox-cell" onClick={(event) => event.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        className="saas-template-check"
                                        checked={selectedTemplateIds.includes(item.id)}
                                        onChange={() => toggleTemplateSelection(item.id)}
                                        aria-label={`Selecionar template ${displayTemplateName(item.templateKey)}`}
                                      />
                                    </td>
                                    <td title={displayTemplateName(item.templateKey)}>
                                      <span className="saas-cell-truncate">{displayTemplateName(item.templateKey)}</span>
                                    </td>
                                    <td title={item.templateKey}>
                                      <code>{item.templateKey}</code>
                                    </td>
                                    <td title={item.productName || '-'}>
                                      <span className="saas-cell-truncate">{item.productName || '-'}</span>
                                    </td>
                                    <td title={item.siteDomain || '-'}>
                                      <span className="saas-cell-truncate">{item.siteDomain || '-'}</span>
                                    </td>
                                    <td title={item.subject}>
                                      <span className="saas-cell-truncate">{item.subject}</span>
                                    </td>
                                    <td>v{item.version}</td>
                                    <td>
                                      <span className={`saas-status-chip ${item.isActive ? 'is-active' : 'is-inactive'}`}>
                                        {item.isActive ? 'Ativo' : 'Inativo'}
                                      </span>
                                    </td>
                                    <td>{shortDateTime(item.updatedAt)}</td>
                                    <td>
                                      <div className="saas-template-row-actions">
                                        <Link href={`/painel-de-controle/templates/${item.id}`} className="secondary-btn saas-inline-action">
                                          Visualizar
                                        </Link>
                                        <Link href={`/painel-de-controle/templates/${item.id}/editar`} className="secondary-btn saas-inline-action is-muted">
                                          Editar
                                        </Link>
                                        <button
                                          type="button"
                                          className="danger-btn saas-inline-action"
                                          disabled={saasSaving}
                                          onClick={() => void removeSingleTemplate(item)}
                                        >
                                          Remover
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="saas-template-mobile-list">
                          {saasTemplateVisibleItems.map((item) => (
                            <article key={item.id} className={`saas-template-mobile-item ${selectedTemplateIds.includes(item.id) ? 'is-selected' : ''}`}>
                              <header>
                                <label className="saas-mobile-check">
                                  <input
                                    type="checkbox"
                                    className="saas-template-check"
                                    checked={selectedTemplateIds.includes(item.id)}
                                    onChange={() => toggleTemplateSelection(item.id)}
                                    aria-label={`Selecionar template ${displayTemplateName(item.templateKey)}`}
                                  />
                                  <strong>{displayTemplateName(item.templateKey)}</strong>
                                </label>
                                <span className={`saas-status-chip ${item.isActive ? 'is-active' : 'is-inactive'}`}>
                                  {item.isActive ? 'Ativo' : 'Inativo'}
                                </span>
                              </header>
                              <p><b>Nome interno:</b> <code>{item.templateKey}</code></p>
                              <p><b>Produto:</b> {item.productName || '-'}</p>
                              <p><b>Site:</b> {item.siteDomain || '-'}</p>
                              <p><b>Assunto:</b> {item.subject}</p>
                              <p><b>Versão:</b> v{item.version}</p>
                              <p><b>Atualizado:</b> {shortDateTime(item.updatedAt)}</p>
                              <div className="saas-template-mobile-actions">
                                <Link href={`/painel-de-controle/templates/${item.id}`} className="secondary-btn">
                                  Visualizar
                                </Link>
                                <Link href={`/painel-de-controle/templates/${item.id}/editar`} className="secondary-btn">
                                  Editar
                                </Link>
                                <button
                                  type="button"
                                  className="danger-btn"
                                  disabled={saasSaving}
                                  onClick={() => void removeSingleTemplate(item)}
                                >
                                  Remover
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>

                        <footer className="saas-pagination">
                          <span>Mostrando {saasTemplateRangeStart}-{saasTemplateRangeEnd} de {saasTemplateFilteredItems.length}</span>
                          <div className="saas-pagination-actions">
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => setSaasTemplatePage((prev) => Math.max(1, prev - 1))}
                              disabled={saasTemplatePage <= 1}
                            >
                              Anterior
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => setSaasTemplatePage((prev) => Math.min(saasTemplateTotalPages, prev + 1))}
                              disabled={saasTemplatePage >= saasTemplateTotalPages}
                            >
                              Próxima
                            </button>
                          </div>
                          <span>Página {saasTemplatePage} de {saasTemplateTotalPages}</span>
                        </footer>
                      </>
                    )}
                  </article>
                ) : null}

                {isTemplateCreateRoute || isTemplateEditRoute ? (
                  <article className="saas-box saas-template-route-form-card">
                    <div className="saas-template-form-head">
                      <div>
                        <h4>{isTemplateEditRoute ? 'Editar template' : 'Novo template'}</h4>
                        <p>Preencha metadados, vínculos de produto/site, assunto e conteúdo do template.</p>
                      </div>
                      <span className={`saas-status-chip ${saasTemplateForm.isActive ? 'is-active' : 'is-inactive'}`}>
                        {saasTemplateForm.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <form className="stack-form saas-template-form" onSubmit={submitSaasTemplate}>
                      <section className="saas-template-section">
                        <div className="saas-template-section-head">
                          <h5>Metadados</h5>
                          <p>Identificação interna e escopo do template.</p>
                        </div>
                        <div className="saas-template-grid-two">
                          <div className="saas-field-group">
                            <label className="saas-field-label" htmlFor="cp-route-template-name">Nome do template</label>
                            <input
                              id="cp-route-template-name"
                              className="saas-input"
                              value={saasTemplateForm.templateName}
                              onChange={(e) =>
                                setSaasTemplateForm((prev) => ({
                                  ...prev,
                                  templateName: e.target.value,
                                  templateKey: prev.templateKey ? prev.templateKey : normalizeTemplateKey(e.target.value),
                                }))
                              }
                              placeholder="Ex: Boas-vindas Praja"
                              required
                            />
                          </div>
                          <div className="saas-field-group">
                            <label className="saas-field-label" htmlFor="cp-route-template-category">Tipo/Categoria</label>
                            <select
                              id="cp-route-template-category"
                              className="saas-input"
                              value={saasTemplateForm.templateCategory}
                              onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, templateCategory: e.target.value }))}
                            >
                              <option value="transacional">Transacional</option>
                              <option value="seguranca">Segurança</option>
                              <option value="comunicacao">Comunicação</option>
                              <option value="operacional">Operacional</option>
                            </select>
                          </div>
                        </div>

                        <div className="saas-template-grid-three">
                          <div className="saas-field-group">
                            <label className="saas-field-label" htmlFor="cp-route-template-product">Produto</label>
                            <select
                              id="cp-route-template-product"
                              className="saas-input"
                              value={saasTemplateForm.productId}
                              onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, productId: e.target.value, siteId: '' }))}
                              required
                            >
                              <option value="">Selecione um produto</option>
                              {saasProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="saas-field-group">
                            <label className="saas-field-label" htmlFor="cp-route-template-site">Site/Domínio</label>
                            <select
                              id="cp-route-template-site"
                              className="saas-input"
                              value={saasTemplateForm.siteId}
                              onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, siteId: e.target.value }))}
                            >
                              <option value="">Sem site específico</option>
                              {saasSites
                                .filter((site) => !saasTemplateForm.productId || site.productId === saasTemplateForm.productId)
                                .map((site) => (
                                  <option key={site.id} value={site.id}>
                                    {site.domain}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="saas-field-group">
                            <label className="saas-field-label" htmlFor="cp-route-template-version">Versão</label>
                            <input
                              id="cp-route-template-version"
                              className="saas-input"
                              type="number"
                              min={1}
                              value={saasTemplateForm.version}
                              onChange={(e) =>
                                setSaasTemplateForm((prev) => ({
                                  ...prev,
                                  version: Math.max(1, Number.parseInt(e.target.value || '1', 10) || 1),
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="saas-template-grid-two">
                          <div className="saas-field-group">
                            <label className="saas-field-label" htmlFor="cp-route-template-key">Nome interno</label>
                            <input
                              id="cp-route-template-key"
                              className="saas-input"
                              value={saasTemplateForm.templateKey}
                              onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, templateKey: normalizeTemplateKey(e.target.value) }))}
                              placeholder="Ex: reset_password"
                              required
                            />
                          </div>
                          <div className="saas-field-group">
                            <label className="saas-field-label" htmlFor="cp-route-template-subject">Assunto</label>
                            <input
                              id="cp-route-template-subject"
                              className="saas-input"
                              value={saasTemplateForm.subject}
                              onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, subject: e.target.value }))}
                              placeholder="Ex: Recuperação de acesso ao Praja"
                              required
                            />
                          </div>
                        </div>
                      </section>

                      <section className="saas-template-section">
                        <div className="saas-template-section-head">
                          <h5>Conteúdo</h5>
                          <p>HTML e texto fallback com preview controlado.</p>
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-route-template-html">Conteúdo HTML</label>
                          <textarea
                            id="cp-route-template-html"
                            className="saas-input saas-template-editor"
                            value={saasTemplateForm.html}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, html: e.target.value }))}
                            placeholder="<h1>Olá, {{name}}</h1>"
                          />
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-route-template-text">Conteúdo texto (fallback)</label>
                          <textarea
                            id="cp-route-template-text"
                            className="saas-input saas-template-textarea"
                            value={saasTemplateForm.text}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, text: e.target.value }))}
                            placeholder="Olá {{name}}, seja bem-vindo(a)!"
                          />
                        </div>
                      </section>

                      <section className="saas-template-section">
                        <div className="saas-template-section-head">
                          <h5>Variáveis e configurações</h5>
                          <p>Documente variáveis e observações operacionais.</p>
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-route-template-vars">Variáveis disponíveis</label>
                          <textarea
                            id="cp-route-template-vars"
                            className="saas-input saas-template-textarea"
                            value={saasTemplateForm.availableVariables}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, availableVariables: e.target.value }))}
                            placeholder="{{name}}, {{email}}, {{resetUrl}}"
                          />
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-route-template-notes">Observações</label>
                          <textarea
                            id="cp-route-template-notes"
                            className="saas-input saas-template-textarea"
                            value={saasTemplateForm.notes}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, notes: e.target.value }))}
                            placeholder="Regras de uso, limitações ou orientações internas."
                          />
                        </div>
                        <label className="saas-check-row">
                          <input
                            type="checkbox"
                            checked={saasTemplateForm.isActive}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                          />
                          <span>Template ativo</span>
                        </label>
                      </section>

                      {saasTemplatePreviewOpen ? (
                        <div className="saas-template-preview" role="status" aria-live="polite">
                          <strong>{saasTemplateForm.subject || 'Sem assunto'}</strong>
                          <small>{saasTemplateForm.templateKey || 'sem-chave'}</small>
                          <pre>{saasTemplateForm.html || saasTemplateForm.text || 'Nenhum conteúdo informado.'}</pre>
                        </div>
                      ) : null}

                      <footer className="saas-template-actions">
                        <Link href="/painel-de-controle/templates" className="secondary-btn">
                          Voltar para templates
                        </Link>
                        <button type="button" className="secondary-btn" onClick={resetSaasTemplateEditor}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => setSaasTemplatePreviewOpen((prev) => !prev)}
                        >
                          {saasTemplatePreviewOpen ? 'Ocultar preview' : 'Visualizar preview'}
                        </button>
                        <button type="submit" className="primary-btn" disabled={saasSaving}>
                          {saasSaving ? 'Salvando...' : isTemplateEditRoute ? 'Salvar alterações' : 'Salvar template'}
                        </button>
                      </footer>
                    </form>
                  </article>
                ) : null}

                {isTemplateViewRoute ? (
                  <article className="saas-box saas-template-route-view-card">
                    <div className="saas-template-management-head">
                      <div>
                        <h4>{templateRouteItem ? displayTemplateName(templateRouteItem.templateKey) : 'Template'}</h4>
                        <p>Visualização detalhada do template com vínculos e conteúdo.</p>
                      </div>
                      <div className="saas-template-route-view-actions">
                        {templateRouteItem ? (
                          <Link href={`/painel-de-controle/templates/${templateRouteItem.id}/editar`} className="secondary-btn">
                            Editar
                          </Link>
                        ) : null}
                        <Link href="/painel-de-controle/templates" className="primary-btn">
                          Voltar para templates
                        </Link>
                      </div>
                    </div>

                    {templateRouteItem ? (
                      <>
                        <div className="saas-template-detail-grid">
                          <div className="saas-template-detail-item">
                            <span>Nome interno</span>
                            <strong>{templateRouteItem.templateKey}</strong>
                          </div>
                          <div className="saas-template-detail-item">
                            <span>Produto</span>
                            <strong>{templateRouteItem.productName || '-'}</strong>
                          </div>
                          <div className="saas-template-detail-item">
                            <span>Site/Domínio</span>
                            <strong>{templateRouteItem.siteDomain || '-'}</strong>
                          </div>
                          <div className="saas-template-detail-item">
                            <span>Assunto</span>
                            <strong>{templateRouteItem.subject}</strong>
                          </div>
                          <div className="saas-template-detail-item">
                            <span>Versão</span>
                            <strong>v{templateRouteItem.version}</strong>
                          </div>
                          <div className="saas-template-detail-item">
                            <span>Status</span>
                            <strong>{templateRouteItem.isActive ? 'Ativo' : 'Inativo'}</strong>
                          </div>
                          <div className="saas-template-detail-item">
                            <span>Atualizado</span>
                            <strong>{shortDateTime(templateRouteItem.updatedAt)}</strong>
                          </div>
                        </div>

                        <section className="saas-template-section">
                          <div className="saas-template-section-head">
                            <h5>Conteúdo</h5>
                            <p>Preview do HTML sanitizado ou fallback em texto.</p>
                          </div>
                          <div
                            className="template-modal-preview-pane"
                            dangerouslySetInnerHTML={{
                              __html: templateRouteItem.html
                                ? String(templateRouteItem.html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                                : `<pre style="margin:0;white-space:pre-wrap;line-height:1.6;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${templateRouteItem.text || 'Nenhum conteúdo disponível.'}</pre>`,
                            }}
                          />
                        </section>
                      </>
                    ) : (
                      <div className="saas-empty-inline saas-empty-rich" role="status" aria-live="polite">
                        <strong>Template não encontrado</strong>
                        <span>O registro solicitado não foi localizado. Verifique o caminho e tente novamente.</span>
                      </div>
                    )}
                  </article>
                ) : null}
              </div>
            ) : null}

            {!saasLoading && !isTemplateRouteMode && saasTab === 'produtos' ? (
              <div className="saas-grid-two">
                <article className="saas-box">
                  <h4>Novo produto</h4>
                  <form className="stack-form" onSubmit={submitSaasProduct}>
                    <label>Nome do produto</label>
                    <input
                      className="saas-input"
                      value={saasProductForm.name}
                      onChange={(e) => setSaasProductForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Ex: Praja"
                      required
                    />
                    <label>Slug</label>
                    <input
                      className="saas-input"
                      value={saasProductForm.slug}
                      onChange={(e) => setSaasProductForm((p) => ({ ...p, slug: e.target.value }))}
                      placeholder="ex: praja"
                    />
                    <label className="saas-check-row">
                      <input
                        type="checkbox"
                        checked={saasProductForm.isActive}
                        onChange={(e) => setSaasProductForm((p) => ({ ...p, isActive: e.target.checked }))}
                      />
                      <span>Ativo</span>
                    </label>
                    <button type="submit" className="primary-btn saas-primary-btn" disabled={saasSaving}>
                      {saasSaving ? 'Salvando...' : 'Cadastrar produto'}
                    </button>
                  </form>
                </article>
                <article className="saas-box">
                  <h4>Produtos cadastrados</h4>
                  <div className="table-wrap">
                    <table className="saas-table">
                      <thead>
                        <tr>
                          <th>Nome</th>
                          <th>Slug</th>
                          <th>Status</th>
                          <th>Sites</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saasProducts.length === 0 ? (
                          <tr>
                            <td colSpan={4}>
                              <div className="saas-empty-inline">Nenhum produto cadastrado ainda.</div>
                            </td>
                          </tr>
                        ) : (
                          saasProducts.map((item) => (
                            <tr key={item.id}>
                              <td>{item.name}</td>
                              <td>{item.slug}</td>
                              <td>
                                <span className={`saas-status-chip ${item.status === 'active' ? 'is-active' : 'is-inactive'}`}>
                                  {item.status === 'active' ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td>{saasSitesByProductId[item.id] || 0}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            ) : null}

            {!saasLoading && !isTemplateRouteMode && saasTab === 'sites' ? (
              <div className="saas-ready-grid">
                <article className="saas-box">
                  <h4>Sites</h4>
                  <p className="saas-ready-text">Aba pronta para gestão de domínios e instâncias operacionais.</p>
                  <button type="button" className="secondary-btn" onClick={() => setNotice('Aba Sites pronta para próxima etapa do Painel de Controle.')}>
                    Configurar sites
                  </button>
                </article>
                <article className="saas-box">
                  <h4>Resumo atual</h4>
                  <p className="saas-ready-count">{saasSites.length} site(s) cadastrado(s)</p>
                </article>
              </div>
            ) : null}

            {!saasLoading && !isTemplateRouteMode && saasTab === 'emails' ? (
              <div className="saas-grid-two saas-email-layout">
                <article className="saas-box saas-email-form-card">
                  <h4>Novo e-mail transacional</h4>
                  <form className="stack-form" onSubmit={submitSaasEmailAccount}>
                    <div className="saas-form-grid-two">
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-email-product">Produto</label>
                        <select
                          id="cp-email-product"
                          className="saas-input"
                          value={saasEmailForm.productId}
                          onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, productId: e.target.value, siteId: '' }))}
                          required
                        >
                          <option value="">Selecione um produto</option>
                          {saasProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-email-site">Site/Domínio (opcional)</label>
                        <select
                          id="cp-email-site"
                          className="saas-input"
                          value={saasEmailForm.siteId}
                          onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, siteId: e.target.value }))}
                        >
                          <option value="">Sem site específico</option>
                          {saasSites
                            .filter((site) => !saasEmailForm.productId || site.productId === saasEmailForm.productId)
                            .map((site) => (
                              <option key={site.id} value={site.id}>
                                {site.domain}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div className="saas-field-group">
                      <label className="saas-field-label" htmlFor="cp-email-label">Nome interno</label>
                      <input
                        id="cp-email-label"
                        className="saas-input"
                        value={saasEmailForm.emailLabel}
                        onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, emailLabel: e.target.value }))}
                        placeholder="Ex: Praja Transacional"
                        required
                      />
                    </div>

                    <div className="saas-form-grid-two">
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-email-from-name">Nome do remetente</label>
                        <input
                          id="cp-email-from-name"
                          className="saas-input"
                          value={saasEmailForm.fromName}
                          onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, fromName: e.target.value }))}
                          placeholder="Ex: Praja"
                          required
                        />
                      </div>
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-email-from-email">E-mail remetente</label>
                        <input
                          id="cp-email-from-email"
                          className="saas-input"
                          type="email"
                          value={saasEmailForm.fromEmail}
                          onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, fromEmail: e.target.value }))}
                          placeholder="Ex: noreply@prajakoddahub.com"
                          required
                        />
                      </div>
                    </div>

                    <div className="saas-form-grid-two">
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-email-reply-to">Responder para</label>
                        <input
                          id="cp-email-reply-to"
                          className="saas-input"
                          type="email"
                          value={saasEmailForm.replyTo}
                          onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, replyTo: e.target.value }))}
                          placeholder="Opcional"
                        />
                      </div>
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-email-provider">Provider</label>
                        <select
                          id="cp-email-provider"
                          className="saas-input"
                          value={saasEmailForm.provider}
                          onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, provider: e.target.value }))}
                          required
                        >
                          <option value="resend">resend</option>
                          <option value="smtp">smtp</option>
                          <option value="ses">ses</option>
                          <option value="custom">custom</option>
                        </select>
                      </div>
                    </div>

                    <label className="saas-check-row">
                      <input
                        type="checkbox"
                        checked={saasEmailForm.isDefault}
                        onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                      />
                      <span>Padrão do produto</span>
                    </label>

                    <label className="saas-check-row">
                      <input
                        type="checkbox"
                        checked={saasEmailForm.isActive}
                        onChange={(e) => setSaasEmailForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                      />
                      <span>Ativo</span>
                    </label>

                    <button type="submit" className="primary-btn saas-primary-btn" disabled={saasSaving}>
                      {saasSaving ? 'Salvando...' : 'Cadastrar e-mail'}
                    </button>
                  </form>
                </article>

                <article className="saas-box saas-email-table-card">
                  <div className="saas-email-table-head">
                    <div>
                      <h4>E-mails cadastrados</h4>
                      <p>Configurações disponíveis para envio transacional por produto e site.</p>
                    </div>
                    <span className="saas-email-table-count">{saasEmailAccounts.length} registro(s)</span>
                  </div>

                  {saasEmailAccounts.length === 0 ? (
                    <div className="saas-empty-inline saas-empty-rich" role="status" aria-live="polite">
                      <strong>Nenhuma configuração cadastrada</strong>
                      <span>Preencha o formulário para adicionar o primeiro e-mail transacional.</span>
                    </div>
                  ) : (
                    <>
                      <div className="saas-email-table-desktop">
                        <div className="saas-table-wrap">
                          <table className="saas-table">
                            <thead>
                              <tr>
                                <th scope="col">Produto</th>
                                <th scope="col">Site</th>
                                <th scope="col">Nome interno</th>
                                <th scope="col">Remetente</th>
                                <th scope="col">Provider</th>
                                <th scope="col">Padrão</th>
                                <th scope="col">Status</th>
                                <th scope="col">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {saasEmailVisibleItems.map((item) => (
                                <tr key={item.id}>
                                  <td title={item.productName}>{item.productName}</td>
                                  <td title={item.siteDomain || '-'}>
                                    <span className="saas-cell-truncate">{item.siteDomain || '-'}</span>
                                  </td>
                                  <td title={item.emailLabel}>
                                    <span className="saas-cell-truncate">{item.emailLabel}</span>
                                  </td>
                                  <td>
                                    <div className="saas-email-sender-cell" title={`${item.fromName} <${item.fromEmail}>`}>
                                      <strong>{item.fromName}</strong>
                                      <span>{item.fromEmail}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="saas-provider-pill">{item.provider}</span>
                                  </td>
                                  <td>{item.isDefault ? 'Sim' : 'Não'}</td>
                                  <td>
                                    <span className={`saas-status-chip ${item.isActive ? 'is-active' : 'is-inactive'}`}>
                                      {item.isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                  </td>
                                  <td>
                                    <button type="button" className="saas-ghost-action" disabled aria-label="Ações em breve">
                                      -
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="saas-email-mobile-list">
                        {saasEmailVisibleItems.map((item) => (
                          <article key={item.id} className="saas-email-mobile-item">
                            <header>
                              <strong>{item.emailLabel}</strong>
                              <span className={`saas-status-chip ${item.isActive ? 'is-active' : 'is-inactive'}`}>
                                {item.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </header>
                            <p><b>Produto:</b> {item.productName}</p>
                            <p><b>Site:</b> {item.siteDomain || '-'}</p>
                            <p><b>Remetente:</b> {item.fromName} &lt;{item.fromEmail}&gt;</p>
                            <p><b>Provider:</b> {item.provider}</p>
                            <p><b>Padrão:</b> {item.isDefault ? 'Sim' : 'Não'}</p>
                          </article>
                        ))}
                      </div>

                      <footer className="saas-pagination">
                        <span>Mostrando {saasEmailRangeStart}-{saasEmailRangeEnd} de {saasEmailAccounts.length}</span>
                        <div className="saas-pagination-actions">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setSaasEmailPage((prev) => Math.max(1, prev - 1))}
                            disabled={saasEmailPage <= 1}
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setSaasEmailPage((prev) => Math.min(saasEmailTotalPages, prev + 1))}
                            disabled={saasEmailPage >= saasEmailTotalPages}
                          >
                            Próxima
                          </button>
                        </div>
                        <span>Página {saasEmailPage} de {saasEmailTotalPages}</span>
                      </footer>
                    </>
                  )}
                </article>
              </div>
            ) : null}

            {!saasLoading && !isTemplateRouteMode && saasTab === 'templates' ? (
              <div className="saas-grid-two saas-template-layout">
                <article className="saas-box saas-template-form-card">
                  <div className="saas-template-form-head">
                    <div>
                      <h4>{saasTemplateForm.id ? 'Editar template' : 'Cadastro de template'}</h4>
                      <p>Estruture metadados, assunto, conteúdo e variáveis do template em um único fluxo operacional.</p>
                    </div>
                    <span className={`saas-status-chip ${saasTemplateForm.isActive ? 'is-active' : 'is-inactive'}`}>
                      {saasTemplateForm.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  <form className="stack-form saas-template-form" onSubmit={submitSaasTemplate}>
                    <section className="saas-template-section">
                      <div className="saas-template-section-head">
                        <h5>Metadados</h5>
                        <p>Defina identificação, categoria e escopo do template.</p>
                      </div>
                      <div className="saas-template-grid-two">
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-template-name">Nome do template</label>
                          <input
                            id="cp-template-name"
                            className="saas-input"
                            value={saasTemplateForm.templateName}
                            onChange={(e) =>
                              setSaasTemplateForm((prev) => ({
                                ...prev,
                                templateName: e.target.value,
                                templateKey: prev.templateKey ? prev.templateKey : normalizeTemplateKey(e.target.value),
                              }))
                            }
                            placeholder="Ex: Boas-vindas Praja"
                            required
                          />
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-template-category">Tipo/Categoria</label>
                          <select
                            id="cp-template-category"
                            className="saas-input"
                            value={saasTemplateForm.templateCategory}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, templateCategory: e.target.value }))}
                          >
                            <option value="transacional">Transacional</option>
                            <option value="seguranca">Segurança</option>
                            <option value="comunicacao">Comunicação</option>
                            <option value="operacional">Operacional</option>
                          </select>
                        </div>
                      </div>

                      <div className="saas-template-grid-three">
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-template-product">Produto</label>
                          <select
                            id="cp-template-product"
                            className="saas-input"
                            value={saasTemplateForm.productId}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, productId: e.target.value, siteId: '' }))}
                            required
                          >
                            <option value="">Selecione um produto</option>
                            {saasProducts.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-template-site">Site/Domínio</label>
                          <select
                            id="cp-template-site"
                            className="saas-input"
                            value={saasTemplateForm.siteId}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, siteId: e.target.value }))}
                          >
                            <option value="">Sem site específico</option>
                            {saasSites
                              .filter((site) => !saasTemplateForm.productId || site.productId === saasTemplateForm.productId)
                              .map((site) => (
                                <option key={site.id} value={site.id}>
                                  {site.domain}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-template-version">Versão</label>
                          <input
                            id="cp-template-version"
                            className="saas-input"
                            type="number"
                            min={1}
                            value={saasTemplateForm.version}
                            onChange={(e) =>
                              setSaasTemplateForm((prev) => ({
                                ...prev,
                                version: Math.max(1, Number.parseInt(e.target.value || '1', 10) || 1),
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="saas-template-grid-two">
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-template-key">Nome interno</label>
                          <input
                            id="cp-template-key"
                            className="saas-input"
                            value={saasTemplateForm.templateKey}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, templateKey: normalizeTemplateKey(e.target.value) }))}
                            placeholder="Ex: reset_password"
                            required
                          />
                        </div>
                        <div className="saas-field-group">
                          <label className="saas-field-label" htmlFor="cp-template-subject">Assunto</label>
                          <input
                            id="cp-template-subject"
                            className="saas-input"
                            value={saasTemplateForm.subject}
                            onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, subject: e.target.value }))}
                            placeholder="Ex: Recuperação de acesso ao Praja"
                            required
                          />
                        </div>
                      </div>

                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-template-description">Descrição</label>
                        <textarea
                          id="cp-template-description"
                          className="saas-input saas-template-textarea"
                          value={saasTemplateForm.description}
                          onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
                          placeholder="Resumo funcional e contexto de uso do template."
                        />
                      </div>
                    </section>

                    <section className="saas-template-section">
                      <div className="saas-template-section-head">
                        <h5>Conteúdo</h5>
                        <p>Mantenha o HTML principal e o texto fallback sincronizados.</p>
                      </div>
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-template-html">Conteúdo HTML</label>
                        <textarea
                          id="cp-template-html"
                          className="saas-input saas-template-editor"
                          value={saasTemplateForm.html}
                          onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, html: e.target.value }))}
                          placeholder="<h1>Olá, {{name}}</h1>"
                        />
                      </div>
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-template-text">Conteúdo texto (fallback)</label>
                        <textarea
                          id="cp-template-text"
                          className="saas-input saas-template-textarea"
                          value={saasTemplateForm.text}
                          onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, text: e.target.value }))}
                          placeholder="Olá {{name}}, seja bem-vindo(a)!"
                        />
                      </div>
                    </section>

                    <section className="saas-template-section">
                      <div className="saas-template-section-head">
                        <h5>Variáveis e configurações</h5>
                        <p>Documente placeholders e instruções internas de uso.</p>
                      </div>
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-template-vars">Variáveis disponíveis</label>
                        <textarea
                          id="cp-template-vars"
                          className="saas-input saas-template-textarea"
                          value={saasTemplateForm.availableVariables}
                          onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, availableVariables: e.target.value }))}
                          placeholder="{{name}}, {{email}}, {{resetUrl}}"
                        />
                        <small className="saas-template-hint">Campo auxiliar para documentação visual do template.</small>
                      </div>
                      <div className="saas-field-group">
                        <label className="saas-field-label" htmlFor="cp-template-notes">Observações</label>
                        <textarea
                          id="cp-template-notes"
                          className="saas-input saas-template-textarea"
                          value={saasTemplateForm.notes}
                          onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, notes: e.target.value }))}
                          placeholder="Regras de uso, limitações ou orientações internas."
                        />
                      </div>
                      <label className="saas-check-row">
                        <input
                          type="checkbox"
                          checked={saasTemplateForm.isActive}
                          onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                        />
                        <span>Template ativo</span>
                      </label>
                    </section>

                    <footer className="saas-template-actions">
                      <button type="button" className="secondary-btn" onClick={resetSaasTemplateEditor}>
                        Limpar
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => setSaasTemplatePreviewOpen((prev) => !prev)}
                      >
                        {saasTemplatePreviewOpen ? 'Ocultar preview' : 'Visualizar preview'}
                      </button>
                      <button type="submit" className="primary-btn" disabled={saasSaving}>
                        {saasSaving ? 'Salvando...' : saasTemplateForm.id ? 'Salvar alterações' : 'Salvar template'}
                      </button>
                    </footer>
                  </form>

                  {saasTemplatePreviewOpen ? (
                    <div className="saas-template-preview" role="status" aria-live="polite">
                      <strong>{saasTemplateForm.subject || 'Sem assunto'}</strong>
                      <small>{saasTemplateForm.templateKey || 'sem-chave'}</small>
                      <pre>{saasTemplateForm.html || saasTemplateForm.text || 'Nenhum conteúdo informado.'}</pre>
                    </div>
                  ) : null}
                </article>

                <article className="saas-box saas-template-table-card">
                  <div className="saas-template-table-head">
                    <div>
                      <h4>Templates cadastrados</h4>
                      <p>Visualize, edite e selecione templates em lote mantendo histórico por versão.</p>
                    </div>
                    <div className="saas-template-table-head-meta">
                      <span className="saas-email-table-count">{saasTemplates.length} registro(s)</span>
                      <small>Seleção aplicada apenas na página atual</small>
                    </div>
                  </div>

                  {saasTemplateSelectedCount > 0 ? (
                    <div className="saas-bulk-toolbar" role="status" aria-live="polite">
                      <strong>{saasTemplateSelectedCount} template(s) selecionado(s)</strong>
                      <div className="saas-bulk-toolbar-actions">
                        <button type="button" className="secondary-btn" onClick={() => setSelectedTemplateIds([])}>
                          Desmarcar todos
                        </button>
                        <button type="button" className="danger-btn" onClick={() => setShowTemplateBulkRemoveModal(true)}>
                          Remover selecionados
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {saasTemplates.length === 0 ? (
                    <div className="saas-empty-inline saas-empty-rich" role="status" aria-live="polite">
                      <strong>Nenhum template cadastrado</strong>
                      <span>Preencha o formulário para criar o primeiro template transacional.</span>
                    </div>
                  ) : (
                    <>
                      <div className="saas-template-table-desktop">
                        <div className="saas-table-wrap">
                          <table className="saas-table">
                            <thead>
                              <tr>
                                <th scope="col" className="saas-checkbox-cell">
                                  <input
                                    ref={templatesSelectAllRef}
                                    type="checkbox"
                                    className="saas-template-check"
                                    checked={allVisibleTemplatesSelected}
                                    onChange={toggleSelectAllVisibleTemplates}
                                    aria-label="Selecionar todos os templates visíveis"
                                  />
                                </th>
                                <th scope="col">Template</th>
                                <th scope="col">Produto</th>
                                <th scope="col">Site</th>
                                <th scope="col">Assunto</th>
                                <th scope="col">Versão</th>
                                <th scope="col">Status</th>
                                <th scope="col">Atualizado</th>
                                <th scope="col">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {saasTemplateVisibleItems.map((item) => (
                                <tr key={item.id} className={selectedTemplateIds.includes(item.id) ? 'saas-row-selected' : undefined}>
                                  <td className="saas-checkbox-cell" onClick={(event) => event.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="saas-template-check"
                                      checked={selectedTemplateIds.includes(item.id)}
                                      onChange={() => toggleTemplateSelection(item.id)}
                                      aria-label={`Selecionar template ${displayTemplateName(item.templateKey)}`}
                                    />
                                  </td>
                                  <td>
                                    <div className="saas-template-name-cell">
                                      <strong>{displayTemplateName(item.templateKey)}</strong>
                                      <span className="saas-template-key">{item.templateKey}</span>
                                    </div>
                                  </td>
                                  <td title={item.productName || '-'}>
                                    <span className="saas-cell-truncate">{item.productName || '-'}</span>
                                  </td>
                                  <td title={item.siteDomain || '-'}>
                                    <span className="saas-cell-truncate">{item.siteDomain || '-'}</span>
                                  </td>
                                  <td title={item.subject}>
                                    <span className="saas-cell-truncate">{item.subject}</span>
                                  </td>
                                  <td>v{item.version}</td>
                                  <td>
                                    <span className={`saas-status-chip ${item.isActive ? 'is-active' : 'is-inactive'}`}>
                                      {item.isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                  </td>
                                  <td>{shortDateTime(item.updatedAt)}</td>
                                  <td>
                                    <div className="saas-template-row-actions">
                                      <button
                                        type="button"
                                        className="secondary-btn saas-inline-action"
                                        onClick={() => openTemplateModal(item, 'view')}
                                      >
                                        Visualizar
                                      </button>
                                      <button
                                        type="button"
                                        className="secondary-btn saas-inline-action is-muted"
                                        onClick={() => startSaasTemplateEdit(item)}
                                      >
                                        Editar
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="saas-template-mobile-list">
                        {saasTemplateVisibleItems.map((item) => (
                          <article key={item.id} className={`saas-template-mobile-item ${selectedTemplateIds.includes(item.id) ? 'is-selected' : ''}`}>
                            <header>
                              <label className="saas-mobile-check">
                                <input
                                  type="checkbox"
                                  className="saas-template-check"
                                  checked={selectedTemplateIds.includes(item.id)}
                                  onChange={() => toggleTemplateSelection(item.id)}
                                  aria-label={`Selecionar template ${displayTemplateName(item.templateKey)}`}
                                />
                                <strong>{displayTemplateName(item.templateKey)}</strong>
                              </label>
                              <div className="saas-mobile-header-actions">
                                <span className={`saas-status-chip ${item.isActive ? 'is-active' : 'is-inactive'}`}>
                                  {item.isActive ? 'Ativo' : 'Inativo'}
                                </span>
                              </div>
                            </header>
                            <p><b>Nome interno:</b> <code>{item.templateKey}</code></p>
                            <p><b>Produto:</b> {item.productName || '-'}</p>
                            <p><b>Site:</b> {item.siteDomain || '-'}</p>
                            <p><b>Assunto:</b> {item.subject}</p>
                            <p><b>Versão:</b> v{item.version}</p>
                            <div className="saas-template-mobile-actions">
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => openTemplateModal(item, 'view')}
                              >
                                Visualizar
                              </button>
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => startSaasTemplateEdit(item)}
                              >
                                Editar no formulário
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>

                      <footer className="saas-pagination">
                        <span>Mostrando {saasTemplateRangeStart}-{saasTemplateRangeEnd} de {saasTemplates.length}</span>
                        <div className="saas-pagination-actions">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setSaasTemplatePage((prev) => Math.max(1, prev - 1))}
                            disabled={saasTemplatePage <= 1}
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setSaasTemplatePage((prev) => Math.min(saasTemplateTotalPages, prev + 1))}
                            disabled={saasTemplatePage >= saasTemplateTotalPages}
                          >
                            Próxima
                          </button>
                        </div>
                        <span>Página {saasTemplatePage} de {saasTemplateTotalPages}</span>
                      </footer>
                    </>
                  )}
                </article>
              </div>
            ) : null}

            {!saasLoading && !isTemplateRouteMode && saasTab === 'eventos' ? (
              <div className="saas-ready-grid">
                <article className="saas-box">
                  <h4>Eventos</h4>
                  <p className="saas-ready-text">Aba pronta para vincular eventos automáticos aos templates cadastrados.</p>
                  <button type="button" className="secondary-btn" onClick={() => setNotice('Aba Eventos pronta para próxima etapa do Painel de Controle.')}>
                    Configurar eventos
                  </button>
                </article>
                <article className="saas-box">
                  <h4>Resumo atual</h4>
                  <p className="saas-ready-count">{saasEvents.length} evento(s) cadastrado(s)</p>
                </article>
              </div>
            ) : null}
          </section>
        ) : null}

        {section === 'social_accounts' ? (
          <section className="crm-v2-panel">
            <div className="table-header-actions">
              <div>
                <h3>Contas Instagram conectadas</h3>
                <p>Conexão OAuth administrativa para contas profissionais do Instagram.</p>
              </div>
              <div className="social-header-actions">
                <button type="button" className="secondary-btn" onClick={() => void loadSocialAccounts()}>
                  Atualizar
                </button>
                <a className="primary-btn social-link-btn" href={socialConnectUrl}>
                  <i className="bi bi-instagram" aria-hidden="true" /> Conectar Instagram
                </a>
              </div>
            </div>

            {!socialMetaConfigured ? (
              <p className="social-warning-text">
                Configure `META_APP_ID`, `META_APP_SECRET` e `META_REDIRECT_URI` para habilitar a conexão OAuth.
              </p>
            ) : null}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Usuário Instagram</th>
                    <th>Página</th>
                    <th>Instagram ID</th>
                    <th>Token expira</th>
                    <th>Status</th>
                    <th>Escopos</th>
                    <th>Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {socialAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={7}>Nenhuma conta conectada até o momento.</td>
                    </tr>
                  ) : (
                    socialAccounts.map((account) => (
                      <tr key={account.id}>
                        <td>@{account.instagramUsername}</td>
                        <td>{account.pageName || account.pageId}</td>
                        <td>{account.instagramId}</td>
                        <td>{dateTime(account.tokenExpiresAt)}</td>
                        <td><span className={`status-chip ${account.status === 'ACTIVE' ? 'ativo' : 'inativo'}`}>{account.status}</span></td>
                        <td className="social-text-cell">{account.scopes || '-'}</td>
                        <td>{dateTime(account.updatedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {section === 'social_posts' ? (
          <div className="social-grid-two">
            <section className="crm-v2-panel">
              <h3>Publicar imagem única (MVP)</h3>
              <form className="stack-form" onSubmit={submitSocialPost}>
                <label>Conta Instagram</label>
                <select
                  value={socialPostForm.accountId}
                  onChange={(e) => setSocialPostForm((prev) => ({ ...prev, accountId: e.target.value }))}
                  required
                  disabled={socialAccounts.length === 0}
                >
                  {socialAccounts.length === 0 ? (
                    <option value="">Sem conta conectada</option>
                  ) : (
                    socialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        @{account.instagramUsername} ({account.pageName || account.pageId})
                      </option>
                    ))
                  )}
                </select>

                <label>URL da imagem (`media_url`)</label>
                <input
                  type="url"
                  value={socialPostForm.mediaUrl}
                  onChange={(e) => setSocialPostForm((prev) => ({ ...prev, mediaUrl: e.target.value }))}
                  placeholder="https://..."
                  required
                />

                <label>Legenda (`caption`)</label>
                <textarea
                  value={socialPostForm.caption}
                  onChange={(e) => setSocialPostForm((prev) => ({ ...prev, caption: e.target.value }))}
                  placeholder="Texto do post..."
                />

                <button type="submit" className="primary-btn" disabled={socialPublishing || socialAccounts.length === 0}>
                  {socialPublishing ? 'Publicando...' : 'Publicar no Instagram'}
                </button>
              </form>
            </section>

            <section className="crm-v2-panel">
              <div className="table-header-actions">
                <div>
                  <h3>Posts recentes</h3>
                  <p>Histórico de publicações enviadas pelo CRM.</p>
                </div>
                <button type="button" className="secondary-btn" onClick={() => void loadSocialPosts()}>
                  Atualizar
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Conta</th>
                      <th>Imagem</th>
                      <th>Legenda</th>
                      <th>Status</th>
                      <th>IG Media ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {socialPosts.length === 0 ? (
                      <tr>
                        <td colSpan={6}>Nenhum post registrado.</td>
                      </tr>
                    ) : (
                      socialPosts.map((post) => (
                        <tr key={post.id}>
                          <td>{dateTime(post.createdAt)}</td>
                          <td>{post.account?.instagramUsername ? `@${post.account.instagramUsername}` : '-'}</td>
                          <td className="social-url-cell">
                            <a href={post.mediaUrl} target="_blank" rel="noreferrer">
                              {post.mediaUrl}
                            </a>
                          </td>
                          <td className="social-text-cell">{post.caption || '-'}</td>
                          <td>
                            <span className={`status-chip ${socialPostStatusClass(post.status)}`}>{post.status}</span>
                          </td>
                          <td>{post.igMediaId || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {section === 'social_logs' ? (
          <section className="crm-v2-panel">
            <div className="table-header-actions">
              <div>
                <h3>Logs da integração Instagram</h3>
                <p>Auditoria de request/response/status das chamadas para a Meta Graph API.</p>
              </div>
              <button type="button" className="secondary-btn" onClick={() => void loadSocialLogs()}>
                Atualizar
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Ação</th>
                    <th>Conta</th>
                    <th>Status</th>
                    <th>HTTP</th>
                    <th>Endpoint</th>
                    <th>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {socialLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7}>Nenhum log encontrado.</td>
                    </tr>
                  ) : (
                    socialLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{dateTime(log.createdAt)}</td>
                        <td>{log.action}</td>
                        <td>{log.account?.instagramUsername ? `@${log.account.instagramUsername}` : '-'}</td>
                        <td>
                          <span className={`status-chip ${log.success ? 'ativo' : 'atrasado'}`}>
                            {log.success ? 'OK' : 'ERRO'}
                          </span>
                        </td>
                        <td>{log.statusCode ?? '-'}</td>
                        <td className="social-url-cell">{log.endpoint || '-'}</td>
                        <td className="social-text-cell">{log.errorMessage || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {section === 'financeiro' ? (
          <div className="crm-v2-finance-grid">
            <section className="crm-v2-panel">
              <h3>KPIs Financeiros</h3>
              <div className="metric-grid">
                <div><span>MRR</span><strong>{currency(financeOverview?.mrr ?? 0)}</strong></div>
                <div><span>Recebido mês</span><strong>{currency(financeOverview?.recebidosMes ?? 0)}</strong></div>
                <div><span>Inadimplência aberta</span><strong>{currency(financeOverview?.inadimplenciaAberta ?? 0)}</strong></div>
                <div><span>Receita avulsa mês</span><strong>{currency(financeOverview?.avulsoMes ?? 0)}</strong></div>
                <div><span>Projeção 30d</span><strong>{currency(financeOverview?.projecao.d30 ?? 0)}</strong></div>
                <div><span>Projeção 60d</span><strong>{currency(financeOverview?.projecao.d60 ?? 0)}</strong></div>
                <div><span>Projeção 90d</span><strong>{currency(financeOverview?.projecao.d90 ?? 0)}</strong></div>
                <div><span>DRE Resultado</span><strong>{currency(financeOverview?.dre.resultado ?? 0)}</strong></div>
              </div>
            </section>

            <section className="crm-v2-panel">
              <h3>Novo lançamento manual</h3>
              <form className="stack-form" onSubmit={submitFinancialEntry}>
                <label>Tipo</label>
                <select value={financialForm.entryType} onChange={(e) => setFinancialForm((p) => ({ ...p, entryType: e.target.value }))}>
                  <option value="RECEITA">Receita</option>
                  <option value="DESPESA">Despesa</option>
                  <option value="AJUSTE">Ajuste</option>
                </select>
                <label>Categoria</label>
                <input value={financialForm.category} onChange={(e) => setFinancialForm((p) => ({ ...p, category: e.target.value }))} />
                <label>Valor (R$)</label>
                <input value={financialForm.amount} onChange={(e) => setFinancialForm((p) => ({ ...p, amount: e.target.value }))} type="number" step="0.01" min="0" required />
                <label>Data</label>
                <input value={financialForm.entryDate} onChange={(e) => setFinancialForm((p) => ({ ...p, entryDate: e.target.value }))} type="date" required />
                <label>Deal ID (opcional)</label>
                <input value={financialForm.dealId} onChange={(e) => setFinancialForm((p) => ({ ...p, dealId: e.target.value }))} />
                <label>Organization ID (opcional)</label>
                <input value={financialForm.organizationId} onChange={(e) => setFinancialForm((p) => ({ ...p, organizationId: e.target.value }))} />
                <label>Descrição</label>
                <textarea value={financialForm.description} onChange={(e) => setFinancialForm((p) => ({ ...p, description: e.target.value }))} />
                <button type="submit" className="primary-btn">Salvar lançamento</button>
              </form>
            </section>

            <section className="crm-v2-panel">
              <h3>Ação de cobrança</h3>
              <form className="stack-form" onSubmit={submitCollectionAction}>
                <label>Tipo de ação</label>
                <input value={collectionForm.actionType} onChange={(e) => setCollectionForm((p) => ({ ...p, actionType: e.target.value }))} />
                <label>Canal</label>
                <select value={collectionForm.channel} onChange={(e) => setCollectionForm((p) => ({ ...p, channel: e.target.value }))}>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="LIGACAO">Ligação</option>
                </select>
                <label>Resultado</label>
                <input value={collectionForm.outcome} onChange={(e) => setCollectionForm((p) => ({ ...p, outcome: e.target.value }))} />
                <label>Próxima ação</label>
                <input type="datetime-local" value={collectionForm.nextActionAt} onChange={(e) => setCollectionForm((p) => ({ ...p, nextActionAt: e.target.value }))} />
                <label>Deal ID (opcional)</label>
                <input value={collectionForm.dealId} onChange={(e) => setCollectionForm((p) => ({ ...p, dealId: e.target.value }))} />
                <label>Organization ID (opcional)</label>
                <input value={collectionForm.organizationId} onChange={(e) => setCollectionForm((p) => ({ ...p, organizationId: e.target.value }))} />
                <label>Notas</label>
                <textarea value={collectionForm.notes} onChange={(e) => setCollectionForm((p) => ({ ...p, notes: e.target.value }))} />
                <button type="submit" className="primary-btn">Registrar cobrança</button>
              </form>
            </section>

            <section className="crm-v2-panel">
              <h3>Recebimentos</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Plano</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Vencimento</th>
                      <th>Pago em</th>
                      <th>Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recebimentos.map((item) => (
                      <tr key={item.id}>
                        <td>{item.organization}</td>
                        <td>{item.plan}</td>
                        <td>{currency(item.amountCents)}</td>
                        <td>{item.status}</td>
                        <td>{dateOnly(item.dueDate)}</td>
                        <td>{dateOnly(item.paidAt)}</td>
                        <td>{item.billingType || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="crm-v2-panel">
              <h3>Inadimplência</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>E-mail</th>
                      <th>Valor</th>
                      <th>Vencimento</th>
                      <th>Dias atraso</th>
                      <th>Faixa</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inadimplencia.map((item) => (
                      <tr key={item.id}>
                        <td>{item.organization}</td>
                        <td>{item.email || '-'}</td>
                        <td>{currency(item.amountCents)}</td>
                        <td>{dateOnly(item.dueDate)}</td>
                        <td>{item.daysLate}</td>
                        <td>{item.bucket}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {section === 'tickets' ? (
          <section className="crm-v2-panel">
            <h3>Fila de tickets</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Status</th>
                    <th>SLA</th>
                    <th>Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>{ticket.queueName}</td>
                      <td>{ticket.status}</td>
                      <td>{dateTime(ticket.slaDeadline)}</td>
                      <td>{dateTime(ticket.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {section === 'config' ? (
          <section className="crm-v2-panel">
            <h3>Configurações CRM</h3>
            <ul className="config-list">
              <li>Menu simplificado sem operação/propostas globais.</li>
              <li>Operação agora é por cliente dentro do deal fechado.</li>
              <li>Regra de abandono: 2 horas sem pagamento confirmado.</li>
              <li>Clientes fechados centralizados na aba Clientes.</li>
            </ul>
          </section>
        ) : null}
      </main>

      <nav className="crm-v2-mobile-nav" aria-label="Navegação mobile CRM">
        {MENU_ITEMS.map((item) => (
          <Link key={`m-${item.key}`} href={item.href} className={activeMenu === item.key ? 'active' : ''}>
            <i className={`bi ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {showTemplateModal && templateModalSource ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Visualização de template">
          <div className="crm-v2-modal-backdrop" onClick={closeTemplateModal} />
          <div className="crm-v2-modal-content template-modal-content">
            <header>
              <div className="template-modal-head">
                <h3>{displayTemplateName(saasTemplateForm.templateKey)}</h3>
                <p>
                  {saasTemplateForm.templateKey || 'sem-chave'} · atualizado em {shortDateTime(templateModalSource.updatedAt)}
                </p>
              </div>
              <button type="button" onClick={closeTemplateModal}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>

            <div className="template-modal-toolbar">
              <div className="template-modal-tabs" role="tablist" aria-label="Visualização do template">
                <button
                  type="button"
                  role="tab"
                  aria-selected={templateModalTab === 'details'}
                  className={templateModalTab === 'details' ? 'is-active' : ''}
                  onClick={() => setTemplateModalTab('details')}
                >
                  Detalhes
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={templateModalTab === 'html'}
                  className={templateModalTab === 'html' ? 'is-active' : ''}
                  onClick={() => setTemplateModalTab('html')}
                >
                  HTML
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={templateModalTab === 'preview'}
                  className={templateModalTab === 'preview' ? 'is-active' : ''}
                  onClick={() => setTemplateModalTab('preview')}
                >
                  Preview
                </button>
              </div>
              <span className={`saas-status-chip ${saasTemplateForm.isActive ? 'is-active' : 'is-inactive'}`}>
                {saasTemplateForm.isActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            {templateModalTab === 'details' ? (
              <div className="template-modal-panel">
                <div className="template-modal-grid">
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-name">Nome do template</label>
                    <input
                      id="template-modal-name"
                      className="saas-input"
                      value={saasTemplateForm.templateName}
                      onChange={(e) =>
                        setSaasTemplateForm((prev) => ({
                          ...prev,
                          templateName: e.target.value,
                          templateKey: prev.templateKey ? prev.templateKey : normalizeTemplateKey(e.target.value),
                        }))
                      }
                      disabled={templateModalMode !== 'edit'}
                    />
                  </div>
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-key">Nome interno</label>
                    <input
                      id="template-modal-key"
                      className="saas-input"
                      value={saasTemplateForm.templateKey}
                      onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, templateKey: normalizeTemplateKey(e.target.value) }))}
                      disabled={templateModalMode !== 'edit'}
                    />
                  </div>
                </div>

                <div className="template-modal-grid template-modal-grid-three">
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-product">Produto</label>
                    <select
                      id="template-modal-product"
                      className="saas-input"
                      value={saasTemplateForm.productId}
                      onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, productId: e.target.value, siteId: '' }))}
                      disabled={templateModalMode !== 'edit'}
                    >
                      <option value="">Selecione um produto</option>
                      {saasProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-site">Site/Domínio</label>
                    <select
                      id="template-modal-site"
                      className="saas-input"
                      value={saasTemplateForm.siteId}
                      onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, siteId: e.target.value }))}
                      disabled={templateModalMode !== 'edit'}
                    >
                      <option value="">Sem site específico</option>
                      {saasSites
                        .filter((site) => !saasTemplateForm.productId || site.productId === saasTemplateForm.productId)
                        .map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.domain}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-category">Categoria</label>
                    <select
                      id="template-modal-category"
                      className="saas-input"
                      value={saasTemplateForm.templateCategory}
                      onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, templateCategory: e.target.value }))}
                      disabled={templateModalMode !== 'edit'}
                    >
                      <option value="transacional">Transacional</option>
                      <option value="seguranca">Segurança</option>
                      <option value="comunicacao">Comunicação</option>
                      <option value="operacional">Operacional</option>
                    </select>
                  </div>
                </div>

                <div className="template-modal-grid">
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-subject">Assunto</label>
                    <input
                      id="template-modal-subject"
                      className="saas-input"
                      value={saasTemplateForm.subject}
                      onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, subject: e.target.value }))}
                      disabled={templateModalMode !== 'edit'}
                    />
                  </div>
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-version">Versão</label>
                    <input
                      id="template-modal-version"
                      className="saas-input"
                      type="number"
                      min={1}
                      value={saasTemplateForm.version}
                      onChange={(e) =>
                        setSaasTemplateForm((prev) => ({
                          ...prev,
                          version: Math.max(1, Number.parseInt(e.target.value || '1', 10) || 1),
                        }))
                      }
                      disabled={templateModalMode !== 'edit'}
                    />
                  </div>
                </div>

                <div className="saas-field-group">
                  <label className="saas-field-label" htmlFor="template-modal-description">Descrição</label>
                  <textarea
                    id="template-modal-description"
                    className="saas-input saas-template-textarea"
                    value={saasTemplateForm.description}
                    onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
                    disabled={templateModalMode !== 'edit'}
                  />
                </div>

                <div className="template-modal-grid">
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-vars">Variáveis</label>
                    <textarea
                      id="template-modal-vars"
                      className="saas-input saas-template-textarea"
                      value={saasTemplateForm.availableVariables}
                      onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, availableVariables: e.target.value }))}
                      disabled={templateModalMode !== 'edit'}
                    />
                  </div>
                  <div className="saas-field-group">
                    <label className="saas-field-label" htmlFor="template-modal-notes">Observações</label>
                    <textarea
                      id="template-modal-notes"
                      className="saas-input saas-template-textarea"
                      value={saasTemplateForm.notes}
                      onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, notes: e.target.value }))}
                      disabled={templateModalMode !== 'edit'}
                    />
                  </div>
                </div>

                <label className="saas-check-row template-modal-check">
                  <input
                    type="checkbox"
                    checked={saasTemplateForm.isActive}
                    onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                    disabled={templateModalMode !== 'edit'}
                  />
                  <span>Template ativo</span>
                </label>
              </div>
            ) : null}

            {templateModalTab === 'html' ? (
              <div className="template-modal-panel">
                <div className="saas-field-group">
                  <label className="saas-field-label" htmlFor="template-modal-html">Conteúdo HTML</label>
                  <textarea
                    id="template-modal-html"
                    className="saas-input saas-template-editor template-modal-editor"
                    value={saasTemplateForm.html}
                    onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, html: e.target.value }))}
                    disabled={templateModalMode !== 'edit'}
                  />
                </div>
                <div className="saas-field-group">
                  <label className="saas-field-label" htmlFor="template-modal-text">Texto fallback</label>
                  <textarea
                    id="template-modal-text"
                    className="saas-input saas-template-textarea"
                    value={saasTemplateForm.text}
                    onChange={(e) => setSaasTemplateForm((prev) => ({ ...prev, text: e.target.value }))}
                    disabled={templateModalMode !== 'edit'}
                  />
                </div>
              </div>
            ) : null}

            {templateModalTab === 'preview' ? (
              <div className="template-modal-panel">
                <div className="template-modal-preview-frame" dangerouslySetInnerHTML={{ __html: templateModalPreviewMarkup }} />
              </div>
            ) : null}

            <footer className="template-modal-actions">
              <button type="button" className="secondary-btn" onClick={closeTemplateModal}>
                Fechar
              </button>
              {templateModalMode === 'view' ? (
                <>
                  <button type="button" className="secondary-btn" onClick={() => startSaasTemplateEdit(templateModalSource)}>
                    Editar no formulário
                  </button>
                  <button type="button" className="primary-btn" onClick={() => setTemplateModalMode('edit')}>
                    Editar neste modal
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="secondary-btn" onClick={cancelTemplateModalEdit}>
                    Cancelar alterações
                  </button>
                  <button type="button" className="primary-btn" onClick={() => void saveTemplateFromModal()} disabled={saasSaving}>
                    {saasSaving ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      ) : null}

      {showTemplateBulkRemoveModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Confirmar remoção em lote de templates">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowTemplateBulkRemoveModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Remover templates selecionados</h3>
              <button type="button" onClick={() => setShowTemplateBulkRemoveModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p style={{ marginTop: 4, color: '#334155' }}>
              Você está prestes a remover <strong>{saasTemplateSelectedCount}</strong> template(s) desta página.
            </p>
            <p style={{ marginTop: 0, color: '#64748b', fontSize: '0.92rem' }}>
              Esta ação aplica remoção lógica (desativação) para manter histórico e pode ser revertida via edição.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowTemplateBulkRemoveModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => void removeSelectedTemplatesInBulk()}
                disabled={saasTemplateBulkRemoving}
              >
                {saasTemplateBulkRemoving ? 'Removendo...' : 'Confirmar remoção'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLeadModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Novo lead manual">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowLeadModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Novo lead manual</h3>
              <button type="button" onClick={() => setShowLeadModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>

            <form className="stack-form" onSubmit={createManualLead}>
              <label>Nome</label>
              <input required value={leadForm.name} onChange={(e) => setLeadForm((p) => ({ ...p, name: e.target.value }))} />
              <label>E-mail</label>
              <input type="email" value={leadForm.email} onChange={(e) => setLeadForm((p) => ({ ...p, email: e.target.value }))} />
              <label>Telefone</label>
              <input value={leadForm.phone} onChange={(e) => setLeadForm((p) => ({ ...p, phone: e.target.value }))} />

              {pipelineType === 'hospedagem' ? (
                <>
                  <label>Plano</label>
                  <select value={leadForm.planCode} onChange={(e) => setLeadForm((p) => ({ ...p, planCode: e.target.value }))}>
                    <option value="basic">Básico</option>
                    <option value="profissional">Profissional</option>
                    <option value="pro">Pro</option>
                  </select>
                </>
              ) : null}

              {pipelineType === 'avulsos' ? (
                <>
                  <label>Produto</label>
                  <select value={leadForm.productCode} onChange={(e) => setLeadForm((p) => ({ ...p, productCode: e.target.value }))}>
                    <option value="site_institucional">Site Institucional</option>
                    <option value="ecommerce">E-commerce</option>
                    <option value="site_industrial">Site Industrial</option>
                    <option value="site_servicos">Site de Serviços</option>
                    <option value="sistemas_empresariais">Sistemas Empresariais</option>
                    <option value="customizacao_sistemas">Customização de Sistemas</option>
                    <option value="landing_page">Landing Page</option>
                    <option value="blog_portal">Blog/Portal</option>
                    <option value="redesign">Redesign</option>
                  </select>
                </>
              ) : null}

              <label>Intent (opcional)</label>
              <input value={leadForm.intent} onChange={(e) => setLeadForm((p) => ({ ...p, intent: e.target.value }))} />
              <label>Valor estimado (R$)</label>
              <input type="number" step="0.01" min="0" value={leadForm.value} onChange={(e) => setLeadForm((p) => ({ ...p, value: e.target.value }))} />

              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar lead'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Editar registro">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowEditModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Editar lead/cliente</h3>
              <button type="button" onClick={() => setShowEditModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <form className="stack-form" onSubmit={submitEditDeal}>
              <label>Título</label>
              <input required value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
              <label>Nome do contato</label>
              <input value={editForm.contactName} onChange={(e) => setEditForm((p) => ({ ...p, contactName: e.target.value }))} />
              <label>E-mail</label>
              <input type="email" value={editForm.contactEmail} onChange={(e) => setEditForm((p) => ({ ...p, contactEmail: e.target.value }))} />
              <label>Telefone</label>
              <input value={editForm.contactPhone} onChange={(e) => setEditForm((p) => ({ ...p, contactPhone: e.target.value }))} />
              <label>Interesse</label>
              <input value={editForm.intent} onChange={(e) => setEditForm((p) => ({ ...p, intent: e.target.value }))} />
              <label>Valor (R$)</label>
              <input type="number" min="0" step="0.01" value={editForm.value} onChange={(e) => setEditForm((p) => ({ ...p, value: e.target.value }))} />
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {createClientModalOpen ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Cadastro rápido de cliente">
          <div className="crm-v2-modal-backdrop" onClick={() => setCreateClientModalOpen(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Cadastro rápido de cliente</h3>
              <button type="button" onClick={() => setCreateClientModalOpen(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <form className="stack-form" onSubmit={createQuickClient}>
              <label>Nome</label>
              <input
                required
                value={quickClientForm.name}
                onChange={(e) => setQuickClientForm((p) => ({ ...p, name: e.target.value }))}
              />
              <label>E-mail</label>
              <input
                type="email"
                value={quickClientForm.email}
                onChange={(e) => setQuickClientForm((p) => ({ ...p, email: e.target.value }))}
              />
              <label>Telefone</label>
              <input
                value={quickClientForm.phone}
                onChange={(e) => setQuickClientForm((p) => ({ ...p, phone: e.target.value }))}
              />
              <label>Plano</label>
              <select
                value={quickClientForm.planCode}
                onChange={(e) => setQuickClientForm((p) => ({ ...p, planCode: e.target.value }))}
              >
                <option value="basic">Básico</option>
                <option value="profissional">Profissional</option>
                <option value="pro">Pro</option>
              </select>
              <label>Valor (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={quickClientForm.value}
                onChange={(e) => setQuickClientForm((p) => ({ ...p, value: e.target.value }))}
              />
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar cliente'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showBulkDeleteModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Remoção em massa de clientes">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowBulkDeleteModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Remover clientes selecionados</h3>
              <button type="button" onClick={() => setShowBulkDeleteModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p>
              Você está prestes a remover <strong>{selectedClients.length}</strong> cliente(s) de teste.
            </p>
            <p style={{ marginTop: 0, color: '#64748b', fontSize: '0.92rem' }}>
              Esta ação remove os registros do CRM atual e não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowBulkDeleteModal(false)}>
                Cancelar
              </button>
              <button type="button" className="danger-btn" onClick={confirmBulkDeleteClients} disabled={bulkDeleteLoading}>
                {bulkDeleteLoading ? 'Removendo...' : 'Remover selecionados'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ghostTarget ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Mover para lista fantasma">
          <div className="crm-v2-modal-backdrop" onClick={() => setGhostTarget(null)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Mover para Lista Fantasma</h3>
              <button type="button" onClick={() => setGhostTarget(null)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p>Deseja mover <strong>{ghostTarget.label}</strong> para a lista fantasma?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setGhostTarget(null)}>Cancelar</button>
              <button type="button" className="danger-btn" onClick={moveToGhost} disabled={loading}>
                {loading ? 'Movendo...' : 'Mover'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreTarget ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Restaurar cliente">
          <div className="crm-v2-modal-backdrop" onClick={() => setRestoreTarget(null)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Restaurar Cliente</h3>
              <button type="button" onClick={() => setRestoreTarget(null)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p>Deseja restaurar <strong>{restoreTarget.label}</strong> para a lista principal?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setRestoreTarget(null)}>Cancelar</button>
              <button type="button" className="primary-btn" onClick={restoreFromGhost} disabled={loading}>
                {loading ? 'Restaurando...' : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPurgeModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Exclusão permanente">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowPurgeModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Exclusão Permanente</h3>
              <button type="button" onClick={() => setShowPurgeModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p>
              Isso removerá permanentemente todos os dados de <strong>{purgeTarget?.label || 'este cliente'}</strong>.
            </p>
            <p style={{ color: '#b91c1c', marginTop: 0 }}>
              Digite <strong>EXCLUIR PERMANENTEMENTE</strong> para confirmar.
            </p>
            <input
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="EXCLUIR PERMANENTEMENTE"
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowPurgeModal(false)}>Cancelar</button>
              <button type="button" className="danger-btn" onClick={purgeGhostClient} disabled={loading}>
                {loading ? 'Excluindo...' : 'Excluir permanentemente'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Confirmar exclusão">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowDeleteModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Confirmar exclusão</h3>
              <button type="button" onClick={() => setShowDeleteModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p style={{ marginTop: 4, color: '#334155' }}>
              Deseja excluir <strong>{deleteTarget?.label || 'este registro'}</strong>?
            </p>
            <p style={{ marginTop: 0, color: '#64748b', fontSize: '0.92rem' }}>
              Esta ação remove apenas o registro do CRM atual.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowDeleteModal(false)}>
                Cancelar
              </button>
              <button type="button" className="danger-btn" onClick={confirmDeleteDeal} disabled={loading}>
                {loading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
