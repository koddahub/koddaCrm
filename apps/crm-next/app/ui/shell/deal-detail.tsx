'use client';

import { useEffect, useMemo, useState } from 'react';

type DealDetailProps = {
  dealId: string;
  setNotice: (message: string) => void;
};

type DealData = {
  deal: {
    id: string;
    title: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    planCode: string | null;
    productCode: string | null;
    intent: string | null;
    valueCents: number | null;
    dealType: string;
    category: string;
    origin: string;
    lifecycleStatus: string;
    isClosed: boolean;
    createdAt: string;
    updatedAt: string;
    pipeline: { id: string; name: string; code: string };
    stage: { id: string; name: string; code: string; stageOrder: number };
  };
  stageOptions: { id: string; name: string; code: string }[];
  organization: {
    id: string;
    legalName: string;
    billingEmail: string;
    whatsapp: string | null;
    domain: string | null;
    cpfCnpj: string;
  } | null;
  subscription:
    | {
        id: string;
        status: string;
        paymentMethod: string;
        asaasSubscriptionId: string | null;
        nextDueDate: string | null;
        plan: { code: string; name: string; monthlyPrice: number };
      }
    | null;
  operations: {
    id: string;
    operationType: string;
    stageCode: string;
    stageName: string;
    stageOrder: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
  }[];
  activities: {
    id: string;
    activityType: string;
    content: string;
    createdBy: string | null;
    createdAt: string;
  }[];
  agenda: {
    id: string;
    title: string;
    description: string | null;
    dueAt: string;
    status: string;
    createdAt: string;
  }[];
  documents: {
    id: string;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: string | null;
    createdAt: string;
  }[];
  proposals: {
    id: string;
    title: string;
    status: string;
    valueCents: number | null;
    pdfPath: string | null;
    createdAt: string;
  }[];
  tickets: {
    id: string;
    ticketType: string;
    subject: string;
    status: string;
    createdAt: string;
  }[];
  payments: {
    id: string;
    amountCents: number;
    status: string;
    dueDate: string | null;
    paidAt: string | null;
    billingType: string | null;
  }[];
};

function currency(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

export function DealDetail({ dealId, setNotice }: DealDetailProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DealData | null>(null);
  const [tab, setTab] = useState('resumo');
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [deletingProposalId, setDeletingProposalId] = useState<string | null>(null);

  const [activityForm, setActivityForm] = useState({ activityType: 'NOTE', content: '' });
  const [agendaForm, setAgendaForm] = useState({ title: '', description: '', dueAt: '' });
  const [proposalForm, setProposalForm] = useState({
    title: 'Proposta comercial KoddaHub',
    scope: '',
    proposalType: 'hospedagem',
    planCode: 'basic',
    projectType: 'Institucional',
    paymentCondition: 'avista',
    baseValue: '',
    features: '',
    notes: '',
  });

  const canShowClientTabs = useMemo(() => data?.deal.lifecycleStatus === 'CLIENT', [data]);

  async function loadDeal() {
    setLoading(true);
    const res = await fetch(`/api/deals/${dealId}`);
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setNotice(body.error || 'Falha ao carregar área do deal');
      return;
    }

    setData(body);

    if (body.deal?.planCode) {
      setProposalForm((prev) => ({ ...prev, planCode: body.deal.planCode }));
    }
    if (body.deal?.dealType === 'PROJETO_AVULSO') {
      setProposalForm((prev) => ({ ...prev, proposalType: 'personalizado' }));
    }
  }

  useEffect(() => {
    loadDeal();
  }, [dealId]);

  async function changeDealStage(stageId: string) {
    const res = await fetch(`/api/deals/${dealId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, reason: 'Mudança na área do cliente/lead' }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao alterar estágio');
      return;
    }
    setNotice('Estágio atualizado no deal.');
    await loadDeal();
  }

  async function advanceOperation(operationStageCode: string) {
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationStageCode }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao atualizar operação');
      return;
    }
    setNotice('Etapa operacional atualizada.');
    await loadDeal();
  }

  async function createActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch(`/api/deals/${dealId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activityForm),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao criar atividade');
      return;
    }
    setActivityForm({ activityType: 'NOTE', content: '' });
    setNotice('Atividade registrada.');
    await loadDeal();
  }

  async function createAgenda(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch(`/api/deals/${dealId}/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agendaForm),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao criar agenda');
      return;
    }
    setAgendaForm({ title: '', description: '', dueAt: '' });
    setNotice('Agenda registrada.');
    await loadDeal();
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const res = await fetch(`/api/deals/${dealId}/documents`, {
      method: 'POST',
      body: formData,
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao enviar documento');
      return;
    }
    setNotice('Documento anexado com sucesso.');
    event.currentTarget.reset();
    await loadDeal();
  }

  async function generateProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...proposalForm,
      baseValue: proposalForm.baseValue ? Number(proposalForm.baseValue) : null,
      features: proposalForm.features
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };

    const isEditing = Boolean(editingProposalId);
    const endpoint = isEditing
      ? `/api/deals/${dealId}/proposals/${editingProposalId}`
      : `/api/deals/${dealId}/proposals/generate`;

    const res = await fetch(endpoint, {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao gerar proposta');
      return;
    }
    setEditingProposalId(null);
    setNotice(isEditing ? 'Proposta atualizada com sucesso.' : 'Proposta gerada com PDF anexável.');
    await loadDeal();
  }

  async function sendProposal(proposalId: string) {
    const res = await fetch(`/api/deals/${dealId}/proposals/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao enviar proposta por e-mail');
      return;
    }
    setNotice('Proposta enviada para fila de e-mail.');
    await loadDeal();
  }

  function startEditProposal(proposal: DealData['proposals'][number]) {
    const snapshot = (proposal as unknown as { snapshot?: Record<string, unknown> }).snapshot || {};
    const features = Array.isArray(snapshot.features) ? snapshot.features.map((item) => String(item)) : [];

    setEditingProposalId(proposal.id);
    setProposalForm({
      title: proposal.title || 'Proposta comercial KoddaHub',
      scope: (proposal as unknown as { scope?: string | null }).scope || '',
      proposalType: String(snapshot.proposalType || (data?.deal.dealType === 'HOSPEDAGEM' ? 'hospedagem' : 'personalizado')),
      planCode: String(snapshot.planCode || data?.deal.planCode || 'basic'),
      projectType: String(snapshot.projectType || data?.deal.productCode || data?.deal.intent || 'Institucional'),
      paymentCondition: String(snapshot.paymentCondition || 'avista'),
      baseValue: '',
      features: features.join(', '),
      notes: String(snapshot.notes || ''),
    });
    setTab('proposta');
    setNotice('Modo edição de proposta habilitado.');
  }

  async function deleteProposal() {
    if (!deletingProposalId) return;
    const res = await fetch(`/api/deals/${dealId}/proposals/${deletingProposalId}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao excluir proposta');
      return;
    }
    setDeletingProposalId(null);
    if (editingProposalId === deletingProposalId) {
      setEditingProposalId(null);
    }
    setNotice('Proposta excluída com sucesso.');
    await loadDeal();
  }

  if (loading) {
    return <section className="crm-v2-panel"><p>Carregando área do cliente/lead...</p></section>;
  }

  if (!data) {
    return <section className="crm-v2-panel"><p>Deal não encontrado.</p></section>;
  }

  const operationOptions = data.deal.dealType === 'HOSPEDAGEM'
    ? [
        { code: 'boas_vindas', label: 'Boas-vindas' },
        { code: 'briefing', label: 'Briefing' },
        { code: 'producao', label: 'Produção' },
        { code: 'revisao', label: 'Revisão' },
        { code: 'publicado', label: 'Publicado' },
        { code: 'pos_entrega', label: 'Pós-entrega' },
      ]
    : [
        { code: 'kickoff', label: 'Kickoff' },
        { code: 'requisitos', label: 'Requisitos' },
        { code: 'desenvolvimento', label: 'Desenvolvimento' },
        { code: 'validacao', label: 'Validação' },
        { code: 'entrega', label: 'Entrega' },
        { code: 'suporte_inicial', label: 'Suporte inicial' },
      ];

  return (
    <section className="crm-v2-panel deal-detail-wrapper">
      <header className="deal-header">
        <div>
          <h3>{data.deal.contactName || data.deal.title}</h3>
          <p>{data.deal.contactEmail || '-'} • {data.deal.contactPhone || '-'}</p>
          <small>{data.deal.pipeline.name} • Estágio atual: {data.deal.stage.name}</small>
        </div>
        <div className="deal-header-actions">
          <select value={data.deal.stage.id} onChange={(e) => changeDealStage(e.target.value)}>
            {data.stageOptions.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.name}</option>
            ))}
          </select>
        </div>
      </header>

      <nav className="deal-tabs">
        <button className={tab === 'resumo' ? 'active' : ''} onClick={() => setTab('resumo')}>Resumo</button>
        <button className={tab === 'proposta' ? 'active' : ''} onClick={() => setTab('proposta')}>Proposta</button>
        {canShowClientTabs ? <button className={tab === 'operacao' ? 'active' : ''} onClick={() => setTab('operacao')}>Operação</button> : null}
        {canShowClientTabs ? <button className={tab === 'pagamentos' ? 'active' : ''} onClick={() => setTab('pagamentos')}>Pagamentos</button> : null}
        <button className={tab === 'documentos' ? 'active' : ''} onClick={() => setTab('documentos')}>Documentos</button>
        <button className={tab === 'agenda' ? 'active' : ''} onClick={() => setTab('agenda')}>Agenda</button>
        <button className={tab === 'atividades' ? 'active' : ''} onClick={() => setTab('atividades')}>Atividades</button>
        <button className={tab === 'tickets' ? 'active' : ''} onClick={() => setTab('tickets')}>Tickets</button>
      </nav>

      {tab === 'resumo' ? (
        <div className="deal-tab-panel">
          <div className="deal-summary-grid">
            <div><label>Tipo</label><strong>{data.deal.dealType}</strong></div>
            <div><label>Categoria</label><strong>{data.deal.category}</strong></div>
            <div><label>Plano</label><strong>{data.deal.planCode || '-'}</strong></div>
            <div><label>Produto</label><strong>{data.deal.productCode || data.deal.intent || '-'}</strong></div>
            <div><label>Valor</label><strong>{currency(data.deal.valueCents)}</strong></div>
            <div><label>Status ciclo</label><strong>{data.deal.lifecycleStatus}</strong></div>
            <div><label>Criado em</label><strong>{dateTime(data.deal.createdAt)}</strong></div>
            <div><label>Atualizado em</label><strong>{dateTime(data.deal.updatedAt)}</strong></div>
          </div>
          {data.organization ? (
            <div className="deal-summary-grid">
              <div><label>Empresa</label><strong>{data.organization.legalName}</strong></div>
              <div><label>E-mail cobrança</label><strong>{data.organization.billingEmail}</strong></div>
              <div><label>WhatsApp</label><strong>{data.organization.whatsapp || '-'}</strong></div>
              <div><label>Domínio</label><strong>{data.organization.domain || '-'}</strong></div>
              <div><label>CPF/CNPJ</label><strong>{data.organization.cpfCnpj}</strong></div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'proposta' ? (
        <div className="deal-tab-panel proposal-tab-panel">
          <form className="stack-form" onSubmit={generateProposal}>
            <label>Título</label>
            <input value={proposalForm.title} onChange={(e) => setProposalForm((p) => ({ ...p, title: e.target.value }))} required />

            <label>Tipo de proposta</label>
            <select value={proposalForm.proposalType} onChange={(e) => setProposalForm((p) => ({ ...p, proposalType: e.target.value }))}>
              <option value="hospedagem">Plano de hospedagem</option>
              <option value="personalizado">Projeto personalizado</option>
            </select>

            <label>Plano mensal</label>
            <select value={proposalForm.planCode} onChange={(e) => setProposalForm((p) => ({ ...p, planCode: e.target.value }))}>
              <option value="basic">Básico</option>
              <option value="profissional">Profissional</option>
              <option value="pro">Pro</option>
            </select>

            <label>Tipo de projeto</label>
            <input value={proposalForm.projectType} onChange={(e) => setProposalForm((p) => ({ ...p, projectType: e.target.value }))} />

            <label>Valor base do projeto (R$)</label>
            <input type="number" step="0.01" min="0" value={proposalForm.baseValue} onChange={(e) => setProposalForm((p) => ({ ...p, baseValue: e.target.value }))} />

            <label>Condição pagamento projeto</label>
            <select value={proposalForm.paymentCondition} onChange={(e) => setProposalForm((p) => ({ ...p, paymentCondition: e.target.value }))}>
              <option value="avista">À vista</option>
              <option value="6x">Parcelado em 6x</option>
            </select>

            <label>Funcionalidades extras (separadas por vírgula)</label>
            <input value={proposalForm.features} onChange={(e) => setProposalForm((p) => ({ ...p, features: e.target.value }))} placeholder="Ex: Blog, Chatbot, Área logada" />

            <label>Escopo</label>
            <textarea value={proposalForm.scope} onChange={(e) => setProposalForm((p) => ({ ...p, scope: e.target.value }))} />

            <label>Observações</label>
            <textarea value={proposalForm.notes} onChange={(e) => setProposalForm((p) => ({ ...p, notes: e.target.value }))} />

            <div className="proposal-form-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="primary-btn">
                {editingProposalId ? 'Salvar edição da proposta' : 'Gerar proposta com PDF'}
              </button>
              {editingProposalId ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setEditingProposalId(null);
                    setProposalForm((prev) => ({
                      ...prev,
                      title: 'Proposta comercial KoddaHub',
                      scope: '',
                      notes: '',
                      baseValue: '',
                      features: '',
                    }));
                  }}
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </form>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>PDF</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.proposals.map((proposal) => (
                  <tr key={proposal.id}>
                    <td>{proposal.title}</td>
                    <td>{proposal.status}</td>
                    <td>{currency(proposal.valueCents)}</td>
                    <td>{proposal.pdfPath ? 'Gerado' : '-'}</td>
                    <td>
                      <div className="row-actions proposal-row-actions">
                        <button type="button" className="secondary-btn" onClick={() => sendProposal(proposal.id)}>
                          Enviar por e-mail
                        </button>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => window.open(`/api/deals/${dealId}/proposals/${proposal.id}/pdf`, '_blank')}
                          disabled={!proposal.pdfPath}
                        >
                          Ver PDF
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => startEditProposal(proposal)}>
                          Editar
                        </button>
                        <button type="button" className="danger-btn" onClick={() => setDeletingProposalId(proposal.id)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'operacao' && canShowClientTabs ? (
        <div className="deal-tab-panel">
          <div className="stack-form">
            <label>Avançar operação</label>
            <select onChange={(e) => e.target.value && advanceOperation(e.target.value)} defaultValue="">
              <option value="" disabled>Selecione etapa operacional</option>
              {operationOptions.map((op) => (
                <option key={op.code} value={op.code}>{op.label}</option>
              ))}
            </select>
          </div>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Início</th>
                  <th>Conclusão</th>
                </tr>
              </thead>
              <tbody>
                {data.operations.map((operation) => (
                  <tr key={operation.id}>
                    <td>{operation.stageName}</td>
                    <td>{operation.operationType}</td>
                    <td>{operation.status}</td>
                    <td>{dateTime(operation.startedAt)}</td>
                    <td>{dateTime(operation.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'pagamentos' && canShowClientTabs ? (
        <div className="deal-tab-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Vencimento</th>
                  <th>Pago em</th>
                  <th>Método</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{currency(payment.amountCents)}</td>
                    <td>{payment.status}</td>
                    <td>{dateTime(payment.dueDate)}</td>
                    <td>{dateTime(payment.paidAt)}</td>
                    <td>{payment.billingType || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'documentos' ? (
        <div className="deal-tab-panel">
          <form className="stack-form" onSubmit={uploadDocument}>
            <label>Arquivo</label>
            <input name="file" type="file" required />
            <label>Tipo de documento</label>
            <input name="docType" placeholder="Ex: Contrato, briefing, anexo técnico" />
            <button type="submit" className="primary-btn">Anexar documento</button>
          </form>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.fileName}</td>
                    <td>{doc.mimeType || '-'}</td>
                    <td>{doc.sizeBytes || '-'}</td>
                    <td>{dateTime(doc.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'agenda' ? (
        <div className="deal-tab-panel">
          <form className="stack-form" onSubmit={createAgenda}>
            <label>Título</label>
            <input required value={agendaForm.title} onChange={(e) => setAgendaForm((p) => ({ ...p, title: e.target.value }))} />
            <label>Descrição</label>
            <textarea value={agendaForm.description} onChange={(e) => setAgendaForm((p) => ({ ...p, description: e.target.value }))} />
            <label>Data/Hora</label>
            <input type="datetime-local" required value={agendaForm.dueAt} onChange={(e) => setAgendaForm((p) => ({ ...p, dueAt: e.target.value }))} />
            <button type="submit" className="primary-btn">Salvar agenda</button>
          </form>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Status</th>
                  <th>Vencimento</th>
                  <th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {data.agenda.map((ag) => (
                  <tr key={ag.id}>
                    <td>{ag.title}</td>
                    <td>{ag.status}</td>
                    <td>{dateTime(ag.dueAt)}</td>
                    <td>{dateTime(ag.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'atividades' ? (
        <div className="deal-tab-panel">
          <form className="stack-form" onSubmit={createActivity}>
            <label>Tipo de atividade</label>
            <select value={activityForm.activityType} onChange={(e) => setActivityForm((p) => ({ ...p, activityType: e.target.value }))}>
              <option value="NOTE">Nota</option>
              <option value="CALL">Ligação</option>
              <option value="EMAIL">E-mail</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="MEETING">Reunião</option>
            </select>
            <label>Descrição</label>
            <textarea required value={activityForm.content} onChange={(e) => setActivityForm((p) => ({ ...p, content: e.target.value }))} />
            <button type="submit" className="primary-btn">Registrar atividade</button>
          </form>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Conteúdo</th>
                  <th>Criado por</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data.activities.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.activityType}</td>
                    <td>{activity.content}</td>
                    <td>{activity.createdBy || 'ADMIN'}</td>
                    <td>{dateTime(activity.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'tickets' ? (
        <div className="deal-tab-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Assunto</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data.tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{ticket.ticketType}</td>
                    <td>{ticket.subject}</td>
                    <td>{ticket.status}</td>
                    <td>{dateTime(ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {deletingProposalId ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Confirmar exclusão da proposta">
          <div className="crm-v2-modal-backdrop" onClick={() => setDeletingProposalId(null)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Excluir proposta</h3>
              <button type="button" onClick={() => setDeletingProposalId(null)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <p style={{ marginTop: 4, color: '#334155' }}>
              Tem certeza que deseja excluir esta proposta?
            </p>
            <p style={{ marginTop: 0, color: '#64748b', fontSize: '0.92rem' }}>
              O PDF vinculado também será removido.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setDeletingProposalId(null)}>
                Cancelar
              </button>
              <button type="button" className="danger-btn" onClick={deleteProposal}>
                Excluir proposta
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
