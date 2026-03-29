'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type CommunicationView =
  | 'overview'
  | 'emails-list'
  | 'emails-create'
  | 'emails-view'
  | 'emails-edit'
  | 'templates-list'
  | 'templates-create'
  | 'templates-view'
  | 'templates-edit'
  | 'automations-list'
  | 'automations-create'
  | 'automations-edit'
  | 'social-list'
  | 'social-create'
  | 'social-edit';

type CommunicationModuleProps = {
  view: CommunicationView;
  recordId?: string;
  setNotice?: (message: string) => void;
};

type ProductItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type SiteItem = {
  id: string;
  productId: string;
  productName: string;
  domain: string;
  isActive: boolean;
};

type EmailItem = {
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
  updatedAt: string;
};

type TemplateItem = {
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
  updatedAt: string;
};

type AutomationItem = {
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
  updatedAt: string;
};

type SocialItem = {
  id: string;
  pageName: string | null;
  instagramUsername: string;
  instagramName: string | null;
  status: string;
  lastSyncedAt: string;
  updatedAt: string;
};

type EmailFormState = {
  id: string;
  productId: string;
  siteId: string;
  emailLabel: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  provider: string;
  isDefault: boolean;
  isActive: boolean;
};

type TemplateFormState = {
  id: string;
  productId: string;
  siteId: string;
  templateName: string;
  templateKey: string;
  category: string;
  subject: string;
  description: string;
  version: number;
  html: string;
  text: string;
  variables: string;
  isActive: boolean;
};

type AutomationFormState = {
  id: string;
  productId: string;
  siteId: string;
  automationName: string;
  eventKey: string;
  templateId: string;
  conditions: string;
  enabled: boolean;
};

type SocialFormState = {
  id: string;
  status: string;
};

type SocialRow = SocialItem & {
  linkedProduct: ProductItem | null;
};

const PAGE_SIZE = 8;

function toDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function toSearch(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

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

function inferTemplateCategory(templateKey: string) {
  const normalized = toSearch(templateKey);
  if (normalized.includes('welcome') || normalized.includes('boas')) return 'boas-vindas';
  if (normalized.includes('reset') || normalized.includes('password')) return 'seguranca';
  if (normalized.includes('billing') || normalized.includes('payment')) return 'financeiro';
  return 'transacional';
}

function inferProductFromSocial(account: SocialItem, products: ProductItem[]) {
  const haystack = `${account.instagramUsername} ${account.instagramName || ''} ${account.pageName || ''}`.toLowerCase();
  return (
    products.find(
      (product) => haystack.includes(product.slug.toLowerCase()) || haystack.includes(product.name.toLowerCase()),
    ) || null
  );
}

function paginateItems<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    totalPages,
    safePage,
    pageItems: items.slice(start, start + PAGE_SIZE),
  };
}

function resolveActiveModule(view: CommunicationView) {
  if (view.startsWith('emails-')) return 'emails';
  if (view.startsWith('templates-')) return 'templates';
  if (view.startsWith('automations-')) return 'automations';
  if (view.startsWith('social-')) return 'social';
  return 'overview';
}

function StatusBadge({
  active,
  activeLabel = 'Ativo',
  inactiveLabel = 'Inativo',
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return <span className={`comm-status ${active ? 'is-active' : 'is-inactive'}`}>{active ? activeLabel : inactiveLabel}</span>;
}

function ProviderBadge({ provider }: { provider: string }) {
  return <span className="comm-provider">{String(provider || 'smtp').toUpperCase()}</span>;
}

function LoadingState({ label = 'Carregando dados...' }: { label?: string }) {
  return <div className="comm-loading">{label}</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="comm-empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
}) {
  return (
    <div className="comm-pagination">
      <button type="button" className="secondary-btn" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Anterior
      </button>
      <span>
        Página {page} de {totalPages}
      </span>
      <button type="button" className="secondary-btn" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Próxima
      </button>
    </div>
  );
}

export function CommunicationModule({ view, recordId, setNotice }: CommunicationModuleProps) {
  const router = useRouter();
  const activeModule = resolveActiveModule(view);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialItem[]>([]);
  const [socialMetaConfigured, setSocialMetaConfigured] = useState(true);
  const [socialConnectUrl, setSocialConnectUrl] = useState('/api/social/instagram/oauth/start?returnTo=/painel-de-controle/social');

  const [emailsPage, setEmailsPage] = useState(1);
  const [templatesPage, setTemplatesPage] = useState(1);
  const [automationsPage, setAutomationsPage] = useState(1);
  const [socialPage, setSocialPage] = useState(1);

  const [emailFilters, setEmailFilters] = useState({
    productId: 'all',
    siteId: 'all',
    status: 'all',
    provider: 'all',
    query: '',
  });
  const [templateFilters, setTemplateFilters] = useState({
    productId: 'all',
    siteId: 'all',
    category: 'all',
    status: 'all',
    query: '',
  });
  const [automationFilters, setAutomationFilters] = useState({
    productId: 'all',
    siteId: 'all',
    eventKey: 'all',
    status: 'all',
  });
  const [socialFilters, setSocialFilters] = useState({
    platform: 'all',
    status: 'all',
    productId: 'all',
    query: '',
  });

  const [previewAutomation, setPreviewAutomation] = useState<AutomationItem | null>(null);

  const [emailForm, setEmailForm] = useState<EmailFormState>({
    id: '',
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
  const [templateForm, setTemplateForm] = useState<TemplateFormState>({
    id: '',
    productId: '',
    siteId: '',
    templateName: '',
    templateKey: '',
    category: 'transacional',
    subject: '',
    description: '',
    version: 1,
    html: '',
    text: '',
    variables: '',
    isActive: true,
  });
  const [automationForm, setAutomationForm] = useState<AutomationFormState>({
    id: '',
    productId: '',
    siteId: '',
    automationName: '',
    eventKey: '',
    templateId: '',
    conditions: '',
    enabled: true,
  });
  const [socialForm, setSocialForm] = useState<SocialFormState>({
    id: '',
    status: 'ACTIVE',
  });

  const notify = useCallback(
    (message: string) => {
      if (setNotice) setNotice(message);
    },
    [setNotice],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productsRes, sitesRes, emailsRes, templatesRes, automationsRes, socialRes] = await Promise.all([
        fetch('/api/control-panel/products'),
        fetch('/api/control-panel/sites'),
        fetch('/api/control-panel/email-accounts'),
        fetch('/api/control-panel/templates'),
        fetch('/api/control-panel/events'),
        fetch('/api/social/instagram/accounts'),
      ]);

      const [productsData, sitesData, emailsData, templatesData, automationsData, socialData] = await Promise.all([
        productsRes.json().catch(() => ({})),
        sitesRes.json().catch(() => ({})),
        emailsRes.json().catch(() => ({})),
        templatesRes.json().catch(() => ({})),
        automationsRes.json().catch(() => ({})),
        socialRes.json().catch(() => ({})),
      ]);

      if (!productsRes.ok) throw new Error(productsData.error || 'Falha ao carregar produtos.');
      if (!sitesRes.ok) throw new Error(sitesData.error || 'Falha ao carregar sites.');
      if (!emailsRes.ok) throw new Error(emailsData.error || 'Falha ao carregar e-mails.');
      if (!templatesRes.ok) throw new Error(templatesData.error || 'Falha ao carregar templates.');
      if (!automationsRes.ok) throw new Error(automationsData.error || 'Falha ao carregar automações.');
      if (!socialRes.ok) throw new Error(socialData.error || 'Falha ao carregar redes sociais.');

      setProducts(productsData.items || []);
      setSites(sitesData.items || []);
      setEmails(emailsData.items || []);
      setTemplates(templatesData.items || []);
      setAutomations(automationsData.items || []);
      setSocialAccounts(socialData.items || []);
      setSocialMetaConfigured(Boolean(socialData.metaConfigured !== false));
      setSocialConnectUrl('/api/social/instagram/oauth/start?returnTo=/painel-de-controle/social');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (products.length === 0) return;
    setEmailForm((prev) => ({ ...prev, productId: prev.productId || products[0].id }));
    setTemplateForm((prev) => ({ ...prev, productId: prev.productId || products[0].id }));
    setAutomationForm((prev) => ({ ...prev, productId: prev.productId || products[0].id }));
  }, [products]);

  useEffect(() => {
    if (templates.length === 0) return;
    setAutomationForm((prev) => ({ ...prev, templateId: prev.templateId || templates[0].id }));
  }, [templates]);

  const emailCurrent = useMemo(() => emails.find((item) => item.id === recordId) || null, [emails, recordId]);
  const templateCurrent = useMemo(() => templates.find((item) => item.id === recordId) || null, [templates, recordId]);
  const automationCurrent = useMemo(
    () => automations.find((item) => item.id === recordId) || null,
    [automations, recordId],
  );
  const socialCurrent = useMemo(
    () => socialAccounts.find((item) => item.id === recordId) || null,
    [socialAccounts, recordId],
  );

  useEffect(() => {
    if (view === 'emails-create') {
      setEmailForm((prev) => ({
        ...prev,
        id: '',
        siteId: '',
        emailLabel: '',
        fromName: '',
        fromEmail: '',
        replyTo: '',
        provider: 'smtp',
        isDefault: false,
        isActive: true,
      }));
      return;
    }

    if ((view === 'emails-edit' || view === 'emails-view') && emailCurrent) {
      setEmailForm({
        id: emailCurrent.id,
        productId: emailCurrent.productId,
        siteId: emailCurrent.siteId || '',
        emailLabel: emailCurrent.emailLabel,
        fromName: emailCurrent.fromName,
        fromEmail: emailCurrent.fromEmail,
        replyTo: emailCurrent.replyTo || '',
        provider: emailCurrent.provider,
        isDefault: emailCurrent.isDefault,
        isActive: emailCurrent.isActive,
      });
    }
  }, [view, emailCurrent]);

  useEffect(() => {
    if (view === 'templates-create') {
      setTemplateForm((prev) => ({
        ...prev,
        id: '',
        siteId: '',
        templateName: '',
        templateKey: '',
        category: 'transacional',
        subject: '',
        description: '',
        version: 1,
        html: '',
        text: '',
        variables: '',
        isActive: true,
      }));
      return;
    }

    if ((view === 'templates-edit' || view === 'templates-view') && templateCurrent) {
      setTemplateForm((prev) => ({
        ...prev,
        id: templateCurrent.id,
        productId: templateCurrent.productId || prev.productId,
        siteId: templateCurrent.siteId || '',
        templateName: displayTemplateName(templateCurrent.templateKey),
        templateKey: templateCurrent.templateKey,
        category: inferTemplateCategory(templateCurrent.templateKey),
        subject: templateCurrent.subject,
        description: '',
        version: templateCurrent.version,
        html: templateCurrent.html || '',
        text: templateCurrent.text || '',
        variables: '',
        isActive: templateCurrent.isActive,
      }));
    }
  }, [view, templateCurrent]);

  useEffect(() => {
    if (view === 'automations-create') {
      setAutomationForm((prev) => ({
        ...prev,
        id: '',
        siteId: '',
        automationName: '',
        eventKey: '',
        conditions: '',
        enabled: true,
      }));
      return;
    }

    if (view === 'automations-edit' && automationCurrent) {
      setAutomationForm((prev) => ({
        ...prev,
        id: automationCurrent.id,
        productId: automationCurrent.productId || prev.productId,
        siteId: automationCurrent.siteId || '',
        automationName: automationCurrent.eventKey,
        eventKey: automationCurrent.eventKey,
        templateId: automationCurrent.templateId,
        conditions: '',
        enabled: automationCurrent.enabled,
      }));
    }
  }, [view, automationCurrent]);

  useEffect(() => {
    if (view !== 'social-edit' || !socialCurrent) return;
    setSocialForm({
      id: socialCurrent.id,
      status: socialCurrent.status || 'ACTIVE',
    });
  }, [view, socialCurrent]);

  const linkedEmailSites = useMemo(
    () => sites.filter((site) => site.productId === emailForm.productId),
    [sites, emailForm.productId],
  );
  const linkedTemplateSites = useMemo(
    () => sites.filter((site) => site.productId === templateForm.productId),
    [sites, templateForm.productId],
  );
  const linkedAutomationSites = useMemo(
    () => sites.filter((site) => site.productId === automationForm.productId),
    [sites, automationForm.productId],
  );

  const emailItemsFiltered = useMemo(() => {
    return emails.filter((item) => {
      if (emailFilters.productId !== 'all' && item.productId !== emailFilters.productId) return false;
      if (emailFilters.siteId !== 'all' && (item.siteId || '') !== emailFilters.siteId) return false;
      if (emailFilters.status === 'active' && !item.isActive) return false;
      if (emailFilters.status === 'inactive' && item.isActive) return false;
      if (emailFilters.provider !== 'all' && toSearch(item.provider) !== toSearch(emailFilters.provider)) return false;

      const query = toSearch(emailFilters.query);
      if (!query) return true;
      const haystack = `${item.emailLabel} ${item.fromName} ${item.fromEmail} ${item.productName} ${item.siteDomain || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [emails, emailFilters]);

  const templateItemsFiltered = useMemo(() => {
    return templates.filter((item) => {
      if (templateFilters.productId !== 'all' && (item.productId || '') !== templateFilters.productId) return false;
      if (templateFilters.siteId !== 'all' && (item.siteId || '') !== templateFilters.siteId) return false;
      if (templateFilters.status === 'active' && !item.isActive) return false;
      if (templateFilters.status === 'inactive' && item.isActive) return false;
      if (templateFilters.category !== 'all' && inferTemplateCategory(item.templateKey) !== templateFilters.category) return false;

      const query = toSearch(templateFilters.query);
      if (!query) return true;
      const haystack = `${item.templateKey} ${displayTemplateName(item.templateKey)} ${item.subject} ${item.productName || ''} ${item.siteDomain || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [templates, templateFilters]);

  const automationItemsFiltered = useMemo(() => {
    return automations.filter((item) => {
      if (automationFilters.productId !== 'all' && (item.productId || '') !== automationFilters.productId) return false;
      if (automationFilters.siteId !== 'all' && (item.siteId || '') !== automationFilters.siteId) return false;
      if (automationFilters.status === 'active' && !item.enabled) return false;
      if (automationFilters.status === 'inactive' && item.enabled) return false;
      if (automationFilters.eventKey !== 'all' && item.eventKey !== automationFilters.eventKey) return false;
      return true;
    });
  }, [automations, automationFilters]);

  const socialItemsFiltered = useMemo(() => {
    return socialAccounts
      .map((item) => ({
        ...item,
        linkedProduct: inferProductFromSocial(item, products),
      }))
      .filter((item) => {
        if (socialFilters.platform !== 'all' && socialFilters.platform !== 'instagram') return false;
        if (socialFilters.status === 'active' && toSearch(item.status) !== 'active') return false;
        if (socialFilters.status === 'inactive' && toSearch(item.status) === 'active') return false;
        if (socialFilters.productId !== 'all' && item.linkedProduct?.id !== socialFilters.productId) return false;

        const query = toSearch(socialFilters.query);
        if (!query) return true;
        const haystack = `${item.instagramUsername} ${item.instagramName || ''} ${item.pageName || ''}`.toLowerCase();
        return haystack.includes(query);
      });
  }, [products, socialAccounts, socialFilters]);

  const overviewStats = useMemo(() => {
    return {
      emailsConfigured: emails.length,
      templatesActive: templates.filter((item) => item.isActive).length,
      automationsActive: automations.filter((item) => item.enabled).length,
      socialConnected: socialAccounts.filter((item) => toSearch(item.status) === 'active').length,
    };
  }, [emails, templates, automations, socialAccounts]);

  const emailsPagination = paginateItems(emailItemsFiltered, emailsPage);
  const templatesPagination = paginateItems(templateItemsFiltered, templatesPage);
  const automationsPagination = paginateItems(automationItemsFiltered, automationsPage);
  const socialPagination = paginateItems(socialItemsFiltered, socialPage);

  useEffect(() => {
    setEmailsPage((prev) => Math.min(prev, emailsPagination.totalPages));
  }, [emailsPagination.totalPages]);
  useEffect(() => {
    setTemplatesPage((prev) => Math.min(prev, templatesPagination.totalPages));
  }, [templatesPagination.totalPages]);
  useEffect(() => {
    setAutomationsPage((prev) => Math.min(prev, automationsPagination.totalPages));
  }, [automationsPagination.totalPages]);
  useEffect(() => {
    setSocialPage((prev) => Math.min(prev, socialPagination.totalPages));
  }, [socialPagination.totalPages]);

  useEffect(() => setEmailsPage(1), [emailFilters]);
  useEffect(() => setTemplatesPage(1), [templateFilters]);
  useEffect(() => setAutomationsPage(1), [automationFilters]);
  useEffect(() => setSocialPage(1), [socialFilters]);

  async function submitEmailForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!emailForm.productId || !emailForm.emailLabel.trim() || !emailForm.fromName.trim() || !emailForm.fromEmail.trim()) {
      notify('Preencha produto, nome interno, remetente e e-mail remetente.');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/control-panel/email-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: emailForm.id || undefined,
        productId: emailForm.productId,
        siteId: emailForm.siteId || undefined,
        emailLabel: emailForm.emailLabel,
        fromName: emailForm.fromName,
        fromEmail: emailForm.fromEmail,
        replyTo: emailForm.replyTo || undefined,
        provider: emailForm.provider,
        isDefault: emailForm.isDefault,
        isActive: emailForm.isActive,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao salvar e-mail.');
      return;
    }

    notify(emailForm.id ? 'E-mail atualizado com sucesso.' : 'E-mail criado com sucesso.');
    await loadData();
    router.push('/painel-de-controle/emails');
  }

  async function removeEmail(item: EmailItem) {
    if (!window.confirm(`Remover "${item.emailLabel}" da listagem ativa?`)) return;

    setSaving(true);
    const res = await fetch('/api/control-panel/email-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        productId: item.productId,
        siteId: item.siteId || undefined,
        emailLabel: item.emailLabel,
        fromName: item.fromName,
        fromEmail: item.fromEmail,
        replyTo: item.replyTo || undefined,
        provider: item.provider,
        isDefault: item.isDefault,
        isActive: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao remover e-mail.');
      return;
    }

    notify('E-mail removido da listagem ativa.');
    await loadData();
  }

  async function submitTemplateForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedKey = normalizeTemplateKey(templateForm.templateKey || templateForm.templateName);

    if (!templateForm.productId || !normalizedKey || !templateForm.subject.trim()) {
      notify('Preencha produto, nome interno do template e assunto.');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/control-panel/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: templateForm.id || undefined,
        productId: templateForm.productId,
        siteId: templateForm.siteId || undefined,
        templateKey: normalizedKey,
        subject: templateForm.subject,
        html: templateForm.html,
        text: templateForm.text,
        isActive: templateForm.isActive,
        version: templateForm.version,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao salvar template.');
      return;
    }

    notify(templateForm.id ? 'Template atualizado com sucesso.' : 'Template criado com sucesso.');
    await loadData();
    router.push('/painel-de-controle/templates');
  }

  async function removeTemplate(item: TemplateItem) {
    if (!window.confirm(`Remover "${displayTemplateName(item.templateKey)}" da listagem ativa?`)) return;
    if (!item.productId) {
      notify('Template sem vínculo com produto.');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/control-panel/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        productId: item.productId,
        siteId: item.siteId || undefined,
        templateKey: item.templateKey,
        subject: item.subject,
        html: item.html || '',
        text: item.text || '',
        version: item.version,
        isActive: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao remover template.');
      return;
    }

    notify('Template removido da listagem ativa.');
    await loadData();
  }

  async function submitAutomationForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!automationForm.productId || !automationForm.eventKey.trim() || !automationForm.templateId) {
      notify('Preencha produto, evento de origem e template vinculado.');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/control-panel/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: automationForm.id || undefined,
        productId: automationForm.productId,
        siteId: automationForm.siteId || undefined,
        eventKey: automationForm.eventKey,
        templateId: automationForm.templateId,
        enabled: automationForm.enabled,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao salvar automação.');
      return;
    }

    notify(automationForm.id ? 'Automação atualizada com sucesso.' : 'Automação criada com sucesso.');
    await loadData();
    router.push('/painel-de-controle/automacoes');
  }

  async function removeAutomation(item: AutomationItem) {
    if (!window.confirm(`Remover automação "${item.eventKey}"?`)) return;
    if (!item.productId) {
      notify('Automação sem vínculo com produto.');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/control-panel/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        productId: item.productId,
        siteId: item.siteId || undefined,
        eventKey: item.eventKey,
        templateId: item.templateId,
        enabled: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao remover automação.');
      return;
    }

    notify('Automação removida da listagem ativa.');
    await loadData();
  }

  async function submitSocialForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!socialForm.id) {
      notify('Conta social inválida.');
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/social/instagram/accounts/${socialForm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: socialForm.status }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao atualizar conta social.');
      return;
    }

    notify('Conta social atualizada com sucesso.');
    await loadData();
    router.push('/painel-de-controle/social');
  }

  async function removeSocial(item: SocialRow) {
    if (!window.confirm(`Remover conta @${item.instagramUsername}?`)) return;

    setSaving(true);
    const res = await fetch(`/api/social/instagram/accounts/${item.id}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      notify(data.error || 'Falha ao remover conta social.');
      return;
    }

    notify('Conta social removida com sucesso.');
    await loadData();
  }

  const readOnlyEmailForm = view === 'emails-view';
  const readOnlyTemplateForm = view === 'templates-view';

  const subnavItems = [
    { key: 'overview', label: 'Visão Geral', href: '/painel-de-controle' },
    { key: 'emails', label: 'E-mails', href: '/painel-de-controle/emails' },
    { key: 'templates', label: 'Templates', href: '/painel-de-controle/templates' },
    { key: 'automations', label: 'Automações', href: '/painel-de-controle/automacoes' },
    { key: 'social', label: 'Redes Sociais', href: '/painel-de-controle/social' },
  ] as const;

  return (
    <section className="comm-module">
      <header className="comm-module-head">
        <div>
          <span className="comm-kicker">Central de Comunicação / Engajamento</span>
          <h3>Comunicação</h3>
          <p>Gestão de mensagens, templates, automações e redes sociais com contexto por produto e site.</p>
        </div>
      </header>

      <nav className="comm-subnav" aria-label="Submódulos de comunicação">
        {subnavItems.map((item) => (
          <Link key={item.key} href={item.href} className={activeModule === item.key ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <div className="comm-error-box" role="alert">
          <p>{error}</p>
          <button type="button" className="secondary-btn" onClick={() => void loadData()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading && activeModule === 'overview' ? (
        <section className="comm-panel">
          <div className="comm-stat-grid">
            <article className="comm-stat-card">
              <span>E-mails configurados</span>
              <strong>{overviewStats.emailsConfigured}</strong>
            </article>
            <article className="comm-stat-card">
              <span>Templates ativos</span>
              <strong>{overviewStats.templatesActive}</strong>
            </article>
            <article className="comm-stat-card">
              <span>Automações ativas</span>
              <strong>{overviewStats.automationsActive}</strong>
            </article>
            <article className="comm-stat-card">
              <span>Contas sociais conectadas</span>
              <strong>{overviewStats.socialConnected}</strong>
            </article>
          </div>
        </section>
      ) : null}

      {!loading && view === 'emails-list' ? (
        <section className="comm-panel">
          <div className="table-header-actions">
            <div>
              <h3>E-mails</h3>
              <p>Gerencie e-mails transacionais e de boas-vindas vinculados ao ecossistema.</p>
            </div>
            <Link href="/painel-de-controle/emails/novo" className="primary-btn">
              <i className="bi bi-plus-circle" aria-hidden="true" /> + Novo e-mail
            </Link>
          </div>

          <div className="comm-toolbar">
            <select className="saas-input" value={emailFilters.productId} onChange={(e) => setEmailFilters((prev) => ({ ...prev, productId: e.target.value }))}>
              <option value="all">Produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <select className="saas-input" value={emailFilters.siteId} onChange={(e) => setEmailFilters((prev) => ({ ...prev, siteId: e.target.value }))}>
              <option value="all">Site/Domínio</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.domain}
                </option>
              ))}
            </select>
            <select className="saas-input" value={emailFilters.status} onChange={(e) => setEmailFilters((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="all">Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            <select className="saas-input" value={emailFilters.provider} onChange={(e) => setEmailFilters((prev) => ({ ...prev, provider: e.target.value }))}>
              <option value="all">Provider</option>
              {Array.from(new Set(emails.map((item) => item.provider))).map((provider) => (
                <option key={provider} value={provider}>
                  {provider.toUpperCase()}
                </option>
              ))}
            </select>
            <input
              className="saas-input"
              placeholder="Buscar por nome interno/remetente"
              value={emailFilters.query}
              onChange={(e) => setEmailFilters((prev) => ({ ...prev, query: e.target.value }))}
            />
          </div>

          {emailsPagination.pageItems.length === 0 ? (
            <EmptyState title="Nenhum e-mail encontrado" description="Ajuste os filtros ou crie um novo e-mail transacional." />
          ) : (
            <>
              <div className="table-wrap comm-table-wrap">
                <table className="comm-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Site/Domínio</th>
                      <th>Nome interno</th>
                      <th>Remetente</th>
                      <th>Provider</th>
                      <th>Padrão</th>
                      <th>Status</th>
                      <th>Atualizado em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailsPagination.pageItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td>{item.siteDomain || 'Todos os sites'}</td>
                        <td>{item.emailLabel}</td>
                        <td>
                          <div className="comm-cell-stack">
                            <strong>{item.fromName}</strong>
                            <small>{item.fromEmail}</small>
                          </div>
                        </td>
                        <td><ProviderBadge provider={item.provider} /></td>
                        <td>{item.isDefault ? 'Sim' : 'Não'}</td>
                        <td><StatusBadge active={item.isActive} /></td>
                        <td>{toDateTime(item.updatedAt)}</td>
                        <td>
                          <div className="comm-row-actions">
                            <Link href={`/painel-de-controle/emails/${item.id}`} className="secondary-btn">Visualizar</Link>
                            <Link href={`/painel-de-controle/emails/${item.id}/editar`} className="secondary-btn">Editar</Link>
                            <button type="button" className="danger-btn" onClick={() => void removeEmail(item)} disabled={saving}>Remover</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={emailsPagination.safePage} totalPages={emailsPagination.totalPages} onPageChange={setEmailsPage} />
            </>
          )}
        </section>
      ) : null}

      {!loading && (view === 'emails-create' || view === 'emails-edit' || view === 'emails-view') ? (
        <section className="comm-panel">
          <nav className="saas-template-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/painel-de-controle">Comunicação</Link>
            <span>›</span>
            <Link href="/painel-de-controle/emails">E-mails</Link>
            <span>›</span>
            <span>{view === 'emails-create' ? 'Novo e-mail' : readOnlyEmailForm ? 'Visualizar' : 'Editar'}</span>
          </nav>

          {!recordId || emailCurrent || view === 'emails-create' ? (
            <form className="comm-form" onSubmit={submitEmailForm}>
              <section className="comm-form-section">
                <h4>Novo e-mail transacional</h4>
                <p>Configure remetente, provider e escopo por produto/site.</p>
              </section>
              <section className="comm-form-section">
                <h4>1. Configuração básica</h4>
                <div className="comm-form-grid two">
                  <label>
                    Produto
                    <select className="saas-input" value={emailForm.productId} onChange={(e) => setEmailForm((prev) => ({ ...prev, productId: e.target.value, siteId: '' }))} disabled={readOnlyEmailForm}>
                      <option value="">Selecione</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Site/Domínio
                    <select className="saas-input" value={emailForm.siteId} onChange={(e) => setEmailForm((prev) => ({ ...prev, siteId: e.target.value }))} disabled={readOnlyEmailForm}>
                      <option value="">Todos os sites</option>
                      {linkedEmailSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.domain}</option>
                      ))}
                    </select>
                  </label>
                  <label className="comm-form-grid-full">
                    Nome interno
                    <input className="saas-input" value={emailForm.emailLabel} onChange={(e) => setEmailForm((prev) => ({ ...prev, emailLabel: e.target.value }))} disabled={readOnlyEmailForm} />
                  </label>
                </div>
              </section>
              <section className="comm-form-section">
                <h4>2. Remetente</h4>
                <div className="comm-form-grid two">
                  <label>
                    Nome do remetente
                    <input className="saas-input" value={emailForm.fromName} onChange={(e) => setEmailForm((prev) => ({ ...prev, fromName: e.target.value }))} disabled={readOnlyEmailForm} />
                  </label>
                  <label>
                    E-mail remetente
                    <input className="saas-input" type="email" value={emailForm.fromEmail} onChange={(e) => setEmailForm((prev) => ({ ...prev, fromEmail: e.target.value }))} disabled={readOnlyEmailForm} />
                  </label>
                  <label className="comm-form-grid-full">
                    Responder para
                    <input className="saas-input" type="email" value={emailForm.replyTo} onChange={(e) => setEmailForm((prev) => ({ ...prev, replyTo: e.target.value }))} disabled={readOnlyEmailForm} />
                  </label>
                </div>
              </section>
              <section className="comm-form-section">
                <h4>3. Configuração técnica</h4>
                <div className="comm-form-grid two">
                  <label>
                    Provider
                    <select className="saas-input" value={emailForm.provider} onChange={(e) => setEmailForm((prev) => ({ ...prev, provider: e.target.value }))} disabled={readOnlyEmailForm}>
                      <option value="smtp">SMTP</option>
                      <option value="sendgrid">SendGrid</option>
                      <option value="ses">SES</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select className="saas-input" value={emailForm.isActive ? 'active' : 'inactive'} onChange={(e) => setEmailForm((prev) => ({ ...prev, isActive: e.target.value === 'active' }))} disabled={readOnlyEmailForm}>
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </label>
                  <label className="comm-check">
                    <input type="checkbox" checked={emailForm.isDefault} onChange={(e) => setEmailForm((prev) => ({ ...prev, isDefault: e.target.checked }))} disabled={readOnlyEmailForm} />
                    <span>Padrão do produto</span>
                  </label>
                </div>
              </section>
              <div className="comm-form-actions">
                {!readOnlyEmailForm ? (
                  <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
                ) : null}
                <Link href="/painel-de-controle/emails" className="secondary-btn">Voltar para e-mails</Link>
                {readOnlyEmailForm && emailCurrent ? (
                  <Link href={`/painel-de-controle/emails/${emailCurrent.id}/editar`} className="secondary-btn">Editar</Link>
                ) : null}
              </div>
            </form>
          ) : (
            <EmptyState title="E-mail não encontrado" description="Verifique o identificador informado." />
          )}
        </section>
      ) : null}

      {!loading && view === 'templates-list' ? (
        <section className="comm-panel">
          <div className="table-header-actions">
            <div>
              <h3>Templates</h3>
              <p>Gerencie templates de comunicação vinculados a produtos, sites e automações.</p>
            </div>
            <Link href="/painel-de-controle/templates/novo" className="primary-btn">
              <i className="bi bi-plus-circle" aria-hidden="true" /> + Novo template
            </Link>
          </div>

          <div className="comm-toolbar">
            <select className="saas-input" value={templateFilters.productId} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, productId: e.target.value }))}>
              <option value="all">Produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <select className="saas-input" value={templateFilters.siteId} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, siteId: e.target.value }))}>
              <option value="all">Site/Domínio</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.domain}</option>
              ))}
            </select>
            <select className="saas-input" value={templateFilters.category} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, category: e.target.value }))}>
              <option value="all">Tipo/Categoria</option>
              <option value="transacional">Transacional</option>
              <option value="boas-vindas">Boas-vindas</option>
              <option value="seguranca">Segurança</option>
              <option value="financeiro">Financeiro</option>
            </select>
            <select className="saas-input" value={templateFilters.status} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="all">Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            <input className="saas-input" placeholder="Buscar por nome/assunto" value={templateFilters.query} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, query: e.target.value }))} />
          </div>

          {templatesPagination.pageItems.length === 0 ? (
            <EmptyState title="Nenhum template encontrado" description="Crie novos templates ou ajuste os filtros." />
          ) : (
            <>
              <div className="table-wrap comm-table-wrap">
                <table className="comm-table">
                  <thead>
                    <tr>
                      <th>Template</th>
                      <th>Produto</th>
                      <th>Site</th>
                      <th>Assunto</th>
                      <th>Versão</th>
                      <th>Status</th>
                      <th>Atualizado em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templatesPagination.pageItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="comm-cell-stack">
                            <strong>{displayTemplateName(item.templateKey)}</strong>
                            <small>{item.templateKey}</small>
                          </div>
                        </td>
                        <td>{item.productName || '-'}</td>
                        <td>{item.siteDomain || 'Todos os sites'}</td>
                        <td>{item.subject}</td>
                        <td>v{item.version}</td>
                        <td><StatusBadge active={item.isActive} /></td>
                        <td>{toDateTime(item.updatedAt)}</td>
                        <td>
                          <div className="comm-row-actions">
                            <Link href={`/painel-de-controle/templates/${item.id}`} className="secondary-btn">Visualizar</Link>
                            <Link href={`/painel-de-controle/templates/${item.id}/editar`} className="secondary-btn">Editar</Link>
                            <button type="button" className="danger-btn" onClick={() => void removeTemplate(item)} disabled={saving}>Remover</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={templatesPagination.safePage} totalPages={templatesPagination.totalPages} onPageChange={setTemplatesPage} />
            </>
          )}
        </section>
      ) : null}

      {!loading && (view === 'templates-create' || view === 'templates-edit' || view === 'templates-view') ? (
        <section className="comm-panel">
          <nav className="saas-template-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/painel-de-controle">Comunicação</Link>
            <span>›</span>
            <Link href="/painel-de-controle/templates">Templates</Link>
            <span>›</span>
            <span>{view === 'templates-create' ? 'Novo template' : readOnlyTemplateForm ? 'Visualizar' : 'Editar'}</span>
          </nav>

          {!recordId || templateCurrent || view === 'templates-create' ? (
            <form className="comm-form" onSubmit={submitTemplateForm}>
              <section className="comm-form-section">
                <h4>Novo template</h4>
                <p>Formulário organizado por metadados, conteúdo e configuração.</p>
              </section>
              <section className="comm-form-section">
                <h4>1. Metadados</h4>
                <div className="comm-form-grid two">
                  <label>
                    Nome do template
                    <input className="saas-input" value={templateForm.templateName} onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateName: e.target.value }))} disabled={readOnlyTemplateForm} />
                  </label>
                  <label>
                    Tipo/Categoria
                    <select className="saas-input" value={templateForm.category} onChange={(e) => setTemplateForm((prev) => ({ ...prev, category: e.target.value }))} disabled={readOnlyTemplateForm}>
                      <option value="transacional">Transacional</option>
                      <option value="boas-vindas">Boas-vindas</option>
                      <option value="seguranca">Segurança</option>
                      <option value="financeiro">Financeiro</option>
                    </select>
                  </label>
                  <label>
                    Produto
                    <select className="saas-input" value={templateForm.productId} onChange={(e) => setTemplateForm((prev) => ({ ...prev, productId: e.target.value, siteId: '' }))} disabled={readOnlyTemplateForm}>
                      <option value="">Selecione</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Site/Domínio
                    <select className="saas-input" value={templateForm.siteId} onChange={(e) => setTemplateForm((prev) => ({ ...prev, siteId: e.target.value }))} disabled={readOnlyTemplateForm}>
                      <option value="">Todos os sites</option>
                      {linkedTemplateSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.domain}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Versão
                    <input className="saas-input" type="number" min={1} value={templateForm.version} onChange={(e) => setTemplateForm((prev) => ({ ...prev, version: Math.max(1, Number(e.target.value) || 1) }))} disabled={readOnlyTemplateForm} />
                  </label>
                  <label>
                    Nome interno
                    <input className="saas-input" value={templateForm.templateKey} onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateKey: e.target.value }))} disabled={readOnlyTemplateForm} />
                  </label>
                  <label className="comm-form-grid-full">
                    Assunto
                    <input className="saas-input" value={templateForm.subject} onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))} disabled={readOnlyTemplateForm} />
                  </label>
                  <label className="comm-form-grid-full">
                    Descrição
                    <textarea className="saas-input" rows={2} value={templateForm.description} onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))} disabled={readOnlyTemplateForm} />
                  </label>
                </div>
              </section>
              <section className="comm-form-section">
                <h4>2. Conteúdo</h4>
                <div className="comm-form-grid two">
                  <label className="comm-form-grid-full">
                    Conteúdo HTML
                    <textarea className="saas-input" rows={8} value={templateForm.html} onChange={(e) => setTemplateForm((prev) => ({ ...prev, html: e.target.value }))} disabled={readOnlyTemplateForm} />
                  </label>
                  <label className="comm-form-grid-full">
                    Texto fallback
                    <textarea className="saas-input" rows={4} value={templateForm.text} onChange={(e) => setTemplateForm((prev) => ({ ...prev, text: e.target.value }))} disabled={readOnlyTemplateForm} />
                  </label>
                  <label className="comm-form-grid-full">
                    Variáveis disponíveis
                    <textarea className="saas-input" rows={2} value={templateForm.variables} onChange={(e) => setTemplateForm((prev) => ({ ...prev, variables: e.target.value }))} disabled={readOnlyTemplateForm} placeholder="Ex: {{user_name}}, {{reset_link}}" />
                  </label>
                </div>
              </section>
              <section className="comm-form-section">
                <h4>3. Configuração</h4>
                <div className="comm-form-grid two">
                  <label>
                    Status
                    <select className="saas-input" value={templateForm.isActive ? 'active' : 'inactive'} onChange={(e) => setTemplateForm((prev) => ({ ...prev, isActive: e.target.value === 'active' }))} disabled={readOnlyTemplateForm}>
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </label>
                </div>
              </section>
              <div className="comm-form-actions">
                {!readOnlyTemplateForm ? (
                  <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
                ) : null}
                <Link href="/painel-de-controle/templates" className="secondary-btn">Voltar para templates</Link>
                {readOnlyTemplateForm && templateCurrent ? (
                  <Link href={`/painel-de-controle/templates/${templateCurrent.id}/editar`} className="secondary-btn">Editar</Link>
                ) : null}
              </div>
            </form>
          ) : (
            <EmptyState title="Template não encontrado" description="Verifique o identificador informado." />
          )}
        </section>
      ) : null}

      {!loading && view === 'automations-list' ? (
        <section className="comm-panel">
          <div className="table-header-actions">
            <div>
              <h3>Automações</h3>
              <p>Configure gatilhos e regras de envio vinculadas ao comportamento do usuário.</p>
            </div>
            <Link href="/painel-de-controle/automacoes/nova" className="primary-btn">
              <i className="bi bi-plus-circle" aria-hidden="true" /> + Nova automação
            </Link>
          </div>

          <div className="comm-toolbar">
            <select className="saas-input" value={automationFilters.productId} onChange={(e) => setAutomationFilters((prev) => ({ ...prev, productId: e.target.value }))}>
              <option value="all">Produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <select className="saas-input" value={automationFilters.siteId} onChange={(e) => setAutomationFilters((prev) => ({ ...prev, siteId: e.target.value }))}>
              <option value="all">Site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.domain}</option>
              ))}
            </select>
            <select className="saas-input" value={automationFilters.eventKey} onChange={(e) => setAutomationFilters((prev) => ({ ...prev, eventKey: e.target.value }))}>
              <option value="all">Evento</option>
              {Array.from(new Set(automations.map((item) => item.eventKey))).map((eventKey) => (
                <option key={eventKey} value={eventKey}>{eventKey}</option>
              ))}
            </select>
            <select className="saas-input" value={automationFilters.status} onChange={(e) => setAutomationFilters((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="all">Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>

          {automationsPagination.pageItems.length === 0 ? (
            <EmptyState title="Nenhuma automação encontrada" description="Crie uma automação para iniciar o fluxo." />
          ) : (
            <>
              <div className="table-wrap comm-table-wrap">
                <table className="comm-table">
                  <thead>
                    <tr>
                      <th>Nome da automação</th>
                      <th>Evento de origem</th>
                      <th>Template/E-mail vinculado</th>
                      <th>Produto</th>
                      <th>Site</th>
                      <th>Status</th>
                      <th>Atualizado em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {automationsPagination.pageItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.eventKey}</td>
                        <td>{item.eventKey}</td>
                        <td>
                          <div className="comm-cell-stack">
                            <strong>{displayTemplateName(item.templateKey)}</strong>
                            <small>{item.templateSubject}</small>
                          </div>
                        </td>
                        <td>{item.productName || '-'}</td>
                        <td>{item.siteDomain || 'Todos os sites'}</td>
                        <td><StatusBadge active={item.enabled} /></td>
                        <td>{toDateTime(item.updatedAt)}</td>
                        <td>
                          <div className="comm-row-actions">
                            <button type="button" className="secondary-btn" onClick={() => setPreviewAutomation(item)}>Visualizar</button>
                            <Link href={`/painel-de-controle/automacoes/${item.id}/editar`} className="secondary-btn">Editar</Link>
                            <button type="button" className="danger-btn" onClick={() => void removeAutomation(item)} disabled={saving}>Remover</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={automationsPagination.safePage} totalPages={automationsPagination.totalPages} onPageChange={setAutomationsPage} />
            </>
          )}
        </section>
      ) : null}

      {!loading && (view === 'automations-create' || view === 'automations-edit') ? (
        <section className="comm-panel">
          <nav className="saas-template-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/painel-de-controle">Comunicação</Link>
            <span>›</span>
            <Link href="/painel-de-controle/automacoes">Automações</Link>
            <span>›</span>
            <span>{view === 'automations-create' ? 'Nova automação' : 'Editar automação'}</span>
          </nav>

          {!recordId || automationCurrent || view === 'automations-create' ? (
            <form className="comm-form" onSubmit={submitAutomationForm}>
              <section className="comm-form-section">
                <h4>{view === 'automations-create' ? 'Nova automação' : 'Editar automação'}</h4>
                <p>Defina gatilho, vínculo de template/e-mail, contexto e status.</p>
              </section>
              <section className="comm-form-section">
                <div className="comm-form-grid two">
                  <label>
                    Nome da automação
                    <input className="saas-input" value={automationForm.automationName} onChange={(e) => setAutomationForm((prev) => ({ ...prev, automationName: e.target.value }))} />
                  </label>
                  <label>
                    Evento de origem
                    <input className="saas-input" value={automationForm.eventKey} onChange={(e) => setAutomationForm((prev) => ({ ...prev, eventKey: e.target.value }))} placeholder="user.created" />
                  </label>
                  <label>
                    Produto
                    <select className="saas-input" value={automationForm.productId} onChange={(e) => setAutomationForm((prev) => ({ ...prev, productId: e.target.value, siteId: '' }))}>
                      <option value="">Selecione</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Site
                    <select className="saas-input" value={automationForm.siteId} onChange={(e) => setAutomationForm((prev) => ({ ...prev, siteId: e.target.value }))}>
                      <option value="">Todos os sites</option>
                      {linkedAutomationSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.domain}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Template/E-mail vinculado
                    <select className="saas-input" value={automationForm.templateId} onChange={(e) => setAutomationForm((prev) => ({ ...prev, templateId: e.target.value }))}>
                      <option value="">Selecione</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {displayTemplateName(template.templateKey)} · {template.subject}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select className="saas-input" value={automationForm.enabled ? 'active' : 'inactive'} onChange={(e) => setAutomationForm((prev) => ({ ...prev, enabled: e.target.value === 'active' }))}>
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </label>
                  <label className="comm-form-grid-full">
                    Condições
                    <textarea className="saas-input" rows={3} value={automationForm.conditions} onChange={(e) => setAutomationForm((prev) => ({ ...prev, conditions: e.target.value }))} placeholder="Ex: origem website, plano premium, usuário confirmado." />
                  </label>
                </div>
              </section>
              <div className="comm-form-actions">
                <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
                <Link href="/painel-de-controle/automacoes" className="secondary-btn">Voltar para automações</Link>
              </div>
            </form>
          ) : (
            <EmptyState title="Automação não encontrada" description="Verifique o identificador informado." />
          )}
        </section>
      ) : null}

      {!loading && view === 'social-list' ? (
        <section className="comm-panel">
          <div className="table-header-actions">
            <div>
              <h3>Redes Sociais</h3>
              <p>Centralize contas conectadas e integrações sociais do ecossistema Koddahub.</p>
            </div>
            <Link href="/painel-de-controle/social/nova" className="primary-btn">
              <i className="bi bi-plus-circle" aria-hidden="true" /> + Conectar conta
            </Link>
          </div>

          <div className="comm-toolbar">
            <select className="saas-input" value={socialFilters.platform} onChange={(e) => setSocialFilters((prev) => ({ ...prev, platform: e.target.value }))}>
              <option value="all">Plataforma</option>
              <option value="instagram">Instagram</option>
            </select>
            <select className="saas-input" value={socialFilters.status} onChange={(e) => setSocialFilters((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="all">Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            <select className="saas-input" value={socialFilters.productId} onChange={(e) => setSocialFilters((prev) => ({ ...prev, productId: e.target.value }))}>
              <option value="all">Produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <input className="saas-input" placeholder="Buscar por conta" value={socialFilters.query} onChange={(e) => setSocialFilters((prev) => ({ ...prev, query: e.target.value }))} />
          </div>

          {socialPagination.pageItems.length === 0 ? (
            <EmptyState title="Nenhuma conta social encontrada" description="Conecte uma conta para iniciar o gerenciamento." />
          ) : (
            <>
              <div className="table-wrap comm-table-wrap">
                <table className="comm-table">
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Plataforma</th>
                      <th>Produto</th>
                      <th>Status</th>
                      <th>Última sincronização</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {socialPagination.pageItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="comm-cell-stack">
                            <strong>@{item.instagramUsername}</strong>
                            <small>{item.instagramName || item.pageName || 'Conta sem nome'}</small>
                          </div>
                        </td>
                        <td>Instagram</td>
                        <td>{item.linkedProduct?.name || 'Não vinculado'}</td>
                        <td>
                          <StatusBadge active={toSearch(item.status) === 'active'} activeLabel="Conectada" inactiveLabel="Inativa" />
                        </td>
                        <td>{toDateTime(item.lastSyncedAt)}</td>
                        <td>
                          <div className="comm-row-actions">
                            <Link href={`/painel-de-controle/social/${item.id}/editar`} className="secondary-btn">Visualizar</Link>
                            <Link href={`/painel-de-controle/social/${item.id}/editar`} className="secondary-btn">Editar</Link>
                            <button type="button" className="danger-btn" onClick={() => void removeSocial(item)} disabled={saving}>Remover</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={socialPagination.safePage} totalPages={socialPagination.totalPages} onPageChange={setSocialPage} />
            </>
          )}
        </section>
      ) : null}

      {!loading && view === 'social-create' ? (
        <section className="comm-panel">
          <nav className="saas-template-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/painel-de-controle">Comunicação</Link>
            <span>›</span>
            <Link href="/painel-de-controle/social">Redes Sociais</Link>
            <span>›</span>
            <span>Conectar conta</span>
          </nav>
          <div className="comm-form">
            <section className="comm-form-section">
              <h4>Conectar conta social</h4>
              <p>Fluxo via OAuth para conectar Instagram no ecossistema e habilitar engajamento centralizado.</p>
              {!socialMetaConfigured ? (
                <p className="comm-inline-warning">Integração Meta não configurada no ambiente atual.</p>
              ) : null}
            </section>
            <div className="comm-form-actions">
              <a className="primary-btn" href={socialConnectUrl}>
                <i className="bi bi-instagram" aria-hidden="true" /> Conectar com Instagram
              </a>
              <Link href="/painel-de-controle/social" className="secondary-btn">Voltar para redes sociais</Link>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && view === 'social-edit' ? (
        <section className="comm-panel">
          <nav className="saas-template-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/painel-de-controle">Comunicação</Link>
            <span>›</span>
            <Link href="/painel-de-controle/social">Redes Sociais</Link>
            <span>›</span>
            <span>Editar conta</span>
          </nav>
          {!socialCurrent ? (
            <EmptyState title="Conta social não encontrada" description="Verifique o identificador informado." />
          ) : (
            <form className="comm-form" onSubmit={submitSocialForm}>
              <section className="comm-form-section">
                <h4>Conta social conectada</h4>
                <div className="comm-form-grid two">
                  <label>
                    Plataforma
                    <input className="saas-input" value="Instagram" disabled />
                  </label>
                  <label>
                    Conta
                    <input className="saas-input" value={`@${socialCurrent.instagramUsername}`} disabled />
                  </label>
                  <label>
                    Nome exibido
                    <input className="saas-input" value={socialCurrent.instagramName || socialCurrent.pageName || '-'} disabled />
                  </label>
                  <label>
                    Última sincronização
                    <input className="saas-input" value={toDateTime(socialCurrent.lastSyncedAt)} disabled />
                  </label>
                  <label>
                    Status
                    <select className="saas-input" value={socialForm.status} onChange={(e) => setSocialForm((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="ACTIVE">Ativa</option>
                      <option value="INACTIVE">Inativa</option>
                    </select>
                  </label>
                </div>
              </section>
              <div className="comm-form-actions">
                <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
                <Link href="/painel-de-controle/social" className="secondary-btn">Voltar para redes sociais</Link>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {previewAutomation ? (
        <div className="crm-v2-modal" role="dialog" aria-modal="true" aria-label="Visualizar automação">
          <div className="crm-v2-modal-card comm-preview-modal">
            <header>
              <h3>Visualizar automação</h3>
              <button type="button" className="secondary-btn" onClick={() => setPreviewAutomation(null)}>
                Fechar
              </button>
            </header>
            <div className="comm-detail-grid">
              <div>
                <span>Nome da automação</span>
                <strong>{previewAutomation.eventKey}</strong>
              </div>
              <div>
                <span>Evento de origem</span>
                <strong>{previewAutomation.eventKey}</strong>
              </div>
              <div>
                <span>Template vinculado</span>
                <strong>{displayTemplateName(previewAutomation.templateKey)}</strong>
              </div>
              <div>
                <span>Produto</span>
                <strong>{previewAutomation.productName || '-'}</strong>
              </div>
              <div>
                <span>Site</span>
                <strong>{previewAutomation.siteDomain || 'Todos os sites'}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{previewAutomation.enabled ? 'Ativo' : 'Inativo'}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
