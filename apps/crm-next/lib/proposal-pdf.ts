import { chromium, type Browser } from 'playwright';
import { buildProposalPresentation, type ProposalInput } from '@/lib/proposal-template';

function escapeHtml(value: string) {
  return String(value || '').replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

function styles() {
  return `
    :root {
      --primary-900: #08182d;
      --primary-800: #0a1a2f;
      --secondary-600: #1e3a5f;
      --accent-500: #f0b90b;
      --accent-400: #ffd45c;
      --text-900: #1f2a37;
      --text-700: #475467;
      --text-500: #667085;
      --line: #d8e1ec;
      --line-strong: #c7d3e2;
      --radius-sm: 12px;
      --radius-md: 16px;
      --radius-lg: 22px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Poppins, Arial, sans-serif;
      color: var(--text-900);
      background: #f4f7fb;
      padding: 22px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .proposal-paper {
      background: #fff;
      border: 1px solid #d4deea;
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .pdf-block { padding: 18px 20px; border-bottom: 1px solid #edf2f9; }
    .pdf-block:last-child { border-bottom: 0; }
    .proposal-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      color: #fff;
      background: linear-gradient(135deg, #0a1a2f, #1e3a5f);
      border-radius: var(--radius-md);
      padding: 18px;
    }
    .proposal-header h2 { margin: 0; font-size: 22px; max-width: 360px; }
    .meta { margin: 8px 0 0; font-size: 12px; color: rgba(255,255,255,.85); }
    .brand { font-size: 28px; font-weight: 700; color: #fff; }
    .brand b { color: #ff8a00; }
    h3 {
      margin: 0 0 12px;
      color: var(--secondary-600);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .box {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #f9fbff;
    }
    .box span { display: block; font-size: 11px; color: var(--text-500); margin-bottom: 3px; }
    .box strong { font-size: 13px; }
    .plans { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .plan-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
      background: #fff;
    }
    .plan-card.active { border-color: var(--accent-500); box-shadow: 0 0 0 2px rgba(240,185,11,.2); }
    .plan-card h4 { margin: 0; font-size: 14px; }
    .plan-card .value { margin: 4px 0; font-weight: 700; color: #0a1a2f; }
    .plan-card p { margin: 0; font-size: 12px; color: #64748b; }
    .plan-highlights { margin: 8px 0 0; padding-left: 16px; display: grid; gap: 4px; font-size: 11px; color: #334155; }
    .bullet-list { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
    .price-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .price-table th, .price-table td { border: 1px solid #e5eaf2; padding: 8px; text-align: left; vertical-align: top; }
    .price-table th { background: #f7faff; }
    .finance-summary { margin-top: 10px; padding: 10px; border-radius: 10px; background: #f7fbff; border: 1px solid #d9e6f8; font-size: 12px; }
    .included-grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .included-item { border: 1px solid #d9e6f8; background: #f8fbff; border-radius: 10px; padding: 9px; font-size: 12px; }
    .included-item.off { opacity: .52; text-decoration: line-through; }
    .cta { background: linear-gradient(180deg, #fffdf7, #fff); }
    .cta strong { font-size: 16px; color: #102c4f; }
    .cta p { margin: 8px 0 0; font-size: 12px; color: #475467; }
    .footer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; background: #f8fbff; }
    .footer h4 { margin: 0 0 6px; color: #0a1a2f; }
    .footer p { margin: 2px 0; font-size: 12px; color: #475467; }
  `;
}

export function renderProposalHtml(input: ProposalInput) {
  const view = buildProposalPresentation(input);
  const notes = view.notes.trim();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<style>${styles()}</style>
<title>${escapeHtml(view.title)}</title>
</head>
<body>
  <article class="proposal-paper">
    <div class="pdf-block">
      <header class="proposal-header">
        <div>
          <div class="brand"><b>Kodda</b>Hub</div>
          <p class="meta">Proposta comercial • ${escapeHtml(view.todayLabel)} • Válida por 7 dias</p>
        </div>
        <div>
          <h2>Sua Presença Digital Completa por um Preço Imbatível</h2>
        </div>
      </header>
    </div>

    <div class="pdf-block">
      <h3>Dados do cliente</h3>
      <div class="grid-2">
        <div class="box"><span>Cliente</span><strong>${escapeHtml(view.clientName || '—')}</strong></div>
        <div class="box"><span>Empresa</span><strong>${escapeHtml(view.companyName || '—')}</strong></div>
        <div class="box"><span>Tipo</span><strong>${escapeHtml(view.proposalTypeLabel)}</strong></div>
        <div class="box"><span>Pagamento projeto</span><strong>${escapeHtml(view.paymentLabel)}</strong></div>
      </div>
    </div>

    <div class="pdf-block">
      <h3>Planos mensais (recorrência)</h3>
      <div class="plans">
        ${view.planCards.map((plan) => `
          <div class="plan-card ${plan.active ? 'active' : ''}">
            <h4>${escapeHtml(plan.name)}</h4>
            <div class="value">${escapeHtml(plan.monthlyLabel)}</div>
            <p>${escapeHtml(plan.description)}</p>
            <ul class="plan-highlights">
              ${plan.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="pdf-block">
      <h3>Escopo do projeto</h3>
      <ul class="bullet-list">
        ${view.scopeItems.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br/>${escapeHtml(item.description)}</li>`).join('')}
      </ul>
      ${view.scope.trim() ? `<p><strong>Escopo adicional:</strong> ${escapeHtml(view.scope.trim())}</p>` : ''}
    </div>

    <div class="pdf-block">
      <h3>Investimento objetivo</h3>
      <table class="price-table">
        <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
        <tbody>
          ${view.investmentRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="finance-summary">${escapeHtml(view.financeSummary)}</div>
    </div>

    <div class="pdf-block">
      <h3>Condições comerciais</h3>
      <ul class="bullet-list">
        ${view.terms.map((term) => `<li>${escapeHtml(term)}</li>`).join('')}
      </ul>
    </div>

    <div class="pdf-block">
      <h3>O que está incluso</h3>
      <div class="included-grid">
        ${view.includedItems.map((item) => `<div class="included-item ${item.off ? 'off' : ''}">${escapeHtml(item.label)}</div>`).join('')}
      </div>
    </div>

    <div class="pdf-block">
      <h3>Portfólio / demos</h3>
      <p>https://koddahub.com.br</p>
    </div>

    <div class="pdf-block cta">
      <strong>Pronto para decolar sua presença digital?</strong>
      <p>Esta proposta é válida por 7 dias. Se aprovar, iniciamos o cronograma imediatamente.</p>
      ${notes ? `<p><strong>Observações:</strong> ${escapeHtml(notes)}</p>` : ''}
    </div>

    <div class="pdf-block footer">
      <div>
        <h4>Contato</h4>
        <p>contato@koddahub.com.br</p>
        <p>www.koddahub.com.br</p>
        <p>Instagram: @koddahub</p>
        <p>LinkedIn: /company/koddahub</p>
      </div>
      <div>
        <h4>Garantias</h4>
        <p>Hospedagem com SSL grátis</p>
        <p>Backup diário automático</p>
        <p>Suporte técnico ilimitado</p>
        <p>Manutenção mensal</p>
      </div>
    </div>
  </article>
</body>
</html>`;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });
  }
  return browserPromise;
}

export async function renderProposalPdfBuffer(input: ProposalInput) {
  const html = renderProposalHtml(input);
  const browser = await getBrowser();
  const context = await browser.newContext({ locale: 'pt-BR' });
  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '10mm', bottom: '14mm', left: '10mm' },
      preferCSSPageSize: true,
    });
  } finally {
    await page.close();
    await context.close();
  }
}
