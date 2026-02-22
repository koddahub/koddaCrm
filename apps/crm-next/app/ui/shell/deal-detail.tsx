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
  releases?: Array<{
    id: string;
    dealId: string;
    version: number;
    label: string;
    status: string;
    projectRoot: string;
    assetsPath: string;
    promptMdPath: string | null;
    promptJsonPath: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    variants: Array<{
      id: string;
      releaseId: string;
      variantCode: 'V1' | 'V2' | 'V3';
      folderPath: string;
      entryFile: string;
      previewUrl: string | null;
      sourceHash: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }>;
  activeRelease?: {
    id: string;
    version: number;
    label: string;
    status: string;
    projectRoot: string;
    assetsPath: string;
    promptMdPath: string | null;
    promptJsonPath: string | null;
    variants: Array<{
      id: string;
      variantCode: 'V1' | 'V2' | 'V3';
      folderPath: string;
      entryFile: string;
      previewUrl: string | null;
      sourceHash: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
  } | null;
  selectedApprovalVariant?: {
    releaseVersion: number | null;
    variantCode: 'V1' | 'V2' | 'V3' | null;
  } | null;
  assets?: {
    releaseId: string | null;
    releaseLabel: string | null;
    uploadPath: string | null;
    summary: {
      logo: { count: number; status: string };
      identidadeVisual: { count: number; status: string };
      conteudo: { count: number; status: string };
      outros: { count: number; status: string };
    };
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

const TEMPLATE_VARIANT_SHOWCASE: Record<'V1' | 'V2' | 'V3', {
  title: string;
  description: string;
  icon: string;
  features: string[];
}> = {
  V1: {
    title: 'V1 - Institucional 1 página',
    description: 'Site de página única sem formulário, sem WhatsApp e sem chatbot.',
    icon: 'bi-file-earmark-text',
    features: ['Página única com âncoras', 'Sem formulário', 'Sem WhatsApp', 'Sem chatbot'],
  },
  V2: {
    title: 'V2 - Institucional 3 páginas',
    description: 'Home, Sobre e Contato com formulário e botão de WhatsApp.',
    icon: 'bi-files',
    features: ['Home, Sobre e Contato', 'Formulário de contato', 'WhatsApp em todas as páginas', 'Sem chatbot'],
  },
  V3: {
    title: 'V3 - Completo com chatbot',
    description: 'Versão completa com formulário, WhatsApp e chatbot.',
    icon: 'bi-robot',
    features: ['Estrutura multipágina', 'Formulário de contato', 'WhatsApp', 'Chatbot integrado'],
  },
};

const PROMPT_VARIANT_TASKS: Record<'V1' | 'V2' | 'V3', {
  slug: string;
  structure: string;
  hardRules: string[];
}> = {
  V1: {
    slug: 'institucional_1_pagina',
    structure: 'Uma página única com navegação por âncoras internas.',
    hardRules: ['Sem formulário de contato', 'Sem botão WhatsApp', 'Sem chatbot'],
  },
  V2: {
    slug: 'institucional_3_paginas',
    structure: 'Três páginas: Home, Sobre e Contato.',
    hardRules: ['Com formulário funcional na página de contato', 'Com botão WhatsApp em todas as páginas', 'Sem chatbot'],
  },
  V3: {
    slug: 'institucional_3_paginas_chatbot',
    structure: 'Três páginas com chatbot integrado e experiência completa.',
    hardRules: ['Com formulário funcional', 'Com botão WhatsApp', 'Com chatbot Kodassauro integrado'],
  },
};

function currency(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function normalizeTone(value?: string | null) {
  const tone = String(value || '').trim().toLowerCase();
  if (tone.includes('descontra')) return 'Descontraído';
  if (tone.includes('inspir')) return 'Inspirador';
  if (tone.includes('tecn')) return 'Técnico';
  if (tone.includes('lux')) return 'Luxuoso';
  if (tone.includes('equilibr')) return 'Equilibrado';
  return 'Profissional';
}

function normalizeStatusBadge(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (value === 'APPROVED') return { label: 'Aprovado', className: 'status-ok' };
  if (value === 'REQUESTED_INFO') return { label: 'Aguardando info', className: 'status-warn' };
  if (value === 'DRAFT') return { label: 'Rascunho', className: 'status-neutral' };
  return { label: value || 'Rascunho', className: 'status-neutral' };
}

function extractHexColors(input?: string | null) {
  const matches = String(input || '').match(/#[0-9a-fA-F]{6}/g) || [];
  const unique = Array.from(new Set(matches.map((item) => item.toUpperCase())));
  return unique.slice(0, 6);
}

function sanitizeColor(value?: string) {
  const raw = String(value || '').trim();
  const valid = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : '#0A1A2F';
  return valid;
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
  const [quickBrief, setQuickBrief] = useState({
    objetivo: '',
    publico: '',
    cores: '',
    tom: 'Profissional',
  });
  const [seoForm, setSeoForm] = useState({
    title: '',
    description: '',
    keywords: '',
    schemaEnabled: true,
  });
  const [siteSections, setSiteSections] = useState<Array<{ id: string; name: string; active: boolean }>>([
    { id: 'hero', name: 'Hero', active: true },
    { id: 'sobre', name: 'Sobre', active: true },
    { id: 'servicos', name: 'Serviços', active: true },
    { id: 'diferenciais', name: 'Diferenciais', active: true },
    { id: 'contato', name: 'Contato', active: true },
    { id: 'faq', name: 'FAQ', active: true },
    { id: 'rodape', name: 'Rodapé', active: true },
  ]);
  const [newSectionName, setNewSectionName] = useState('');
  const [selectedTemplateCard, setSelectedTemplateCard] = useState<'V1' | 'V2' | 'V3' | null>(null);
  const [previewModal, setPreviewModal] = useState<{ variantCode: 'V1' | 'V2' | 'V3'; url: string; title: string } | null>(null);
  const [templateSending, setTemplateSending] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showSeoModal, setShowSeoModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [promptVariantTab, setPromptVariantTab] = useState<'V1' | 'V2' | 'V3'>('V1');
  const [variantPrompts, setVariantPrompts] = useState<Record<'V1' | 'V2' | 'V3', string>>({
    V1: '',
    V2: '',
    V3: '',
  });
  const [brandPalette, setBrandPalette] = useState<string[]>(['#0A1A2F', '#FF8A00', '#1E3A5F', '#0F9F6F']);
  const [templateForm, setTemplateForm] = useState({
    entryFile: 'index.html',
    templateModelCode: 'template_v1_institucional_1pagina',
    copyMode: 'if_empty_or_missing',
    releaseVersion: '',
    variantCode: 'V1',
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
    const promptJson = body.prompt?.latest?.promptJson as
      | {
          brand?: { cores?: string; tom?: string };
          conteudo?: { objetivo?: string; publico?: string };
          seo?: { title?: string; description?: string; keywords?: string; schema_org_localbusiness?: boolean };
          sections?: string[];
          business?: { objetivo_principal?: string; publico_alvo?: string };
          style?: { tom_voz?: string };
          client?: { domain_target?: string };
          content?: { paginas_necessarias?: string[] };
        }
      | null;
    if (promptJson) {
      const parsedPalette = [
        ...(Array.isArray((promptJson as { brand?: { palette?: string[] } })?.brand?.palette)
          ? ((promptJson as { brand?: { palette?: string[] } }).brand?.palette || [])
          : []),
        ...extractHexColors((promptJson as { brand?: { cores?: string } })?.brand?.cores),
      ]
        .map((item) => sanitizeColor(item))
        .filter((item, index, arr) => arr.indexOf(item) === index)
        .slice(0, 6);
      if (parsedPalette.length > 0) {
        setBrandPalette(parsedPalette);
      }
      setQuickBrief({
        objetivo: promptJson?.conteudo?.objetivo || promptJson?.business?.objetivo_principal || '',
        publico: promptJson?.conteudo?.publico || promptJson?.business?.publico_alvo || '',
        cores: promptJson?.brand?.cores || '',
        tom: normalizeTone(promptJson?.brand?.tom || promptJson?.style?.tom_voz || ''),
      });
      setSeoForm((prev) => ({
        ...prev,
        title: String(promptJson?.seo?.title || ''),
        description: String(promptJson?.seo?.description || ''),
        keywords: String(promptJson?.seo?.keywords || ''),
        schemaEnabled: promptJson?.seo?.schema_org_localbusiness !== false,
      }));
      const sectionValues = Array.isArray(promptJson?.sections)
        ? promptJson.sections
        : (Array.isArray(promptJson?.content?.paginas_necessarias) ? promptJson.content.paginas_necessarias : []);
      if (sectionValues.length > 0) {
        setSiteSections(sectionValues.map((name, idx) => ({
          id: `${name}-${idx}`,
          name: String(name),
          active: true,
        })));
      }
      const variantData = (promptJson as { variant_prompts?: Record<string, string>; variantPrompts?: Record<string, string> });
      const variantPromptsPayload = variantData?.variant_prompts || variantData?.variantPrompts || null;
      if (variantPromptsPayload && typeof variantPromptsPayload === 'object') {
        const nextVariants: Record<'V1' | 'V2' | 'V3', string> = {
          V1: String(variantPromptsPayload.V1 || body.prompt?.latest?.promptText || ''),
          V2: String(variantPromptsPayload.V2 || body.prompt?.latest?.promptText || ''),
          V3: String(variantPromptsPayload.V3 || body.prompt?.latest?.promptText || ''),
        };
        setVariantPrompts(nextVariants);
        setPrePromptForm((prev) => ({ ...prev, promptText: nextVariants[promptVariantTab] || nextVariants.V1 }));
      }
    }
    if (body.template?.latest?.entryFile || body.template?.catalog?.[0]?.code || body.activeRelease) {
      const selectedReleaseVersion = body.activeRelease?.version
        ? String(body.activeRelease.version)
        : (body.selectedApprovalVariant?.releaseVersion ? String(body.selectedApprovalVariant.releaseVersion) : '');
      const selectedVariantCode = body.selectedApprovalVariant?.variantCode || body.activeRelease?.variants?.[0]?.variantCode || 'V1';
      const selectedVariantEntry =
        body.activeRelease?.variants?.find((item: { variantCode: string }) => item.variantCode === selectedVariantCode)?.entryFile ||
        body.template?.latest?.entryFile ||
        'index.html';
      setTemplateForm((prev) => ({
        ...prev,
        entryFile: selectedVariantEntry,
        templateModelCode: body.template?.catalog?.find((item: { isDefault: boolean }) => item.isDefault)?.code || prev.templateModelCode,
        copyMode: prev.copyMode || 'if_empty_or_missing',
        releaseVersion: selectedReleaseVersion || prev.releaseVersion,
        variantCode: selectedVariantCode,
      }));
      if (selectedVariantCode) {
        setSelectedTemplateCard(selectedVariantCode);
      }
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

  useEffect(() => {
    const current = variantPrompts[promptVariantTab];
    if (current && current !== prePromptForm.promptText) {
      setPrePromptForm((prev) => ({ ...prev, promptText: current }));
    }
  }, [promptVariantTab, variantPrompts, prePromptForm.promptText]);

  useEffect(() => {
    if (tab !== 'operacao' || operationStageTab !== 'pre_prompt') return;
    const hasAny = Boolean(variantPrompts.V1 || variantPrompts.V2 || variantPrompts.V3);
    if (!hasAny) {
      refreshVariantPrompts(false);
    }
  }, [tab, operationStageTab, templateForm.releaseVersion]);

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
    const resolvedVariants = {
      ...variantPrompts,
      [promptVariantTab]: prePromptForm.promptText.trim() || variantPrompts[promptVariantTab] || buildConditionalPromptForVariant(promptVariantTab),
    } as Record<'V1' | 'V2' | 'V3', string>;
    setVariantPrompts(resolvedVariants);
    const promptJson = buildPromptJsonFromEditor(resolvedVariants);
    const promptText = resolvedVariants[promptVariantTab];
    const res = await fetch(`/api/deals/${dealId}/preprompt/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptText, promptJson }),
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

    const resolvedVariants = {
      ...variantPrompts,
      [promptVariantTab]: prePromptForm.promptText.trim() || variantPrompts[promptVariantTab] || buildConditionalPromptForVariant(promptVariantTab),
    } as Record<'V1' | 'V2' | 'V3', string>;
    setVariantPrompts(resolvedVariants);

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
        promptText: resolvedVariants[promptVariantTab],
        promptJson: buildPromptJsonFromEditor(resolvedVariants),
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
    if (hasBlockingAssets) {
      setNotice('Não é possível aprovar: logo e identidade visual são obrigatórios.');
      return;
    }
    const resolvedVariants = {
      ...variantPrompts,
      [promptVariantTab]: prePromptForm.promptText.trim() || variantPrompts[promptVariantTab] || buildConditionalPromptForVariant(promptVariantTab),
    } as Record<'V1' | 'V2' | 'V3', string>;
    setVariantPrompts(resolvedVariants);
    const promptJson = buildPromptJsonFromEditor(resolvedVariants);
    const promptText = resolvedVariants[promptVariantTab];
    const res = await fetch(`/api/deals/${dealId}/preprompt/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText,
        promptJson,
        templateModelCode: templateForm.templateModelCode || null,
        copyMode: templateForm.copyMode || 'if_empty_or_missing',
        releaseVersion: templateForm.releaseVersion ? Number(templateForm.releaseVersion) : null,
        templateAppliedAllVariants: true,
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

  async function sendTemplateForApproval(
    templateRevisionId?: string,
    releaseVersionOverride?: number | null,
    variantCodeOverride?: string | null,
  ) {
    if (!templateRevisionId && !templateForm.releaseVersion) {
      setNotice('Selecione uma release e variante antes de enviar aprovação.');
      return;
    }
    setApprovalSending(true);
    const res = await fetch(`/api/deals/${dealId}/template/send-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateRevisionId: templateRevisionId || null,
        releaseVersion: releaseVersionOverride ?? (templateForm.releaseVersion ? Number(templateForm.releaseVersion) : null),
        variantCode: variantCodeOverride || templateForm.variantCode || 'V1',
      }),
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
  const publicationReady = operationFlow?.publication?.summary?.ready || false;
  const releaseOptions = operationFlow?.releases || [];
  const selectedRelease =
    releaseOptions.find((item) => String(item.version) === String(templateForm.releaseVersion || '')) ||
    operationFlow?.activeRelease ||
    null;
  const promptBadge = normalizeStatusBadge(operationFlow?.prompt?.latest?.status);
  const assetsSummary = operationFlow?.assets?.summary;
  const missingAssets = [
    assetsSummary?.logo?.status !== 'received' ? 'logo' : null,
    assetsSummary?.identidadeVisual?.status !== 'received' ? 'identidade visual' : null,
    assetsSummary?.conteudo?.status === 'missing' ? 'textos/imagens' : null,
  ].filter(Boolean) as string[];
  const hasBlockingAssets = missingAssets.includes('logo') || missingAssets.includes('identidade visual');
  const selectedTemplateMeta = selectedTemplateCard ? TEMPLATE_VARIANT_SHOWCASE[selectedTemplateCard] : null;
  const selectedTemplateVariant =
    selectedTemplateCard && selectedRelease
      ? selectedRelease.variants.find((item) => item.variantCode === selectedTemplateCard) || null
      : null;

  function queueAssetRequest(item: string) {
    setPrePromptForm((prev) => {
      const current = prev.requestItems
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (current.includes(item)) return prev;
      return {
        ...prev,
        requestItems: [...current, item].join('\n'),
      };
    });
    setNotice(`Item adicionado à solicitação: ${item}`);
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSiteSections((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const current = copy[index];
      copy[index] = copy[nextIndex];
      copy[nextIndex] = current;
      return copy;
    });
  }

  function removeSection(id: string) {
    setSiteSections((prev) => prev.filter((item) => item.id !== id));
  }

  function addSection() {
    const name = newSectionName.trim();
    if (!name) return;
    setSiteSections((prev) => [...prev, { id: `${name}-${Date.now()}`, name, active: true }]);
    setNewSectionName('');
  }

  function buildPromptJsonFromEditor(variantPromptsOverride?: Record<'V1' | 'V2' | 'V3', string>) {
    const activeSections = siteSections.filter((item) => item.active).map((item) => item.name);
    const palette = brandPalette.map((item) => sanitizeColor(item)).filter((item, index, arr) => arr.indexOf(item) === index);
    const effectiveVariantPrompts = variantPromptsOverride || variantPrompts;
    return {
      task: 'personalizar_templates_site',
      version: '2.1',
      generatedAt: new Date().toISOString(),
      client: {
        name: data?.organization?.legalName || data?.deal.contactName || data?.deal.title || '',
        contactEmail: data?.deal.contactEmail || data?.organization?.billingEmail || '',
        domain: data?.organization?.domain || '',
        dealId: data?.deal.id || '',
        releaseVersion: selectedRelease?.version || null,
        releaseRoot: selectedRelease?.projectRoot || '',
      },
      identity: {
        toneOfVoice: quickBrief.tom || 'Profissional',
        colorPalette: palette,
        colorPaletteRaw: quickBrief.cores || palette.join(', '),
        logoStatus: assetsSummary?.logo?.status || 'missing',
        logoFiles: assetsSummary?.logo?.count || 0,
        manualStatus: assetsSummary?.identidadeVisual?.status || 'missing',
      },
      business: {
        objective: quickBrief.objetivo || '',
        audience: quickBrief.publico || '',
        product: data?.deal.productCode || data?.deal.planCode || data?.deal.intent || '',
        valueCents: data?.deal.valueCents || 0,
      },
      site: {
        sections: activeSections,
        seo: {
          title: seoForm.title || '',
          description: seoForm.description || '',
          keywords: seoForm.keywords || '',
          schemaLocalBusiness: seoForm.schemaEnabled,
        },
      },
      assets: {
        uploadPath: operationFlow?.assets?.uploadPath || '',
        summary: assetsSummary || null,
        missingAssets,
      },
      workflow: {
        prePromptStatus: operationFlow?.prompt?.latest?.status || 'DRAFT',
        requestItems: prePromptForm.requestItems
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      },
      variants: {
        V1: {
          structure: PROMPT_VARIANT_TASKS.V1.structure,
          rules: PROMPT_VARIANT_TASKS.V1.hardRules,
          path: selectedRelease?.variants?.find((item) => item.variantCode === 'V1')?.folderPath || '',
          prompt: effectiveVariantPrompts.V1 || '',
        },
        V2: {
          structure: PROMPT_VARIANT_TASKS.V2.structure,
          rules: PROMPT_VARIANT_TASKS.V2.hardRules,
          path: selectedRelease?.variants?.find((item) => item.variantCode === 'V2')?.folderPath || '',
          prompt: effectiveVariantPrompts.V2 || '',
        },
        V3: {
          structure: PROMPT_VARIANT_TASKS.V3.structure,
          rules: PROMPT_VARIANT_TASKS.V3.hardRules,
          path: selectedRelease?.variants?.find((item) => item.variantCode === 'V3')?.folderPath || '',
          prompt: effectiveVariantPrompts.V3 || '',
        },
      },
      variant_prompts: effectiveVariantPrompts,
    };
  }

  function buildConditionalPromptForVariant(variantCode: 'V1' | 'V2' | 'V3') {
    const variant = PROMPT_VARIANT_TASKS[variantCode];
    const activeSections = siteSections.filter((item) => item.active).map((item) => item.name);
    const palette = brandPalette.map((item) => sanitizeColor(item));
    const variantFolder =
      selectedRelease?.variants?.find((item) => item.variantCode === variantCode)?.folderPath ||
      `${selectedRelease?.projectRoot || '/home/server/projects/clientes/cliente'}/modelo_${variantCode.toLowerCase()}`;
    const payload = {
      variant: variantCode,
      objective: quickBrief.objetivo || '',
      audience: quickBrief.publico || '',
      tone: quickBrief.tom || 'Profissional',
      palette,
      sections: activeSections,
      seo: {
        title: seoForm.title || '',
        description: seoForm.description || '',
        keywords: seoForm.keywords || '',
        schema_localbusiness: seoForm.schemaEnabled,
      },
      assets: {
        logo_status: assetsSummary?.logo?.status || 'missing',
        logo_files: assetsSummary?.logo?.count || 0,
        manual_status: assetsSummary?.identidadeVisual?.status || 'missing',
        content_status: assetsSummary?.conteudo?.status || 'missing',
        upload_path: operationFlow?.assets?.uploadPath || '',
      },
      paths: {
        client_root: selectedRelease?.projectRoot || '',
        variant_root: variantFolder,
      },
      hard_rules: variant.hardRules,
    };
    return [
      `# Prompt Operacional Site24h - ${variantCode}`,
      '',
      '## Objetivo',
      `Personalizar o template ${variantCode} para o cliente com fidelidade visual, responsividade e foco em conversão.`,
      '',
      '## Contexto do Cliente',
      `- Nome: ${data?.organization?.legalName || data?.deal.contactName || data?.deal.title || '-'}`,
      `- Produto/Plano: ${data?.deal.productCode || data?.deal.planCode || data?.deal.intent || '-'}`,
      `- Domínio alvo: ${data?.organization?.domain || 'não informado'}`,
      `- Pasta da variante: ${variantFolder}`,
      `- Estrutura alvo: ${variant.structure}`,
      '',
      '## Regras condicionais obrigatórias',
      '- Se `assets.logo_status` for `missing`: criar `assets/logo_placeholder.svg` mantendo a paleta e tipografia da marca.',
      '- Se `assets.manual_status` for `received`: priorizar paleta e estilo descritos no manual em detrimento de defaults.',
      '- Se `assets.content_status` for `missing`: gerar textos provisórios coerentes com o objetivo, mantendo tom de voz definido.',
      '- Nunca quebrar estrutura mobile e desktop do template base.',
      ...variant.hardRules.map((rule) => `- ${rule}`),
      '',
      '## Checklist técnico da execução',
      '1. Carregar arquivos do template base desta variante (HTML/CSS/JS).',
      '2. Aplicar identidade visual (cores, logo, tom de voz, CTA).',
      '3. Reescrever conteúdo das seções ativas com foco no objetivo do negócio.',
      '4. Validar SEO local (title, description, keywords e schema quando ativo).',
      '5. Validar responsividade completa (375, 768, 1024, 1366+).',
      '6. Gerar versão final pronta para preview em `index.html` da variante.',
      '',
      '## Dados estruturados',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
      '',
      '## Resultado esperado',
      `Entregar variante ${variantCode} pronta para validação no CRM com layout profissional, sem erros de CSS/JS e com assets organizados na pasta da variante.`,
    ].join('\n');
  }

  function refreshVariantPrompts(autoNotice = true) {
    const next = {
      V1: buildConditionalPromptForVariant('V1'),
      V2: buildConditionalPromptForVariant('V2'),
      V3: buildConditionalPromptForVariant('V3'),
    };
    setVariantPrompts(next);
    setPrePromptForm((prev) => ({
      ...prev,
      promptText: next[promptVariantTab],
    }));
    if (autoNotice) {
      setNotice('Prompts V1/V2/V3 atualizados com as configurações atuais.');
    }
    return next;
  }

  async function copyFullPrompt() {
    const text = variantPrompts[promptVariantTab] || prePromptForm.promptText || buildConditionalPromptForVariant(promptVariantTab);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Prompt ${promptVariantTab} copiado para área de transferência.`);
    } catch {
      setNotice('Não foi possível copiar automaticamente o prompt.');
    }
  }

  async function approveSelectedTemplateToClient() {
    if (!selectedTemplateCard || !selectedRelease) {
      setNotice('Selecione uma versão V1, V2 ou V3 antes de enviar.');
      return;
    }
    const variant = selectedRelease.variants.find((item) => item.variantCode === selectedTemplateCard);
    if (!variant) {
      setNotice('Variante não encontrada na release ativa.');
      return;
    }
    setTemplateSending(true);
    try {
      const generateResponse = await fetch(`/api/deals/${dealId}/template/generate-record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseVersion: selectedRelease.version,
          variantCode: selectedTemplateCard,
          entryFile: variant.entryFile || 'index.html',
          status: 'APPROVED_INTERNAL',
        }),
      });
      const generateBody = await generateResponse.json();
      if (!generateResponse.ok) {
        setNotice(generateBody.error || 'Falha ao preparar template selecionado.');
        return;
      }

      const sendResponse = await fetch(`/api/deals/${dealId}/template/send-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateRevisionId: generateBody?.revision?.id || null,
          releaseVersion: selectedRelease.version,
          variantCode: selectedTemplateCard,
        }),
      });
      const sendBody = await sendResponse.json();
      if (!sendResponse.ok) {
        setNotice(sendBody.error || 'Falha ao enviar versão selecionada para aprovação do cliente.');
        return;
      }
      setNotice(`Template ${selectedTemplateCard} enviado para aprovação do cliente.`);
      await loadOperationFlow();
      await loadDeal();
    } finally {
      setTemplateSending(false);
    }
  }

  function openVariantPreview(variantCode: 'V1' | 'V2' | 'V3', mode: 'tab' | 'modal' = 'tab') {
    const variant = selectedRelease?.variants?.find((item) => item.variantCode === variantCode) || null;
    const url = variant?.previewUrl || null;
    if (!url) {
      setNotice('Preview ainda indisponível para esta variante.');
      return;
    }
    if (mode === 'modal') {
      setPreviewModal({
        variantCode,
        url,
        title: `${variantCode} - ${TEMPLATE_VARIANT_SHOWCASE[variantCode].title}`,
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
        <div className="deal-tab-panel deal-operation-panel">
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

              {operationStageTab === 'briefing_pendente' ? (
                <div className="operation-card">
                  <div className="operation-card-head">
                    <h4>Briefing pendente</h4>
                    <span className="status-chip atrasado">Aguardando cliente</span>
                  </div>
                  <p className="muted">
                    Nesta etapa o cliente precisa preencher o briefing no portal. O histórico completo desta operação fica na aba Atividades.
                  </p>
                  <div className="operation-actions">
                    <button type="button" className="secondary-btn" onClick={() => moveOperationStage('pre_prompt')}>
                      Avançar para Pré-prompt
                    </button>
                  </div>
                </div>
              ) : null}

              {operationStageTab === 'pre_prompt' ? (
                <div className="operation-card preprompt-editor-shell">
                  <header className="preprompt-editor-header">
                    <div>
                      <h4><i className="bi bi-pencil-square" aria-hidden="true" /> Editor de Pré-prompt</h4>
                      <p>Prompt condicional estruturado por variante para execução no VS Code/Copilot.</p>
                      <div className="preprompt-client-box">
                        <span>Cliente ativo</span>
                        <strong>{data.organization?.legalName || data.deal.contactName || data.deal.title}</strong>
                      </div>
                    </div>
                    <div className="preprompt-header-status">
                      <span className={`preprompt-status-badge ${promptBadge.className}`}>{promptBadge.label}</span>
                      <small>
                        Última revisão: {operationFlow?.prompt?.latest ? `v${operationFlow.prompt.latest.version} (${operationFlow.prompt.latest.status})` : 'sem revisão'}
                      </small>
                      <small>{dateTime(operationFlow?.prompt?.latest?.updatedAt || null)}</small>
                    </div>
                  </header>

                  <div className="preprompt-content-grid">
                    <div className="preprompt-left-col">
                      <section className="preprompt-block">
                        <h5><i className="bi bi-code-slash" aria-hidden="true" /> Prompt (editor)</h5>
                        <div className="prompt-variant-tabs">
                          {(['V1', 'V2', 'V3'] as const).map((variant) => (
                            <button
                              key={variant}
                              type="button"
                              className={promptVariantTab === variant ? 'active' : ''}
                              onClick={() => {
                                setPromptVariantTab(variant);
                                setPrePromptForm((prev) => ({
                                  ...prev,
                                  promptText: variantPrompts[variant] || prev.promptText,
                                }));
                              }}
                            >
                              {variant}
                            </button>
                          ))}
                        </div>
                        <div className="prompt-variant-note">
                          <strong>{TEMPLATE_VARIANT_SHOWCASE[promptVariantTab].title}</strong>
                          <small>{TEMPLATE_VARIANT_SHOWCASE[promptVariantTab].description}</small>
                        </div>
                        <textarea
                          rows={22}
                          value={prePromptForm.promptText}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPrePromptForm((prev) => ({ ...prev, promptText: value }));
                            setVariantPrompts((prev) => ({ ...prev, [promptVariantTab]: value }));
                          }}
                          placeholder="Prompt estruturado condicional da variante selecionada."
                        />
                        <small className="muted">
                          Cada aba contém o prompt completo e condicional para a variante correspondente ({promptVariantTab}).
                        </small>
                      </section>
                    </div>

                    <aside className="preprompt-right-col">
                      <section className="preprompt-block">
                        <h5><i className="bi bi-paperclip" aria-hidden="true" /> Assets e conteúdo</h5>
                        <div className="asset-status-list">
                          <div className={`asset-status-item ${assetsSummary?.logo?.status || 'missing'}`}>
                            <div>
                              <strong>Logo</strong>
                              <small>{assetsSummary?.logo?.count || 0} arquivo(s)</small>
                            </div>
                            <button type="button" className="secondary-btn" onClick={() => queueAssetRequest('Logo em SVG ou PNG (alta qualidade)')}>
                              Solicitar
                            </button>
                          </div>
                          <div className={`asset-status-item ${assetsSummary?.identidadeVisual?.status || 'missing'}`}>
                            <div>
                              <strong>Identidade visual</strong>
                              <small>{assetsSummary?.identidadeVisual?.count || 0} arquivo(s)</small>
                            </div>
                            <button type="button" className="secondary-btn" onClick={() => queueAssetRequest('Manual de marca / identidade visual')}>
                              Solicitar
                            </button>
                          </div>
                          <div className={`asset-status-item ${assetsSummary?.conteudo?.status || 'missing'}`}>
                            <div>
                              <strong>Textos e imagens</strong>
                              <small>{assetsSummary?.conteudo?.count || 0} arquivo(s)</small>
                            </div>
                            <button type="button" className="secondary-btn" onClick={() => queueAssetRequest('Textos institucionais e imagens para o site')}>
                              Solicitar
                            </button>
                          </div>
                        </div>
                        <small className="muted">
                          Pasta de upload: {operationFlow?.assets?.uploadPath || '-'}
                        </small>
                        <div className="brand-palette-inline">
                          {brandPalette.map((color, idx) => (
                            <span key={`${color}-${idx}`} style={{ background: sanitizeColor(color) }} title={sanitizeColor(color)} />
                          ))}
                        </div>
                      </section>

                      <section className="preprompt-block">
                        <h5><i className="bi bi-envelope-paper" aria-hidden="true" /> Solicitação de informações</h5>
                        <label>Assunto</label>
                        <input
                          value={prePromptForm.subject}
                          onChange={(e) => setPrePromptForm((prev) => ({ ...prev, subject: e.target.value }))}
                        />
                        <label>Prazo</label>
                        <input
                          type="datetime-local"
                          value={prePromptForm.dueAt}
                          onChange={(e) => setPrePromptForm((prev) => ({ ...prev, dueAt: e.target.value }))}
                        />
                        <label>Itens solicitados (um por linha)</label>
                        <textarea
                          rows={5}
                          value={prePromptForm.requestItems}
                          onChange={(e) => setPrePromptForm((prev) => ({ ...prev, requestItems: e.target.value }))}
                        />
                        <label>Mensagem complementar</label>
                        <textarea
                          rows={4}
                          value={prePromptForm.message}
                          onChange={(e) => setPrePromptForm((prev) => ({ ...prev, message: e.target.value }))}
                        />
                        <div className="operation-actions">
                          <button type="button" className="secondary-btn" onClick={() => setShowEmailPreview(true)}>
                            <i className="bi bi-eye" aria-hidden="true" /> Pré-visualizar e-mail
                          </button>
                          <button type="button" className="secondary-btn" onClick={requestPrePromptInfo}>
                            <i className="bi bi-send" aria-hidden="true" /> Enviar solicitação
                          </button>
                        </div>
                      </section>

                      <section className="preprompt-block">
                        <h5><i className="bi bi-sliders2-vertical" aria-hidden="true" /> Ferramentas de edição</h5>
                        <button type="button" className="secondary-btn btn-press" onClick={() => setShowBrandModal(true)}>
                          <i className="bi bi-palette2" aria-hidden="true" /> Identidade visual e paleta
                        </button>
                        <button type="button" className="secondary-btn btn-press" onClick={() => setShowSectionsModal(true)}>
                          <i className="bi bi-layout-text-window-reverse" aria-hidden="true" /> Seções do site
                        </button>
                        <button type="button" className="secondary-btn btn-press" onClick={() => setShowSeoModal(true)}>
                          <i className="bi bi-search" aria-hidden="true" /> SEO Local
                        </button>
                        <label>Release ativa</label>
                        <select
                          value={templateForm.releaseVersion}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, releaseVersion: e.target.value }))}
                        >
                          {releaseOptions.length === 0 ? <option value="">Sem release provisionada</option> : null}
                          {releaseOptions.map((release) => (
                            <option key={release.id} value={String(release.version)}>
                              {release.label} ({release.status})
                            </option>
                          ))}
                        </select>
                        <small className="muted">
                          Ao salvar alterações nos modais, os prompts V1/V2/V3 são atualizados automaticamente.
                        </small>
                        <small className="muted">
                          Padrão de identidade: <code>storage/site-models/brand-identity/KODDAHUB_IDENTITY_STANDARD.md</code>
                        </small>
                      </section>
                    </aside>
                  </div>

                  <footer className="preprompt-action-bar">
                    <div className="operation-actions">
                      <button type="button" className="secondary-btn" onClick={savePrePromptDraft}>
                        <i className="bi bi-save" aria-hidden="true" /> Salvar rascunho
                      </button>
                      <button type="button" className="secondary-btn" onClick={requestPrePromptInfo}>
                        <i className="bi bi-envelope" aria-hidden="true" /> Solicitar informações
                      </button>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={approvePrePrompt}
                        disabled={hasBlockingAssets}
                        title={hasBlockingAssets ? 'Logo e identidade visual são obrigatórios para aprovar.' : 'Aprovar pré-prompt'}
                      >
                        <i className="bi bi-check2-circle" aria-hidden="true" /> Aprovar pré-prompt
                      </button>
                      <button type="button" className="secondary-btn" onClick={copyFullPrompt}>
                        <i className="bi bi-clipboard" aria-hidden="true" /> Copiar prompt
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => openVariantPreview(selectedTemplateCard || 'V1')}
                      >
                        <i className="bi bi-display" aria-hidden="true" /> Preview do site
                      </button>
                    </div>
                    <div className="preprompt-progress">
                      <span className="done">Briefing</span>
                      <span className="current">Revisão</span>
                      <span className={hasBlockingAssets ? 'pending' : 'done'}>Assets</span>
                      <span className="pending">Aprovação</span>
                    </div>
                    {missingAssets.length > 0 ? (
                      <small className="muted">
                        Pendências de assets: {missingAssets.join(', ')}.
                      </small>
                    ) : null}
                  </footer>
                </div>
              ) : null}

              {(operationStageTab === 'template_v1' || operationStageTab === 'ajustes') ? (
                <div className="operation-card template-v1-simplified">
                  <header className="template-v1-header">
                    <div>
                      <h4><i className="bi bi-check2-square" aria-hidden="true" /> Templates gerados</h4>
                      <p>Visualize as versões V1, V2 e V3 e escolha qual será enviada para aprovação do cliente.</p>
                    </div>
                    <div className="template-folder-box">
                      <label>Pasta do cliente</label>
                      <code>{selectedRelease?.projectRoot || '-'}</code>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(selectedRelease?.projectRoot || '');
                            setNotice('Caminho da pasta copiado.');
                          } catch {
                            setNotice('Não foi possível copiar o caminho da pasta.');
                          }
                        }}
                      >
                        <i className="bi bi-clipboard" aria-hidden="true" /> Copiar caminho
                      </button>
                    </div>
                  </header>

                  <div className="template-showcase-grid">
                    {(['V1', 'V2', 'V3'] as const).map((variantCode) => {
                      const meta = TEMPLATE_VARIANT_SHOWCASE[variantCode];
                      const variant = selectedRelease?.variants?.find((item) => item.variantCode === variantCode) || null;
                      const isSelected = selectedTemplateCard === variantCode;
                      return (
                        <article
                          key={variantCode}
                          className={`template-showcase-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedTemplateCard(variantCode);
                            setTemplateForm((prev) => ({
                              ...prev,
                              variantCode,
                              releaseVersion: selectedRelease ? String(selectedRelease.version) : prev.releaseVersion,
                              entryFile: variant?.entryFile || prev.entryFile,
                            }));
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedTemplateCard(variantCode);
                              setTemplateForm((prev) => ({
                                ...prev,
                                variantCode,
                                releaseVersion: selectedRelease ? String(selectedRelease.version) : prev.releaseVersion,
                                entryFile: variant?.entryFile || prev.entryFile,
                              }));
                            }
                          }}
                        >
                          <header>
                            <h5><i className={`bi ${meta.icon}`} aria-hidden="true" /> {meta.title}</h5>
                            <p>{meta.description}</p>
                          </header>
                          <ul>
                            {meta.features.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                          <div className="template-showcase-footer">
                            <small>{variant?.folderPath || '-'}</small>
                            <div className="operation-actions">
                              <button type="button" className="secondary-btn" onClick={(e) => {
                                e.stopPropagation();
                                openVariantPreview(variantCode);
                              }}>
                                <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Abrir
                              </button>
                              <button type="button" className="secondary-btn" onClick={(e) => {
                                e.stopPropagation();
                                openVariantPreview(variantCode, 'modal');
                              }}>
                                <i className="bi bi-eye" aria-hidden="true" /> Preview
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <section className="template-selection-panel">
                    <div>
                      {selectedTemplateMeta ? (
                        <>
                          <strong>{selectedTemplateMeta.title} selecionado</strong>
                          <small>
                            {selectedTemplateVariant?.folderPath || '-'} • {selectedTemplateVariant?.entryFile || 'index.html'}
                          </small>
                        </>
                      ) : (
                        <small>Nenhum template selecionado. Clique em um card para escolher a versão.</small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={approveSelectedTemplateToClient}
                      disabled={!selectedTemplateCard || templateSending}
                    >
                      <i className="bi bi-send-check" aria-hidden="true" />
                      {templateSending ? ' Enviando...' : ' Enviar para aprovação do cliente'}
                    </button>
                  </section>

                  <section className="template-quick-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={async () => {
                        const links = (selectedRelease?.variants || [])
                          .map((item) => `${item.variantCode}: ${item.previewUrl || '-'}`)
                          .join('\n');
                        try {
                          await navigator.clipboard.writeText(links);
                          setNotice('Links de preview copiados.');
                        } catch {
                          setNotice('Não foi possível copiar links de preview.');
                        }
                      }}
                    >
                      <i className="bi bi-link-45deg" aria-hidden="true" /> Copiar links de preview
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => moveOperationStage('aprovacao_cliente')}>
                      <i className="bi bi-arrow-right-circle" aria-hidden="true" /> Ir para Aprovação do cliente
                    </button>
                  </section>
                </div>
              ) : null}

              {operationStageTab === 'aprovacao_cliente' ? (
                <div className="operation-card">
                  <div className="operation-card-head">
                    <h4>Aprovação do cliente</h4>
                    <span className="status-chip ativo">{operationFlow?.approval?.latest?.status || 'Sem envio'}</span>
                  </div>
                  <p className="muted">Envie ou reenvie o link temporário para validação do cliente no portal.</p>
                  <div className="template-form-grid">
                    <div>
                      <label>Release para envio</label>
                      <select
                        value={templateForm.releaseVersion}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, releaseVersion: e.target.value }))}
                      >
                        {releaseOptions.length === 0 ? <option value="">Sem release provisionada</option> : null}
                        {releaseOptions.map((release) => (
                          <option key={release.id} value={String(release.version)}>
                            {release.label} ({release.status})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Variante para aprovação</label>
                      <select
                        value={templateForm.variantCode}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, variantCode: e.target.value }))}
                      >
                        <option value="V1">V1</option>
                        <option value="V2">V2</option>
                        <option value="V3">V3</option>
                      </select>
                    </div>
                  </div>
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
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => sendTemplateForApproval(
                        undefined,
                        templateForm.releaseVersion ? Number(templateForm.releaseVersion) : null,
                        templateForm.variantCode,
                      )}
                      disabled={approvalSending}
                    >
                      {approvalSending ? 'Enviando...' : 'Enviar/Reenviar para aprovação'}
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => moveOperationStage('publicacao')}>
                      Mover para publicação
                    </button>
                  </div>
                </div>
              ) : null}

              {operationStageTab === 'publicacao' ? (
                <div className="operation-card">
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
                </div>
              ) : null}

              {operationStageTab === 'publicado' ? (
                <div className="operation-card">
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
                </div>
              ) : null}
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

      {showBrandModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Editar identidade visual">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowBrandModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Identidade visual e paleta</h3>
              <button type="button" onClick={() => setShowBrandModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <div className="quick-brief-grid">
              <label>
                <span>Objetivo</span>
                <input
                  value={quickBrief.objetivo}
                  onChange={(e) => setQuickBrief((prev) => ({ ...prev, objetivo: e.target.value }))}
                />
              </label>
              <label>
                <span>Público-alvo</span>
                <input
                  value={quickBrief.publico}
                  onChange={(e) => setQuickBrief((prev) => ({ ...prev, publico: e.target.value }))}
                />
              </label>
              <label>
                <span>Tom de voz</span>
                <select
                  value={quickBrief.tom}
                  onChange={(e) => setQuickBrief((prev) => ({ ...prev, tom: e.target.value }))}
                >
                  <option value="Profissional">Profissional</option>
                  <option value="Descontraído">Descontraído</option>
                  <option value="Inspirador">Inspirador</option>
                  <option value="Técnico">Técnico</option>
                  <option value="Luxuoso">Luxuoso</option>
                  <option value="Equilibrado">Equilibrado</option>
                </select>
              </label>
              <label>
                <span>Cores (texto)</span>
                <input
                  value={quickBrief.cores}
                  onChange={(e) => setQuickBrief((prev) => ({ ...prev, cores: e.target.value }))}
                  placeholder="#0A1A2F, #FF8A00, #1E3A5F"
                />
              </label>
            </div>
            <div className="palette-editor-grid">
              {brandPalette.map((color, idx) => (
                <label key={`palette-${idx}`}>
                  <span>Cor {idx + 1}</span>
                  <div className="palette-picker-line">
                    <input
                      type="color"
                      value={sanitizeColor(color)}
                      onChange={(e) => {
                        const value = sanitizeColor(e.target.value);
                        setBrandPalette((prev) => prev.map((item, itemIdx) => (itemIdx === idx ? value : item)));
                      }}
                    />
                    <input
                      value={sanitizeColor(color)}
                      onChange={(e) => {
                        const value = sanitizeColor(e.target.value);
                        setBrandPalette((prev) => prev.map((item, itemIdx) => (itemIdx === idx ? value : item)));
                      }}
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="operation-meta-grid" style={{ marginTop: 8 }}>
              <div>
                <label>Logo</label>
                <strong>{assetsSummary?.logo?.status || '-'}</strong>
              </div>
              <div>
                <label>Identidade visual</label>
                <strong>{assetsSummary?.identidadeVisual?.status || '-'}</strong>
              </div>
              <div>
                <label>Arquivos de conteúdo</label>
                <strong>{assetsSummary?.conteudo?.count || 0}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowBrandModal(false)}>Cancelar</button>
              <button
                type="button"
                className="primary-btn btn-press"
                onClick={() => {
                  const normalizedPalette = brandPalette.map((item) => sanitizeColor(item));
                  setBrandPalette(normalizedPalette);
                  setQuickBrief((prev) => ({
                    ...prev,
                    cores: prev.cores || normalizedPalette.join(', '),
                  }));
                  refreshVariantPrompts(false);
                  setShowBrandModal(false);
                  setNotice('Identidade visual aplicada aos prompts V1/V2/V3.');
                }}
              >
                Aplicar ao prompt
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSectionsModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Editar seções do site">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowSectionsModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Seções do site</h3>
              <button type="button" onClick={() => setShowSectionsModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <div className="sections-editor">
              {siteSections.map((item, index) => (
                <div key={item.id} className={`section-row ${item.active ? 'active' : 'inactive'}`}>
                  <button type="button" className="icon-btn" title="Subir" onClick={() => moveSection(index, -1)} disabled={index === 0}>
                    <i className="bi bi-arrow-up" aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-btn" title="Descer" onClick={() => moveSection(index, 1)} disabled={index === siteSections.length - 1}>
                    <i className="bi bi-arrow-down" aria-hidden="true" />
                  </button>
                  <input
                    value={item.name}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSiteSections((prev) => prev.map((row) => (row.id === item.id ? { ...row, name: value } : row)));
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title={item.active ? 'Desativar seção' : 'Ativar seção'}
                    onClick={() => setSiteSections((prev) => prev.map((row) => (row.id === item.id ? { ...row, active: !row.active } : row)))}
                  >
                    <i className={`bi ${item.active ? 'bi-toggle-on' : 'bi-toggle-off'}`} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-btn danger" title="Remover seção" onClick={() => removeSection(item.id)}>
                    <i className="bi bi-trash3" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="section-add-row">
                <input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="Nova seção"
                />
                <button type="button" className="secondary-btn" onClick={addSection}>
                  <i className="bi bi-plus-lg" aria-hidden="true" /> Adicionar
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowSectionsModal(false)}>Cancelar</button>
              <button
                type="button"
                className="primary-btn btn-press"
                onClick={() => {
                  refreshVariantPrompts(false);
                  setShowSectionsModal(false);
                  setNotice('Seções aplicadas aos prompts V1/V2/V3.');
                }}
              >
                Aplicar ao prompt
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSeoModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Editar SEO local">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowSeoModal(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>SEO Local</h3>
              <button type="button" onClick={() => setShowSeoModal(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <div className="seo-grid">
              <label>
                <span>Title</span>
                <input
                  maxLength={60}
                  value={seoForm.title}
                  onChange={(e) => setSeoForm((prev) => ({ ...prev, title: e.target.value }))}
                />
                <small>{seoForm.title.length}/60</small>
              </label>
              <label>
                <span>Description</span>
                <textarea
                  maxLength={160}
                  rows={3}
                  value={seoForm.description}
                  onChange={(e) => setSeoForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <small>{seoForm.description.length}/160</small>
              </label>
              <label>
                <span>Keywords</span>
                <input
                  value={seoForm.keywords}
                  onChange={(e) => setSeoForm((prev) => ({ ...prev, keywords: e.target.value }))}
                />
              </label>
              <label className="toggle-line">
                <span>Schema.org LocalBusiness</span>
                <input
                  type="checkbox"
                  checked={seoForm.schemaEnabled}
                  onChange={(e) => setSeoForm((prev) => ({ ...prev, schemaEnabled: e.target.checked }))}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowSeoModal(false)}>Cancelar</button>
              <button
                type="button"
                className="primary-btn btn-press"
                onClick={() => {
                  refreshVariantPrompts(false);
                  setShowSeoModal(false);
                  setNotice('SEO aplicado aos prompts V1/V2/V3.');
                }}
              >
                Aplicar ao prompt
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEmailPreview ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Pré-visualização do e-mail">
          <div className="crm-v2-modal-backdrop" onClick={() => setShowEmailPreview(false)} />
          <div className="crm-v2-modal-content">
            <header>
              <h3>Pré-visualização do e-mail</h3>
              <button type="button" onClick={() => setShowEmailPreview(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <div className="email-preview-body">
              <strong>Assunto:</strong> {prePromptForm.subject}
              <hr />
              <p>Olá! Para avançarmos na criação do seu site, precisamos destas informações:</p>
              <ul>
                {prePromptForm.requestItems
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .map((item) => (
                    <li key={item}>{item}</li>
                  ))}
              </ul>
              <p>{prePromptForm.message || 'Sem mensagem complementar.'}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="secondary-btn" onClick={() => setShowEmailPreview(false)}>Fechar</button>
              <button
                type="button"
                className="primary-btn"
                onClick={async () => {
                  setShowEmailPreview(false);
                  await requestPrePromptInfo();
                }}
              >
                Enviar solicitação
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewModal ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Preview da versão do template">
          <div className="crm-v2-modal-backdrop" onClick={() => setPreviewModal(null)} />
          <div className="crm-v2-modal-content template-preview-modal">
            <header>
              <h3>{previewModal.title}</h3>
              <button type="button" onClick={() => setPreviewModal(null)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <iframe title={previewModal.title} src={previewModal.url} className="template-preview-iframe" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setSelectedTemplateCard(previewModal.variantCode);
                  setTemplateForm((prev) => ({
                    ...prev,
                    variantCode: previewModal.variantCode,
                  }));
                  setPreviewModal(null);
                }}
              >
                Selecionar esta versão
              </button>
              <button type="button" className="secondary-btn" onClick={() => setPreviewModal(null)}>Fechar</button>
            </div>
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
