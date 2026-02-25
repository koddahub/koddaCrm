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

function normalizePortalBaseUrl(rawBaseUrl: string | undefined) {
  const input = String(rawBaseUrl || 'https://clientes.koddahub.com.br').trim();
  const trimmed = input.replace(/\/+$/, '') || 'https://clientes.koddahub.com.br';
  if (trimmed.includes('://cliente.koddahub.com.br')) {
    return trimmed.replace('://cliente.koddahub.com.br', '://clientes.koddahub.com.br');
  }
  return trimmed;
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
    body {
      margin: 0;
      padding: 0;
      background: #f4f7fb;
      font-family: Poppins, Arial, Helvetica, sans-serif;
      color: #1f2a37;
    }
    .container {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d4deea;
      border-radius: 20px;
      overflow: hidden;
    }
    .section {
      padding: 18px 20px;
      border-bottom: 1px solid #edf2f9;
    }
    .section:last-child {
      border-bottom: 0;
    }
    .proposal-header {
      background: linear-gradient(135deg, #0a1a2f, #1e3a5f);
      border-radius: 16px;
      color: #ffffff;
      padding: 18px;
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
      font-size: 28px;
      font-weight: 700;
      margin: 0;
      line-height: 1.1;
    }
    .brand .accent {
      color: #ff8a00;
    }
    .meta {
      margin: 8px 0 0;
      font-size: 12px;
      color: rgba(255, 255, 255, .85);
    }
    .hero {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      max-width: 360px;
    }
    .title {
      margin: 0 0 12px;
      color: #1e3a5f;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: .06em;
      font-weight: 700;
    }
    .box {
      border: 1px solid #d8e1ec;
      border-radius: 10px;
      background: #f9fbff;
      padding: 10px;
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
      color: #1f2a37;
    }
    .card {
      border: 1px solid #d8e1ec;
      border-radius: 12px;
      padding: 10px;
      background: #ffffff;
      margin: 0 6px 8px 0;
    }
    .card.active {
      border-color: #f0b90b;
      box-shadow: inset 0 0 0 2px rgba(240, 185, 11, 0.2);
    }
    .card h4 {
      margin: 0;
      font-size: 14px;
      color: #1f2a37;
    }
    .value {
      margin: 4px 0;
      font-size: 13px;
      font-weight: 700;
      color: #0a1a2f;
    }
    .desc {
      margin: 0;
      font-size: 12px;
      color: #64748b;
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
      color: #1f2a37;
    }
    .scope b {
      color: #0f2747;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .table th, .table td {
      border: 1px solid #e5eaf2;
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
      padding: 10px;
      border-radius: 10px;
      background: #f7fbff;
      border: 1px solid #d9e6f8;
      font-size: 12px;
      color: #334155;
    }
    .included {
      border: 1px solid #d9e6f8;
      background: #f8fbff;
      border-radius: 10px;
      padding: 9px;
      margin: 0 6px 8px 0;
      font-size: 12px;
      color: #1f2a37;
    }
    .included.off {
      color: #64748b;
      opacity: .75;
    }
    .cta {
      background: linear-gradient(180deg, #fffdf7, #ffffff);
    }
    .cta strong {
      color: #102c4f;
      font-size: 16px;
    }
    .cta p {
      margin: 8px 0 0;
      font-size: 12px;
      color: #475467;
    }
    .btn {
      display: inline-block;
      padding: 11px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      margin-right: 8px;
      margin-top: 8px;
    }
    .btn-dark {
      background: #0a1a2f;
      color: #ffffff;
    }
    .btn-gold {
      background: #f0b90b;
      color: #10213d;
    }
    .btn-green {
      background: #25d366;
      color: #083b1c;
    }
    .footer {
      background: #f8fbff;
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
      color: #1e3a5f;
      text-decoration: underline;
    }
    @media screen and (max-width: 640px) {
      .container {
        border-radius: 0;
        border-left: 0;
        border-right: 0;
      }
      .section {
        padding: 14px 12px;
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
        font-size: 19px;
      }
      .btn {
        display: block;
        width: 100%;
        text-align: center;
        margin-right: 0;
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
  <title>${escapeHtml(view.title)}</title>
  <style>${emailStyles()}</style>
</head>
<body>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:16px;background:#f4f7fb;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td class="section">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="proposal-header">
                <tr>
                  <td class="mobile-col" style="vertical-align:top;">
                    <p class="brand"><span class="accent">Kodda</span>Hub</p>
                    <p class="meta">Proposta comercial • ${escapeHtml(view.todayLabel)} • Válida por 7 dias</p>
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
                  <td class="col"><div class="box"><span>Cliente</span><strong>${escapeHtml(view.clientName || '—')}</strong></div></td>
                  <td class="col"><div class="box"><span>Empresa</span><strong>${escapeHtml(view.companyName || '—')}</strong></div></td>
                </tr>
                <tr>
                  <td class="col"><div class="box"><span>Tipo</span><strong>${escapeHtml(view.proposalTypeLabel)}</strong></div></td>
                  <td class="col"><div class="box"><span>Pagamento projeto</span><strong>${escapeHtml(view.paymentLabel)}</strong></div></td>
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
                      <div class="card ${plan.active ? 'active' : ''}">
                        <h4>${escapeHtml(plan.name)}</h4>
                        <p class="value">${escapeHtml(plan.monthlyLabel)}</p>
                        <p class="desc">${escapeHtml(plan.description)}</p>
                        <ul class="list">
                          ${plan.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
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
                ${view.scopeItems.map((item) => `<li><b>${escapeHtml(item.title)}:</b> ${escapeHtml(item.description)}</li>`).join('')}
              </ul>
              ${scope ? `<p style="margin:10px 0 0;font-size:12px;color:#334155;"><b>Escopo adicional:</b> ${escapeHtml(scope)}</p>` : ''}
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Investimento objetivo</h3>
              <table class="table" role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
                <tbody>
                  ${view.investmentRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td></tr>`).join('')}
                </tbody>
              </table>
              <div class="summary">${escapeHtml(view.financeSummary)}</div>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Condições comerciais</h3>
              <ul class="list">
                ${view.terms.map((term) => `<li>${escapeHtml(term)}</li>`).join('')}
              </ul>
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
                        ${escapeHtml(item.label)}${item.off ? ' (não incluso neste cenário)' : ''}
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
                <a class="text-link" href="${escapeHtml(catalogUrl)}">${escapeHtml(catalogUrl)}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td class="section cta">
              <strong>Pronto para decolar sua presença digital?</strong>
              <p>Esta proposta é válida por 7 dias. Se aprovar, iniciamos o cronograma imediatamente.</p>
              ${notes ? `<p><strong>Observações:</strong> ${escapeHtml(notes)}</p>` : ''}
              <p>
                <a class="btn btn-dark" href="${escapeHtml(catalogUrl)}">Conhecer KoddaHub</a>
                <a class="btn btn-gold" href="${escapeHtml(selectedPlanSignupUrl)}">Quero esse plano</a>
                <a class="btn btn-green" href="${escapeHtml(whatsappUrl)}">Tirar dúvidas no WhatsApp</a>
              </p>
              <p>Ficou com dúvidas? Chame nosso time no WhatsApp e te orientamos no melhor plano para o seu negócio.</p>
              <p>Ao clicar em qualquer plano, abrimos a área do cliente com o modal de cadastro aberto e plano pré-selecionado.</p>
            </td>
          </tr>

          <tr>
            <td class="section footer">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="col mobile-col">
                    <h4>Contato</h4>
                    <p>contato@koddahub.com.br</p>
                    <p><a class="text-link" href="${escapeHtml(catalogUrl)}">www.koddahub.com.br</a></p>
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
</body>
</html>`;
}
