export const DEAL_TYPES = {
  HOSPEDAGEM: 'HOSPEDAGEM',
  PROJETO_AVULSO: 'PROJETO_AVULSO',
} as const;

export const CATEGORIES = {
  RECORRENTE: 'RECORRENTE',
  AVULSO: 'AVULSO',
} as const;

export const ORIGINS = {
  SITE_FORM: 'SITE_FORM',
  SIGNUP_FLOW: 'SIGNUP_FLOW',
  PAYMENT_WEBHOOK: 'PAYMENT_WEBHOOK',
  MANUAL: 'MANUAL',
} as const;

export const INTENTS = [
  'hospedagem_basico',
  'hospedagem_profissional',
  'hospedagem_pro',
  'site_institucional',
  'ecommerce',
  'site_industrial',
  'site_servicos',
  'sistemas_empresariais',
  'customizacao_sistemas',
  'landing_page',
  'blog_portal',
  'redesign',
] as const;

export function normalizeIntent(raw?: string | null): string {
  const value = (raw || '').toLowerCase().trim();
  if (!value) return 'site_institucional';

  const map: Array<[RegExp, string]> = [
    [/hospedagem.*basic|plano.*basic|b[áa]sico/, 'hospedagem_basico'],
    [/hospedagem.*prof|plano.*prof/, 'hospedagem_profissional'],
    [/hospedagem.*pro|plano.*pro/, 'hospedagem_pro'],
    [/institucional/, 'site_institucional'],
    [/e-?commerce|loja/, 'ecommerce'],
    [/industrial/, 'site_industrial'],
    [/servi[cç]os|cl[ií]nica|agend/, 'site_servicos'],
    [/sistemas empresariais/, 'sistemas_empresariais'],
    [/customiza[cç][aã]o/, 'customizacao_sistemas'],
    [/landing/, 'landing_page'],
    [/blog|portal/, 'blog_portal'],
    [/redesign|reformul/, 'redesign'],
  ];

  for (const [pattern, intent] of map) {
    if (pattern.test(value)) return intent;
  }
  return 'site_institucional';
}

export function inferCategory(intent: string): string {
  if (intent.startsWith('hospedagem_')) return CATEGORIES.RECORRENTE;
  return CATEGORIES.AVULSO;
}

export function inferDealType(category: string): string {
  return category === CATEGORIES.RECORRENTE ? DEAL_TYPES.HOSPEDAGEM : DEAL_TYPES.PROJETO_AVULSO;
}

export function normalizePhone(phone?: string | null) {
  return (phone || '').replace(/\D+/g, '');
}
