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
};

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

export function CrmPage({ section, dealId }: CrmPageProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineTableData | null>(null);
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [financeOverview, setFinanceOverview] = useState<FinanceOverview | null>(null);
  const [recebimentos, setRecebimentos] = useState<RecebimentoItem[]>([]);
  const [inadimplencia, setInadimplencia] = useState<InadimplenciaItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);

  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    planCode: 'basic',
    productCode: 'site_institucional',
    value: '',
    intent: '',
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
    const res = await fetch('/api/dashboard/kpis');
    const data = await res.json();
    if (res.ok) setDashboardData(data);
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

  async function loadClientes() {
    const res = await fetch('/api/clientes');
    const data = await res.json();
    if (res.ok) setClientes(data.items || []);
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

  const activeMenu = MENU_ITEMS.find((item) => pathname.startsWith(item.href))?.key || (section === 'deal' ? 'clientes' : section);

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
            <Link key={item.key} href={item.href} className={activeMenu === item.key ? 'active' : ''}>
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="crm-v2-sidebar-footer">
          <button type="button" onClick={runReconcile} className="secondary-btn">
            <i className="bi bi-arrow-repeat" aria-hidden="true" /> Reconciliar
          </button>
          <button type="button" onClick={logout} className="danger-btn">
            <i className="bi bi-box-arrow-right" aria-hidden="true" /> Sair
          </button>
        </div>
      </aside>

      <main className="crm-v2-main">
        <header className="crm-v2-topbar">
          <div>
            <h1>{sectionTitle(section)}</h1>
            <p>KoddaCRM: tabela por estágio, área do cliente, operação integrada e financeiro avançado.</p>
          </div>
        </header>

        {notice ? <div className="crm-v2-notice">{notice}</div> : null}

        {section === 'deal' && dealId ? <DealDetail dealId={dealId} setNotice={setNotice} /> : null}

        {section === 'dashboard' ? (
          <div className="crm-v2-dashboard-grid">
            <article className="crm-v2-panel">
              <h3>Prospecção</h3>
              <div className="metric-grid">
                <div><span>Leads 24h</span><strong>{dashboardData?.prospeccao.leads24h ?? 0}</strong></div>
                <div><span>Leads 7d</span><strong>{dashboardData?.prospeccao.leads7d ?? 0}</strong></div>
                <div><span>Abandonos +2h</span><strong>{dashboardData?.prospeccao.abandonos2h ?? 0}</strong></div>
                <div><span>Ganhos hospedagem</span><strong>{dashboardData?.prospeccao.ganhosHospedagem ?? 0}</strong></div>
                <div><span>Ganhos avulsos</span><strong>{dashboardData?.prospeccao.ganhosAvulsos ?? 0}</strong></div>
                <div><span>Perdidos</span><strong>{dashboardData?.prospeccao.perdidos ?? 0}</strong></div>
              </div>
            </article>

            <article className="crm-v2-panel">
              <h3>Financeiro</h3>
              <div className="metric-grid">
                <div><span>MRR</span><strong>{currency(dashboardData?.financeiro.mrr ?? 0)}</strong></div>
                <div><span>Recebido no mês</span><strong>{currency(dashboardData?.financeiro.recebidosMes ?? 0)}</strong></div>
                <div><span>Inadimplência</span><strong>{currency(dashboardData?.financeiro.inadimplenciaAberta ?? 0)}</strong></div>
                <div><span>Resultado DRE</span><strong>{currency(dashboardData?.financeiro.dreResultadoMes ?? 0)}</strong></div>
              </div>
            </article>

            <article className="crm-v2-panel">
              <h3>Operação</h3>
              <div className="metric-grid">
                <div><span>Clientes ativos</span><strong>{dashboardData?.operacao.clientesAtivos ?? 0}</strong></div>
                <div><span>Operações em curso</span><strong>{dashboardData?.operacao.operacoesEmCurso ?? 0}</strong></div>
                <div><span>SLA em risco</span><strong>{dashboardData?.operacao.slaRisco ?? 0}</strong></div>
                <div><span>Tickets abertos</span><strong>{dashboardData?.operacao.ticketsAbertos ?? 0}</strong></div>
              </div>
            </article>
          </div>
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
                              <button type="button" onClick={() => reorderDeal(row.id, stage.id, Math.max(index - 1, 0))}>
                                <i className="bi bi-arrow-up" aria-hidden="true" />
                              </button>
                              <button type="button" onClick={() => reorderDeal(row.id, stage.id, index + 1)}>
                                <i className="bi bi-arrow-down" aria-hidden="true" />
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
          <section className="crm-v2-panel">
            <h3>Clientes Fechados</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Tipo</th>
                    <th>Plano/Produto</th>
                    <th>Valor</th>
                    <th>Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((item) => (
                    <tr key={item.id} className="table-clickable-row" onClick={() => router.push(`/deals/${item.id}`)}>
                      <td>{item.contactName || item.title}</td>
                      <td>{item.contactEmail || '-'}</td>
                      <td>{item.dealType}</td>
                      <td>{item.planCode || item.productCode || '-'}</td>
                      <td>{currency(item.valueCents)}</td>
                      <td>{dateTime(item.updatedAt)}</td>
                    </tr>
                  ))}
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
    </div>
  );
}
