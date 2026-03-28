'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DealDetail } from '@/app/ui/shell/deal-detail';

type SectionKey =
  | 'dashboard'
  | 'pipeline_hospedagem'
  | 'pipeline_avulsos'
  | 'clientes'
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

type ClientesApiResponse = {
  status: 'ATIVO' | 'ATRASADO' | 'INATIVO' | 'FANTASMA';
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

type CrmPageProps = {
  section: SectionKey;
  dealId?: string;
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
  id: 'prospeccao' | 'financeiro' | 'operacao';
  title: string;
  subtitle: string;
  icon: string;
  metrics: DashboardMetric[];
};

const MENU_ITEMS: MenuItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', href: '/dashboard' },
  { key: 'pipeline_hospedagem', label: 'Pipeline Hospedagem', icon: 'bi-diagram-3-fill', href: '/pipeline/hospedagem' },
  { key: 'pipeline_avulsos', label: 'Pipeline Avulsos', icon: 'bi-grid-1x2-fill', href: '/pipeline/avulsos' },
  { key: 'clientes', label: 'Clientes', icon: 'bi-people-fill', href: '/clientes' },
  { key: 'financeiro', label: 'Financeiro', icon: 'bi-cash-stack', href: '/financeiro' },
  { key: 'tickets', label: 'Tickets', icon: 'bi-ticket-detailed-fill', href: '/tickets' },
  { key: 'config', label: 'Configurações', icon: 'bi-sliders2', href: '/config' },
];

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
      return 'Pipeline Hospedagem';
    case 'pipeline_avulsos':
      return 'Pipeline Avulsos';
    case 'clientes':
      return 'Clientes';
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

export function CrmPage({ section, dealId }: CrmPageProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(section === 'dashboard');
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardUpdatedAt, setDashboardUpdatedAt] = useState<string | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineTableData | null>(null);
  const [clientesAtivos, setClientesAtivos] = useState<ClienteItem[]>([]);
  const [clientesAtrasados, setClientesAtrasados] = useState<ClienteItem[]>([]);
  const [clientesInativos, setClientesInativos] = useState<ClienteItem[]>([]);
  const [clientesFantasma, setClientesFantasma] = useState<ClienteItem[]>([]);
  const [clientesCounts, setClientesCounts] = useState({ ATIVO: 0, ATRASADO: 0, INATIVO: 0, FANTASMA: 0 });
  const [showGhostModal, setShowGhostModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [ghostTarget, setGhostTarget] = useState<DeleteTarget>(null);
  const [restoreTarget, setRestoreTarget] = useState<DeleteTarget>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeleteTarget>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [searchAtivos, setSearchAtivos] = useState('');
  const [searchAtrasados, setSearchAtrasados] = useState('');
  const [searchInativos, setSearchInativos] = useState('');
  const [searchFantasma, setSearchFantasma] = useState('');
  const [pageAtivos, setPageAtivos] = useState(1);
  const [pageAtrasados, setPageAtrasados] = useState(1);
  const [pageInativos, setPageInativos] = useState(1);
  const [pageFantasma, setPageFantasma] = useState(1);
  const [totals, setTotals] = useState({ ATIVO: 0, ATRASADO: 0, INATIVO: 0, FANTASMA: 0 });
  const [totalPages, setTotalPages] = useState({ ATIVO: 1, ATRASADO: 1, INATIVO: 1, FANTASMA: 1 });
  const [financeOverview, setFinanceOverview] = useState<FinanceOverview | null>(null);
  const [recebimentos, setRecebimentos] = useState<RecebimentoItem[]>([]);
  const [inadimplencia, setInadimplencia] = useState<InadimplenciaItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);

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
    setShowGhostModal(false);
    setShowPurgeModal(false);
    setDeleteTarget(null);
    setGhostTarget(null);
    setRestoreTarget(null);
    setPurgeTarget(null);
    setPurgeConfirm('');
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
      return;
    }
    setNotice(data.error || 'Falha ao carregar pipeline');
  }

  async function loadClientesByStatus(
    status: 'ATIVO' | 'ATRASADO' | 'INATIVO' | 'FANTASMA',
    search: string,
    page: number,
    setter: (items: ClienteItem[]) => void
  ) {
    const qs = new URLSearchParams({
      status,
      search,
      page: String(page),
      pageSize: '10',
    });
    const res = await fetch(`/api/clientes?${qs.toString()}`);
    const data = (await res.json()) as ClientesApiResponse & { error?: string };
    if (!res.ok) {
      setNotice(data.error || `Falha ao carregar clientes ${status.toLowerCase()}`);
      return;
    }

    setter(data.items || []);
    setClientesCounts(data.counts || { ATIVO: 0, ATRASADO: 0, INATIVO: 0, FANTASMA: 0 });
    setTotals((prev) => ({ ...prev, [status]: data.total ?? 0 }));
    setTotalPages((prev) => ({ ...prev, [status]: Math.max(1, data.totalPages ?? 1) }));
  }

  async function loadClientes() {
    await Promise.all([
      loadClientesByStatus('ATIVO', searchAtivos, pageAtivos, setClientesAtivos),
      loadClientesByStatus('ATRASADO', searchAtrasados, pageAtrasados, setClientesAtrasados),
      loadClientesByStatus('INATIVO', searchInativos, pageInativos, setClientesInativos),
      loadClientesByStatus('FANTASMA', searchFantasma, pageFantasma, setClientesFantasma),
    ]);
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
    resetTransientOverlays();
  }, [pathname]);

  useEffect(() => {
    const onPageShow = () => resetTransientOverlays();
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    if (section === 'clientes') {
      loadClientes();
    }
  }, [
    section,
    searchAtivos,
    searchAtrasados,
    searchInativos,
    searchFantasma,
    pageAtivos,
    pageAtrasados,
    pageInativos,
    pageFantasma,
  ]);

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

    setNotice('Lead cadastrado com sucesso.');
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
      : 'KoddaCRM: tabela por estágio, área do cliente, operação integrada e financeiro avançado.';
  const currentHour = new Date().getHours();
  const periodLabel = currentHour < 12 ? 'Manhã' : currentHour < 18 ? 'Tarde' : 'Noite';

  return (
    <div className="crm-v2-layout">
      <aside className="crm-v2-sidebar">
        <Link className="crm-v2-brand" href="/dashboard" aria-label="KoddaCRM">
          <img src="/koddahub-logo-v2.png" alt="KoddaHub" />
          <span>
            <span className="kodda">Kodda</span>
            <span className="hub">Hub</span>
          </span>
        </Link>

        <nav className="crm-v2-menu">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={activeMenu === item.key ? 'active' : ''}
              aria-current={activeMenu === item.key ? 'page' : undefined}
            >
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="crm-v2-sidebar-footer">
          <button type="button" onClick={runReconcile} className="secondary-btn" disabled={loading}>
            <i className="bi bi-arrow-repeat" aria-hidden="true" /> Reconciliar
          </button>
          <button type="button" onClick={logout} className="danger-btn">
            <i className="bi bi-box-arrow-right" aria-hidden="true" /> Sair
          </button>
        </div>
      </aside>

      <main className="crm-v2-main">
        <header className="crm-v2-topbar">
          <div className="crm-v2-topbar-main">
            <h1>{sectionTitle(section)}</h1>
            <p>{topbarDescription}</p>
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
                <h3>{pipelineData?.pipeline.name || 'Pipeline'}</h3>
                <p>Tabela escalonada por estágio com movimentação livre.</p>
              </div>
              <button type="button" className="primary-btn" onClick={() => setShowLeadModal(true)}>
                <i className="bi bi-plus-circle" aria-hidden="true" /> Novo lead
              </button>
            </div>

            {(pipelineData?.stages || []).map((stage) => (
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
                  <table>
                    <thead>
                      <tr>
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
                          className="table-clickable-row"
                        >
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
            ))}
          </section>
        ) : null}

        {section === 'clientes' ? (
          <section className="clientes-v2-grid">
            <section className="crm-v2-panel clientes-table-panel ativos">
              <div className="table-header-actions">
                <div>
                  <h3>Ativos</h3>
                  <p>Pagamento confirmado ou até 2 dias de tolerância.</p>
                </div>
                <span className="status-chip ativo">{clientesCounts.ATIVO}</span>
              </div>
              <div className="clientes-table-toolbar">
                <input
                  placeholder="Buscar cliente ativo..."
                  value={searchAtivos}
                  onChange={(e) => {
                    setSearchAtivos(e.target.value);
                    setPageAtivos(1);
                  }}
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Contato</th>
                      <th>Plano</th>
                      <th>Valor</th>
                      <th>Vencimento</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesAtivos.map((item) => (
                      <tr key={item.id} className="table-clickable-row" onClick={() => router.push(`/deals/${item.id}`)}>
                        <td>{item.contactName || item.title}</td>
                        <td>{item.contactEmail || '-'}</td>
                        <td>{item.planCode || '-'}</td>
                        <td>{currency(item.valueCents)}</td>
                        <td>{dateOnly(item.nextDueDate || item.referenceDueDate)}</td>
                        <td><span className="status-chip ativo">{item.classStatus}</span></td>
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="clientes-pagination">
                <button type="button" onClick={() => setPageAtivos((p) => Math.max(1, p - 1))} disabled={pageAtivos <= 1}>Anterior</button>
                <span>Página {pageAtivos} de {totalPages.ATIVO} ({totals.ATIVO} registros)</span>
                <button type="button" onClick={() => setPageAtivos((p) => Math.min(totalPages.ATIVO, p + 1))} disabled={pageAtivos >= totalPages.ATIVO}>Próxima</button>
              </div>
            </section>

            <section className="crm-v2-panel clientes-table-panel atrasados">
              <div className="table-header-actions">
                <div>
                  <h3>Atrasados</h3>
                  <p>Pagamentos com atraso entre 3 e 15 dias.</p>
                </div>
                <span className="status-chip atrasado">{clientesCounts.ATRASADO}</span>
              </div>
              <div className="clientes-table-toolbar">
                <input
                  placeholder="Buscar cliente atrasado..."
                  value={searchAtrasados}
                  onChange={(e) => {
                    setSearchAtrasados(e.target.value);
                    setPageAtrasados(1);
                  }}
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Contato</th>
                      <th>Plano</th>
                      <th>Dias atraso</th>
                      <th>Status pagamento</th>
                      <th>Atualizado</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesAtrasados.map((item) => (
                      <tr key={item.id} className="table-clickable-row" onClick={() => router.push(`/deals/${item.id}`)}>
                        <td>{item.contactName || item.title}</td>
                        <td>{item.contactEmail || '-'}</td>
                        <td>{item.planCode || '-'}</td>
                        <td>{item.daysLate}</td>
                        <td>{item.lastPaymentStatus || '-'}</td>
                        <td>{dateTime(item.updatedAt)}</td>
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="clientes-pagination">
                <button type="button" onClick={() => setPageAtrasados((p) => Math.max(1, p - 1))} disabled={pageAtrasados <= 1}>Anterior</button>
                <span>Página {pageAtrasados} de {totalPages.ATRASADO} ({totals.ATRASADO} registros)</span>
                <button type="button" onClick={() => setPageAtrasados((p) => Math.min(totalPages.ATRASADO, p + 1))} disabled={pageAtrasados >= totalPages.ATRASADO}>Próxima</button>
              </div>
            </section>

            <section className="crm-v2-panel clientes-table-panel inativos">
              <div className="table-header-actions">
                <div>
                  <h3>Inativos</h3>
                  <p>Atraso superior a 15 dias. Elegíveis para lista fantasma.</p>
                </div>
                <div className="clientes-actions-group">
                  <span className="status-chip inativo">{clientesCounts.INATIVO}</span>
                  <button type="button" className="secondary-btn" onClick={() => setShowGhostModal(true)}>
                    <i className="bi bi-archive" aria-hidden="true" /> Lista Fantasma
                  </button>
                </div>
              </div>
              <div className="clientes-table-toolbar">
                <input
                  placeholder="Buscar cliente inativo..."
                  value={searchInativos}
                  onChange={(e) => {
                    setSearchInativos(e.target.value);
                    setPageInativos(1);
                  }}
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Contato</th>
                      <th>Dias atraso</th>
                      <th>Ticket</th>
                      <th>SLA ticket</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesInativos.map((item) => (
                      <tr key={item.id} className="table-clickable-row" onClick={() => router.push(`/deals/${item.id}`)}>
                        <td>{item.contactName || item.title}</td>
                        <td>{item.contactEmail || '-'}</td>
                        <td>{item.daysLate}</td>
                        <td>{item.ticketId ? item.ticketId.slice(0, 8) : '-'}</td>
                        <td>{dateTime(item.ticketSlaDeadline)}</td>
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
                            <button
                              type="button"
                              className="danger-inline-btn"
                              aria-label="Mover para fantasma"
                              title="Mover para fantasma"
                              onClick={() => setGhostTarget({ id: item.id, label: item.contactName || item.title })}
                            >
                              <i className="bi bi-archive-fill" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="clientes-pagination">
                <button type="button" onClick={() => setPageInativos((p) => Math.max(1, p - 1))} disabled={pageInativos <= 1}>Anterior</button>
                <span>Página {pageInativos} de {totalPages.INATIVO} ({totals.INATIVO} registros)</span>
                <button type="button" onClick={() => setPageInativos((p) => Math.min(totalPages.INATIVO, p + 1))} disabled={pageInativos >= totalPages.INATIVO}>Próxima</button>
              </div>
            </section>
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

      {showGhostModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Lista fantasma">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowGhostModal(false)} />
          <div className="crm-v2-modal-content ghost-modal-content">
            <header>
              <h3>Lista Fantasma</h3>
              <button type="button" onClick={() => setShowGhostModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p className="ghost-modal-note">
              Clientes removidos da operação principal. Você pode restaurar ou excluir permanentemente.
            </p>
            <div className="clientes-table-toolbar">
              <input
                placeholder="Buscar na lista fantasma..."
                value={searchFantasma}
                onChange={(e) => {
                  setSearchFantasma(e.target.value);
                  setPageFantasma(1);
                }}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Atraso</th>
                    <th>Movido em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFantasma.map((item) => (
                    <tr key={item.id}>
                      <td>{item.contactName || item.title}</td>
                      <td>{item.contactEmail || '-'}</td>
                      <td>{item.daysLate} dias</td>
                      <td>{dateTime(item.ghostedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            title="Restaurar"
                            onClick={() => setRestoreTarget({ id: item.id, label: item.contactName || item.title })}
                          >
                            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="danger-inline-btn"
                            title="Excluir permanentemente"
                            onClick={() => {
                              setPurgeTarget({ id: item.id, label: item.contactName || item.title });
                              setShowPurgeModal(true);
                            }}
                          >
                            <i className="bi bi-trash3-fill" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="clientes-pagination">
              <button type="button" onClick={() => setPageFantasma((p) => Math.max(1, p - 1))} disabled={pageFantasma <= 1}>Anterior</button>
              <span>Página {pageFantasma} de {totalPages.FANTASMA} ({totals.FANTASMA} registros)</span>
              <button type="button" onClick={() => setPageFantasma((p) => Math.min(totalPages.FANTASMA, p + 1))} disabled={pageFantasma >= totalPages.FANTASMA}>Próxima</button>
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
