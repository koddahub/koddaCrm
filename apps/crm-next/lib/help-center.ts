export interface HelpCategory {
  slug: string;
  title: string;
  description: string;
  icon: 'calendar' | 'credit-card' | 'integrations' | 'users' | 'video' | 'gear';
  articleCount: number;
}

export interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  author: string;
  publishedAt: string;
  readTime: number;
  popular?: boolean;
  keywords: string[];
  contentHtml: string;
}

export interface HelpFaqSection {
  category: string;
  questions: Array<{ q: string; a: string }>;
}

export const helpCategories: HelpCategory[] = [
  {
    slug: 'primeiros-passos',
    title: 'Primeiros passos',
    description: 'Configure sua conta e comece a agendar',
    icon: 'calendar',
    articleCount: 12,
  },
  {
    slug: 'pagamentos',
    title: 'Planos e pagamentos',
    description: 'Assinaturas, faturas e métodos de pagamento',
    icon: 'credit-card',
    articleCount: 8,
  },
  {
    slug: 'integracoes',
    title: 'Integrações',
    description: 'Conecte WhatsApp, Google Calendar e Meet',
    icon: 'integrations',
    articleCount: 15,
  },
  {
    slug: 'clientes',
    title: 'Clientes e serviços',
    description: 'Gerencie sua carteira de clientes',
    icon: 'users',
    articleCount: 10,
  },
  {
    slug: 'reunioes',
    title: 'Reuniões online',
    description: 'Google Meet, gravações e transcrições',
    icon: 'video',
    articleCount: 6,
  },
  {
    slug: 'configuracoes',
    title: 'Configurações',
    description: 'Ajustes da conta e preferências',
    icon: 'gear',
    articleCount: 9,
  },
];

export const helpArticles: HelpArticle[] = [
  {
    slug: 'como-conectar-google-agenda',
    title: 'Como conectar Google Agenda',
    description: 'Sincronize agendamentos do Praja com o Google Calendar em poucos passos.',
    categorySlug: 'integracoes',
    categoryName: 'Integrações',
    author: 'Equipe Praja',
    publishedAt: '2026-03-10',
    readTime: 5,
    popular: true,
    keywords: ['google', 'calendar', 'agenda', 'sincronização'],
    contentHtml: `
      <h2>Pré-requisitos</h2>
      <ul>
        <li>Conta Google ativa</li>
        <li>Plano Professional ou Pro</li>
        <li>Permissão de acesso ao Calendar</li>
      </ul>
      <h2>Passo a passo</h2>
      <ol>
        <li>Acesse <strong>Configurações &gt; Integrações</strong>.</li>
        <li>Clique em <strong>Conectar Google</strong>.</li>
        <li>Conceda os escopos solicitados.</li>
        <li>Escolha a agenda e o tipo de sincronização.</li>
      </ol>
      <h2>Problemas comuns</h2>
      <p>Se eventos não sincronizam, desconecte e reconecte sua conta Google e valide o fuso horário.</p>
    `,
  },
  {
    slug: 'como-cancelar-assinatura',
    title: 'Como cancelar assinatura',
    description: 'Saiba como cancelar seu plano e entender regras de acesso e cobrança.',
    categorySlug: 'pagamentos',
    categoryName: 'Planos e pagamentos',
    author: 'Equipe Praja',
    publishedAt: '2026-03-10',
    readTime: 4,
    popular: true,
    keywords: ['cancelar', 'assinatura', 'reembolso', 'plano'],
    contentHtml: `
      <h2>Cancelamento</h2>
      <p>Acesse <strong>Configurações &gt; Assinatura</strong> e clique em <strong>Cancelar plano</strong>.</p>
      <h2>Após cancelar</h2>
      <ul>
        <li>Você mantém acesso até o fim do período pago.</li>
        <li>Não haverá nova renovação automática.</li>
      </ul>
      <h2>Reembolso</h2>
      <p>Solicitações seguem política vigente e legislação aplicável.</p>
    `,
  },
  {
    slug: 'configurar-lembretes-whatsapp',
    title: 'Configurar lembretes por WhatsApp',
    description: 'Automatize lembretes de atendimento para reduzir faltas.',
    categorySlug: 'integracoes',
    categoryName: 'Integrações',
    author: 'Equipe Praja',
    publishedAt: '2026-03-09',
    readTime: 6,
    popular: true,
    keywords: ['whatsapp', 'lembrete', 'notificação', 'cliente'],
    contentHtml: `
      <h2>Ative o canal</h2>
      <p>Em <strong>Configurações &gt; Notificações</strong>, habilite WhatsApp.</p>
      <h2>Defina antecedência</h2>
      <p>Escolha lembrete de 24h, 12h ou 1h antes do atendimento.</p>
      <h2>Boas práticas</h2>
      <ul>
        <li>Confirme o DDD no cadastro do cliente.</li>
        <li>Use mensagens curtas com horário e serviço.</li>
      </ul>
    `,
  },
  {
    slug: 'como-criar-seu-primeiro-servico',
    title: 'Como criar seu primeiro serviço',
    description: 'Cadastre serviços com duração, preço e categoria.',
    categorySlug: 'primeiros-passos',
    categoryName: 'Primeiros passos',
    author: 'Equipe Praja',
    publishedAt: '2026-03-08',
    readTime: 3,
    keywords: ['serviço', 'cadastro', 'preço', 'duração'],
    contentHtml: `
      <h2>Criar serviço</h2>
      <p>Acesse <strong>Serviços &gt; Novo serviço</strong> e preencha nome, valor e duração.</p>
      <h2>Categoria</h2>
      <p>Escolha a categoria correta para melhorar filtros e relatórios.</p>
    `,
  },
  {
    slug: 'como-importar-clientes-do-google',
    title: 'Como importar clientes do Google Contatos',
    description: 'Importe contatos para acelerar seu onboarding no Praja.',
    categorySlug: 'integracoes',
    categoryName: 'Integrações',
    author: 'Equipe Praja',
    publishedAt: '2026-03-08',
    readTime: 5,
    keywords: ['google people', 'contatos', 'importação', 'clientes'],
    contentHtml: `
      <h2>Conectar Google</h2>
      <p>Conecte sua conta em <strong>Integrações</strong> e permita acesso a contatos.</p>
      <h2>Selecionar contatos</h2>
      <p>Escolha quais contatos deseja trazer para a base de clientes.</p>
      <h2>Evitar duplicidade</h2>
      <p>O Praja compara e-mail e telefone para reduzir duplicações.</p>
    `,
  },
  {
    slug: 'gerenciar-conflitos-de-horario',
    title: 'Como evitar conflitos de horário',
    description: 'Ajuste disponibilidade e regras para evitar sobreposição de agenda.',
    categorySlug: 'configuracoes',
    categoryName: 'Configurações',
    author: 'Equipe Praja',
    publishedAt: '2026-03-07',
    readTime: 4,
    keywords: ['conflito', 'agenda', 'horário', 'disponibilidade'],
    contentHtml: `
      <h2>Disponibilidade</h2>
      <p>Defina intervalos de atendimento por dia da semana.</p>
      <h2>Buffers</h2>
      <p>Adicione intervalo mínimo entre serviços para evitar atrasos.</p>
    `,
  },
  {
    slug: 'como-usar-google-meet-no-praja',
    title: 'Como usar Google Meet no Praja',
    description: 'Crie reuniões online com link automático para clientes.',
    categorySlug: 'reunioes',
    categoryName: 'Reuniões online',
    author: 'Equipe Praja',
    publishedAt: '2026-03-07',
    readTime: 5,
    keywords: ['meet', 'reunião', 'online', 'link'],
    contentHtml: `
      <h2>Ativar Meet</h2>
      <p>Na criação do agendamento, ative a opção de gerar link do Meet.</p>
      <h2>Sala fixa</h2>
      <p>Para serviços recorrentes, habilite sala permanente nas integrações.</p>
    `,
  },
  {
    slug: 'entendendo-faturas-e-cobrancas',
    title: 'Entendendo faturas e cobranças',
    description: 'Aprenda como funcionam faturas, vencimento e inadimplência.',
    categorySlug: 'pagamentos',
    categoryName: 'Planos e pagamentos',
    author: 'Equipe Praja',
    publishedAt: '2026-03-06',
    readTime: 4,
    keywords: ['fatura', 'cobrança', 'inadimplência', 'asaas'],
    contentHtml: `
      <h2>Fatura mensal</h2>
      <p>As cobranças são emitidas em ciclo mensal, conforme plano contratado.</p>
      <h2>Inadimplência</h2>
      <p>Em atraso, podem ocorrer lembretes e bloqueio temporário de funcionalidades.</p>
    `,
  },
  {
    slug: 'como-restaurar-clientes-excluidos',
    title: 'Como restaurar clientes removidos',
    description: 'Recupere clientes excluídos da lista principal quando necessário.',
    categorySlug: 'clientes',
    categoryName: 'Clientes e serviços',
    author: 'Equipe Praja',
    publishedAt: '2026-03-06',
    readTime: 3,
    keywords: ['cliente', 'restaurar', 'exclusão', 'cadastro'],
    contentHtml: `
      <h2>Lista de arquivados</h2>
      <p>Acesse o filtro de clientes removidos e selecione <strong>Restaurar</strong>.</p>
      <h2>Histórico preservado</h2>
      <p>Ao restaurar, o histórico operacional e financeiro do cliente é mantido.</p>
    `,
  },
];

export const helpFaqSections: HelpFaqSection[] = [
  {
    category: 'Primeiros passos',
    questions: [
      {
        q: 'Como criar minha conta no Praja?',
        a: 'Acesse praja.koddahub.com.br e siga o fluxo de cadastro com e-mail e senha.',
      },
      {
        q: 'Preciso de cartão para começar?',
        a: 'Depende da oferta vigente. Consulte condições de teste no momento da contratação.',
      },
    ],
  },
  {
    category: 'Planos e pagamentos',
    questions: [
      {
        q: 'Quais formas de pagamento são aceitas?',
        a: 'Os pagamentos são processados via ASAAS com métodos disponíveis conforme seu plano e região.',
      },
      {
        q: 'Como cancelar assinatura?',
        a: 'Vá em Configurações > Assinatura e solicite cancelamento.',
      },
    ],
  },
  {
    category: 'Integrações',
    questions: [
      {
        q: 'O Praja integra com Google Calendar?',
        a: 'Sim. Você pode ativar sincronização com autorização OAuth.',
      },
      {
        q: 'Consigo usar Google Meet?',
        a: 'Sim, quando integração estiver ativa e plano permitir.',
      },
    ],
  },
];

export function getHelpCategories(): HelpCategory[] {
  return helpCategories;
}

export function getHelpCategoryBySlug(slug: string): HelpCategory | undefined {
  return helpCategories.find((category) => category.slug === slug);
}

export function getHelpArticles(): HelpArticle[] {
  return helpArticles;
}

export function getHelpArticleBySlug(slug: string): HelpArticle | undefined {
  return helpArticles.find((article) => article.slug === slug);
}

export function getHelpArticlesByCategory(categorySlug: string): HelpArticle[] {
  return helpArticles.filter((article) => article.categorySlug === categorySlug);
}

export function getPopularHelpArticles(limit = 6): HelpArticle[] {
  return helpArticles.filter((article) => article.popular).slice(0, limit);
}

export function getRelatedHelpArticles(slug: string, categorySlug: string, limit = 4): HelpArticle[] {
  return helpArticles.filter((article) => article.categorySlug === categorySlug && article.slug !== slug).slice(0, limit);
}

export function getHelpFaqSections(): HelpFaqSection[] {
  return helpFaqSections;
}

export function searchHelpArticles(query: string): HelpArticle[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return helpArticles.filter((article) => {
    const inTitle = article.title.toLowerCase().includes(normalized);
    const inDescription = article.description.toLowerCase().includes(normalized);
    const inKeywords = article.keywords.some((keyword) => keyword.toLowerCase().includes(normalized));
    return inTitle || inDescription || inKeywords;
  });
}

export function getHelpSearchSuggestions(query: string, limit = 6): string[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return getPopularHelpArticles(5).map((article) => article.title);
  }

  return helpArticles
    .map((article) => article.title)
    .filter((title) => title.toLowerCase().includes(normalized))
    .slice(0, limit);
}
