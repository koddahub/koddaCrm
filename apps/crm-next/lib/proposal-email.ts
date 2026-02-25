import { buildProposalPresentation, type ProposalInput, type PlanCode } from '@/lib/proposal-template';

type ProposalEmailOptions = {
  dealId: string;
  portalBaseUrl?: string;
  catalogUrl?: string;
  whatsappPhone?: string;
  whatsappMessage?: string;
};

function escapeHtml(value: unknown) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeText(value: unknown) {
  const escaped = escapeHtml(value);
  // Evita auto-link em clientes de e-mail quando o texto contém TLD solto, ex: ".com.br".
  return escaped.replace(/(^|[\s(])\.(com(?:\.br)?)/gi, '$1&#8203;.$2');
}

function normalizePortalBaseUrl(rawBaseUrl: string | undefined) {
  const input = String(rawBaseUrl || '').trim();
  if (input.includes('://clientes.koddahub.com.br')) {
    return input.replace(/\/+$/, '');
  }
  return 'https://clientes.koddahub.com.br';
}

function signupUrl(baseUrl: string, planCode: PlanCode, dealId: string) {
  const url = new URL('/signup', baseUrl);
  url.searchParams.set('tab', 'signup');
  url.searchParams.set('plan', planCode);
  url.searchParams.set('source', 'crm_proposal');
  url.searchParams.set('deal', dealId);
  return url.toString();
}

function encodeWhatsAppMessage(message: string) {
  return encodeURIComponent(message.trim());
}

function emailStyles() {
  return `
    :root { color-scheme: light; supported-color-schemes: light; }
    body {
      margin: 0;
      padding: 0;
      background: #eef3fb;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
    }
    .shell {
      width: 100%;
      max-width: 700px;
      margin: 0 auto;
    }
    .proposal-card {
      width: 100%;
      background: #ffffff;
      border: 1px solid #d9e4f2;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
    }
    .section {
      padding: 18px 20px;
      border-bottom: 1px solid #e7eef8;
    }
    .section:last-child {
      border-bottom: 0;
    }
    .proposal-header {
      background: radial-gradient(circle at top right, #2d5ea0, #0c213f 60%);
      border-radius: 14px;
      color: #ffffff;
      padding: 20px;
    }
    .row {
      width: 100%;
    }
    .col {
      width: 50%;
      vertical-align: top;
    }
    .col-3 {
      width: 33.33%;
      vertical-align: top;
    }
    .brand {
      font-size: 30px;
      font-weight: 700;
      margin: 0;
      line-height: 1.1;
      letter-spacing: 0.2px;
    }
    .brand .accent {
      color: #ffb547;
    }
    .meta {
      margin: 10px 0 0;
      font-size: 12px;
      color: rgba(255, 255, 255, .85);
    }
    .hero {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      max-width: 320px;
      font-weight: 700;
    }
    .title {
      margin: 0 0 12px;
      color: #153968;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 700;
    }
    .box {
      border: 1px solid #dbe7f5;
      border-radius: 10px;
      background: #f7fbff;
      padding: 11px;
      margin: 0 6px 8px 0;
    }
    .box span {
      display: block;
      font-size: 11px;
      color: #667085;
      margin-bottom: 3px;
    }
    .box strong {
      font-size: 13px;
      color: #0f172a;
    }
    .plan-card {
      border: 1px solid #dbe7f5;
      border-radius: 14px;
      padding: 10px;
      background: #fdfefe;
      margin: 0 6px 8px 0;
    }
    .plan-card.active {
      border-color: #f0b90b;
      box-shadow: inset 0 0 0 2px rgba(240, 185, 11, 0.22);
    }
    .plan-card h4 {
      margin: 0;
      font-size: 14px;
      color: #0f172a;
    }
    .value {
      margin: 4px 0;
      font-size: 23px;
      font-weight: 700;
      color: #0b2a4d;
      line-height: 1.05;
    }
    .desc {
      margin: 0;
      font-size: 12px;
      color: #4f6179;
    }
    .list {
      margin: 8px 0 0;
      padding-left: 18px;
    }
    .list li {
      margin-bottom: 6px;
      font-size: 12px;
      color: #334155;
    }
    .scope li {
      margin-bottom: 8px;
      font-size: 12px;
      color: #1e293b;
    }
    .scope b {
      color: #0d2f58;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .table th, .table td {
      border: 1px solid #e3eaf5;
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    .table th {
      background: #f7faff;
      color: #1f2a37;
    }
    .summary {
      margin-top: 10px;
      padding: 12px;
      border-radius: 10px;
      background: #f7fbff;
      border: 1px solid #d9e6f8;
      font-size: 12px;
      color: #334155;
    }
    .included {
      border: 1px solid #d9e6f8;
      background: #f7fbff;
      border-radius: 10px;
      padding: 9px;
      margin: 0 6px 8px 0;
      font-size: 12px;
      color: #1f2a37;
    }
    .included.off {
      color: #64748b;
      opacity: .75;
      text-decoration: line-through;
      text-decoration-thickness: from-font;
    }
    .cta {
      background: linear-gradient(180deg, #fffef9, #ffffff);
    }
    .cta strong {
      color: #0f2e56;
      font-size: 22px;
      line-height: 1.15;
      display: block;
      margin-bottom: 6px;
    }
    .cta p {
      margin: 8px 0 0;
      font-size: 13px;
      color: #475569;
    }
    .btn-wrap {
      width: 100%;
      border-collapse: separate;
      border-spacing: 10px 0;
      margin-top: 16px;
      table-layout: fixed;
    }
    .btn-cell {
      width: 33.33%;
      vertical-align: top;
    }
    .btn {
      display: inline-block;
      width: 100%;
      min-height: 46px;
      box-sizing: border-box;
      padding: 13px 16px;
      border-radius: 12px;
      border: 1px solid transparent;
      font-family: Arial, "Segoe UI", Roboto, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 20px;
      font-weight: 700;
      letter-spacing: 0.1px;
      text-align: center;
      text-decoration: none;
      white-space: nowrap;
      mso-line-height-rule: exactly;
    }
    .btn-dark {
      background: #0f2d52;
      border-color: #0b2341;
      color: #ffffff !important;
    }
    .btn-gold {
      background: #f2be2d;
      border-color: #d6a315;
      color: #1f2937 !important;
    }
    .btn-green {
      background: #25c267;
      border-color: #1ea458;
      color: #0e2a1b !important;
    }
    .plan-card .btn {
      min-height: 42px;
      padding: 11px 14px;
      font-size: 13px;
      line-height: 18px;
      border-radius: 10px;
    }
    .footer {
      background: #f6f9ff;
    }
    .footer h4 {
      margin: 0 0 6px;
      color: #0a1a2f;
      font-size: 14px;
    }
    .footer p {
      margin: 2px 0;
      font-size: 12px;
      color: #475467;
    }
    .text-link {
      color: #173f72;
      text-decoration: underline;
    }
    .muted {
      color: #64748b;
      font-size: 12px;
    }
    @media screen and (max-width: 640px) {
      .shell {
        width: 100% !important;
      }
      .section {
        padding: 14px 14px;
      }
      .col,
      .col-3,
      .mobile-col {
        width: 100% !important;
        display: block !important;
      }
      .hero {
        margin-top: 12px;
        max-width: none;
        font-size: 20px;
      }
      .btn-wrap {
        border-spacing: 0 !important;
        margin-top: 14px;
      }
      .btn-wrap tbody,
      .btn-wrap tr {
        display: block !important;
        width: 100% !important;
      }
      .btn-cell {
        width: 100% !important;
        display: block !important;
        padding: 0 0 12px 0 !important;
      }
      .btn-cell:last-child {
        padding-bottom: 0 !important;
      }
      .btn {
        display: block !important;
        width: 100% !important;
        margin: 0 !important;
        min-height: 46px;
        padding: 13px 14px;
        font-size: 14px;
        line-height: 20px;
      }
      .plan-card .btn {
        width: 100% !important;
      }
    }
  `;
}

export function renderProposalEmailHtml(input: ProposalInput, options: ProposalEmailOptions) {
  const view = buildProposalPresentation(input);
  const notes = view.notes.trim();
  const scope = view.scope.trim();

  const portalBaseUrl = normalizePortalBaseUrl(options.portalBaseUrl);
  const catalogUrl = String(options.catalogUrl || 'https://koddahub.com.br').trim() || 'https://koddahub.com.br';
  const whatsappPhone = String(options.whatsappPhone || '5541992272854').replace(/\D+/g, '') || '5541992272854';
  const whatsappMessage = String(options.whatsappMessage || 'Olá! Tenho dúvidas sobre a proposta da KoddaHub e gostaria de falar com o time.').trim();
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeWhatsAppMessage(whatsappMessage)}`;
  const selectedPlanSignupUrl = signupUrl(portalBaseUrl, view.selectedPlanCode, options.dealId);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeText(view.title)}</title>
  <style>${emailStyles()}</style>
</head>
<body>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:20px 10px;background:#eef3fb;">
    <tr>
      <td align="center">
        <table role="presentation" class="shell" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <table role="presentation" class="proposal-card" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td class="section">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="proposal-header">
                <tr>
                  <td class="mobile-col" style="vertical-align:top;">
                    <p class="brand"><span class="accent">Kodda</span>Hub</p>
                    <p class="meta">Proposta comercial • ${escapeText(view.todayLabel)} • Válida por 7 dias</p>
                  </td>
                  <td class="mobile-col" style="vertical-align:top;">
                    <p class="hero">Sua Presença Digital Completa por um Preço Imbatível</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Dados do cliente</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="col"><div class="box"><span>Cliente</span><strong>${escapeText(view.clientName || '—')}</strong></div></td>
                  <td class="col"><div class="box"><span>Empresa</span><strong>${escapeText(view.companyName || '—')}</strong></div></td>
                </tr>
                <tr>
                  <td class="col"><div class="box"><span>Tipo</span><strong>${escapeText(view.proposalTypeLabel)}</strong></div></td>
                  <td class="col"><div class="box"><span>Pagamento projeto</span><strong>${escapeText(view.paymentLabel)}</strong></div></td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Planos mensais (recorrência)</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  ${view.planCards.map((plan) => `
                    <td class="col-3 mobile-col">
                      <div class="plan-card ${plan.active ? 'active' : ''}">
                        <h4>${escapeText(plan.name)}</h4>
                        <p class="value">${escapeText(plan.monthlyLabel)}</p>
                        <p class="desc">${escapeText(plan.description)}</p>
                        <ul class="list">
                          ${plan.highlights.map((item) => `<li>${escapeText(item)}</li>`).join('')}
                        </ul>
                        <a class="btn btn-dark" href="${escapeHtml(signupUrl(portalBaseUrl, plan.code, options.dealId))}">Quero este plano</a>
                      </div>
                    </td>
                  `).join('')}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Escopo do projeto</h3>
              <ul class="list scope">
                ${view.scopeItems.map((item) => `<li><b>${escapeText(item.title)}:</b> ${escapeText(item.description)}</li>`).join('')}
              </ul>
              ${scope ? `<p style="margin:10px 0 0;font-size:12px;color:#334155;"><b>Escopo adicional:</b> ${escapeText(scope)}</p>` : ''}
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Investimento objetivo</h3>
              <table class="table" role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
                <tbody>
                  ${view.investmentRows.map((row) => `<tr><td>${escapeText(row.label)}</td><td>${escapeText(row.value)}</td></tr>`).join('')}
                </tbody>
              </table>
              <div class="summary">${escapeText(view.financeSummary)}</div>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Condições comerciais</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${view.terms.map((term) => `
                  <tr>
                    <td style="padding:0 0 8px 0;font-size:12px;color:#334155;">• ${escapeText(term)}</td>
                  </tr>
                `).join('')}
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">O que está incluso</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  ${view.includedItems.map((item, index) => `
                    ${index > 0 && index % 2 === 0 ? '</tr><tr>' : ''}
                    <td class="col mobile-col">
                      <div class="included ${item.off ? 'off' : ''}">
                        ${escapeText(item.label)}${item.off ? ' (não incluso neste cenário)' : ''}
                      </div>
                    </td>
                  `).join('')}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Portfólio / demos</h3>
              <p style="margin:0;font-size:12px;">
                <a class="text-link" href="${escapeHtml(catalogUrl)}">Ver portfólio KoddaHub</a>
              </p>
            </td>
          </tr>

          <tr>
            <td class="section cta">
              <strong>Pronto para decolar sua presença digital?</strong>
              <p>Esta proposta é válida por 7 dias. Se aprovar, iniciamos o cronograma imediatamente.</p>
              ${notes ? `<p><strong>Observações:</strong> ${escapeText(notes)}</p>` : ''}
              <table role="presentation" class="btn-wrap" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="btn-cell mobile-col"><a class="btn btn-dark" href="${escapeHtml(catalogUrl)}">Conhecer KoddaHub</a></td>
                  <td class="btn-cell mobile-col"><a class="btn btn-gold" href="${escapeHtml(selectedPlanSignupUrl)}">Quero esse plano</a></td>
                  <td class="btn-cell mobile-col"><a class="btn btn-green" href="${escapeHtml(whatsappUrl)}">Tirar dúvidas no WhatsApp</a></td>
                </tr>
              </table>
              <p>Ficou com dúvidas? Chame nosso time no WhatsApp e te orientamos no melhor plano para o seu negócio.</p>
              <p class="muted">Ao clicar em qualquer plano, abrimos a área do cliente com o cadastro já aberto e plano pré-selecionado.</p>
            </td>
          </tr>

          <tr>
            <td class="section footer">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="col mobile-col">
                    <h4>Contato</h4>
                    <p>contato@koddahub.com.br</p>
                    <p><a class="text-link" href="${escapeHtml(catalogUrl)}">Site institucional KoddaHub</a></p>
                    <p><a class="text-link" href="${escapeHtml(whatsappUrl)}">WhatsApp: +55 41 99227-2854</a></p>
                    <p>Instagram: @koddahub</p>
                    <p>LinkedIn: /company/koddahub</p>
                  </td>
                  <td class="col mobile-col">
                    <h4>Garantias</h4>
                    <p>Hospedagem com SSL grátis</p>
                    <p>Backup diário automático</p>
                    <p>Suporte técnico ilimitado</p>
                    <p>Manutenção mensal</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderProposalEmailPlainText(input: ProposalInput, options: ProposalEmailOptions) {
  const view = buildProposalPresentation(input);
  const notes = view.notes.trim();
  const scope = view.scope.trim();
  const portalBaseUrl = normalizePortalBaseUrl(options.portalBaseUrl);
  const catalogUrl = String(options.catalogUrl || 'https://koddahub.com.br').trim() || 'https://koddahub.com.br';
  const whatsappPhone = String(options.whatsappPhone || '5541992272854').replace(/\D+/g, '') || '5541992272854';
  const whatsappMessage = String(options.whatsappMessage || 'Olá! Tenho dúvidas sobre a proposta da KoddaHub e gostaria de falar com o time.').trim();
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeWhatsAppMessage(whatsappMessage)}`;
  const signupSelected = signupUrl(portalBaseUrl, view.selectedPlanCode, options.dealId);

  const planLines = view.planCards
    .map((plan) => `- ${plan.name} (${plan.monthlyLabel}) -> ${signupUrl(portalBaseUrl, plan.code, options.dealId)}`)
    .join('\n');

  const investmentLines = view.investmentRows
    .map((row) => `- ${row.label}: ${row.value}`)
    .join('\n');

  const termsLines = view.terms.map((term) => `- ${term}`).join('\n');
  const includedLines = view.includedItems.map((item) => `- ${item.label}${item.off ? ' (não incluso neste cenário)' : ''}`).join('\n');

  return [
    `${view.title}`,
    '',
    `Proposta comercial KoddaHub • ${view.todayLabel}`,
    'Validade: 7 dias',
    '',
    'Dados do cliente',
    `- Cliente: ${view.clientName || '—'}`,
    `- Empresa: ${view.companyName || '—'}`,
    `- Tipo: ${view.proposalTypeLabel}`,
    `- Pagamento projeto: ${view.paymentLabel}`,
    '',
    'Planos mensais (recorrência)',
    planLines,
    '',
    'Escopo do projeto',
    ...view.scopeItems.map((item) => `- ${item.title}: ${item.description}`),
    ...(scope ? [`- Escopo adicional: ${scope}`] : []),
    '',
    'Investimento objetivo',
    investmentLines,
    '',
    `Resumo financeiro: ${view.financeSummary}`,
    '',
    'Condições comerciais',
    termsLines,
    '',
    'O que está incluso',
    includedLines,
    '',
    'Ações rápidas',
    `- Conhecer KoddaHub: ${catalogUrl}`,
    `- Quero esse plano: ${signupSelected}`,
    `- Tirar dúvidas no WhatsApp: ${whatsappUrl}`,
    '',
    'Contato',
    '- E-mail: contato@koddahub.com.br',
    `- Site: ${catalogUrl}`,
    '- WhatsApp: +55 41 99227-2854',
  ].join('\n');
}
