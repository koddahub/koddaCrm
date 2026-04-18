'use client';

import { useEffect, useMemo, useState } from 'react';

type KPIData = {
  leads24h: number;
  leads7d: number;
  abandoned2h: number;
  newSubscriptions: number;
  avulsoWon: number;
  slaBreaches: number;
  ticketsOpen: number;
};

type Pipeline = {
  id: string;
  code: string;
  name: string;
  kind: string;
};

type BoardCard = {
  id: string;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  intent: string | null;
  origin: string;
  category: string;
  dealType: string;
  valueCents: number | null;
  slaDeadline: string | null;
  status: string;
};

type BoardStage = {
  id: string;
  code: string;
  name: string;
  stageOrder: number;
  cards: BoardCard[];
};

type BoardData = {
  pipeline: Pipeline;
  stages: BoardStage[];
};

type Lead = {
  id: string;
  source: string;
  name: string;
  email: string | null;
  phone: string | null;
  interest: string | null;
  stage: string;
  createdAt: string;
};

type Proposal = {
  id: string;
  title: string;
  status: string;
  valueCents: number | null;
  createdAt: string;
};

type Ticket = {
  id: string;
  queueName: string;
  status: string;
  slaDeadline: string | null;
  createdAt: string;
};

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
  { key: 'pipeline_hospedagem', label: 'Jornada Comercial', icon: 'bi-kanban-fill' },
  { key: 'pipeline_avulsos', label: 'Funil Comercial', icon: 'bi-grid-1x2-fill' },
  { key: 'operacao_hospedagem', label: 'Operacao Hospedagem', icon: 'bi-clipboard2-check-fill' },
  { key: 'operacao_avulsos', label: 'Operacao Avulsos', icon: 'bi-diagram-3-fill' },
  { key: 'leads', label: 'Leads', icon: 'bi-person-lines-fill' },
  { key: 'propostas', label: 'Propostas', icon: 'bi-file-earmark-text-fill' },
  { key: 'tickets', label: 'Tickets', icon: 'bi-ticket-detailed-fill' },
  { key: 'config', label: 'Configuracoes', icon: 'bi-sliders2' },
];

const pipelineCodeByMenu: Record<string, string> = {
  pipeline_hospedagem: 'comercial_hospedagem',
  pipeline_avulsos: 'comercial_avulsos',
  operacao_hospedagem: 'operacao_hospedagem',
  operacao_avulsos: 'operacao_avulsos',
};

function currency(cents: number | null | undefined) {
  if (!cents) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

export function CrmApp() {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dragCardId, setDragCardId] = useState<string | null>(null);

  const selectedPipelineCode = useMemo(() => pipelineCodeByMenu[activeMenu], [activeMenu]);

  async function loadKpis() {
    const response = await fetch('/api/dashboard/kpis');
    const data = await response.json();
    if (response.ok) {
      setKpis(data);
    }
  }

  async function loadPipelines() {
    const response = await fetch('/api/pipelines');
    const data = await response.json();
    if (response.ok) {
      setPipelines(data.items || []);
    }
  }

  async function loadBoardByCode(code: string) {
    const target = pipelines.find((item) => item.code === code);
    if (!target) {
      setBoard(null);
      return;
    }
    const response = await fetch(`/api/pipelines/${target.id}/board`);
    const data = await response.json();
    if (response.ok) {
      setBoard(data);
    }
  }

  async function loadLeads() {
    const response = await fetch('/api/leads/ingest-site-form?mode=list');
    const data = await response.json();
    if (response.ok) {
      setLeads(data.items || []);
    }
  }

  async function loadProposals() {
    const response = await fetch('/api/proposals-avulsas');
    const data = await response.json();
    if (response.ok) {
      setProposals(data.items || []);
    }
  }

  async function loadTickets() {
    const response = await fetch('/api/automation/reconcile?mode=tickets');
    const data = await response.json();
    if (response.ok) {
      setTickets(data.items || []);
    }
  }

  async function initialLoad() {
    setLoading(true);
    await Promise.all([loadKpis(), loadPipelines(), loadLeads(), loadProposals(), loadTickets()]);
    setLoading(false);
  }

  useEffect(() => {
    initialLoad();
  }, []);

  useEffect(() => {
    if (!selectedPipelineCode || pipelines.length === 0) return;
    loadBoardByCode(selectedPipelineCode);
  }, [selectedPipelineCode, pipelines]);

  async function moveCard(cardId: string, stageId: string, positionIndex: number) {
    const response = await fetch(`/api/pipeline-cards/${cardId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, positionIndex }),
    });

    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || 'Falha ao mover card');
      return;
    }

    if (selectedPipelineCode) {
      await loadBoardByCode(selectedPipelineCode);
    }
    setNotice('Card movido com sucesso.');
  }

  async function runReconcile() {
    setLoading(true);
    const response = await fetch('/api/automation/reconcile', { method: 'POST' });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setNotice(data.error || 'Erro na reconciliacao.');
      return;
    }
    setNotice('Automacoes reconciliadas: ' + data.summary);
    await initialLoad();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  async function createProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch('/api/proposals-avulsas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || 'Erro ao criar proposta.');
      return;
    }

    form.reset();
    setNotice('Proposta criada com sucesso.');
    await loadProposals();
  }

  async function closeProposal(proposalId: string) {
    const response = await fetch(`/api/proposals-avulsas/${proposalId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'FECHADO' }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || 'Erro ao fechar proposta.');
      return;
    }
    setNotice('Proposta fechada e enviada para operacao.');
    await Promise.all([loadProposals(), loadPipelines()]);
    if (selectedPipelineCode) {
      await loadBoardByCode(selectedPipelineCode);
    }
  }

  return (
    <div className="crm-layout">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <a className="crm-brand-link" href="/" aria-label="KoddaHub CRM">
            <img src="/koddahub-logo-v2.png" alt="" aria-hidden="true" />
            <span className="crm-brand-wordmark">
              <span className="kodda">Kodda</span>
              <span className="hub">Hub</span>
            </span>
          </a>
        </div>

        <nav className="crm-nav">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeMenu === item.key ? 'active' : ''}
              onClick={() => setActiveMenu(item.key)}
            >
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="crm-sidebar-footer">
          <button type="button" onClick={runReconcile} className="secondary-btn">
            <i className="bi bi-arrow-repeat" aria-hidden="true" /> Reconciliar automacoes
          </button>
          <button type="button" onClick={logout} className="danger-btn">
            <i className="bi bi-box-arrow-right" aria-hidden="true" /> Sair
          </button>
        </div>
      </aside>

      <main className="crm-main">
        <header className="crm-top">
          <div>
            <h2>{MENU_ITEMS.find((item) => item.key === activeMenu)?.label || 'Dashboard'}</h2>
            <p>Fluxo KoddaHub: hospedagem + projetos avulsos + operacao</p>
          </div>
          <div className="top-pills">
            <span className="pill">Sem vendedores</span>
            <span className="pill">ADMIN unico</span>
          </div>
        </header>

        {notice ? <div className="crm-notice">{notice}</div> : null}

        {loading ? <div className="crm-loading">Carregando dados...</div> : null}

        {activeMenu === 'dashboard' ? (
          <section className="crm-grid">
            <article className="kpi-card"><label>Leads 24h</label><strong>{kpis?.leads24h ?? 0}</strong></article>
            <article className="kpi-card"><label>Leads 7 dias</label><strong>{kpis?.leads7d ?? 0}</strong></article>
            <article className="kpi-card"><label>Abandonos (&gt;2h)</label><strong>{kpis?.abandoned2h ?? 0}</strong></article>
            <article className="kpi-card"><label>Assinaturas novas</label><strong>{kpis?.newSubscriptions ?? 0}</strong></article>
            <article className="kpi-card"><label>Avulsos fechados</label><strong>{kpis?.avulsoWon ?? 0}</strong></article>
            <article className="kpi-card"><label>SLA estourado</label><strong>{kpis?.slaBreaches ?? 0}</strong></article>
            <article className="kpi-card"><label>Tickets abertos</label><strong>{kpis?.ticketsOpen ?? 0}</strong></article>
          </section>
        ) : null}

        {selectedPipelineCode ? (
          <section className="kanban-wrapper">
            <div className="kanban-header">
              <strong>{board?.pipeline.name || 'Funil Comercial'}</strong>
              <small>Arraste os cards entre estagios.</small>
            </div>
            <div className="kanban-board">
              {(board?.stages || []).map((stage) => (
                <div
                  className="kanban-column"
                  key={stage.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={async () => {
                    if (dragCardId) {
                      await moveCard(dragCardId, stage.id, stage.cards.length);
                      setDragCardId(null);
                    }
                  }}
                >
                  <div className="kanban-column-head">
                    <h4>{stage.name}</h4>
                    <span>{stage.cards.length}</span>
                  </div>
                  <div className="kanban-column-body">
                    {stage.cards.map((card, index) => (
                      <article
                        key={card.id}
                        className="kanban-card"
                        draggable
                        onDragStart={() => setDragCardId(card.id)}
                      >
                        <strong>{card.title}</strong>
                        <small>{card.contactName || 'Contato sem nome'}</small>
                        <small>{card.intent || 'Sem intent'}</small>
                        <small>{currency(card.valueCents)}</small>
                        <small>SLA: {dateTime(card.slaDeadline)}</small>
                        <div className="kanban-actions">
                          <button
                            type="button"
                            onClick={() => moveCard(card.id, stage.id, Math.max(index - 1, 0))}
                            title="Subir"
                          >
                            <i className="bi bi-arrow-up" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCard(card.id, stage.id, index + 1)}
                            title="Descer"
                          >
                            <i className="bi bi-arrow-down" aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeMenu === 'leads' ? (
          <section className="table-card">
            <h3>Leads recentes</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Origem</th>
                    <th>Interesse</th>
                    <th>Contato</th>
                    <th>Estagio</th>
                    <th>Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name}</td>
                      <td>{lead.source}</td>
                      <td>{lead.interest || '-'}</td>
                      <td>{lead.email || lead.phone || '-'}</td>
                      <td>{lead.stage}</td>
                      <td>{dateTime(lead.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeMenu === 'propostas' ? (
          <section className="grid-two">
            <article className="table-card">
              <h3>Criar proposta avulsa</h3>
              <form className="stack-form" onSubmit={createProposal}>
                <label>Titulo</label>
                <input name="title" required placeholder="Ex: Site institucional premium" />
                <label>Escopo</label>
                <textarea name="scope" placeholder="Escopo resumido do projeto" />
                <label>Valor (R$)</label>
                <input name="value" type="number" min="0" step="0.01" placeholder="0,00" />
                <button type="submit">Salvar proposta</button>
              </form>
            </article>

            <article className="table-card">
              <h3>Propostas cadastradas</h3>
              <div className="proposal-list">
                {proposals.map((proposal) => (
                  <div key={proposal.id} className="proposal-item">
                    <div>
                      <strong>{proposal.title}</strong>
                      <small>{proposal.status} • {currency(proposal.valueCents)}</small>
                    </div>
                    {proposal.status !== 'FECHADO' ? (
                      <button type="button" onClick={() => closeProposal(proposal.id)}>Marcar FECHADO</button>
                    ) : (
                      <span className="done-tag">Fechado</span>
                    )}
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeMenu === 'tickets' ? (
          <section className="table-card">
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

        {activeMenu === 'config' ? (
          <section className="table-card">
            <h3>Configuracoes do CRM</h3>
            <ul className="config-list">
              <li>Regra de abandono ativa: 2 horas sem pagamento.</li>
              <li>Pipelines ativos: 4 (2 comerciais + 2 operacionais).</li>
              <li>Origens aceitas: SITE_FORM, SIGNUP_FLOW, PAYMENT_WEBHOOK, MANUAL.</li>
              <li>Tipos de produto: hospedagem e projetos avulsos da KoddaHub.</li>
            </ul>
          </section>
        ) : null}
      </main>

      <nav className="crm-mobile-nav" aria-label="Navegação CRM mobile">
        {MENU_ITEMS.map((item) => (
          <button
            key={`mobile-${item.key}`}
            type="button"
            className={activeMenu === item.key ? 'active' : ''}
            onClick={() => setActiveMenu(item.key)}
            aria-label={item.label}
            title={item.label}
          >
            <i className={`bi ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
