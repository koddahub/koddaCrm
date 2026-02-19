<?php
declare(strict_types=1);

session_start();

use Shared\Core\Router;
use Shared\Infra\AsaasClient;
use Shared\Infra\PromptBuilder;
use Shared\Support\Auth;
use Shared\Support\Request;
use Shared\Support\Response;
use Shared\Support\Validator;

require_once __DIR__ . '/../../shared/src/bootstrap.php';

function h(string $v): string { return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function boolInput(mixed $v): bool {
  return in_array((string)$v, ['1','true','on','yes','sim'], true);
}

function requireClientAuth(): void {
  if (!isset($_SESSION['client_user'])) {
    header('Location: /login');
    exit;
  }
}

function recaptchaSiteKey(): string {
  return getenv('RECAPTCHA_SITE_KEY') ?: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
}

function recaptchaSecretKey(): string {
  return getenv('RECAPTCHA_SECRET_KEY') ?: '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';
}

function verifyRecaptchaToken(?string $token): bool {
  $token = trim((string)$token);
  if ($token === '') {
    return false;
  }

  $payload = http_build_query([
    'secret' => recaptchaSecretKey(),
    'response' => $token,
    'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '',
  ]);

  $raw = '';
  if (function_exists('curl_init')) {
    $ch = curl_init('https://www.google.com/recaptcha/api/siteverify');
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_TIMEOUT => 10,
      CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $res = curl_exec($ch);
    if ($res !== false) {
      $raw = (string)$res;
    }
    curl_close($ch);
  } else {
    $context = stream_context_create([
      'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => $payload,
        'timeout' => 10,
      ],
    ]);
    $raw = (string)@file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $context);
  }

  $decoded = json_decode($raw, true);
  return is_array($decoded) && !empty($decoded['success']);
}

function cardLuhnValid(string $number): bool {
  $digits = preg_replace('/\D+/', '', $number) ?? '';
  if (strlen($digits) < 13) return false;
  $sum = 0;
  $double = false;
  for ($i = strlen($digits) - 1; $i >= 0; $i--) {
    $digit = (int)$digits[$i];
    if ($double) {
      $digit *= 2;
      if ($digit > 9) $digit -= 9;
    }
    $sum += $digit;
    $double = !$double;
  }
  return $sum % 10 === 0;
}

function cardBrand(string $number): string {
  $n = preg_replace('/\D+/', '', $number) ?? '';
  if (preg_match('/^4/', $n)) return 'VISA';
  if (preg_match('/^5[1-5]|^2(2[2-9]|[3-6]|7[01]|720)/', $n)) return 'MASTERCARD';
  if (preg_match('/^3[47]/', $n)) return 'AMEX';
  if (preg_match('/^5067|^4576|^4011/', $n)) return 'ELO';
  return 'CARD';
}

function renderAuthPage(string $plan = 'basic', string $alert = ''): string {
  $plan = in_array($plan, ['basic','profissional','pro'], true) ? $plan : 'basic';
  $recaptchaKey = recaptchaSiteKey();

  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Área do Cliente KoddaHub</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="shortcut icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script src="https://www.google.com/recaptcha/api.js" async defer></script>
</head>
<body data-page="auth" data-recaptcha-sitekey="<?= h($recaptchaKey) ?>">
  <div class="auth-shell">
    <aside class="auth-left">
      <div>
        <div class="brand-row">
          <img src="https://koddahub.com.br/assets/logo/koddahub-logo-v2.png" alt="Logo KoddaHub">
          <div class="brand-text"><span class="kodda">Kodda</span><span class="hub">Hub</span></div>
        </div>
        <h1>Área do Cliente</h1>
        <p>Contrate seu plano, Hospedagem completa para seu negócio crescer.</p>
        <div class="plan-preview-wrap">
          <h2>Planos de hospedagem</h2>
          <button type="button" class="btn btn-ghost plan-preview-toggle" id="planPreviewToggle">Ver planos</button>
          <div class="plan-preview-grid">
            <article class="plan-preview-card">
              <div class="plan-preview-head">
                <strong>Básico</strong>
                <span class="plan-price">R$ 149,99/mês</span>
              </div>
              <ul>
                <li>Site institucional básico (1 página)</li>
                <li>Domínio incluso (se ainda não tiver)</li>
                <li>Migração gratuita</li>
                <li>1 e-mail profissional</li>
              </ul>
              <button type="button" class="btn btn-plan-select select-plan-btn" data-plan="basic">Selecionar no cadastro</button>
            </article>

            <article class="plan-preview-card featured">
              <div class="plan-preview-head">
                <strong>Profissional</strong>
                <span class="plan-price">R$ 249,00/mês</span>
              </div>
              <ul>
                <li>Site institucional até 3 páginas</li>
                <li>Formulário de contato + botão WhatsApp</li>
                <li>E-mails profissionais ilimitados</li>
                <li>Suporte técnico e atualizações</li>
              </ul>
              <button type="button" class="btn btn-plan-select select-plan-btn" data-plan="profissional">Selecionar no cadastro</button>
            </article>

            <article class="plan-preview-card">
              <div class="plan-preview-head">
                <strong>Pro</strong>
                <span class="plan-price">R$ 399,00/mês</span>
              </div>
              <ul>
                <li>Chatbot incluso no site</li>
                <li>E-commerce básico incluso</li>
                <li>Atualização de site industrial com catálogo</li>
                <li>Ranqueamento profissional no Google</li>
              </ul>
              <button type="button" class="btn btn-plan-select select-plan-btn" data-plan="pro">Selecionar no cadastro</button>
            </article>
          </div>
          <br>
          <p class="plan-preview-note">Sites customizados, integrações e sistemas sob medida são serviços à parte.</p>
        </div>

      </div>
      <div class="note">
        Login de teste: <strong>teste.cliente@koddahub.local</strong> | Senha: <strong>Teste@123</strong>
      </div>
    </aside>

    <main class="auth-right">
      <section class="auth-panel">
        <div class="panel-top">
          <div class="tabbar">
            <button class="tabbtn active" data-tab="login" type="button">Entrar</button>
            <button class="tabbtn" data-tab="signup" type="button">Contratar Plano</button>
          </div>
        </div>
        <div class="panel-body">
          <?php if ($alert !== ''): ?>
            <div id="authInlineNotice" class="alert err" aria-live="polite"><?= h($alert) ?></div>
          <?php else: ?>
            <div id="authInlineNotice" class="alert hidden" aria-live="polite"></div>
          <?php endif; ?>

          <div class="tab-login">
            <form id="loginForm">
              <div class="form-grid">
                <div class="form-col full"><label for="login_email">E-mail</label><input id="login_email" name="email" type="email" data-required="true" placeholder="voce@empresa.com"></div>
                <div class="form-col full"><label for="login_password">Senha</label><input id="login_password" name="password" type="password" data-required="true" placeholder="Sua senha"></div>
              </div>

              <div class="captcha-wrap" style="margin-top:12px">
                <div style="margin-top:10px">
                  <div class="g-recaptcha" data-sitekey="<?= h($recaptchaKey) ?>"></div>
                </div>
              </div>

              <div class="action-row">
                <button class="btn btn-primary" type="submit">Entrar na área do cliente</button>
                <button class="btn btn-google" id="googleLoginBtn" type="button" title="Google Login (demo local)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.1-1.9 3.4-4.8 3.4-8.5Z" fill="#4285F4"/><path d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.2-3.9 1.2-3 0-5.5-2-6.4-4.7H1.8V17A11 11 0 0 0 12 23Z" fill="#34A853"/><path d="M5.6 13.8A6.6 6.6 0 0 1 5.3 12c0-.6.1-1.3.3-1.8V7H1.8A11 11 0 0 0 1 12c0 1.8.4 3.5 1.2 5l3.4-3.2Z" fill="#FBBC05"/><path d="M12 5.2c1.7 0 3.1.6 4.3 1.7l3.2-3.2A11 11 0 0 0 12 1 11 11 0 0 0 1.8 7l3.8 3.2c.9-2.7 3.4-4.9 6.4-4.9Z" fill="#EA4335"/></svg>
                  Entrar com Google
                </button>
              </div>
              <p class="note" style="margin-top:10px">Google login em modo demo/local (sem credenciais OAuth em produção neste ambiente).</p>

              <div id="googleDemoPanel" class="google-demo-panel hidden" style="margin-top:12px">
                <div class="form-grid">
                  <div class="form-col"><label for="google_demo_name">Nome</label><input id="google_demo_name" type="text" value="Cliente Google"></div>
                  <div class="form-col"><label for="google_demo_email">E-mail Google</label><input id="google_demo_email" type="email" value="google.teste@koddahub.local"></div>
                </div>
                <div class="action-row">
                  <button class="btn btn-google" id="googleDemoSubmit" type="button">Continuar com Google</button>
                  <button class="btn btn-ghost" id="googleDemoCancel" type="button">Cancelar</button>
                </div>
              </div>
            </form>
          </div>

          <div class="tab-signup hidden">
            <form id="signupForm">
              <div class="step-label">Etapa 1 de 4</div>
              <div class="stepper"><span class="step active"></span><span class="step"></span><span class="step"></span><span class="step"></span></div>

              <div class="wizard-step" data-step="1">
                <div class="form-grid">
                  <div class="form-col"><label for="person_type">Tipo</label>
                    <select id="person_type" name="person_type" data-required="true"><option value="PF">Pessoa Física</option><option value="PJ">Pessoa Jurídica</option></select>
                  </div>
                  <div class="form-col"><label for="name">Nome responsável</label><input id="name" name="name" data-required="true"></div>
                  <div class="form-col"><label for="phone">Telefone / WhatsApp</label><input id="phone" name="phone" data-required="true" placeholder="41999999999"></div>
                  <div class="form-col"><label for="cpf_cnpj">CPF/CNPJ</label><input id="cpf_cnpj" name="cpf_cnpj" data-required="true"></div>
                  <div class="form-col"><label for="legal_name">Razão social / Nome</label><input id="legal_name" name="legal_name" data-required="true"></div>
                  <div class="form-col" id="trade_name_col"><label for="trade_name">Nome fantasia</label><input id="trade_name" name="trade_name"></div>
                </div>
              </div>

              <div class="wizard-step hidden" data-step="2">
                <div class="form-grid">
                  <div class="form-col"><label for="billing_email">E-mail de cobrança</label><input id="billing_email" name="billing_email" type="email" data-required="true"></div>
                  <div class="form-col"><label for="billing_zip">CEP</label><input id="billing_zip" name="billing_zip" data-required="true"></div>
                  <div class="form-col full"><label for="billing_street">Endereço</label><input id="billing_street" name="billing_street" data-required="true"></div>
                  <div class="form-col"><label for="billing_number">Número</label><input id="billing_number" name="billing_number" data-required="true"></div>
                  <div class="form-col"><label for="billing_complement">Complemento</label><input id="billing_complement" name="billing_complement"></div>
                  <div class="form-col"><label for="billing_district">Bairro</label><input id="billing_district" name="billing_district" data-required="true"></div>
                  <div class="form-col"><label for="billing_city">Cidade</label><input id="billing_city" name="billing_city" data-required="true"></div>
                  <div class="form-col"><label for="billing_state">UF</label><input id="billing_state" name="billing_state" maxlength="2" data-required="true"></div>
                </div>
              </div>

              <div class="wizard-step hidden" data-step="3">
                <div class="form-grid">
                  <div class="form-col"><label for="signup_email">E-mail de acesso</label><input id="signup_email" name="email" type="email" data-required="true"></div>
                  <div class="form-col"><label for="signup_password">Senha</label><input id="signup_password" name="password" type="password" data-required="true"></div>
                  <div class="form-col"><label for="signup_password_confirm">Confirmar senha</label><input id="signup_password_confirm" name="password_confirm" type="password" data-required="true"></div>
                  <div class="form-col full">
                    <label>Não sou um robô</label>
                    <div class="g-recaptcha" data-sitekey="<?= h($recaptchaKey) ?>"></div>
                  </div>
                  <div class="form-col full">
                    <label class="switch"><input type="checkbox" name="lgpd" data-required="true"> Li e aceito os termos de contratação e LGPD.</label>
                  </div>
                </div>
              </div>

              <div class="wizard-step hidden" data-step="4">
                <div class="form-grid">
                  <div class="form-col full"><label for="plan_code">Plano de hospedagem</label>
                    <select id="plan_code" name="plan_code" data-required="true">
                      <option value="basic" <?= $plan === 'basic' ? 'selected' : '' ?>>Básico - R$149,99/mês</option>
                      <option value="profissional" <?= $plan === 'profissional' ? 'selected' : '' ?>>Profissional - R$249,00/mês</option>
                      <option value="pro" <?= $plan === 'pro' ? 'selected' : '' ?>>Pro - R$399,00/mês</option>
                    </select>
                  </div>
                  <div class="form-col full">
                    <label>Método de pagamento recorrente</label>
                    <label class="switch"><input class="payment-method" type="radio" name="payment_method" value="CREDIT_CARD" checked> Cartão de crédito (recorrência)</label>
                    <label class="switch"><input class="payment-method" type="radio" name="payment_method" value="PIX"> PIX</label>
                  </div>
                </div>
                <div class="card-fields">
                  <div class="form-grid" style="margin-top:10px">
                    <div class="form-col full"><label for="card_holder">Titular do cartão</label><input id="card_holder" name="card_holder" data-required="true"></div>
                    <div class="form-col full"><label for="card_number">Número do cartão</label><input id="card_number" name="card_number" data-required="true" placeholder="0000 0000 0000 0000"></div>
                    <div class="form-col"><label for="card_expiry">Validade (MM/AA)</label><input id="card_expiry" name="card_expiry" data-required="true" placeholder="12/30"></div>
                    <div class="form-col"><label for="card_cvv">CVV</label><input id="card_cvv" name="card_cvv" data-required="true" placeholder="123"></div>
                  </div>
                  <div class="card-preview" style="margin-top:12px">
                    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong id="previewBrand">Cartão</strong><span id="cardValidChip" class="status-chip status-bad">Aguardando validação</span></div>
                    <div id="previewNumber" style="font-size:1.2rem;margin:8px 0">•••• •••• •••• ••••</div>
                    <div style="display:flex;justify-content:space-between;gap:10px"><small id="previewHolder">Titular</small><small id="previewExpiry">MM/AA</small></div>
                  </div>
                </div>
              </div>

              <div class="wizard-nav">
                <button type="button" class="btn btn-ghost" id="wizardPrev">Voltar</button>
                <button type="button" class="btn btn-primary" id="wizardNext">Próximo</button>
                <button type="submit" class="btn btn-accent hidden" id="wizardSubmit">Validar pagamento e entrar</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  </div>
  <script src="/assets/app.js"></script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function renderDashboard(?string $notice = null): string {
  $user = $_SESSION['client_user'];
  $orgId = $user['organization_id'] ?? null;

  if (empty($orgId)) {
    $foundOrg = db()->one("SELECT id FROM client.organizations WHERE user_id=:uid ORDER BY created_at DESC LIMIT 1", [':uid' => $user['id']]);
    if ($foundOrg) {
      $orgId = $foundOrg['id'];
      $_SESSION['client_user']['organization_id'] = $orgId;
    }
  }

  $org = $orgId ? db()->one("SELECT legal_name, domain, billing_email, whatsapp, cpf_cnpj, billing_street, billing_number, billing_city, billing_state FROM client.organizations WHERE id=:id", [':id' => $orgId]) : null;
  if (!$org) {
    $org = [
      'legal_name' => $user['name'] ?? 'Cliente KoddaHub',
      'domain' => '',
      'billing_email' => $user['email'] ?? '',
      'whatsapp' => '',
      'cpf_cnpj' => '',
      'billing_street' => '',
      'billing_number' => '',
      'billing_city' => '',
      'billing_state' => '',
    ];
  }

  $sub = $orgId ? db()->one("SELECT s.id, s.asaas_subscription_id, s.status, s.next_due_date, s.payment_method, p.name as plan_name, p.monthly_price FROM client.subscriptions s JOIN client.plans p ON p.id=s.plan_id WHERE s.organization_id=:oid ORDER BY s.created_at DESC LIMIT 1", [':oid' => $orgId]) : null;
  if (!$sub) {
    $basicPlan = db()->one("SELECT name, monthly_price FROM client.plans WHERE code='basic' LIMIT 1");
    $sub = [
      'id' => null,
      'asaas_subscription_id' => null,
      'status' => 'EM CONFIGURACAO',
      'next_due_date' => null,
      'payment_method' => 'PIX',
      'plan_name' => $basicPlan['name'] ?? 'Básico',
      'monthly_price' => $basicPlan['monthly_price'] ?? 149.99,
    ];
  }

  $tickets = $orgId ? db()->all("SELECT id, ticket_type, priority, status, created_at, subject FROM client.tickets WHERE organization_id=:oid ORDER BY created_at DESC LIMIT 12", [':oid' => $orgId]) : [];
  $payments = $orgId ? db()->all("SELECT p.amount, p.status, p.billing_type, p.due_date, p.paid_at FROM client.payments p JOIN client.subscriptions s ON s.id=p.subscription_id WHERE s.organization_id=:oid ORDER BY p.created_at DESC LIMIT 8", [':oid' => $orgId]) : [];
  $billingProfile = $orgId ? db()->one("SELECT card_last4, card_brand, exp_month, exp_year FROM client.billing_profiles bp JOIN client.subscriptions s ON s.id=bp.subscription_id WHERE s.organization_id=:oid ORDER BY bp.created_at DESC LIMIT 1", [':oid' => $orgId]) : null;
  $hasBriefing = $orgId ? (db()->one("SELECT id FROM client.project_briefs WHERE organization_id=:oid LIMIT 1", [':oid' => $orgId]) !== null) : false;

  $siteOnline = !empty($org['domain']) && strtoupper((string)($sub['status'] ?? '')) === 'ACTIVE';
  $siteStatusLabel = $siteOnline ? 'Online' : 'Aguardando publicação';
  $siteStatusClass = $siteOnline ? 'online' : 'offline';
  $uptime = $siteOnline ? '99,9%' : '--';
  $nextDue = !empty($sub['next_due_date']) ? date('d/m/Y', strtotime((string)$sub['next_due_date'])) : 'N/D';
  $fullAddress = trim((string)($org['billing_street'] ?? '') . ', ' . (string)($org['billing_number'] ?? '') . ' - ' . (string)($org['billing_city'] ?? '') . '/' . (string)($org['billing_state'] ?? ''));
  if ($fullAddress === ',  - /') {
    $fullAddress = 'Não informado';
  }

  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Portal do Cliente - KoddaHub</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="shortcut icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body data-page="dashboard" data-theme="dark" data-open-briefing="<?= $hasBriefing ? '0' : '1' ?>">
  <div class="client-layout">
    <aside class="client-sidebar">
      <div class="client-sidebar-logo-wrap">
        <a href="/portal/dashboard#dashboard" class="client-brand" aria-label="KoddaHub">
          <img src="/assets/koddahub-logo-v2.png" alt="" class="client-brand-icon" aria-hidden="true">
          <span class="client-brand-wordmark"><span class="kodda">Kodda</span><span class="hub">Hub</span></span>
        </a>
      </div>
      <div class="client-sidebar-user">
        <strong><?= h((string)($org['legal_name'] ?? ($user['name'] ?? 'Cliente KoddaHub'))) ?></strong>
        <small><?= h((string)($org['billing_email'] ?? ($user['email'] ?? ''))) ?></small>
      </div>
      <nav class="client-sidebar-nav">
        <a class="active" data-nav-section="dashboard" href="/portal/dashboard#dashboard"><i class="bi bi-bar-chart-line-fill" aria-hidden="true"></i> Dashboard</a>
        <a data-nav-section="chamados" href="/portal/dashboard#chamados"><i class="bi bi-ticket-detailed-fill" aria-hidden="true"></i> Chamados</a>
        <a data-nav-section="pagamentos" href="/portal/dashboard#pagamentos"><i class="bi bi-credit-card-2-front-fill" aria-hidden="true"></i> Pagamentos</a>
        <a data-nav-section="planos" href="/portal/dashboard#planos"><i class="bi bi-box-seam-fill" aria-hidden="true"></i> Planos</a>
        <a data-nav-section="perfil" href="/portal/dashboard#perfil"><i class="bi bi-person-badge-fill" aria-hidden="true"></i> Perfil</a>
      </nav>
      <div class="client-sidebar-support">
        <strong>Suporte 24/7</strong>
        <span>(41) 99999-9999</span>
        <span>suporte@koddahub.com.br</span>
      </div>
    </aside>

    <div class="client-main">
      <header class="client-header">
        <div>
          <h1>Painel do Cliente</h1>
          <p><?= h((string)($org['legal_name'] ?? ($user['name'] ?? 'Cliente KoddaHub'))) ?></p>
        </div>
        <div class="client-header-actions">
          <button class="btn btn-ghost theme-toggle-btn" type="button" id="themeToggle" aria-label="Alternar tema"><i class="bi bi-moon-stars-fill" aria-hidden="true"></i> Escuro</button>
          <button class="icon-btn" type="button" aria-label="Notificações"><i class="bi bi-bell-fill" aria-hidden="true"></i></button>
          <a class="btn btn-ghost" href="/portal/logout">Sair</a>
        </div>
      </header>

      <main id="dashboard-main" class="client-content">
        <div id="portalNotice" class="alert <?= $notice ? 'ok' : 'hidden' ?>"><?= $notice ? h($notice) : '' ?></div>

        <?php if (!$hasBriefing): ?>
          <section class="briefing-banner">
            <div class="briefing-banner-copy">
              <strong><i class="bi bi-rocket-takeoff-fill" aria-hidden="true"></i> Comece seu projeto agora!</strong>
              <span>Preencha o briefing do seu site e ganhe 15% de desconto no primeiro mês.</span>
            </div>
            <button type="button" class="btn btn-briefing-banner sidebar-open-briefing">Preencher Briefing</button>
          </section>
        <?php endif; ?>

        <section class="portal-section active" data-section="dashboard">
          <section class="site-status-card <?= h($siteStatusClass) ?>">
            <div class="status-pill <?= h($siteStatusClass) ?>"><?= h($siteStatusLabel) ?></div>
            <div class="status-meta">
              <span>Último check: <?= h(date('d/m/Y H:i')) ?></span>
              <span>Tempo de atividade: <?= h($uptime) ?></span>
            </div>
          </section>

          <section class="kpi-grid">
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-box-seam-fill" aria-hidden="true"></i> Plano</h4><strong><?= h((string)($sub['plan_name'] ?? 'N/D')) ?></strong></article>
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-pin-angle-fill" aria-hidden="true"></i> Status</h4><strong class="<?= strtoupper((string)($sub['status'] ?? '')) === 'ACTIVE' ? 'status-text-ok' : 'status-text-warn' ?>"><?= h((string)($sub['status'] ?? 'N/D')) ?></strong></article>
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-calendar-event-fill" aria-hidden="true"></i> Vencimento</h4><strong><?= h($nextDue) ?></strong></article>
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-cash-coin" aria-hidden="true"></i> Mensalidade</h4><strong>R$ <?= h(number_format((float)($sub['monthly_price'] ?? 0), 2, ',', '.')) ?></strong></article>
          </section>

          <section class="portal-card modern-card">
            <h3>Resumo do Contrato</h3>
            <div class="contract-grid">
              <div class="readonly-field"><label>Domínio</label><span><?= h((string)($org['domain'] ?? 'Não informado')) ?></span></div>
              <div class="readonly-field"><label>WhatsApp</label><span><?= h((string)($org['whatsapp'] ?? 'Não informado')) ?></span></div>
              <div class="readonly-field"><label>E-mail cobrança</label><span><?= h((string)($org['billing_email'] ?? 'Não informado')) ?></span></div>
              <div class="readonly-field"><label>ID Assinatura</label><span><?= h((string)($sub['asaas_subscription_id'] ?? 'N/D')) ?></span></div>
              <div class="readonly-field"><label>CPF/CNPJ</label><span><?= h((string)($org['cpf_cnpj'] ?? 'Não informado')) ?></span></div>
              <div class="readonly-field"><label>Endereço completo</label><span><?= h($fullAddress) ?></span></div>
            </div>
          </section>
        </section>

        <section class="portal-section" data-section="chamados">
          <section class="portal-card modern-card">
            <h3>Central de Chamados</h3>
            <form id="ticketForm" class="grid-2">
              <div class="form-col"><label>Tipo</label><select name="ticket_type" required><option value="SITE_FORA_DO_AR">Site fora do ar</option><option value="SUPORTE">Suporte técnico</option><option value="MUDANCA_PLANO">Dúvidas sobre plano</option><option value="ORCAMENTO_PRIORITARIO">Solicitar mudança</option></select></div>
              <div class="form-col"><label>Prioridade</label><select name="priority" required><option>BAIXA</option><option selected>NORMAL</option><option>ALTA</option><option>CRITICA</option></select></div>
              <div class="form-col full"><label>Assunto</label><input name="subject" required></div>
              <div class="form-col full"><label>Descrição detalhada</label><textarea name="description" required rows="5"></textarea></div>
              <div class="form-col full"><button class="btn btn-primary" type="submit">Abrir Chamado</button></div>
            </form>
          </section>
          <section class="portal-card modern-card">
            <h3>Histórico de Chamados</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Tipo</th><th>Assunto</th><th>Prioridade</th><th>Status</th><th>Data</th></tr></thead>
                <tbody>
                  <?php foreach ($tickets as $t): ?>
                  <tr>
                    <td data-label="Tipo"><?= h((string)$t['ticket_type']) ?></td>
                    <td data-label="Assunto"><?= h((string)$t['subject']) ?></td>
                    <td data-label="Prioridade"><?= h((string)$t['priority']) ?></td>
                    <td data-label="Status"><?= h((string)$t['status']) ?></td>
                    <td data-label="Data"><?= h(date('d/m/Y H:i', strtotime((string)$t['created_at']))) ?></td>
                  </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section class="portal-section" data-section="pagamentos">
          <section class="portal-card modern-card">
            <h3>Método de Pagamento Atual</h3>
            <div class="payment-summary">
              <div class="readonly-field"><label>Cartão atual</label><span><?= h(($billingProfile['card_brand'] ?? 'N/D') . ' •••• ' . ($billingProfile['card_last4'] ?? '----')) ?></span></div>
              <div class="readonly-field"><label>Vencimento</label><span><?= h(!empty($billingProfile['exp_month']) ? str_pad((string)$billingProfile['exp_month'], 2, '0', STR_PAD_LEFT) . '/' . $billingProfile['exp_year'] : 'N/D') ?></span></div>
            </div>
            <form id="cardForm" class="grid-2">
              <div class="form-col"><label>Titular do cartão</label><input name="card_holder" required></div>
              <div class="form-col"><label>Número do cartão</label><input name="card_number" required></div>
              <div class="form-col"><label>Validade (MM/AA)</label><input name="card_expiry" required></div>
              <div class="form-col"><label>CVV</label><input name="card_cvv" required></div>
              <div class="form-col full"><label>Senha da conta para confirmar</label><input type="password" name="account_password" required></div>
              <div class="form-col full"><button class="btn btn-primary" type="submit">Trocar cartão</button></div>
            </form>
          </section>
          <section class="portal-card modern-card">
            <h3>Histórico de Faturas</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Valor</th><th>Status</th><th>Método</th><th>Pago em</th></tr></thead>
                <tbody>
                  <?php foreach ($payments as $p): ?>
                  <tr>
                    <td data-label="Data"><?= h(!empty($p['due_date']) ? date('d/m/Y', strtotime((string)$p['due_date'])) : 'N/D') ?></td>
                    <td data-label="Valor">R$ <?= h(number_format((float)$p['amount'], 2, ',', '.')) ?></td>
                    <td data-label="Status"><?= h((string)$p['status']) ?></td>
                    <td data-label="Método"><?= h((string)$p['billing_type']) ?></td>
                    <td data-label="Pago em"><?= h(!empty($p['paid_at']) ? date('d/m/Y H:i', strtotime((string)$p['paid_at'])) : '-') ?></td>
                  </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section class="portal-section" data-section="planos">
          <section class="portal-card modern-card">
            <h3>Planos Disponíveis</h3>
            <div class="plans-grid">
              <article class="plan-tile">
                <h4>Básico</h4>
                <strong>R$ 149,99/mês</strong>
                <ul>
                  <li>Site 1 página</li>
                  <li>Domínio incluso</li>
                  <li>1 e-mail profissional</li>
                  <li>Migração gratuita</li>
                </ul>
              </article>
              <article class="plan-tile featured">
                <h4>Profissional</h4>
                <strong>R$ 249,00/mês</strong>
                <ul>
                  <li>Até 3 páginas</li>
                  <li>Formulário de contato</li>
                  <li>E-mails ilimitados</li>
                  <li>Suporte técnico</li>
                </ul>
              </article>
              <article class="plan-tile">
                <h4>Pro</h4>
                <strong>R$ 399,00/mês</strong>
                <ul>
                  <li>Chatbot incluso</li>
                  <li>E-commerce básico</li>
                  <li>Catálogo de produtos</li>
                  <li>SEO profissional</li>
                </ul>
              </article>
            </div>
            <form id="planForm" class="grid-2" style="margin-top:14px;">
              <input type="hidden" name="asaas_subscription_id" value="<?= h((string)($sub['asaas_subscription_id'] ?? '')) ?>">
              <div class="form-col"><label>Novo plano</label><select name="plan_code" required><option value="basic">Básico</option><option value="profissional">Profissional</option><option value="pro">Pro</option></select></div>
              <div class="form-col"><label>Justificativa</label><textarea name="justificativa" required></textarea></div>
              <div class="form-col full"><button class="btn btn-accent" type="submit" <?= empty($sub['asaas_subscription_id']) ? 'disabled title="Finalize a contratação para habilitar troca de plano"' : '' ?>>Solicitar troca</button></div>
            </form>
          </section>
        </section>

        <section class="portal-section" data-section="perfil">
          <section class="portal-card modern-card">
            <h3>Perfil e Conta</h3>
            <form id="profileForm" class="grid-2">
              <div class="form-col">
                <label>Nome da conta</label>
                <input name="name" value="<?= h((string)($org['legal_name'] ?? ($user['name'] ?? 'Cliente KoddaHub'))) ?>" required>
              </div>
              <div class="form-col">
                <label>E-mail de acesso</label>
                <input type="email" name="email" value="<?= h((string)($org['billing_email'] ?? ($user['email'] ?? ''))) ?>" required>
              </div>
              <div class="form-col">
                <label>WhatsApp</label>
                <input name="phone" value="<?= h((string)($org['whatsapp'] ?? '')) ?>" placeholder="(41) 99999-9999">
              </div>
              <div class="form-col">
                <label>E-mail de cobrança</label>
                <input type="email" name="billing_email" value="<?= h((string)($org['billing_email'] ?? ($user['email'] ?? ''))) ?>" required>
              </div>
              <div class="form-col">
                <label>Nova senha (opcional)</label>
                <input type="password" name="new_password" placeholder="mínimo 6 caracteres">
              </div>
              <div class="form-col">
                <label>Confirmar nova senha</label>
                <input type="password" name="new_password_confirm" placeholder="repita a nova senha">
              </div>
              <div class="form-col full">
                <label>Senha atual (obrigatória para salvar)</label>
                <input type="password" name="account_password" required>
              </div>
              <div class="form-col full">
                <button type="submit" class="btn btn-primary">Salvar alterações</button>
              </div>
            </form>
            <div class="contract-grid" style="margin-top:12px">
              <div class="readonly-field"><label>Plano atual</label><span><?= h((string)($sub['plan_name'] ?? 'N/D')) ?></span></div>
              <div class="readonly-field"><label>Status assinatura</label><span><?= h((string)($sub['status'] ?? 'N/D')) ?></span></div>
              <div class="readonly-field"><label>ID assinatura</label><span><?= h((string)($sub['asaas_subscription_id'] ?? 'N/D')) ?></span></div>
            </div>
          </section>
        </section>
      </main>
    </div>
  </div>

  <nav class="mobile-bottom-nav" aria-label="Navegação mobile">
    <a class="active" data-nav-section="dashboard" href="/portal/dashboard#dashboard"><span class="icon"><i class="bi bi-bar-chart-line-fill" aria-hidden="true"></i></span><span class="label">Início</span></a>
    <a data-nav-section="chamados" href="/portal/dashboard#chamados"><span class="icon"><i class="bi bi-ticket-detailed-fill" aria-hidden="true"></i></span><span class="label">Chamados</span></a>
    <a data-nav-section="pagamentos" href="/portal/dashboard#pagamentos"><span class="icon"><i class="bi bi-credit-card-2-front-fill" aria-hidden="true"></i></span><span class="label">Pagamentos</span></a>
    <a data-nav-section="planos" href="/portal/dashboard#planos"><span class="icon"><i class="bi bi-box-seam-fill" aria-hidden="true"></i></span><span class="label">Planos</span></a>
    <a data-nav-section="perfil" href="/portal/dashboard#perfil"><span class="icon"><i class="bi bi-person-badge-fill" aria-hidden="true"></i></span><span class="label">Perfil</span></a>
  </nav>

  <div id="briefingModal" class="portal-modal hidden" aria-hidden="true">
    <div class="portal-modal-backdrop"></div>
    <div class="portal-modal-dialog briefing-premium-dialog">
      <header class="portal-modal-header">
        <div>
          <h3><i class="bi bi-rocket-takeoff-fill" aria-hidden="true"></i> Vamos criar o site dos seus sonhos?</h3>
          <p class="note">Responda algumas perguntas para entendermos seu negócio e criarmos um site perfeito para você.</p>
        </div>
        <button type="button" class="icon-btn" data-modal-close aria-label="Fechar"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </header>
      <div class="brief-progress-labels">
        <span data-progress-step="0" class="active">Boas-vindas</span>
        <span data-progress-step="1">Sua Marca</span>
        <span data-progress-step="2">Seu Negócio</span>
        <span data-progress-step="3">Estilo Visual</span>
        <span data-progress-step="4">Conteúdo</span>
        <span data-progress-step="5">Revisão</span>
      </div>
      <div class="brief-progress">
        <span id="briefProgressBar" style="width:16.66%"></span>
      </div>
      <p id="briefProgressHint" class="note brief-hint">Tempo médio: 5-8 minutos</p>
      <div id="briefInlineNotice" class="alert hidden" aria-live="polite"></div>
      <form id="briefModalForm" enctype="multipart/form-data">
        <div class="brief-step" data-brief-step="0">
          <section class="brief-welcome">
            <h4><i class="bi bi-stars" aria-hidden="true"></i> Que bom ter você aqui!</h4>
            <p>Vamos criar um site incrível para seu negócio. Não se preocupe se não souber todas as respostas agora, vamos te ajudar em cada etapa.</p>
            <div class="brief-benefits">
              <article><strong><i class="bi bi-palette-fill" aria-hidden="true"></i></strong><span>Site personalizado para sua marca</span></article>
              <article><strong><i class="bi bi-lightning-charge-fill" aria-hidden="true"></i></strong><span>Estrutura otimizada para atrair clientes</span></article>
              <article><strong><i class="bi bi-phone-fill" aria-hidden="true"></i></strong><span>100% responsivo em qualquer dispositivo</span></article>
              <article><strong><i class="bi bi-search" aria-hidden="true"></i></strong><span>Pronto para indexação no Google</span></article>
            </div>
          </section>
        </div>

        <div class="brief-step hidden" data-brief-step="1">
          <h4>Passo 1: Sua Identidade Visual</h4>
          <p class="note">Conte-nos sobre os elementos visuais que você já possui.</p>
          <div class="grid-2">
            <div class="form-col full">
              <label>Você já tem logo? *</label>
              <div class="radio-card-grid">
                <label class="radio-card"><input type="radio" name="has_logo" value="yes" data-brief-toggle="has_logo" checked><span><i class="bi bi-check-circle-fill" aria-hidden="true"></i> Sim, tenho logo</span></label>
                <label class="radio-card"><input type="radio" name="has_logo" value="no" data-brief-toggle="has_logo"><span><i class="bi bi-magic" aria-hidden="true"></i> Não, preciso de criação</span></label>
              </div>
            </div>
            <div class="form-col conditional-field" data-show-if="has_logo:yes">
              <label>Upload do logo</label>
              <div class="file-uploader">
                <input id="briefLogoFile" class="brief-file-input" type="file" name="logo_file" accept="image/png,image/jpeg,image/svg+xml">
                <label for="briefLogoFile" class="file-uploader-btn">Selecionar logo</label>
                <span class="file-uploader-meta">Nenhum arquivo selecionado</span>
              </div>
            </div>
            <div class="form-col conditional-field hidden" data-show-if="has_logo:no">
              <label>Descreva o logo desejado</label>
              <textarea name="logo_description" placeholder="Ex: símbolo de engrenagem em azul marinho e dourado..."></textarea>
            </div>
            <div class="form-col">
              <label>Possui manual de marca?</label>
              <select name="has_brand_manual" data-brief-toggle="has_brand_manual">
                <option value="yes">Sim, completo</option>
                <option value="partial">Tenho parcialmente</option>
                <option value="no">Não tenho</option>
              </select>
            </div>
            <div class="form-col conditional-field" data-show-if="has_brand_manual:yes|partial">
              <label>Upload dos arquivos de marca</label>
              <div class="file-uploader">
                <input id="briefBrandFiles" class="brief-file-input" type="file" name="brand_files[]" multiple accept=".pdf,.ai,.eps,.png,.jpg,.txt">
                <label for="briefBrandFiles" class="file-uploader-btn">Adicionar arquivos</label>
                <span class="file-uploader-meta">Nenhum arquivo selecionado</span>
              </div>
            </div>
            <div class="form-col conditional-field hidden" data-show-if="has_brand_manual:no">
              <label>Cores da marca</label>
              <input type="text" name="brand_colors" placeholder="Ex: azul marinho, dourado e branco">
            </div>
            <div class="form-col conditional-field hidden" data-show-if="has_brand_manual:no">
              <label>Tipografia preferida</label>
              <select name="brand_fonts">
                <option value="modern">Moderna (sem serifa)</option>
                <option value="classic">Clássica (com serifa)</option>
                <option value="elegant">Elegante</option>
                <option value="casual">Casual</option>
                <option value="undefined">Ainda não sei</option>
              </select>
            </div>
          </div>
        </div>

        <div class="brief-step hidden" data-brief-step="2">
          <h4>Passo 2: Sobre seu Negócio</h4>
          <p class="note">Essas respostas definem a estratégia do site.</p>
          <div class="grid-2">
            <div class="form-col">
              <label>Tipo de negócio *</label>
              <select name="business_type" data-brief-toggle="business_type" required>
                <option value="servicos">Prestação de serviços</option>
                <option value="produtos">Comércio / Produtos</option>
                <option value="profissional">Profissional liberal</option>
                <option value="restaurante">Restaurante / Alimentação</option>
                <option value="educacao">Educação</option>
                <option value="saude">Saúde / Bem-estar</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div class="form-col">
              <label>Tempo de atuação</label>
              <select name="business_time">
                <option value="startup">Menos de 1 ano</option>
                <option value="crescendo">1 a 5 anos</option>
                <option value="estavel">Mais de 5 anos</option>
                <option value="tradicional">Mais de 10 anos</option>
              </select>
            </div>
            <div class="form-col full"><label>Objetivo principal do site *</label><textarea name="objective" required placeholder="Ex: atrair novos clientes, vender online..."></textarea></div>
            <div class="form-col full"><label>Público-alvo *</label><textarea name="audience" required placeholder="Faixa etária, região, perfil de compra..."></textarea></div>
            <div class="form-col"><label>Diferenciais competitivos</label><textarea name="differentials"></textarea></div>
            <div class="form-col"><label>Principais produtos/serviços</label><textarea name="services"></textarea></div>
            <div class="form-col full"><label>Nicho específico</label><input name="has_differentiation" placeholder="Ex: clínicas estéticas, indústrias de médio porte..."></div>
          </div>
        </div>

        <div class="brief-step hidden" data-brief-step="3">
          <h4>Passo 3: Estilo e Personalidade</h4>
          <div class="grid-2">
            <div class="form-col">
              <label>Tom de voz *</label>
              <select name="tone_of_voice" required>
                <option value="Formal e Sério">Formal e Sério</option>
                <option value="Profissional" selected>Profissional</option>
                <option value="Equilibrado">Equilibrado</option>
                <option value="Amigável">Amigável</option>
                <option value="Descontraído e Divertido">Descontraído</option>
              </select>
            </div>
            <div class="form-col">
              <label>Estilo visual *</label>
              <select name="style_vibe" required>
                <option value="modern">Moderno e clean</option>
                <option value="corporate">Corporativo</option>
                <option value="creative">Criativo</option>
                <option value="elegant">Elegante</option>
                <option value="friendly">Aconchegante</option>
                <option value="tech">Tecnológico</option>
              </select>
            </div>
            <div class="form-col"><label>Paleta de cores</label><input name="color_palette" placeholder="Ex: azul marinho, branco, dourado"></div>
            <div class="form-col"><label>CTA principal *</label><select name="cta_text" required><option value="Entrar em contato via WhatsApp">Entrar em contato (WhatsApp)</option><option value="Preencher formulário">Preencher formulário</option><option value="Solicitar orçamento">Solicitar orçamento</option><option value="Comprar agora">Comprar agora</option><option value="Agendar horário">Agendar horário</option></select></div>
            <div class="form-col full"><label>Sites de referência</label><textarea name="visual_references" placeholder="Cole links e diga o que você gosta em cada um"></textarea></div>
            <div class="form-col full"><label>Objetivos secundários</label><input name="secondary_goals" placeholder="Ex: ver portfólio, depoimentos, equipe..."></div>
          </div>
        </div>

        <div class="brief-step hidden" data-brief-step="4">
          <h4>Passo 4: Conteúdo e Funcionalidades</h4>
          <div class="grid-2">
            <div class="form-col full">
              <label>Você já possui textos/imagens? *</label>
              <div class="radio-card-grid">
                <label class="radio-card"><input type="radio" name="has_content" value="yes" data-brief-toggle="has_content"> <span><i class="bi bi-check-circle-fill" aria-hidden="true"></i> Tenho tudo pronto</span></label>
                <label class="radio-card"><input type="radio" name="has_content" value="partial" data-brief-toggle="has_content" checked> <span><i class="bi bi-file-earmark-text-fill" aria-hidden="true"></i> Tenho parte do conteúdo</span></label>
                <label class="radio-card"><input type="radio" name="has_content" value="no" data-brief-toggle="has_content"> <span><i class="bi bi-pencil-square" aria-hidden="true"></i> Preciso de produção</span></label>
              </div>
            </div>
            <div class="form-col conditional-field" data-show-if="has_content:yes|partial">
              <label>Upload do conteúdo existente</label>
              <div class="file-uploader">
                <input id="briefContentFiles" class="brief-file-input" type="file" name="content_files[]" multiple accept=".doc,.docx,.txt,.pdf,.jpg,.png,.mp4">
                <label for="briefContentFiles" class="file-uploader-btn">Adicionar conteúdo</label>
                <span class="file-uploader-meta">Nenhum arquivo selecionado</span>
              </div>
            </div>
            <div class="form-col">
              <label>Domínio desejado</label>
              <input name="domain_target" placeholder="meusite.com.br">
            </div>
            <div class="form-col">
              <label>Domínio já está registrado?</label>
              <select name="has_domain">
                <option value="yes">Sim, já tenho</option>
                <option value="no">Não, preciso registrar</option>
                <option value="transfer">Preciso transferir</option>
              </select>
            </div>
            <div class="form-col full">
              <label>Páginas necessárias</label>
              <div class="check-chip-grid" id="pagesNeeded">
                <label><input type="checkbox" value="Página Inicial" checked> Página Inicial</label>
                <label><input type="checkbox" value="Sobre Nós"> Sobre Nós</label>
                <label><input type="checkbox" value="Serviços/Produtos"> Serviços/Produtos</label>
                <label><input type="checkbox" value="Portfólio"> Portfólio</label>
                <label><input type="checkbox" value="Blog"> Blog</label>
                <label><input type="checkbox" value="Contato" checked> Contato</label>
                <label><input type="checkbox" value="Depoimentos"> Depoimentos</label>
                <label><input type="checkbox" value="Equipe"> Equipe</label>
              </div>
            </div>
            <div class="form-col full">
              <label>Integrações desejadas</label>
              <div class="check-chip-grid" id="integrationsNeeded">
                <label><input type="checkbox" value="WhatsApp"> WhatsApp</label>
                <label><input type="checkbox" value="Instagram"> Instagram</label>
                <label><input type="checkbox" value="Google Maps"> Google Maps</label>
                <label><input type="checkbox" value="Google Analytics"> Google Analytics</label>
                <label><input type="checkbox" value="Chat online"> Chat online</label>
                <label><input type="checkbox" value="Newsletter"> Newsletter</label>
                <label><input type="checkbox" value="Agendamento online"> Agendamento online</label>
                <label><input type="checkbox" value="Pagamentos online"> Pagamentos online</label>
              </div>
            </div>
            <div class="form-col full"><label>Conteúdo legal / observações</label><textarea name="legal_content" placeholder="Políticas, termos, CNPJ, regras obrigatórias..."></textarea></div>
            <div class="form-col full"><label>Requisitos técnicos extras</label><textarea name="extra_requirements" placeholder="Conte tudo que imaginar para o projeto."></textarea></div>
            <input type="hidden" name="integrations" id="briefIntegrationsField">
          </div>
        </div>

        <div class="brief-step hidden" data-brief-step="5">
          <h4>Passo 5: Revisão do Briefing</h4>
          <p class="note">Confira tudo antes de finalizar. Você poderá pedir ajustes depois.</p>
          <div id="briefReview" class="brief-review-grid"></div>
          <label class="brief-terms"><input type="checkbox" id="briefTerms" required> Li e concordo que as informações fornecidas serão usadas para criação do site.</label>
        </div>

        <div id="briefPromptResult" class="alert hidden"></div>
        <div class="wizard-nav">
          <button type="button" class="btn btn-ghost" id="briefPrev">← Voltar</button>
          <button type="button" class="btn btn-primary" id="briefNext">Próximo →</button>
          <button type="submit" class="btn btn-accent hidden" id="briefSubmit">Salvar briefing e gerar prompt</button>
        </div>
      </form>
    </div>
  </div>

  <script src="/assets/app.js"></script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function onboardingPage(?string $output = null): string {
  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Briefing de Projeto</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="shortcut icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
</head>
<body>
  <div class="portal-wrap">
    <div class="portal-nav">
      <div><strong>Briefing Institucional</strong></div>
      <div><a href="/portal/dashboard">Voltar ao painel</a></div>
    </div>

    <div class="portal-card">
      <form id="briefForm">
        <div class="form-grid">
          <div class="form-col"><label>Objetivo principal *</label><textarea name="objective" required></textarea></div>
          <div class="form-col"><label>Público-alvo *</label><textarea name="audience" required></textarea></div>
          <div class="form-col"><label>Diferenciais</label><textarea name="differentials"></textarea></div>
          <div class="form-col"><label>Serviços principais</label><textarea name="services"></textarea></div>
          <div class="form-col"><label>CTA principal</label><input name="cta_text"></div>
          <div class="form-col"><label>Tom de voz</label><input name="tone_of_voice"></div>
          <div class="form-col"><label>Paleta de cores</label><input name="color_palette"></div>
          <div class="form-col"><label>Referências visuais</label><textarea name="references"></textarea></div>
          <div class="form-col"><label>Conteúdo legal</label><textarea name="legal_content"></textarea></div>
          <div class="form-col"><label>Integrações</label><textarea name="integrations"></textarea></div>
          <div class="form-col"><label>Domínio alvo</label><input name="domain_target"></div>
          <div class="form-col"><label>Requisitos extras</label><textarea name="extra_requirements"></textarea></div>
        </div>
        <div class="action-row"><button class="btn btn-accent" type="submit">Salvar briefing e gerar prompt</button></div>
      </form>
    </div>

    <?php if ($output): ?>
      <div class="portal-card"><h3>Prompt gerado</h3><pre style="white-space:pre-wrap"><?= h($output) ?></pre></div>
    <?php endif; ?>
  </div>

  <script>
    document.getElementById('briefForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      const r = await fetch('/api/onboarding/site-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)});
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Erro ao salvar briefing'); return; }
      window.location.href = '/onboarding/site-brief?ok=1';
    });
  </script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function ensureClientSession(array $userRow): void {
  $_SESSION['client_user'] = [
    'id' => $userRow['id'],
    'organization_id' => $userRow['organization_id'] ?? null,
    'name' => $userRow['name'],
    'email' => $userRow['email'],
  ];
}

function queueWelcomeMessages(string $orgId, string $name, string $email, string $phone): void {
  db()->exec("INSERT INTO crm.email_queue(organization_id,email_to,subject,body,status) VALUES(:oid,:to,:s,:b,'PENDING')", [
    ':oid' => $orgId,
    ':to' => $email,
    ':s' => 'Bem-vindo(a) à KoddaHub',
    ':b' => "Olá {$name}, sua contratação foi recebida e seu ambiente foi iniciado."
  ]);

  if ($phone !== '') {
    db()->exec("INSERT INTO crm.manual_whatsapp_queue(organization_id,phone,template_key,context,status) VALUES(:oid,:phone,'welcome_after_contract',:ctx,'PENDING')", [
      ':oid' => $orgId,
      ':phone' => $phone,
      ':ctx' => json_encode(['name' => $name], JSON_UNESCAPED_UNICODE)
    ]);
  }
}

function normalizeUploadFiles(string $field): array {
  if (!isset($_FILES[$field])) return [];
  $f = $_FILES[$field];
  $out = [];
  if (is_array($f['name'])) {
    foreach ($f['name'] as $i => $name) {
      if (($f['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) continue;
      $out[] = [
        'name' => (string)$name,
        'tmp_name' => (string)($f['tmp_name'][$i] ?? ''),
      ];
    }
    return $out;
  }
  if (($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
    $out[] = ['name' => (string)$f['name'], 'tmp_name' => (string)$f['tmp_name']];
  }
  return $out;
}

function storeBriefUploads(string $orgId, string $briefId): array {
  $root = dirname(__DIR__, 3);
  $baseDir = $root . '/storage/uploads/briefings/' . $orgId . '/' . $briefId;
  if (!is_dir($baseDir)) {
    @mkdir($baseDir, 0775, true);
  }
  $stored = [];
  foreach (['upload_logo', 'upload_assets', 'upload_content', 'logo_file', 'brand_files', 'content_files'] as $field) {
    foreach (normalizeUploadFiles($field) as $file) {
      $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']) ?: 'file.bin';
      $target = $baseDir . '/' . time() . '_' . $safe;
      $ok = @move_uploaded_file($file['tmp_name'], $target);
      if (!$ok && is_file($file['tmp_name'])) {
        $ok = @copy($file['tmp_name'], $target);
      }
      if ($ok) {
        $stored[] = str_replace($root . '/', '', $target);
      } else {
        $stored[] = 'upload_failed:' . $safe;
      }
    }
  }
  return $stored;
}

function registerContract(Request $request): void {
  $d = $request->body;
  $required = ['name','email','password','phone','person_type','cpf_cnpj','legal_name','billing_email','plan_code','billing_zip','billing_street','billing_number','billing_district','billing_city','billing_state'];
  $errors = Validator::required($d, $required);

  if (!Validator::email($d['email'] ?? null) || !Validator::email($d['billing_email'] ?? null)) {
    $errors['email'] = 'E-mail inválido';
  }
  if (!verifyRecaptchaToken((string)($d['g-recaptcha-response'] ?? ''))) {
    $errors['g-recaptcha-response'] = 'Validação reCAPTCHA inválida';
  }
  if (!boolInput($d['lgpd'] ?? false)) {
    $errors['lgpd'] = 'Aceite LGPD é obrigatório';
  }
  if (strlen((string)($d['password'] ?? '')) < 6) {
    $errors['password'] = 'Senha precisa de pelo menos 6 caracteres';
  }

  $paymentMethod = strtoupper((string)($d['payment_method'] ?? 'CREDIT_CARD'));
  if (!in_array($paymentMethod, ['PIX','CREDIT_CARD'], true)) {
    $errors['payment_method'] = 'Método de pagamento inválido';
  }

  if ($paymentMethod === 'CREDIT_CARD') {
    $cardNumber = (string)($d['card_number'] ?? '');
    $cardExpiry = (string)($d['card_expiry'] ?? '');
    $cardCvv = (string)($d['card_cvv'] ?? '');

    if (!cardLuhnValid($cardNumber)) $errors['card_number'] = 'Cartão inválido';
    if (!preg_match('/^\d{2}\/\d{2}$/', $cardExpiry)) $errors['card_expiry'] = 'Validade inválida';
    if (!preg_match('/^\d{3,4}$/', $cardCvv)) $errors['card_cvv'] = 'CVV inválido';
  }

  if (!empty($errors)) {
    Response::json(['error' => 'Dados inválidos', 'details' => $errors], 422);
    return;
  }

  $exists = db()->one("SELECT id FROM client.users WHERE email=:email", [':email' => $d['email']]);
  if ($exists) {
    Response::json(['error' => 'E-mail já cadastrado'], 409);
    return;
  }

  $signupSessionId = db()->one("INSERT INTO crm.signup_session(email,phone,plan_code,status,source,payment_confirmed,metadata)
VALUES(:email,:phone,:plan,'SIGNUP_STARTED','SIGNUP_FLOW',false,:meta) RETURNING id", [
    ':email' => strtolower((string)$d['email']),
    ':phone' => preg_replace('/\D+/', '', (string)$d['phone']),
    ':plan' => $d['plan_code'],
    ':meta' => json_encode(['entrypoint' => 'portal_register'], JSON_UNESCAPED_UNICODE),
  ])['id'];

  $uid = db()->one("INSERT INTO client.users(name,email,password_hash,phone,role) VALUES(:n,:e,:p,:ph,'CLIENTE') RETURNING id", [
    ':n' => $d['name'], ':e' => $d['email'], ':p' => Auth::hashPassword((string)$d['password']), ':ph' => $d['phone'],
  ])['id'];

  $orgId = db()->one("INSERT INTO client.organizations(user_id,person_type,cpf_cnpj,legal_name,trade_name,billing_email,whatsapp,domain,billing_zip,billing_street,billing_number,billing_complement,billing_district,billing_city,billing_state,billing_country,has_domain,has_site,current_site_url)
VALUES(:u,:pt,:doc,:ln,:tn,:be,:wa,:dom,:zip,:street,:num,:comp,:district,:city,:state,:country,:hasDomain,:hasSite,:siteUrl) RETURNING id", [
    ':u' => $uid,
    ':pt' => $d['person_type'],
    ':doc' => $d['cpf_cnpj'],
    ':ln' => $d['legal_name'],
    ':tn' => $d['trade_name'] ?? null,
    ':be' => $d['billing_email'],
    ':wa' => $d['phone'],
    ':dom' => $d['domain'] ?? null,
    ':zip' => $d['billing_zip'],
    ':street' => $d['billing_street'],
    ':num' => $d['billing_number'],
    ':comp' => $d['billing_complement'] ?? null,
    ':district' => $d['billing_district'],
    ':city' => $d['billing_city'],
    ':state' => strtoupper((string)$d['billing_state']),
    ':country' => $d['billing_country'] ?? 'Brasil',
    ':hasDomain' => boolInput($d['has_domain'] ?? false) ? 'true' : 'false',
    ':hasSite' => boolInput($d['has_site'] ?? false) ? 'true' : 'false',
    ':siteUrl' => $d['current_site_url'] ?? null,
  ])['id'];

  db()->exec("UPDATE crm.signup_session SET organization_id=:oid, status='CHECKOUT_STARTED', updated_at=now() WHERE id=:id", [
    ':oid' => $orgId,
    ':id' => $signupSessionId,
  ]);

  $plan = db()->one("SELECT id, code, monthly_price FROM client.plans WHERE code=:c", [':c' => $d['plan_code']]);
  if (!$plan) {
    Response::json(['error' => 'Plano inválido'], 422);
    return;
  }

  $asaas = new AsaasClient();
  $customer = $asaas->createCustomer([
    'name' => $d['legal_name'],
    'email' => $d['billing_email'],
    'mobilePhone' => $d['phone'],
    'cpfCnpj' => $d['cpf_cnpj'],
  ]);

  $subscriptionPayload = [
    'customer' => $customer['id'] ?? null,
    'billingType' => $paymentMethod,
    'value' => (float)$plan['monthly_price'],
    'nextDueDate' => date('Y-m-d', strtotime('+1 day')),
    'cycle' => 'MONTHLY',
    'description' => 'Assinatura KoddaHub plano ' . $plan['code'],
  ];

  if ($paymentMethod === 'CREDIT_CARD' && (getenv('ASAAS_API_KEY') ?: '') !== '') {
    [$mm, $yy] = explode('/', (string)$d['card_expiry']);
    $subscriptionPayload['creditCard'] = [
      'holderName' => $d['card_holder'],
      'number' => preg_replace('/\D+/', '', (string)$d['card_number']),
      'expiryMonth' => $mm,
      'expiryYear' => '20' . $yy,
      'ccv' => preg_replace('/\D+/', '', (string)$d['card_cvv']),
    ];
    $subscriptionPayload['creditCardHolderInfo'] = [
      'name' => $d['legal_name'],
      'email' => $d['billing_email'],
      'cpfCnpj' => $d['cpf_cnpj'],
      'postalCode' => preg_replace('/\D+/', '', (string)$d['billing_zip']),
      'addressNumber' => $d['billing_number'],
      'phone' => $d['phone'],
    ];
  }

  $subscription = $asaas->createSubscription($subscriptionPayload);
  $subStatus = ((getenv('ASAAS_API_KEY') ?: '') === '' && $paymentMethod === 'CREDIT_CARD') ? 'ACTIVE' : 'PENDING';

  $subId = db()->one("INSERT INTO client.subscriptions(organization_id,plan_id,asaas_customer_id,asaas_subscription_id,status,payment_method,next_due_date,grace_until) VALUES(:o,:p,:cid,:sid,:status,:pm,:due,:grace) RETURNING id", [
    ':o' => $orgId,
    ':p' => $plan['id'],
    ':cid' => $customer['id'] ?? null,
    ':sid' => $subscription['id'] ?? ('mock_sub_' . substr((string)$orgId, 0, 8)),
    ':status' => $subStatus,
    ':pm' => $paymentMethod,
    ':due' => date('Y-m-d', strtotime('+30 days')),
    ':grace' => date('Y-m-d', strtotime('+7 days')),
  ])['id'];

  db()->exec("UPDATE crm.signup_session
SET status=:status,
    metadata = coalesce(metadata, '{}'::jsonb) || :meta::jsonb,
    updated_at=now()
WHERE id=:id", [
    ':status' => $subStatus === 'ACTIVE' ? 'PAYMENT_CONFIRMED' : 'SUBSCRIPTION_CREATED',
    ':meta' => json_encode([
      'subscription_id' => $subId,
      'asaas_subscription_id' => $subscription['id'] ?? ('mock_sub_' . substr((string)$orgId, 0, 8)),
      'payment_method' => $paymentMethod,
    ], JSON_UNESCAPED_UNICODE),
    ':id' => $signupSessionId,
  ]);

  if ($subStatus === 'ACTIVE') {
    db()->exec("UPDATE crm.signup_session SET payment_confirmed=true, updated_at=now() WHERE id=:id", [
      ':id' => $signupSessionId,
    ]);
  }

  if ($paymentMethod === 'CREDIT_CARD') {
    $digits = preg_replace('/\D+/', '', (string)$d['card_number']);
    $last4 = substr($digits, -4);
    [$mm, $yy] = explode('/', (string)$d['card_expiry']);
    db()->exec("INSERT INTO client.billing_profiles(subscription_id,card_holder,card_last4,card_brand,exp_month,exp_year,is_validated)
VALUES(:sid,:holder,:last4,:brand,:m,:y,true)
ON CONFLICT (subscription_id) DO UPDATE SET card_holder=excluded.card_holder,card_last4=excluded.card_last4,card_brand=excluded.card_brand,exp_month=excluded.exp_month,exp_year=excluded.exp_year,is_validated=true", [
      ':sid' => $subId,
      ':holder' => $d['card_holder'],
      ':last4' => $last4,
      ':brand' => cardBrand((string)$d['card_number']),
      ':m' => (int)$mm,
      ':y' => (int)('20' . $yy),
    ]);

    if ((getenv('ASAAS_API_KEY') ?: '') === '') {
      db()->exec("INSERT INTO client.payments(subscription_id,asaas_payment_id,amount,status,billing_type,due_date,paid_at,raw_payload)
VALUES(:sid,:pid,:amount,'RECEIVED','CREDIT_CARD',CURRENT_DATE,now(),:raw)", [
        ':sid' => $subId,
        ':pid' => 'mock_pay_' . substr((string)$subId, 0, 8),
        ':amount' => (float)$plan['monthly_price'],
        ':raw' => json_encode(['simulated' => true], JSON_UNESCAPED_UNICODE),
      ]);
    }
  }

  db()->exec("INSERT INTO crm.leads(source,source_ref,name,email,phone,interest,payload,stage) VALUES('assinatura','site',:name,:email,:phone,:interest,:payload,'NOVO')", [
    ':name' => $d['name'],
    ':email' => $d['email'],
    ':phone' => $d['phone'],
    ':interest' => 'Plano ' . $plan['code'],
    ':payload' => json_encode($d, JSON_UNESCAPED_UNICODE),
  ]);

  db()->exec("INSERT INTO crm.tasks(title,task_type,status,details,sla_deadline) VALUES(:t,'ONBOARDING','PENDING',:d, now() + interval '2 hour')", [
    ':t' => 'Onboarding novo cliente - ' . $d['legal_name'],
    ':d' => json_encode(['organization_id' => $orgId, 'subscription_id' => $subId], JSON_UNESCAPED_UNICODE),
  ]);

  db()->exec("INSERT INTO crm.accounts(organization_id,subscription_id,status,health_score) VALUES(:oid,:sid,'ACTIVE',100)", [
    ':oid' => $orgId,
    ':sid' => $subId,
  ]);

  queueWelcomeMessages($orgId, (string)$d['name'], (string)$d['billing_email'], (string)$d['phone']);

  ensureClientSession([
    'id' => $uid,
    'organization_id' => $orgId,
    'name' => $d['name'],
    'email' => $d['email'],
  ]);

  Response::json(['ok' => true, 'subscription_id' => $subId, 'status' => $subStatus], 201);
}

$router = new Router();

$router->get('/health', function() {
  Response::json(['service' => 'cliente', 'status' => 'ok', 'time' => date('c')]);
});

$router->get('/', function(Request $request) {
  Response::html(renderAuthPage((string)$request->input('plan', 'basic')));
});

$router->get('/login', function(Request $request) {
  Response::html(renderAuthPage((string)$request->input('plan', 'basic')));
});

$router->get('/signup', function(Request $request) {
  Response::html(renderAuthPage((string)$request->input('plan', 'basic')));
});

$router->get('/portal/logout', function() {
  session_destroy();
  header('Location: /login');
});

$router->get('/portal/dashboard', function(Request $request) {
  requireClientAuth();
  $notice = $request->input('new') ? 'Contratação concluída. Seu acesso foi liberado.' : null;
  Response::html(renderDashboard($notice));
});

$router->get('/onboarding/site-brief', function(Request $request) {
  requireClientAuth();
  Response::html(onboardingPage($request->input('ok') ? 'Briefing salvo com sucesso. Prompt gerado e enviado para a operação.' : null));
});

$router->post('/api/auth/login', function(Request $request) {
  $d = $request->body;
  if (!verifyRecaptchaToken((string)($d['g-recaptcha-response'] ?? ''))) {
    Response::json(['error' => 'Validação reCAPTCHA inválida'], 422);
    return;
  }

  $email = (string)($d['email'] ?? '');
  $password = (string)($d['password'] ?? '');
  $u = db()->one("SELECT u.id,u.name,u.email,u.password_hash,o.id AS organization_id FROM client.users u LEFT JOIN client.organizations o ON o.user_id=u.id WHERE u.email=:e", [':e' => $email]);
  if (!$u || !Auth::verifyPassword($password, (string)$u['password_hash'])) {
    Response::json(['error' => 'Credenciais inválidas'], 401);
    return;
  }

  ensureClientSession($u);
  Response::json(['ok' => true, 'redirect' => '/portal/dashboard']);
});

$router->post('/api/auth/google-demo', function(Request $request) {
  $name = trim((string)$request->input('name', 'Cliente Google'));
  $email = trim((string)$request->input('email', ''));

  if (!Validator::email($email)) {
    Response::json(['error' => 'E-mail Google inválido'], 422);
    return;
  }

  $u = db()->one("SELECT u.id,u.name,u.email,o.id AS organization_id FROM client.users u LEFT JOIN client.organizations o ON o.user_id=u.id WHERE u.email=:e", [':e' => $email]);

  if (!$u) {
    $uid = db()->one("INSERT INTO client.users(name,email,password_hash,phone,role) VALUES(:n,:e,:p,:ph,'CLIENTE') RETURNING id", [
      ':n' => $name,
      ':e' => $email,
      ':p' => Auth::hashPassword(bin2hex(random_bytes(8))),
      ':ph' => null,
    ])['id'];

    $orgId = db()->one("INSERT INTO client.organizations(user_id,person_type,cpf_cnpj,legal_name,billing_email,has_domain,has_site) VALUES(:u,'PF','00000000000',:ln,:be,false,false) RETURNING id", [
      ':u' => $uid,
      ':ln' => $name,
      ':be' => $email,
    ])['id'];

    $u = ['id' => $uid, 'name' => $name, 'email' => $email, 'organization_id' => $orgId];
  }

  ensureClientSession($u);
  Response::json(['ok' => true, 'redirect' => '/portal/dashboard']);
});

$router->post('/api/auth/register', function(Request $request) {
  registerContract($request);
});

$router->post('/api/auth/register-contract', function(Request $request) {
  registerContract($request);
});

$router->post('/api/billing/subscriptions/{id}/change-plan', function(Request $request) {
  requireClientAuth();
  $sid = (string)($request->query['id'] ?? '');
  $planCode = (string)$request->input('plan_code', '');
  if ($sid === '' || $planCode === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes'], 422);
    return;
  }

  $plan = db()->one("SELECT id, monthly_price FROM client.plans WHERE code=:c", [':c' => $planCode]);
  if (!$plan) {
    Response::json(['error' => 'Plano inválido'], 422);
    return;
  }

  $asaas = new AsaasClient();
  $result = $asaas->updateSubscription($sid, ['value' => (float)$plan['monthly_price']]);

  db()->exec("UPDATE client.subscriptions SET plan_id=:pid, updated_at=now() WHERE asaas_subscription_id=:sid", [
    ':pid' => $plan['id'], ':sid' => $sid
  ]);

  db()->exec("INSERT INTO crm.activities(activity_type,message,metadata) VALUES('CHANGE_PLAN','Solicitação de troca de plano',:meta)", [
    ':meta' => json_encode(['asaas_subscription_id' => $sid, 'plan_code' => $planCode], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json(['ok' => true, 'asaas' => $result]);
});

$router->post('/api/billing/card/update', function(Request $request) {
  requireClientAuth();
  $uid = $_SESSION['client_user']['id'];
  $orgId = $_SESSION['client_user']['organization_id'];
  $d = $request->body;

  $errors = Validator::required($d, ['card_holder', 'card_number', 'card_expiry', 'card_cvv', 'account_password']);
  if (!empty($errors)) {
    Response::json(['error' => 'Dados obrigatórios ausentes', 'details' => $errors], 422);
    return;
  }

  $user = db()->one("SELECT password_hash FROM client.users WHERE id=:id", [':id' => $uid]);
  if (!$user || !Auth::verifyPassword((string)$d['account_password'], (string)$user['password_hash'])) {
    Response::json(['error' => 'Senha de confirmação inválida'], 401);
    return;
  }

  if (!cardLuhnValid((string)$d['card_number'])) {
    Response::json(['error' => 'Cartão inválido'], 422);
    return;
  }
  if (!preg_match('/^\d{2}\/\d{2}$/', (string)$d['card_expiry']) || !preg_match('/^\d{3,4}$/', (string)$d['card_cvv'])) {
    Response::json(['error' => 'Dados do cartão inválidos'], 422);
    return;
  }

  $sub = db()->one("SELECT id FROM client.subscriptions WHERE organization_id=:oid ORDER BY created_at DESC LIMIT 1", [':oid' => $orgId]);
  if (!$sub) {
    Response::json(['error' => 'Assinatura não encontrada'], 404);
    return;
  }

  [$mm, $yy] = explode('/', (string)$d['card_expiry']);
  $digits = preg_replace('/\D+/', '', (string)$d['card_number']);
  $last4 = substr($digits, -4);

  db()->exec("INSERT INTO client.billing_profiles(subscription_id,card_holder,card_last4,card_brand,exp_month,exp_year,is_validated)
VALUES(:sid,:holder,:last4,:brand,:m,:y,true)
ON CONFLICT (subscription_id) DO UPDATE SET card_holder=excluded.card_holder,card_last4=excluded.card_last4,card_brand=excluded.card_brand,exp_month=excluded.exp_month,exp_year=excluded.exp_year,is_validated=true", [
    ':sid' => $sub['id'],
    ':holder' => $d['card_holder'],
    ':last4' => $last4,
    ':brand' => cardBrand((string)$d['card_number']),
    ':m' => (int)$mm,
    ':y' => (int)('20' . $yy),
  ]);

  db()->exec("INSERT INTO crm.activities(activity_type,message,metadata) VALUES('CHANGE_CARD','Troca de cartão solicitada pelo cliente',:meta)", [
    ':meta' => json_encode(['organization_id' => $orgId, 'last4' => $last4], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json(['ok' => true]);
});

$router->post('/api/profile/update', function(Request $request) {
  requireClientAuth();
  $uid = $_SESSION['client_user']['id'];
  $orgId = $_SESSION['client_user']['organization_id'] ?? null;
  $d = $request->body;

  $errors = Validator::required($d, ['name', 'email', 'billing_email', 'account_password']);
  if (!Validator::email((string)($d['email'] ?? '')) || !Validator::email((string)($d['billing_email'] ?? ''))) {
    $errors['email'] = 'E-mail inválido';
  }

  $user = db()->one("SELECT id,email,password_hash FROM client.users WHERE id=:id", [':id' => $uid]);
  if (!$user || !Auth::verifyPassword((string)($d['account_password'] ?? ''), (string)$user['password_hash'])) {
    $errors['account_password'] = 'Senha atual inválida';
  }

  $newPass = trim((string)($d['new_password'] ?? ''));
  $newPassConfirm = trim((string)($d['new_password_confirm'] ?? ''));
  if ($newPass !== '' || $newPassConfirm !== '') {
    if (strlen($newPass) < 6) {
      $errors['new_password'] = 'A nova senha precisa ter no mínimo 6 caracteres';
    }
    if ($newPass !== $newPassConfirm) {
      $errors['new_password_confirm'] = 'A confirmação da senha não confere';
    }
  }

  $newEmail = trim((string)($d['email'] ?? ''));
  if ($newEmail !== (string)$user['email']) {
    $exists = db()->one("SELECT id FROM client.users WHERE email=:email AND id<>:id", [':email' => $newEmail, ':id' => $uid]);
    if ($exists) {
      $errors['email'] = 'Este e-mail já está cadastrado em outra conta';
    }
  }

  if (!empty($errors)) {
    Response::json(['error' => 'Dados inválidos', 'details' => $errors], 422);
    return;
  }

  $safeName = trim((string)$d['name']);
  $safePhone = trim((string)($d['phone'] ?? ''));
  $safeBillingEmail = trim((string)$d['billing_email']);

  db()->exec("UPDATE client.users SET name=:n, email=:e, phone=:p, updated_at=now() WHERE id=:id", [
    ':n' => $safeName,
    ':e' => $newEmail,
    ':p' => $safePhone !== '' ? $safePhone : null,
    ':id' => $uid,
  ]);

  if ($newPass !== '') {
    db()->exec("UPDATE client.users SET password_hash=:ph, updated_at=now() WHERE id=:id", [
      ':ph' => Auth::hashPassword($newPass),
      ':id' => $uid,
    ]);
  }

  if (!empty($orgId)) {
    db()->exec("UPDATE client.organizations SET legal_name=:ln, billing_email=:be, whatsapp=:wa, updated_at=now() WHERE id=:id", [
      ':ln' => $safeName,
      ':be' => $safeBillingEmail,
      ':wa' => $safePhone !== '' ? $safePhone : null,
      ':id' => $orgId,
    ]);
  }

  $_SESSION['client_user']['name'] = $safeName;
  $_SESSION['client_user']['email'] = $newEmail;

  db()->exec("INSERT INTO crm.activities(activity_type,message,metadata) VALUES('PROFILE_UPDATE','Dados de perfil atualizados pelo cliente',:meta)", [
    ':meta' => json_encode(['user_id' => $uid, 'organization_id' => $orgId], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json(['ok' => true, 'message' => 'Perfil atualizado com sucesso']);
});

$router->post('/api/onboarding/site-brief', function(Request $request) {
  requireClientAuth();
  $uid = $_SESSION['client_user']['id'];
  $org = db()->one("SELECT id, legal_name FROM client.organizations WHERE user_id=:uid", [':uid' => $uid]);
  if (!$org) {
    Response::json(['error' => 'Organização não encontrada'], 404);
    return;
  }

  $data = $request->body;
  if (empty($data) && !empty($_POST)) {
    $data = $_POST;
  }
  $required = ['objective','audience'];
  $errors = Validator::required($data, $required);
  if ($errors) {
    Response::json(['error' => 'Dados inválidos', 'details' => $errors], 422);
    return;
  }

  $data['legal_name'] = $org['legal_name'];

  $briefId = db()->one("INSERT INTO client.project_briefs(organization_id,objective,audience,differentials,services,cta_text,tone_of_voice,color_palette,visual_references,legal_content,integrations,domain_target,extra_requirements) VALUES(:o,:objective,:audience,:d,:s,:cta,:tone,:color,:vref,:legal,:int,:dom,:extra) RETURNING id", [
    ':o' => $org['id'],
    ':objective' => $data['objective'],
    ':audience' => $data['audience'],
    ':d' => $data['differentials'] ?? null,
    ':s' => $data['services'] ?? null,
    ':cta' => $data['cta_text'] ?? null,
    ':tone' => $data['tone_of_voice'] ?? null,
    ':color' => $data['color_palette'] ?? null,
    ':vref' => $data['references'] ?? null,
    ':legal' => $data['legal_content'] ?? null,
    ':int' => $data['integrations'] ?? null,
    ':dom' => $data['domain_target'] ?? null,
    ':extra' => $data['extra_requirements'] ?? null,
  ])['id'];

  $uploadedFiles = storeBriefUploads((string)$org['id'], (string)$briefId);
  if (!empty($uploadedFiles)) {
    $data['uploaded_files'] = $uploadedFiles;
  }

  $prompt = PromptBuilder::build($data);

  db()->exec("INSERT INTO client.ai_prompts(brief_id,prompt_json,prompt_text,version) VALUES(:b,:j,:t,1)", [
    ':b' => $briefId,
    ':j' => json_encode($prompt['json'], JSON_UNESCAPED_UNICODE),
    ':t' => $prompt['text']
  ]);

  db()->exec("INSERT INTO crm.tasks(title,task_type,status,details,sla_deadline) VALUES(:t,'SITE_BRIEF','PENDING',:d, now() + interval '8 hour')", [
    ':t' => 'Novo briefing enviado - ' . $org['legal_name'],
    ':d' => json_encode(['brief_id' => $briefId, 'organization_id' => $org['id']], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json(['ok' => true, 'brief_id' => $briefId, 'prompt_json' => $prompt['json'], 'prompt_text' => $prompt['text']], 201);
});

$router->post('/api/tickets', function(Request $request) {
  requireClientAuth();
  $uid = $_SESSION['client_user']['id'];
  $org = db()->one("SELECT id FROM client.organizations WHERE user_id=:uid", [':uid' => $uid]);
  if (!$org) {
    Response::json(['error' => 'Organização não encontrada'], 404);
    return;
  }

  $d = $request->body;
  $errors = Validator::required($d, ['ticket_type','priority','subject','description']);
  if ($errors) {
    Response::json(['error' => 'Dados inválidos', 'details' => $errors], 422);
    return;
  }

  $ticketId = db()->one("INSERT INTO client.tickets(organization_id,ticket_type,priority,subject,description,status) VALUES(:o,:tt,:p,:s,:d,'OPEN') RETURNING id", [
    ':o' => $org['id'],
    ':tt' => $d['ticket_type'],
    ':p' => $d['priority'],
    ':s' => $d['subject'],
    ':d' => $d['description']
  ])['id'];

  $queue = match((string)$d['ticket_type']) {
    'SITE_FORA_DO_AR' => 'suporte_critico',
    'ORCAMENTO_PRIORITARIO' => 'comercial_prioritario',
    'MUDANCA_PLANO' => 'billing',
    default => 'suporte'
  };

  db()->exec("INSERT INTO crm.ticket_queue(ticket_id,queue_name,sla_deadline,status) VALUES(:tid,:q,now() + interval '4 hour','NEW')", [
    ':tid' => $ticketId,
    ':q' => $queue,
  ]);

  Response::json(['ok' => true, 'ticket_id' => $ticketId], 201);
});

$router->post('/api/webhooks/asaas', function(Request $request) {
  $token = $request->headers['X-Webhook-Token'] ?? $request->headers['x-webhook-token'] ?? '';
  $expected = getenv('ASAAS_WEBHOOK_TOKEN') ?: '';

  if ($expected !== '' && $token !== $expected) {
    Response::json(['error' => 'Unauthorized webhook'], 401);
    return;
  }

  $event = $request->body;
  $eventId = (string)($event['id'] ?? sha1(json_encode($event)));
  $eventType = (string)($event['event'] ?? 'UNKNOWN');

  $exists = db()->one("SELECT id FROM client.webhook_events WHERE provider='ASAAS' AND event_id=:eid", [':eid' => $eventId]);
  if ($exists) {
    Response::json(['ok' => true, 'idempotent' => true]);
    return;
  }

  db()->exec("INSERT INTO client.webhook_events(provider,event_id,event_type,payload,processed) VALUES('ASAAS',:eid,:et,:p,false)", [
    ':eid' => $eventId,
    ':et' => $eventType,
    ':p' => json_encode($event, JSON_UNESCAPED_UNICODE),
  ]);

  $subCode = $event['payment']['subscription'] ?? null;
  if ($subCode) {
    if (str_contains($eventType, 'PAYMENT_CONFIRMED') || str_contains($eventType, 'PAYMENT_RECEIVED')) {
      db()->exec("UPDATE client.subscriptions SET status='ACTIVE', updated_at=now() WHERE asaas_subscription_id=:sid", [':sid' => $subCode]);

      $sub = db()->one("SELECT s.id, s.organization_id, p.monthly_price FROM client.subscriptions s JOIN client.plans p ON p.id=s.plan_id WHERE s.asaas_subscription_id=:sid", [':sid' => $subCode]);
      if ($sub) {
        db()->exec("INSERT INTO client.payments(subscription_id,asaas_payment_id,amount,status,billing_type,due_date,paid_at,raw_payload) VALUES(:sid,:pay,:amount,'RECEIVED',:type,CURRENT_DATE,now(),:raw)", [
          ':sid' => $sub['id'],
          ':pay' => (string)($event['payment']['id'] ?? ('pay_' . substr($eventId, 0, 12))),
          ':amount' => (float)$sub['monthly_price'],
          ':type' => (string)($event['payment']['billingType'] ?? 'PIX'),
          ':raw' => json_encode($event, JSON_UNESCAPED_UNICODE),
        ]);

        $org = db()->one("SELECT legal_name,billing_email,whatsapp FROM client.organizations WHERE id=:oid", [':oid' => $sub['organization_id']]);
        if ($org) {
          queueWelcomeMessages((string)$sub['organization_id'], (string)$org['legal_name'], (string)$org['billing_email'], (string)$org['whatsapp']);
        }

        db()->exec("UPDATE crm.signup_session
SET payment_confirmed=true,
    status='PAYMENT_CONFIRMED',
    updated_at=now()
WHERE id IN (
  SELECT id FROM crm.signup_session
  WHERE organization_id=:oid
     OR metadata->>'asaas_subscription_id' = :sid
  ORDER BY created_at DESC
  LIMIT 1
)", [
          ':oid' => $sub['organization_id'],
          ':sid' => $subCode,
        ]);
      }
    }
  }

  Response::json(['ok' => true]);
});

$router->run();
