type DemoAccessEmailInput = {
  clientName: string;
  accessEmail: string;
  demoUrl: string;
  additionalMessage?: string;
};

function escapeHtml(value: unknown) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeDemoUrl(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return 'https://ecommerce.koddahub.com.br/index.php';
  return value;
}

function extractHostLabel(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.host || 'clientes.koddahub.com.br';
  } catch {
    return 'clientes.koddahub.com.br';
  }
}

export function renderDemoAccessEmailHtml(input: DemoAccessEmailInput) {
  const clientName = String(input.clientName || 'Cliente').trim() || 'Cliente';
  const accessEmail = String(input.accessEmail || '').trim();
  const demoUrl = normalizeDemoUrl(input.demoUrl);
  const hostLabel = extractHostLabel(demoUrl);
  const additionalMessage = String(input.additionalMessage || '').trim();

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>POP Acesso Demo</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f6f8;padding:24px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:660px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 10px 28px;text-align:center;border-bottom:1px solid #edf2f7;">
              <p style="margin:0;font-size:12px;color:#6b7280;letter-spacing:.05em;">KoddaHub • Acesso Demo</p>
              <h1 style="margin:8px 0 0 0;font-size:25px;line-height:1.3;color:#111827;">POP Acesso Demo</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 0 28px;">
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#374151;">Olá, ${escapeHtml(clientName)}!</p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#374151;">Acesse via o link abaixo para abrir a área demo:</p>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.4;">
                <a href="${escapeHtml(demoUrl)}" style="color:#2563eb;text-decoration:none;font-weight:700;">${escapeHtml(demoUrl)}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #dbe5f0;border-radius:10px;background:#fcfdff;">
                <tr>
                  <td style="padding:16px 16px 0 16px;text-align:center;">
                    <p style="margin:0;color:#6b7280;font-size:12px;">${escapeHtml(hostLabel)}</p>
                    <p style="margin:8px 0 0 0;color:#0f172a;font-size:34px;line-height:1.1;font-weight:300;">Area-cliente</p>
                    <p style="margin:14px 0 0 0;color:#1f2937;font-size:24px;line-height:1.2;font-weight:700;">Get a login code emailed to you</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 22px 16px 22px;">
                    <p style="margin:0 0 8px 0;color:#111827;font-size:16px;font-weight:700;">Email</p>
                    <div style="height:46px;border:1px solid #cbd5e1;border-radius:6px;background:#ffffff;padding:12px 14px;color:#64748b;font-size:20px;line-height:22px;">example@email.com</div>
                    <div style="margin-top:10px;height:46px;border-radius:6px;background:#2f7db1;color:#ffffff;text-align:center;line-height:46px;font-size:28px;">Send me a code</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px 0 28px;">
              <p style="margin:0;color:#374151;font-size:15px;line-height:1.65;">
                Na tela acima, coloque seu e-mail cadastrado:
                <strong style="color:#111827;">${escapeHtml(accessEmail)}</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px 0 28px;">
              <p style="margin:0;color:#374151;font-size:15px;line-height:1.65;">
                Pronto! Acesso liberado para a área demo. Veja layout, teste funcionalidades, pagamento e fluxo.
              </p>
              <p style="margin:10px 0 0 0;color:#374151;font-size:15px;line-height:1.65;">
                Personalizamos como quiser com a sua marca. Comece a vender!
              </p>
              ${additionalMessage ? `<p style="margin:10px 0 0 0;color:#334155;font-size:15px;line-height:1.65;"><strong>Observação:</strong> ${escapeHtml(additionalMessage)}</p>` : ''}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 24px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #dbeafe;background:#f8fbff;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;color:#1e3a8a;font-size:14px;line-height:1.6;">
                    Caso não receba o código de acesso no seu e-mail, responda esta mensagem que ajudamos imediatamente.
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-size:15px;color:#111827;font-weight:700;">Ficamos à disposição!</p>
              <p style="margin:6px 0 0 0;font-size:14px;color:#6b7280;">Equipe KoddaHub</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderDemoAccessEmailPlainText(input: DemoAccessEmailInput) {
  const clientName = String(input.clientName || 'Cliente').trim() || 'Cliente';
  const accessEmail = String(input.accessEmail || '').trim();
  const demoUrl = normalizeDemoUrl(input.demoUrl);
  const additionalMessage = String(input.additionalMessage || '').trim();

  return [
    'POP Acesso Demo',
    '',
    `Olá, ${clientName}!`,
    '',
    `Acesse via o link: ${demoUrl}`,
    '',
    'Na tela de login da Área Demo, informe o e-mail cadastrado:',
    accessEmail,
    '',
    'Pronto! Acesso liberado para a Área Demo.',
    'Teste layout, funcionalidades, pagamento e fluxo.',
    'Personalizamos tudo com a sua marca para começar a vender.',
    ...(additionalMessage ? ['', `Observação: ${additionalMessage}`] : []),
    '',
    'Caso não receba o código de acesso no seu e-mail, responda esta mensagem.',
    '',
    'Ficamos à disposição!',
    'Equipe KoddaHub',
  ].join('\n');
}
