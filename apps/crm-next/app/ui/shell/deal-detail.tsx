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

type OperationFlowData = {
  deal: {
    id: string;
    dealType: string;
    lifecycleStatus: string;
    organizationId: string | null;
    organizationName: string | null;
    organizationDomain: string | null;
    billingEmail: string | null;
  };
  operation: {
    activeStageCode: string | null;
    stageTabs: Array<{ code: string; name: string; order: number }>;
    history: {
      id: string;
      operationType: string;
      stageCode: string;
      stageName: string;
      stageOrder: number;
      status: string;
      startedAt: string;
      completedAt: string | null;
    }[];
  };
  prompt: {
    latest: {
      id: string;
      version: number;
      promptText: string;
      promptJson: unknown;
      status: string;
      requestedNotes: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
    revisions?: Array<{
      id: string;
      version: number;
      promptText: string;
      status: string;
      updatedAt: string;
    }>;
  };
  template: {
    latest: {
      id: string;
      version: number;
      projectPath: string;
      entryFile: string;
      previewUrl: string | null;
      sourceHash: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    } | null;
    revisions: Array<{
      id: string;
      version: number;
      projectPath: string;
      entryFile: string;
      previewUrl: string | null;
      sourceHash: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
    vscode: {
      deepLink: string;
      webLink: string | null;
    } | null;
    sshConfig?: string | null;
    catalog?: Array<{
      id: string;
      code: string;
      name: string;
      rootPath: string;
      entryFile: string;
      isDefault: boolean;
      isActive: boolean;
    }>;
  };
  approval: {
    latest: {
      id: string;
      status: string;
      expiresAt: string;
      clientNote: string | null;
      actedAt: string | null;
      templateRevisionId: string;
    } | null;
    history?: Array<{
      id: string;
      status: string;
      expiresAt: string;
      actedAt: string | null;
      clientNote: string | null;
      templateRevisionId: string;
    }>;
  };
  publication: {
    checks: Array<{
      id: string;
      targetDomain: string | null;
      expectedHash: string | null;
      lastLiveHash: string | null;
      lastHttpStatus: number | null;
      matches: boolean;
      checkedAt: string;
    }>;
    substeps: Array<{
      id: string;
      dealId: string;
      stageCode: string;
      substepCode: string;
      substepName: string;
      substepOrder: number;
      status: string;
      isRequired: boolean;
      owner: string | null;
      notes: string | null;
      startedAt: string | null;
      completedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    summary: {
      requiredTotal: number;
      requiredCompleted: number;
      pendingTotal: number;
      ready: boolean;
    };
  };
  operationLogsSummary?: {
    totalActivities: number;
    hint: string;
  };
};

const STAGE_LABEL: Record<string, string> = {
  briefing_pendente: 'Briefing pendente',
  pre_prompt: 'Pré-prompt',
  template_v1: 'Template V1',
  ajustes: 'Ajustes',
  aprovacao_cliente: 'Aprovação do cliente',
  publicacao: 'Publicação',
  publicado: 'Publicado',
};

const PREPROMPT_SNIPPETS = [
  { label: 'Objetivo', text: '## Objetivo\n- ' },
  { label: 'Tom de voz', text: '## Tom de voz\n- Profissional e direto\n' },
  { label: 'SEO local', text: '## SEO local\n- Cidade/região alvo: \n- Palavra-chave principal: \n' },
  { label: 'Restrições', text: '## Restrições\n- Não alterar estrutura base de responsividade.\n' },
  { label: 'CTA', text: '## CTA principal\n- ' },
];

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
  const [operationFlow, setOperationFlow] = useState<OperationFlowData | null>(null);
  const [operationStageTab, setOperationStageTab] = useState('briefing_pendente');
  const [prePromptForm, setPrePromptForm] = useState({
    promptText: '',
    subject: 'Solicitação de informações adicionais do briefing',
    requestItems: '',
    message: '',
    dueAt: '',
  });
  const [templateForm, setTemplateForm] = useState({
    entryFile: 'index.html',
    sourceHash: '',
    status: 'GENERATED',
    templateModelCode: 'template_v1_institucional_1pagina',
    copyMode: 'if_empty_or_missing',
  });
  const [approvalSending, setApprovalSending] = useState(false);
  const [updatingSubstepId, setUpdatingSubstepId] = useState<string | null>(null);

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

    if (body.deal?.lifecycleStatus === 'CLIENT') {
      await loadOperationFlow();
    }
  }

  async function loadOperationFlow() {
    const res = await fetch(`/api/deals/${dealId}/operation-flow`);
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao carregar fluxo de operação');
      return;
    }
    setOperationFlow(body);
    setOperationStageTab(body.operation?.activeStageCode || body.operation?.stageTabs?.[0]?.code || 'briefing_pendente');
    if (body.prompt?.latest?.promptText || body.prompt?.latest?.requestedNotes) {
      setPrePromptForm((prev) => ({
        ...prev,
        promptText: body.prompt.latest?.promptText || prev.promptText,
        message: body.prompt.latest?.requestedNotes || prev.message,
      }));
    }
    if (body.template?.latest?.entryFile || body.template?.catalog?.[0]?.code) {
      setTemplateForm((prev) => ({
        ...prev,
        entryFile: body.template?.latest?.entryFile || prev.entryFile,
        templateModelCode: body.template?.catalog?.find((item: { isDefault: boolean }) => item.isDefault)?.code || prev.templateModelCode,
        copyMode: prev.copyMode || 'if_empty_or_missing',
      }));
    }
  }

  useEffect(() => {
    loadDeal();
  }, [dealId]);

  useEffect(() => {
    if (tab === 'operacao' && canShowClientTabs) {
      loadOperationFlow();
    }
  }, [tab, canShowClientTabs]);

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

  async function moveOperationStage(operationStageCode: string) {
    const res = await fetch(`/api/deals/${dealId}/operation/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageCode: operationStageCode }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao atualizar operação');
      return;
    }
    setNotice('Etapa operacional atualizada.');
    setOperationStageTab(operationStageCode);
    await loadDeal();
  }

  async function savePrePromptDraft() {
    if (!prePromptForm.promptText.trim()) {
      setNotice('Preencha o texto do pré-prompt para salvar rascunho.');
      return;
    }
    const res = await fetch(`/api/deals/${dealId}/preprompt/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptText: prePromptForm.promptText }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao salvar rascunho do pré-prompt');
      return;
    }
    setNotice('Rascunho do pré-prompt salvo.');
    await loadOperationFlow();
  }

  async function requestPrePromptInfo() {
    if (!prePromptForm.message.trim() && !prePromptForm.requestItems.trim()) {
      setNotice('Descreva a mensagem e/ou itens de informação a solicitar ao cliente.');
      return;
    }

    const res = await fetch(`/api/deals/${dealId}/preprompt/request-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: prePromptForm.subject,
        message: prePromptForm.message,
        requestItems: prePromptForm.requestItems
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        dueAt: prePromptForm.dueAt || null,
        promptText: prePromptForm.promptText,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao solicitar informações adicionais');
      return;
    }
    setNotice('Solicitação enviada por e-mail ao cliente.');
    await loadOperationFlow();
    await loadDeal();
  }

  async function approvePrePrompt() {
    if (!prePromptForm.promptText.trim()) {
      setNotice('Preencha/ajuste o texto do pré-prompt antes de aprovar.');
      return;
    }
    const res = await fetch(`/api/deals/${dealId}/preprompt/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText: prePromptForm.promptText,
        templateModelCode: templateForm.templateModelCode || null,
        copyMode: templateForm.copyMode || 'if_empty_or_missing',
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao aprovar pré-prompt');
      return;
    }
    setNotice(
      body.templateApplied
        ? `Pré-prompt aprovado. Modelo aplicado: ${body?.templateModel?.name || body?.templateModel?.code || '-'}.`
        : 'Pré-prompt aprovado. Projeto já possuía template e não foi sobrescrito.',
    );
    await loadOperationFlow();
    await loadDeal();
  }

  async function createTemplateRevision() {
    const res = await fetch(`/api/deals/${dealId}/template/generate-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateModelCode: templateForm.templateModelCode || null,
        entryFile: templateForm.entryFile,
        sourceHash: templateForm.sourceHash || null,
        status: templateForm.status,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error || 'Falha ao registrar revisão de template');
      return;
    }
    setNotice('Revisão de template registrada com preview.');
    await loadOperationFlow();
    await loadDeal();
  }

  async function updatePublicationSubstep(substepId: string, payload: { status?: string; owner?: string; notes?: string }) {
    setUpdatingSubstepId(substepId);
    const res = await fetch(`/api/deals/${dealId}/operation/substeps/${substepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    setUpdatingSubstepId(null);
    if (!res.ok) {
      setNotice(body.error || 'Falha ao atualizar sub-etapa');
      return;
    }
    setNotice('Sub-etapa atualizada.');
    await loadOperationFlow();
    await loadDeal();
  }

  async function sendTemplateForApproval(templateRevisionId?: string) {
    setApprovalSending(true);
    const res = await fetch(`/api/deals/${dealId}/template/send-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateRevisionId: templateRevisionId || null }),
    });
    const body = await res.json();
    setApprovalSending(false);
    if (!res.ok) {
      setNotice(body.error || 'Falha ao enviar link de aprovação');
      return;
    }
    setNotice('Link de aprovação enviado para o cliente.');
    await loadOperationFlow();
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

  const operationTabs = operationFlow?.operation?.stageTabs || [];
  const currentStageCode = operationFlow?.operation?.activeStageCode || operationStageTab;
  const publicationReady = operationFlow?.publication?.summary?.ready || false;

  function appendPrePromptSnippet(text: string) {
    setPrePromptForm((prev) => ({ ...prev, promptText: `${prev.promptText}${prev.promptText ? '\n' : ''}${text}` }));
  }

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
          {data.deal.dealType !== 'HOSPEDAGEM' ? (
            <p>Fluxo por sub-abas desta versão disponível somente para hospedagem.</p>
          ) : (
            <div className="operation-stage-layout">
              <nav className="operation-stage-tabs">
                {operationTabs.map((op) => (
                  <button
                    key={op.code}
                    type="button"
                    className={operationStageTab === op.code ? 'active' : ''}
                    onClick={() => setOperationStageTab(op.code)}
                    title={STAGE_LABEL[op.code] || op.name}
                  >
                    {STAGE_LABEL[op.code] || op.name}
                  </button>
                ))}
              </nav>

              <div className="operation-card">
                <div className="operation-card-head">
                  <h4>{STAGE_LABEL[operationStageTab] || operationStageTab}</h4>
                  <span className={`status-chip ${operationStageTab === currentStageCode ? 'ativo' : 'atrasado'}`}>
                    {operationStageTab === currentStageCode ? 'Etapa ativa' : 'Etapa não ativa'}
                  </span>
                </div>
                {operationStageTab !== currentStageCode ? (
                  <div className="operation-actions">
                    <button type="button" className="primary-btn" onClick={() => moveOperationStage(operationStageTab)}>
                      Mover operação para esta etapa
                    </button>
                  </div>
                ) : null}

                {operationStageTab === 'briefing_pendente' ? (
                  <>
                    <p className="muted">
                      Aguardando envio do briefing no portal do cliente. Assim que enviado, avance para Pré-prompt.
                    </p>
                    <div className="operation-actions">
                      <button type="button" className="secondary-btn" onClick={() => moveOperationStage('pre_prompt')}>
                        Avançar para Pré-prompt
                      </button>
                    </div>
                  </>
                ) : null}

                {operationStageTab === 'pre_prompt' ? (
                  <>
                    <p className="muted">
                      Ambiente de edição do pré-prompt com snippets, solicitação estruturada de informações e aprovação da revisão.
                    </p>
                    <div className="preprompt-toolbar">
                      {PREPROMPT_SNIPPETS.map((snippet) => (
                        <button key={snippet.label} type="button" className="secondary-btn" onClick={() => appendPrePromptSnippet(snippet.text)}>
                          + {snippet.label}
                        </button>
                      ))}
                    </div>
                    <label>Prompt (editor)</label>
                    <textarea
                      rows={12}
                      value={prePromptForm.promptText}
                      onChange={(e) => setPrePromptForm((prev) => ({ ...prev, promptText: e.target.value }))}
                      placeholder="Descreva de forma estruturada objetivo, tom, restrições, SEO e CTA."
                    />
                    <div className="template-form-grid">
                      <div>
                        <label>Assunto da solicitação</label>
                        <input
                          value={prePromptForm.subject}
                          onChange={(e) => setPrePromptForm((prev) => ({ ...prev, subject: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label>Prazo para resposta</label>
                        <input
                          type="datetime-local"
                          value={prePromptForm.dueAt}
                          onChange={(e) => setPrePromptForm((prev) => ({ ...prev, dueAt: e.target.value }))}
                        />
                      </div>
                    </div>
                    <label>Itens solicitados (um por linha)</label>
                    <textarea
                      rows={4}
                      value={prePromptForm.requestItems}
                      onChange={(e) => setPrePromptForm((prev) => ({ ...prev, requestItems: e.target.value }))}
                      placeholder={'Ex:\nLogo em SVG\nTexto institucional validado\nLista de serviços prioritários'}
                    />
                    <label>Mensagem complementar</label>
                    <textarea
                      rows={4}
                      value={prePromptForm.message}
                      onChange={(e) => setPrePromptForm((prev) => ({ ...prev, message: e.target.value }))}
                      placeholder="Detalhes adicionais para o cliente responder por e-mail."
                    />
                    <div className="template-form-grid">
                      <div>
                        <label>Modelo base para aprovar pré-prompt</label>
                        <select
                          value={templateForm.templateModelCode}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateModelCode: e.target.value }))}
                        >
                          {(operationFlow?.template?.catalog || []).map((model) => (
                            <option key={model.code} value={model.code}>{model.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Modo de cópia para pasta do cliente</label>
                        <select
                          value={templateForm.copyMode}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, copyMode: e.target.value }))}
                        >
                          <option value="if_empty_or_missing">Copiar se vazio/incompleto</option>
                          <option value="replace">Substituir conteúdo existente (com backup)</option>
                        </select>
                      </div>
                    </div>
                    <div className="operation-actions">
                      <button type="button" className="secondary-btn" onClick={savePrePromptDraft}>Salvar rascunho</button>
                      <button type="button" className="secondary-btn" onClick={requestPrePromptInfo}>Solicitar informações</button>
                      <button type="button" className="primary-btn" onClick={approvePrePrompt}>Aprovar pré-prompt</button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(prePromptForm.promptText || '');
                            setNotice('Prompt copiado para a área de transferência.');
                          } catch {
                            setNotice('Não foi possível copiar automaticamente. Copie manualmente o texto.');
                          }
                        }}
                      >
                        Copiar prompt
                      </button>
                    </div>
                    {operationFlow?.prompt?.latest ? (
                      <small className="muted">
                        Última revisão: v{operationFlow.prompt.latest.version} ({operationFlow.prompt.latest.status}) em {dateTime(operationFlow.prompt.latest.updatedAt)}
                      </small>
                    ) : null}
                  </>
                ) : null}

                {(operationStageTab === 'template_v1' || operationStageTab === 'ajustes') ? (
                  <>
                    <p className="muted">
                      Selecione o modelo base, registre a revisão e valide no preview. Abra o VS Code com SSH/Web para executar os ajustes no diretório do cliente.
                    </p>
                    <div className="template-form-grid">
                      <div>
                        <label>Modelo base</label>
                        <select
                          value={templateForm.templateModelCode}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateModelCode: e.target.value }))}
                        >
                          {(operationFlow?.template?.catalog || []).map((model) => (
                            <option key={model.code} value={model.code}>{model.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Arquivo de entrada</label>
                        <input value={templateForm.entryFile} onChange={(e) => setTemplateForm((prev) => ({ ...prev, entryFile: e.target.value }))} />
                      </div>
                      <div>
                        <label>Status da revisão</label>
                        <select value={templateForm.status} onChange={(e) => setTemplateForm((prev) => ({ ...prev, status: e.target.value }))}>
                          <option value="GENERATED">Gerado</option>
                          <option value="IN_ADJUSTMENT">Em ajustes</option>
                          <option value="APPROVED_INTERNAL">Aprovado internamente</option>
                        </select>
                      </div>
                    </div>
                    <div className="template-form-grid">
                      <div>
                        <label>Hash da revisão (opcional)</label>
                        <input value={templateForm.sourceHash} onChange={(e) => setTemplateForm((prev) => ({ ...prev, sourceHash: e.target.value }))} placeholder="sha256..." />
                      </div>
                      <div>
                        <label>Caminho do projeto atual</label>
                        <input value={operationFlow?.template?.latest?.projectPath || '-'} readOnly />
                      </div>
                      <div>
                        <label>Entry atual</label>
                        <input value={operationFlow?.template?.latest?.entryFile || '-'} readOnly />
                      </div>
                    </div>
                    <label>Configuração SSH de referência</label>
                    <pre className="operation-ssh-block">{operationFlow?.template?.sshConfig || ''}</pre>

                    <div className="operation-actions">
                      <button type="button" className="primary-btn" onClick={createTemplateRevision}>Registrar revisão</button>
                      <button type="button" className="secondary-btn" onClick={() => moveOperationStage('ajustes')}>Marcar como ajustes</button>
                      <button type="button" className="secondary-btn" onClick={() => moveOperationStage('aprovacao_cliente')}>Aprovar internamente</button>
                      {operationFlow?.template?.vscode?.deepLink ? (
                        <a className="secondary-btn link-btn" href={operationFlow.template.vscode.deepLink}>Abrir VS Code (SSH)</a>
                      ) : null}
                      {operationFlow?.template?.vscode?.webLink ? (
                        <a className="secondary-btn link-btn" href={operationFlow.template.vscode.webLink} target="_blank" rel="noreferrer">Abrir VS Code Web</a>
                      ) : null}
                    </div>

                    <div className="table-wrap" style={{ marginTop: 12 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Versão</th>
                            <th>Status</th>
                            <th>Preview</th>
                            <th>Hash</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(operationFlow?.template?.revisions || []).map((revision) => (
                            <tr key={revision.id}>
                              <td>v{revision.version}</td>
                              <td>{revision.status}</td>
                              <td>
                                {revision.previewUrl ? (
                                  <a href={revision.previewUrl} target="_blank" rel="noreferrer">Abrir preview</a>
                                ) : '-'}
                              </td>
                              <td>{revision.sourceHash ? `${revision.sourceHash.slice(0, 12)}...` : '-'}</td>
                              <td>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => sendTemplateForApproval(revision.id)}
                                  disabled={approvalSending}
                                >
                                  Enviar para aprovação
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {operationStageTab === 'aprovacao_cliente' ? (
                  <>
                    <p className="muted">Envie ou reenvie o link temporário para validação do cliente no portal.</p>
                    <div className="operation-meta-grid">
                      <div>
                        <label>Status aprovação</label>
                        <strong>{operationFlow?.approval?.latest?.status || 'Sem envio'}</strong>
                      </div>
                      <div>
                        <label>Expira em</label>
                        <strong>{dateTime(operationFlow?.approval?.latest?.expiresAt || null)}</strong>
                      </div>
                      <div>
                        <label>Resposta do cliente</label>
                        <strong>{operationFlow?.approval?.latest?.clientNote || '-'}</strong>
                      </div>
                    </div>
                    <div className="operation-actions">
                      <button type="button" className="primary-btn" onClick={() => sendTemplateForApproval()} disabled={approvalSending}>
                        {approvalSending ? 'Enviando...' : 'Enviar/Reenviar para aprovação'}
                      </button>
                      <button type="button" className="secondary-btn" onClick={() => moveOperationStage('publicacao')}>
                        Mover para publicação
                      </button>
                    </div>
                  </>
                ) : null}

                {operationStageTab === 'publicacao' ? (
                  <>
                    <p className="muted">Checklist de sub-etapas fixas para publicação. Após concluir obrigatórias, o monitor estrito valida e publica automaticamente.</p>
                    <div className="operation-meta-grid">
                      <div>
                        <label>Obrigatórias concluídas</label>
                        <strong>{operationFlow?.publication?.summary?.requiredCompleted || 0} / {operationFlow?.publication?.summary?.requiredTotal || 0}</strong>
                      </div>
                      <div>
                        <label>Pendências</label>
                        <strong>{operationFlow?.publication?.summary?.pendingTotal || 0}</strong>
                      </div>
                      <div>
                        <label>Estado</label>
                        <strong>{publicationReady ? 'Publicando (monitor ativo)' : 'Checklist em andamento'}</strong>
                      </div>
                    </div>
                    <div className="table-wrap" style={{ marginTop: 12 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Sub-etapa</th>
                            <th>Status</th>
                            <th>Responsável</th>
                            <th>Notas</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(operationFlow?.publication?.substeps || []).map((substep) => (
                            <tr key={substep.id}>
                              <td>{substep.substepName}</td>
                              <td>{substep.status}</td>
                              <td>{substep.owner || '-'}</td>
                              <td>{substep.notes || '-'}</td>
                              <td>
                                <div className="row-actions proposal-row-actions">
                                  <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => updatePublicationSubstep(substep.id, { status: 'IN_PROGRESS' })}
                                    disabled={updatingSubstepId === substep.id}
                                  >
                                    Iniciar
                                  </button>
                                  <button
                                    type="button"
                                    className="primary-btn"
                                    onClick={() => updatePublicationSubstep(substep.id, { status: 'COMPLETED' })}
                                    disabled={updatingSubstepId === substep.id}
                                  >
                                    Concluir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="table-wrap" style={{ marginTop: 12 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Domínio</th>
                            <th>HTTP</th>
                            <th>Match hash</th>
                            <th>Check em</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(operationFlow?.publication?.checks || []).map((check) => (
                            <tr key={check.id}>
                              <td>{check.targetDomain || '-'}</td>
                              <td>{check.lastHttpStatus ?? '-'}</td>
                              <td>{check.matches ? 'Sim' : 'Não'}</td>
                              <td>{dateTime(check.checkedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {operationStageTab === 'publicado' ? (
                  <>
                    <p className="muted">Site publicado com monitoramento ativo e registro de auditoria no histórico.</p>
                    <div className="operation-meta-grid">
                      <div>
                        <label>Domínio final</label>
                        <strong>{operationFlow?.deal?.organizationDomain || '-'}</strong>
                      </div>
                      <div>
                        <label>Último check</label>
                        <strong>{dateTime(operationFlow?.publication?.checks?.[0]?.checkedAt || null)}</strong>
                      </div>
                      <div>
                        <label>Status</label>
                        <strong>Publicado</strong>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
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
