<?php
declare(strict_types=1);

function secureSessionStart(): void {
  if (session_status() === PHP_SESSION_ACTIVE) {
    return;
  }
  $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
  session_start();
}
secureSessionStart();

use Shared\Core\Router;
use Shared\Infra\AsaasClient;
use Shared\Infra\PromptBuilder;
use Shared\Support\Auth;
use Shared\Support\Request;
use Shared\Support\Response;
use Shared\Support\Validator;

require_once __DIR__ . '/../../shared/src/bootstrap.php';

function h(string $v): string { return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function applySecurityHeaders(): void {
  header('X-Frame-Options: SAMEORIGIN');
  header('X-Content-Type-Options: nosniff');
  header('Referrer-Policy: strict-origin-when-cross-origin');
  header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
  header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self' https://viacep.com.br https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com;");
}
applySecurityHeaders();

function apiError(string $message, int $status, string $code, ?string $actionHint = null, array $extra = []): void {
  $payload = array_merge([
    'error' => $message,
    'error_code' => $code,
  ], $extra);
  if ($actionHint !== null && $actionHint !== '') {
    $payload['action_hint'] = $actionHint;
  }
  Response::json($payload, $status);
}

function boolInput(mixed $v): bool {
  return in_array((string)$v, ['1','true','on','yes','sim'], true);
}

function getClientIp(): string {
  return (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function csrfToken(): string {
  if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  }
  return $_SESSION['csrf_token'];
}

function requestHeader(Request $request, string $name): ?string {
  foreach ($request->headers as $k => $v) {
    if (strcasecmp((string)$k, $name) === 0) {
      return is_array($v) ? (string)($v[0] ?? '') : (string)$v;
    }
  }
  return null;
}

function requireCsrf(Request $request): void {
  $token = (string)(requestHeader($request, 'X-CSRF-Token') ?? $request->body['csrf_token'] ?? '');
  if ($token === '' || !hash_equals((string)($_SESSION['csrf_token'] ?? ''), $token)) {
    Response::json(['error' => 'CSRF token inválido'], 419);
    exit;
  }
}

function rateLimitAllow(string $scope, int $limit, int $windowSeconds): bool {
  $ip = getClientIp();
  $key = sha1($scope . '|' . $ip);
  $file = sys_get_temp_dir() . '/koddahub_rl_' . $key . '.json';
  $now = time();
  $payload = ['start' => $now, 'count' => 0];

  $fh = @fopen($file, 'c+');
  if (!$fh) {
    return true;
  }
  if (!flock($fh, LOCK_EX)) {
    fclose($fh);
    return true;
  }

  $raw = stream_get_contents($fh);
  if (is_string($raw) && trim($raw) !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
      $payload = array_merge($payload, $decoded);
    }
  }

  if (($now - (int)$payload['start']) > $windowSeconds) {
    $payload = ['start' => $now, 'count' => 0];
  }
  $payload['count'] = (int)$payload['count'] + 1;

  ftruncate($fh, 0);
  rewind($fh);
  fwrite($fh, json_encode($payload, JSON_UNESCAPED_UNICODE));
  fflush($fh);
  flock($fh, LOCK_UN);
  fclose($fh);

  return (int)$payload['count'] <= $limit;
}

function rateLimitAllowKeyed(string $scope, string $identity, int $limit, int $windowSeconds): bool {
  $identity = trim(strtolower($identity));
  if ($identity === '') {
    return true;
  }
  $key = sha1($scope . '|' . $identity);
  $file = sys_get_temp_dir() . '/koddahub_rl_' . $key . '.json';
  $now = time();
  $payload = ['start' => $now, 'count' => 0];

  $fh = @fopen($file, 'c+');
  if (!$fh) {
    return true;
  }
  if (!flock($fh, LOCK_EX)) {
    fclose($fh);
    return true;
  }

  $raw = stream_get_contents($fh);
  if (is_string($raw) && trim($raw) !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
      $payload = array_merge($payload, $decoded);
    }
  }

  if (($now - (int)$payload['start']) > $windowSeconds) {
    $payload = ['start' => $now, 'count' => 0];
  }
  $payload['count'] = (int)$payload['count'] + 1;

  ftruncate($fh, 0);
  rewind($fh);
  fwrite($fh, json_encode($payload, JSON_UNESCAPED_UNICODE));
  fflush($fh);
  flock($fh, LOCK_UN);
  fclose($fh);

  return (int)$payload['count'] <= $limit;
}

function requireClientAuth(?string $nextPath = null): void {
  if (!isset($_SESSION['client_user'])) {
    if ($nextPath !== null && $nextPath !== '') {
      $_SESSION['after_login_redirect'] = $nextPath;
    }
    header('Location: /login');
    exit;
  }
}

function resolveAfterLoginRedirect(): string {
  $redirect = '/portal/dashboard';
  if (!empty($_SESSION['after_login_redirect']) && is_string($_SESSION['after_login_redirect'])) {
    $candidate = $_SESSION['after_login_redirect'];
    if (str_starts_with($candidate, '/portal/')) {
      $redirect = $candidate;
    }
  }
  unset($_SESSION['after_login_redirect']);
  return $redirect;
}

function turnstileSiteKey(): string {
  return getenv('CLOUDFLARE_TURNSTILE_SITE_KEY') ?: '0x4AAAAAACgQsahzjXTKYe2z';
}

function turnstileSecretKey(): string {
  return getenv('CLOUDFLARE_TURNSTILE_SECRET_KEY') ?: '0x4AAAAAACgQsQHZZ6v6BC_svstWvkxHi5A';
}

function verifyTurnstileToken(?string $token): bool {
  $token = trim((string)$token);
  if ($token === '') {
    return false;
  }

  $payload = http_build_query([
    'secret' => turnstileSecretKey(),
    'response' => $token,
    'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '',
  ]);

  $raw = '';
  if (function_exists('curl_init')) {
    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
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
    $raw = (string)@file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, $context);
  }

  $decoded = json_decode($raw, true);
  return is_array($decoded) && !empty($decoded['success']);
}

function renderAuthPage(string $plan = 'basic', string $alert = ''): string {
  $plan = in_array($plan, ['basic','profissional','pro'], true) ? $plan : 'basic';
  $turnstileKey = turnstileSiteKey();
  $assetCssVersion = (string)@filemtime(__DIR__ . '/assets/app.css');
  $assetJsVersion = (string)@filemtime(__DIR__ . '/assets/app.js');

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
  <link rel="stylesheet" href="/assets/app.css?v=<?= h($assetCssVersion) ?>">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body data-page="auth" data-turnstile-sitekey="<?= h($turnstileKey) ?>" data-csrf-token="<?= h(csrfToken()) ?>">
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
                  <div class="cf-turnstile" data-sitekey="<?= h($turnstileKey) ?>" data-theme="auto"></div>
                </div>
              </div>
              <p class="auth-help-link"><a href="/esqueci-senha">Esqueceu a senha?</a></p>

              <div class="action-row">
                <button class="btn btn-primary" type="submit">Entrar na área do cliente</button>
                <a class="btn btn-ghost" href="/esqueci-senha">Recuperar senha</a>
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
                    <select id="person_type" name="person_type" data-required="true"><option value="PJ">Pessoa Jurídica</option><option value="PF">Pessoa Física</option></select>
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
                  <div class="form-col"><label for="billing_zip">CEP (digite para buscar endereço automaticamente)</label><input id="billing_zip" name="billing_zip" data-required="true"></div>
                  <div class="form-col full"><label for="billing_street">Endereço</label><input id="billing_street" name="billing_street" data-required="true" readonly></div>
                  <div class="form-col"><label for="billing_number">Número</label><input id="billing_number" name="billing_number" data-required="true"></div>
                  <div class="form-col"><label for="billing_complement">Complemento</label><input id="billing_complement" name="billing_complement"></div>
                  <div class="form-col"><label for="billing_district">Bairro</label><input id="billing_district" name="billing_district" data-required="true" readonly></div>
                  <div class="form-col"><label for="billing_city">Cidade</label><input id="billing_city" name="billing_city" data-required="true" readonly></div>
                  <div class="form-col"><label for="billing_state">UF</label><input id="billing_state" name="billing_state" maxlength="2" data-required="true" readonly></div>
                </div>
              </div>

              <div class="wizard-step hidden" data-step="3">
                <div class="form-grid">
                  <div class="form-col"><label for="signup_email">E-mail de acesso</label><input id="signup_email" name="email" type="email" data-required="true"></div>
                  <div class="form-col"><label for="signup_password">Senha</label><input id="signup_password" name="password" type="password" data-required="true"></div>
                  <div class="form-col"><label for="signup_password_confirm">Confirmar senha</label><input id="signup_password_confirm" name="password_confirm" type="password" data-required="true"></div>
                  <div class="form-col full">
                    <label>Não sou um robô</label>
                    <div class="cf-turnstile" data-sitekey="<?= h($turnstileKey) ?>" data-theme="auto"></div>
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
                    <input type="hidden" name="payment_method" value="CREDIT_CARD">
                    <div class="status-note">
                      Cartão de crédito (checkout seguro ASAAS).
                    </div>
                  </div>
                  <div class="form-col full">
                    <div class="status-note">
                      Seus dados de pagamento serão informados diretamente no checkout hospedado do ASAAS.
                      Nenhum dado bruto de cartão é processado por este portal.
                    </div>
                  </div>
                </div>
              </div>

              <div class="wizard-nav">
                <button type="button" class="btn btn-ghost" id="wizardPrev">Voltar</button>
                <button type="button" class="btn btn-primary" id="wizardNext">Próximo</button>
                <button type="submit" class="btn btn-accent hidden" id="wizardSubmit">Continuar para pagamento seguro</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  </div>

  <div id="authFlowOverlay" class="auth-flow-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="authFlowTitle">
    <div class="auth-flow-card">
      <div class="auth-flow-spinner" aria-hidden="true"></div>
      <h3 id="authFlowTitle">Redirecionando para pagamento seguro...</h3>
      <p id="authFlowMessage">Aguarde alguns segundos enquanto abrimos sua cobrança em nova aba.</p>
    </div>
  </div>

  <div id="authStateModal" class="auth-state-modal hidden" role="dialog" aria-modal="true" aria-labelledby="authStateTitle" aria-live="polite">
    <div class="auth-state-backdrop"></div>
    <div class="auth-state-card">
      <div id="authStateSpinner" class="auth-state-spinner hidden" aria-hidden="true"></div>
      <h3 id="authStateTitle">Aguardando pagamento</h3>
      <p id="authStateText">Estamos aguardando a confirmação do ASAAS para liberar seu acesso.</p>
      <div id="authStateRich" class="auth-state-rich hidden"></div>
      <p id="authStateCountdown" class="auth-state-countdown hidden"></p>
      <div class="auth-state-actions">
        <button type="button" id="authStateRetryBtn" class="btn btn-primary hidden">Acessar link de pagamento</button>
        <button type="button" id="authStateCheckBtn" class="btn btn-ghost hidden">Já paguei, verificar agora</button>
        <button type="button" id="authStatePrimaryBtn" class="btn btn-primary hidden">Seguir para login</button>
        <button type="button" id="authStateCloseBtn" class="btn btn-ghost hidden">Fechar</button>
      </div>
    </div>
  </div>
  <script src="/assets/app.js?v=<?= h($assetJsVersion) ?>"></script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function renderForgotPasswordPage(string $alert = ''): string {
  $assetCssVersion = (string)@filemtime(__DIR__ . '/assets/app.css');
  $turnstileKey = turnstileSiteKey();
  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Esqueci minha senha - KoddaHub</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="shortcut icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css?v=<?= h($assetCssVersion) ?>">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body data-page="forgot-password" data-csrf-token="<?= h(csrfToken()) ?>">
  <div class="auth-shell">
    <aside class="auth-left">
      <div>
        <div class="brand-row">
          <img src="https://koddahub.com.br/assets/logo/koddahub-logo-v2.png" alt="Logo KoddaHub">
          <div class="brand-text"><span class="kodda">Kodda</span><span class="hub">Hub</span></div>
        </div>
        <h1>Recuperar senha</h1>
        <p>Informe seu e-mail de acesso. Se ele existir, enviaremos um link seguro para redefinição.</p>
      </div>
      <div class="note">Lembrete: o link expira em 15 minutos e pode ser usado uma única vez.</div>
    </aside>
    <main class="auth-right">
      <section class="auth-panel">
        <div class="panel-body">
          <div id="forgotNotice" class="alert <?= $alert !== '' ? 'ok' : 'hidden' ?>" aria-live="polite"><?= h($alert) ?></div>
          <form id="forgotPasswordForm">
            <div class="form-grid">
              <div class="form-col full">
                <label for="forgot_email">E-mail de acesso</label>
                <input id="forgot_email" name="email" type="email" required placeholder="voce@empresa.com">
              </div>
              <div class="form-col full">
                <label>Validação de segurança</label>
                <div class="cf-turnstile" data-sitekey="<?= h($turnstileKey) ?>" data-theme="auto"></div>
              </div>
            </div>
            <div class="action-row">
              <button type="submit" class="btn btn-primary" id="forgotSubmitBtn">Enviar instruções</button>
              <a href="/login" class="btn btn-ghost">Voltar para login</a>
            </div>
            <p id="forgotCooldownHint" class="note hidden" aria-live="polite"></p>
          </form>
        </div>
      </section>
    </main>
  </div>
  <script>
    (() => {
      const form = document.getElementById('forgotPasswordForm');
      const notice = document.getElementById('forgotNotice');
      const submitBtn = document.getElementById('forgotSubmitBtn');
      const cooldownHint = document.getElementById('forgotCooldownHint');
      const csrfToken = document.body?.dataset?.csrfToken || '';
      const cooldownStorageKey = 'koddahub_forgot_cooldown_until';
      const cooldownSeconds = 60;
      let cooldownTimer = null;
      if (!form) return;

      const turnstileEl = form.querySelector('.cf-turnstile');
      const resetCaptcha = () => {
        try {
          if (window.turnstile && turnstileEl) {
            window.turnstile.reset(turnstileEl);
          } else if (window.turnstile) {
            window.turnstile.reset();
          }
        } catch (_) {}
      };

      const formatCooldown = (seconds) => {
        const s = Math.max(0, Number(seconds) || 0);
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        return `${mm}:${ss}`;
      };

      const setCooldown = (untilEpochMs = 0) => {
        if (cooldownTimer) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
        }

        const tick = () => {
          const remaining = Math.ceil((untilEpochMs - Date.now()) / 1000);
          if (remaining <= 0) {
            submitBtn?.removeAttribute('disabled');
            if (cooldownHint) {
              cooldownHint.classList.add('hidden');
              cooldownHint.textContent = '';
            }
            localStorage.removeItem(cooldownStorageKey);
            if (cooldownTimer) {
              clearInterval(cooldownTimer);
              cooldownTimer = null;
            }
            return;
          }
          submitBtn?.setAttribute('disabled', 'disabled');
          if (cooldownHint) {
            cooldownHint.classList.remove('hidden');
            cooldownHint.textContent = `Aguarde ${formatCooldown(remaining)} para reenviar o link.`;
          }
        };

        if (untilEpochMs > Date.now()) {
          localStorage.setItem(cooldownStorageKey, String(untilEpochMs));
          tick();
          cooldownTimer = window.setInterval(tick, 1000);
        } else {
          localStorage.removeItem(cooldownStorageKey);
          tick();
        }
      };

      const savedUntil = Number(localStorage.getItem(cooldownStorageKey) || '0');
      if (savedUntil > Date.now()) {
        setCooldown(savedUntil);
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentCooldown = Number(localStorage.getItem(cooldownStorageKey) || '0');
        if (currentCooldown > Date.now()) {
          setCooldown(currentCooldown);
          return;
        }
        const token = (form.querySelector('[name="cf-turnstile-response"]')?.value || '').trim();
        if (!token) {
          notice.classList.remove('hidden', 'ok');
          notice.classList.add('err');
          notice.textContent = 'CAPTCHA inválido, tente novamente.';
          return;
        }
        submitBtn?.setAttribute('disabled', 'disabled');
        notice.classList.remove('hidden', 'err');
        notice.classList.add('ok');
        notice.textContent = 'Enviando instruções...';
        const body = Object.fromEntries(new FormData(form).entries());
        try {
          const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            credentials: 'same-origin',
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) {
            notice.classList.remove('ok');
            notice.classList.add('err');
            notice.textContent = data?.error || 'Falha ao enviar instruções.';
            resetCaptcha();
            return;
          }
          notice.classList.remove('err');
          notice.classList.add('ok');
          notice.textContent = data?.message || 'Se o e-mail existir, enviaremos as instruções.';
          setCooldown(Date.now() + cooldownSeconds * 1000);
          resetCaptcha();
        } catch (_) {
          notice.classList.remove('ok');
          notice.classList.add('err');
          notice.textContent = 'Falha de comunicação. Tente novamente em instantes.';
          resetCaptcha();
        } finally {
          const current = Number(localStorage.getItem(cooldownStorageKey) || '0');
          if (!(current > Date.now())) {
            submitBtn?.removeAttribute('disabled');
          }
        }
      });
    })();
  </script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function renderResetPasswordPage(string $token, string $alert = '', bool $tokenValid = true): string {
  $assetCssVersion = (string)@filemtime(__DIR__ . '/assets/app.css');
  $turnstileKey = turnstileSiteKey();
  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redefinir senha - KoddaHub</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="shortcut icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css?v=<?= h($assetCssVersion) ?>">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body data-page="reset-password" data-csrf-token="<?= h(csrfToken()) ?>">
  <div class="auth-shell">
    <aside class="auth-left">
      <div>
        <div class="brand-row">
          <img src="https://koddahub.com.br/assets/logo/koddahub-logo-v2.png" alt="Logo KoddaHub">
          <div class="brand-text"><span class="kodda">Kodda</span><span class="hub">Hub</span></div>
        </div>
        <h1>Nova senha</h1>
        <p>Defina uma nova senha forte para acessar sua área do cliente.</p>
      </div>
      <div class="note">A senha precisa ter no mínimo 8 caracteres, com letras e números.</div>
    </aside>
    <main class="auth-right">
      <section class="auth-panel">
        <div class="panel-body">
          <div id="resetNotice" class="alert <?= $alert !== '' ? 'err' : 'hidden' ?>" aria-live="polite"><?= h($alert) ?></div>
          <form id="resetPasswordForm">
            <input type="hidden" name="token" value="<?= h($token) ?>">
            <div class="form-grid">
              <div class="form-col full">
                <label for="reset_password">Nova senha</label>
                <input id="reset_password" name="password" type="password" required minlength="8">
                <div class="password-strength" id="resetPasswordStrength">
                  <div class="password-strength-head">
                    <span>Força da senha</span>
                    <strong id="resetStrengthLabel" class="strength-label weak">Muito fraca</strong>
                  </div>
                  <div class="password-strength-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <span id="resetStrengthFill"></span>
                  </div>
                </div>
                <ul class="password-rules" id="resetPasswordRules">
                  <li data-rule="len">Mínimo de 8 caracteres</li>
                  <li data-rule="letter">Pelo menos 1 letra</li>
                  <li data-rule="number">Pelo menos 1 número</li>
                  <li data-rule="match">A confirmação deve ser igual</li>
                </ul>
              </div>
              <div class="form-col full">
                <label for="reset_password_confirm">Confirmar nova senha</label>
                <input id="reset_password_confirm" name="password_confirm" type="password" required minlength="8">
              </div>
              <div class="form-col full">
                <label>Validação de segurança</label>
                <div class="cf-turnstile" data-sitekey="<?= h($turnstileKey) ?>" data-theme="auto"></div>
              </div>
            </div>
            <div class="action-row">
              <button type="submit" class="btn btn-primary" id="resetSubmitBtn" <?= $tokenValid ? '' : 'disabled' ?>>Redefinir senha</button>
              <a href="/login" class="btn btn-ghost">Voltar para login</a>
            </div>
          </form>
        </div>
      </section>
    </main>
  </div>
  <script>
    (() => {
      const form = document.getElementById('resetPasswordForm');
      const notice = document.getElementById('resetNotice');
      const submitBtn = document.getElementById('resetSubmitBtn');
      const csrfToken = document.body?.dataset?.csrfToken || '';
      const passEl = document.getElementById('reset_password');
      const confirmEl = document.getElementById('reset_password_confirm');
      const strengthFill = document.getElementById('resetStrengthFill');
      const strengthLabel = document.getElementById('resetStrengthLabel');
      const rules = {
        len: document.querySelector('#resetPasswordRules [data-rule="len"]'),
        letter: document.querySelector('#resetPasswordRules [data-rule="letter"]'),
        number: document.querySelector('#resetPasswordRules [data-rule="number"]'),
        match: document.querySelector('#resetPasswordRules [data-rule="match"]'),
      };
      if (!form) return;

      const turnstileEl = form.querySelector('.cf-turnstile');
      const resetCaptcha = () => {
        try {
          if (window.turnstile && turnstileEl) {
            window.turnstile.reset(turnstileEl);
          } else if (window.turnstile) {
            window.turnstile.reset();
          }
        } catch (_) {}
      };

      const setRuleState = (el, ok) => {
        if (!el) return;
        el.classList.toggle('ok', !!ok);
      };

      const evaluatePassword = () => {
        const password = passEl?.value || '';
        const confirm = confirmEl?.value || '';
        const hasLen = password.length >= 8;
        const hasLetter = /[A-Za-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const matches = confirm.length > 0 && password === confirm;

        setRuleState(rules.len, hasLen);
        setRuleState(rules.letter, hasLetter);
        setRuleState(rules.number, hasNumber);
        setRuleState(rules.match, matches);

        const strongFactors = [
          hasLen,
          /[A-Z]/.test(password),
          /[a-z]/.test(password),
          hasNumber,
          /[^A-Za-z0-9]/.test(password),
          password.length >= 12,
        ].filter(Boolean).length;
        const score = Math.min(100, Math.round((strongFactors / 6) * 100));
        if (strengthFill) strengthFill.style.width = `${score}%`;
        const strengthBar = strengthFill?.parentElement;
        if (strengthBar) strengthBar.setAttribute('aria-valuenow', String(score));

        if (strengthLabel) {
          let label = 'Muito fraca';
          let klass = 'weak';
          if (score >= 80) { label = 'Muito forte'; klass = 'great'; }
          else if (score >= 60) { label = 'Forte'; klass = 'strong'; }
          else if (score >= 40) { label = 'Média'; klass = 'medium'; }
          else if (score >= 20) { label = 'Fraca'; klass = 'weak'; }
          strengthLabel.textContent = label;
          strengthLabel.classList.remove('weak', 'medium', 'strong', 'great');
          strengthLabel.classList.add(klass);
          if (strengthFill) {
            strengthFill.classList.remove('weak', 'medium', 'strong', 'great');
            strengthFill.classList.add(klass);
          }
        }

        return {
          valid: hasLen && hasLetter && hasNumber && matches,
          hasLen,
          hasLetter,
          hasNumber,
          matches,
        };
      };

      passEl?.addEventListener('input', evaluatePassword);
      confirmEl?.addEventListener('input', evaluatePassword);
      evaluatePassword();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = form.querySelector('[name="password"]')?.value || '';
        const confirm = form.querySelector('[name="password_confirm"]')?.value || '';
        const checks = evaluatePassword();
        if (!checks.valid) {
          notice.classList.remove('hidden', 'ok');
          notice.classList.add('err');
          notice.textContent = 'Revise os requisitos da senha para continuar.';
          return;
        }
        const captcha = (form.querySelector('[name="cf-turnstile-response"]')?.value || '').trim();
        if (!captcha) {
          notice.classList.remove('hidden', 'ok');
          notice.classList.add('err');
          notice.textContent = 'CAPTCHA inválido, tente novamente.';
          return;
        }
        submitBtn?.setAttribute('disabled', 'disabled');
        notice.classList.remove('hidden', 'err');
        notice.classList.add('ok');
        notice.textContent = 'Atualizando sua senha...';
        const body = Object.fromEntries(new FormData(form).entries());
        try {
          const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            credentials: 'same-origin',
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) {
            notice.classList.remove('ok');
            notice.classList.add('err');
            notice.textContent = data?.error || 'Token inválido ou expirado.';
            resetCaptcha();
            return;
          }
          window.location.href = '/login?reset=success';
        } catch (_) {
          notice.classList.remove('ok');
          notice.classList.add('err');
          notice.textContent = 'Falha de comunicação. Tente novamente em instantes.';
          resetCaptcha();
        } finally {
          submitBtn?.removeAttribute('disabled');
        }
      });
    })();
  </script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function renderCheckoutPendingPage(string $asaasSubscriptionId, string $paymentUrl): string {
  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aguardando confirmação de pagamento</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body data-page="auth" data-csrf-token="<?= h(csrfToken()) ?>">
  <div class="auth-shell">
    <aside class="auth-left">
      <div>
        <div class="brand-row">
          <img src="https://koddahub.com.br/assets/logo/koddahub-logo-v2.png" alt="Logo KoddaHub">
          <div class="brand-text"><span class="kodda">Kodda</span><span class="hub">Hub</span></div>
        </div>
        <h1>Pagamento em análise</h1>
        <p>Finalize o pagamento no ASAAS. Assim que confirmado, você será redirecionado automaticamente para o login.</p>
        <p class="note">Depois do login, você já poderá preencher o briefing para publicar seu primeiro site em até 24h.</p>
      </div>
    </aside>
    <main class="auth-right">
      <section class="auth-panel">
        <div class="panel-body">
          <div class="alert ok" id="pendingNotice">Aguardando confirmação do pagamento...</div>
          <div class="action-row" style="margin-top:16px">
            <?php if ($paymentUrl !== ''): ?>
            <a class="btn btn-primary" href="<?= h($paymentUrl) ?>" target="_blank" rel="noopener noreferrer">Abrir cobrança no ASAAS</a>
            <?php endif; ?>
            <a class="btn btn-ghost" href="/checkout/return">Já finalizei o pagamento</a>
            <a class="btn btn-ghost" href="/login">Ir para login</a>
          </div>
        </div>
      </section>
    </main>
  </div>
  <script>
    (function () {
      const sid = <?= json_encode($asaasSubscriptionId, JSON_UNESCAPED_UNICODE) ?>;
      const notice = document.getElementById('pendingNotice');
      if (!sid) return;
      const tick = async () => {
        try {
          const res = await fetch('/api/billing/subscriptions/' + encodeURIComponent(sid) + '/status', { credentials: 'same-origin' });
          const data = await res.json();
          if (!res.ok) return;
          const status = String(data?.subscription?.status || '').toUpperCase();
          if (status === 'ACTIVE') {
            if (notice) notice.textContent = 'Pagamento confirmado! Redirecionando para o login...';
            setTimeout(() => {
              window.location.href = '/login?payment=confirmed';
            }, 700);
          }
        } catch (e) {}
      };
      setInterval(tick, 8000);
      tick();
    })();
  </script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function currentClientPendingContext(): ?array {
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  if ($orgId === '') {
    return null;
  }
  $pending = pendingPaymentByOrganization($orgId);
  if (!$pending) {
    return null;
  }
  $sid = trim((string)($pending['asaas_subscription_id'] ?? ''));
  $signupSessionId = trim((string)($pending['signup_session_id'] ?? ''));
  $pendingUntil = trim((string)($pending['payment_pending_until'] ?? ''));
  if ($pendingUntil === '') {
    $pendingUntil = date('c', strtotime((string)$pending['updated_at'] . ' +15 minutes'));
  }
  $redirectUrl = trim((string)($pending['payment_redirect_url'] ?? ''));
  return [
    'sid' => $sid,
    'signup_session_id' => $signupSessionId,
    'pending_until' => $pendingUntil,
    'payment_redirect_url' => $redirectUrl,
  ];
}

function renderPortalPaymentPendingPage(array $ctx): string {
  $sid = (string)($ctx['sid'] ?? '');
  $signupSessionId = (string)($ctx['signup_session_id'] ?? '');
  $pendingUntil = (string)($ctx['pending_until'] ?? date('c', time() + 900));
  $paymentUrl = (string)($ctx['payment_redirect_url'] ?? '');
  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Processando pagamento - KoddaHub</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css?v=<?= h((string)@filemtime(__DIR__ . '/assets/app.css')) ?>">
</head>
<body data-page="auth" data-csrf-token="<?= h(csrfToken()) ?>">
  <div class="auth-shell">
    <aside class="auth-left">
      <div>
        <div class="brand-row">
          <img src="https://koddahub.com.br/assets/logo/koddahub-logo-v2.png" alt="Logo KoddaHub">
          <div class="brand-text"><span class="kodda">Kodda</span><span class="hub">Hub</span></div>
        </div>
        <h1>Processando pagamento</h1>
        <p>Estamos aguardando a confirmação da cobrança no ASAAS para liberar sua área completa.</p>
        <p class="note">Assim que confirmar, seu acesso será liberado automaticamente para cadastrar o briefing do site.</p>
      </div>
    </aside>
    <main class="auth-right">
      <section class="auth-panel">
        <div class="panel-body">
          <div id="portalPendingStatus" class="alert ok">Aguardando confirmação de pagamento...</div>
          <p id="portalPendingCountdown" class="note" style="margin-top:8px"></p>
          <div class="action-row" style="margin-top:12px">
            <button class="btn btn-primary" type="button" id="portalPendingOpenBtn">Acessar link de pagamento</button>
            <button class="btn btn-ghost" type="button" id="portalPendingCheckBtn">Já paguei, verificar agora</button>
            <a class="btn btn-ghost" href="/portal/logout">Sair</a>
          </div>
        </div>
      </section>
    </main>
  </div>
  <script>
    (() => {
      const sid = <?= json_encode($sid, JSON_UNESCAPED_UNICODE) ?>;
      const ssid = <?= json_encode($signupSessionId, JSON_UNESCAPED_UNICODE) ?>;
      const initialUrl = <?= json_encode($paymentUrl, JSON_UNESCAPED_UNICODE) ?>;
      const pendingUntilRaw = <?= json_encode($pendingUntil, JSON_UNESCAPED_UNICODE) ?>;
      const csrfToken = document.body?.dataset?.csrfToken || '';
      const statusEl = document.getElementById('portalPendingStatus');
      const countdownEl = document.getElementById('portalPendingCountdown');
      const openBtn = document.getElementById('portalPendingOpenBtn');
      const checkBtn = document.getElementById('portalPendingCheckBtn');

      let paymentUrl = initialUrl || '';
      const deadline = pendingUntilRaw ? Date.parse(pendingUntilRaw) : (Date.now() + 15 * 60 * 1000);

      const setStatus = (msg, ok = true) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.classList.remove('ok', 'err');
        statusEl.classList.add(ok ? 'ok' : 'err');
      };

      const setCountdown = () => {
        if (!countdownEl) return;
        const remainMs = Math.max(0, deadline - Date.now());
        const mins = String(Math.floor(remainMs / 60000)).padStart(2, '0');
        const secs = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
        countdownEl.textContent = `Tempo restante: ${mins}:${secs}`;
        if (remainMs <= 0) {
          setStatus('Falha no pagamento: tempo de confirmação expirado. Tente novamente.', false);
        }
      };

      const openPayment = async () => {
        if (!paymentUrl && sid) {
          try {
            const retry = await fetch('/api/billing/subscriptions/' + encodeURIComponent(sid) + '/retry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
              credentials: 'same-origin',
              body: JSON.stringify({}),
            });
            const retryData = await retry.json();
            if (retry.ok && retryData?.payment_redirect_url) {
              paymentUrl = String(retryData.payment_redirect_url);
            }
          } catch (_) {}
        }
        if (paymentUrl) {
          window.open(paymentUrl, '_blank', 'noopener,noreferrer');
          setStatus('Link de pagamento aberto em nova aba. Aguardando confirmação...', true);
          return;
        }
        setStatus('Não foi possível obter o link de pagamento agora. Tente novamente em instantes.', false);
      };

      const checkStatus = async () => {
        try {
          const resp = await fetch('/api/portal/pagamento-pendente/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            credentials: 'same-origin',
            body: JSON.stringify({}),
          });
          const data = await resp.json();
          if (!resp.ok) return;
          if (data?.payment_redirect_url) paymentUrl = String(data.payment_redirect_url);
          if (data?.ready) {
            setStatus('Pagamento confirmado. Acesso liberado, redirecionando...', true);
            setTimeout(() => { window.location.href = '/portal/dashboard?new=1'; }, 700);
            return;
          }
          setStatus(data?.payment_confirmed
            ? 'Pagamento confirmado no ASAAS. Finalizando sincronização no CRM...'
            : 'Aguardando confirmação do pagamento no ASAAS...', true);
        } catch (_) {}
      };

      if (openBtn) openBtn.addEventListener('click', openPayment);
      if (checkBtn) checkBtn.addEventListener('click', checkStatus);

      setCountdown();
      checkStatus();
      setInterval(setCountdown, 1000);
      setInterval(checkStatus, 10000);
    })();
  </script>
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

  $operationStagesBlueprint = [
    ['code' => 'briefing_pendente', 'name' => 'Briefing pendente', 'description' => 'Preencher o briefing inicial do site.'],
    ['code' => 'pre_prompt', 'name' => 'Pré-prompt', 'description' => 'Prompt gerado e validado para produção.'],
    ['code' => 'template_v1', 'name' => 'Template V1', 'description' => 'Primeira versão do site institucional gerada.'],
    ['code' => 'ajustes', 'name' => 'Ajustes', 'description' => 'Correções e micro ajustes antes da aprovação.'],
    ['code' => 'aprovacao_cliente', 'name' => 'Aprovação do cliente', 'description' => 'Cliente valida versão temporária.'],
    ['code' => 'publicacao', 'name' => 'Publicação', 'description' => 'Deploy e validação final no domínio.'],
    ['code' => 'publicado', 'name' => 'Publicado', 'description' => 'Site publicado e monitorado.'],
  ];
  $operationOrderByCode = [];
  foreach ($operationStagesBlueprint as $idx => $stage) {
    $operationOrderByCode[$stage['code']] = $idx + 1;
  }
  $operationLegacyCodeMap = [
    'boas_vindas' => 'briefing_pendente',
    'briefing' => 'briefing_pendente',
    'producao' => 'template_v1',
    'revisao' => 'ajustes',
    'pos_entrega' => 'publicacao',
  ];
  $normalizeOperationCode = static function (?string $code) use ($operationLegacyCodeMap): string {
    $value = trim((string)$code);
    return $operationLegacyCodeMap[$value] ?? $value;
  };

  $operationDeal = $orgId ? db()->one("
    SELECT d.id, d.title, d.deal_type, d.lifecycle_status, d.plan_code, d.product_code, d.updated_at
    FROM crm.deal d
    WHERE d.organization_id=:oid AND d.lifecycle_status='CLIENT'
    ORDER BY d.updated_at DESC
    LIMIT 1
  ", [':oid' => $orgId]) : null;
  $operationRecordsRaw = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->all("
    SELECT id, stage_code, stage_name, stage_order, status, started_at, completed_at, updated_at
    FROM crm.deal_operation
    WHERE deal_id=:did
    ORDER BY stage_order ASC, started_at ASC
  ", [':did' => $operationDeal['id']]) : [];
  $operationRecords = [];
  $operationActiveCode = null;
  $operationActiveOrder = 0;
  $operationCompletedMaxOrder = 0;
  foreach ($operationRecordsRaw as $row) {
    $normalizedCode = $normalizeOperationCode((string)($row['stage_code'] ?? ''));
    if ($normalizedCode === '') {
      continue;
    }
    $normalizedOrder = $operationOrderByCode[$normalizedCode] ?? (int)($row['stage_order'] ?? 0);
    $operationRecords[$normalizedCode] = [
      'id' => (string)$row['id'],
      'stage_code' => $normalizedCode,
      'stage_name' => (string)$row['stage_name'],
      'stage_order' => $normalizedOrder,
      'status' => strtoupper((string)($row['status'] ?? 'ACTIVE')),
      'started_at' => $row['started_at'] ?? null,
      'completed_at' => $row['completed_at'] ?? null,
      'updated_at' => $row['updated_at'] ?? null,
    ];
    if (strtoupper((string)($row['status'] ?? '')) === 'ACTIVE' && $normalizedOrder >= $operationActiveOrder) {
      $operationActiveOrder = $normalizedOrder;
      $operationActiveCode = $normalizedCode;
    }
    if (strtoupper((string)($row['status'] ?? '')) === 'COMPLETED' && $normalizedOrder > $operationCompletedMaxOrder) {
      $operationCompletedMaxOrder = $normalizedOrder;
    }
  }

  $operationApprovalPending = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->one("
    SELECT
      a.expires_at,
      tr.preview_url
    FROM crm.deal_client_approval a
    JOIN crm.deal_template_revision tr ON tr.id = a.template_revision_id
    WHERE a.deal_id=:did AND a.status='PENDING' AND a.expires_at > now()
    ORDER BY a.created_at DESC
    LIMIT 1
  ", [':did' => $operationDeal['id']]) : null;

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
<body data-page="dashboard" data-theme="dark" data-open-briefing="<?= $hasBriefing ? '0' : '1' ?>" data-csrf-token="<?= h(csrfToken()) ?>">
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
        <a data-nav-section="operacao" href="/portal/dashboard#operacao"><i class="bi bi-diagram-3-fill" aria-hidden="true"></i> Operação</a>
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
              <span>Preencha o briefing do seu primeiro site e garanta publicação em 24 horas.</span>
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
            <p class="note" style="margin-top:12px">A gestão de cartão é feita no checkout seguro do ASAAS. Este portal não processa dados brutos de cartão.</p>
            <?php if (!empty($sub['asaas_subscription_id'])): ?>
              <div style="margin-top:12px">
                <button class="btn btn-primary" id="retryPaymentBtn" type="button" data-subscription-id="<?= h((string)$sub['asaas_subscription_id']) ?>">Abrir cobrança segura</button>
              </div>
            <?php endif; ?>
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

        <section class="portal-section" data-section="operacao">
          <section class="portal-card modern-card">
            <h3>Operação do site 24h</h3>
            <?php if (!$operationDeal): ?>
              <p class="note">Ainda não existe uma operação ativa para este cliente. Assim que o pagamento e o fechamento forem confirmados, as etapas aparecem aqui automaticamente.</p>
            <?php else: ?>
              <div class="contract-grid" style="margin-top:12px">
                <div class="readonly-field"><label>Projeto</label><span><?= h((string)($operationDeal['title'] ?? 'Projeto')) ?></span></div>
                <div class="readonly-field"><label>Tipo</label><span><?= h((string)($operationDeal['deal_type'] ?? 'HOSPEDAGEM')) ?></span></div>
                <div class="readonly-field"><label>Plano / Produto</label><span><?= h((string)($operationDeal['plan_code'] ?? ($operationDeal['product_code'] ?? 'N/D'))) ?></span></div>
                <div class="readonly-field"><label>Atualizado em</label><span><?= h(!empty($operationDeal['updated_at']) ? date('d/m/Y H:i', strtotime((string)$operationDeal['updated_at'])) : 'N/D') ?></span></div>
              </div>

              <?php if ($operationApprovalPending): ?>
                <div class="alert ok" style="margin-top:12px">
                  Sua aprovação está pendente nesta etapa. Valide a versão do site para seguirmos com a publicação.
                  <?php if (!empty($operationApprovalPending['preview_url'])): ?>
                    <a href="<?= h((string)$operationApprovalPending['preview_url']) ?>" target="_blank" rel="noreferrer">Abrir preview</a>
                  <?php endif; ?>
                  <div style="margin-top:10px">
                    <button type="button" class="btn btn-primary" id="portalApprovalLinkBtn">Validar versão do site</button>
                  </div>
                </div>
              <?php else: ?>
                <div class="alert hidden" id="portalApprovalNotice"></div>
              <?php endif; ?>

              <div class="operation-flow-list">
                <?php foreach ($operationStagesBlueprint as $index => $stage): ?>
                  <?php
                    $stageOrder = $index + 1;
                    $stageCode = $stage['code'];
                    $record = $operationRecords[$stageCode] ?? null;
                    $isActive = $operationActiveCode === $stageCode;
                    $isDone = ($record && $record['status'] === 'COMPLETED') || (!$isActive && $stageOrder <= $operationCompletedMaxOrder);
                    $statusClass = $isDone ? 'done' : ($isActive ? 'active' : 'pending');
                    $statusText = $isDone ? 'Concluído' : ($isActive ? 'Em andamento' : 'Pendente');
                    if ($isDone && !empty($record['completed_at'])) {
                      $statusText .= ' em ' . date('d/m/Y H:i', strtotime((string)$record['completed_at']));
                    } elseif ($isActive && !empty($record['started_at'])) {
                      $statusText .= ' desde ' . date('d/m/Y H:i', strtotime((string)$record['started_at']));
                    }
                  ?>
                  <article class="operation-step <?= h($statusClass) ?>">
                    <div class="operation-step-head">
                      <strong><?= h((string)$stage['name']) ?></strong>
                      <span class="status-chip status-<?= h($statusClass) ?>"><?= h($statusText) ?></span>
                    </div>
                    <p><?= h((string)$stage['description']) ?></p>
                  </article>
                <?php endforeach; ?>
              </div>
            <?php endif; ?>
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
    <a data-nav-section="operacao" href="/portal/dashboard#operacao"><span class="icon"><i class="bi bi-diagram-3-fill" aria-hidden="true"></i></span><span class="label">Operação</span></a>
    <a data-nav-section="pagamentos" href="/portal/dashboard#pagamentos"><span class="icon"><i class="bi bi-credit-card-2-front-fill" aria-hidden="true"></i></span><span class="label">Financeiro</span></a>
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
<body data-csrf-token="<?= h(csrfToken()) ?>">
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
      const csrfToken = document.body?.dataset?.csrfToken || '';
      const r = await fetch('/api/onboarding/site-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(body)
      });
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

function queueBillingEventEmail(string $orgId, string $email, string $subject, string $message): void {
  if (!Validator::email($email)) {
    return;
  }
  db()->exec("INSERT INTO crm.email_queue(organization_id,email_to,subject,body,status) VALUES(:oid,:to,:s,:b,'PENDING')", [
    ':oid' => $orgId,
    ':to' => $email,
    ':s' => $subject,
    ':b' => $message,
  ]);
}

function normalizeEmail(string $email): string {
  return strtolower(trim($email));
}

function generatePasswordResetToken(): string {
  return bin2hex(random_bytes(32));
}

function hashPasswordResetToken(string $token): string {
  return hash('sha256', $token);
}

function queuePasswordResetEmail(?string $organizationId, string $email, string $token): void {
  if (!Validator::email($email)) {
    return;
  }
  $baseUrl = rtrim((string)(getenv('APP_URL_CLIENTE') ?: 'https://clientes.koddahub.com.br'), '/');
  $link = $baseUrl . '/redefinir-senha?token=' . rawurlencode($token);
  $subject = 'Redefinição de senha - KoddaHub';
  $body = implode("\n", [
    'Olá,',
    '',
    'Recebemos uma solicitação para redefinir sua senha na área do cliente KoddaHub.',
    'Use o link abaixo para criar uma nova senha (válido por 15 minutos):',
    $link,
    '',
    'Se você não solicitou esta alteração, ignore este e-mail.',
  ]);
  db()->exec("
    INSERT INTO crm.email_queue(organization_id,email_to,subject,body,status)
    VALUES(:oid,:to,:s,:b,'PENDING')
  ", [
    ':oid' => $organizationId,
    ':to' => $email,
    ':s' => $subject,
    ':b' => $body,
  ]);
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

function operationStageMeta(string $stageCode): array {
  $map = [
    'briefing_pendente' => ['name' => 'Briefing pendente', 'order' => 1],
    'pre_prompt' => ['name' => 'Pré-prompt', 'order' => 2],
    'template_v1' => ['name' => 'Template V1', 'order' => 3],
    'ajustes' => ['name' => 'Ajustes', 'order' => 4],
    'aprovacao_cliente' => ['name' => 'Aprovação do cliente', 'order' => 5],
    'publicacao' => ['name' => 'Publicação', 'order' => 6],
    'publicado' => ['name' => 'Publicado', 'order' => 7],
  ];
  return $map[$stageCode] ?? ['name' => $stageCode, 'order' => 99];
}

function ensureDealOperationSubstepTable(): void {
  static $ready = false;
  if ($ready) {
    return;
  }
  db()->exec("
    CREATE TABLE IF NOT EXISTS crm.deal_operation_substep (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      stage_code VARCHAR(80) NOT NULL,
      substep_code VARCHAR(80) NOT NULL,
      substep_name VARCHAR(140) NOT NULL,
      substep_order INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      is_required BOOLEAN NOT NULL DEFAULT true,
      owner VARCHAR(120),
      notes TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (deal_id, stage_code, substep_code)
    )
  ");
  $ready = true;
}

function ensurePasswordResetTable(): void {
  static $ready = false;
  if ($ready) {
    return;
  }
  db()->exec("
    CREATE TABLE IF NOT EXISTS client.password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_address VARCHAR(45),
      user_agent TEXT
    )
  ");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_password_resets_email_state ON client.password_resets(email, used_at, expires_at)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON client.password_resets(expires_at)");
  $ready = true;
}

function initializePublicationSubstepsForDeal(string $dealId): void {
  ensureDealOperationSubstepTable();
  $substeps = [
    ['code' => 'dominio_decisao', 'name' => 'Domínio já existe / precisa contratar', 'order' => 1],
    ['code' => 'dominio_registro', 'name' => 'Registro/transferência de domínio', 'order' => 2],
    ['code' => 'dns_config', 'name' => 'Configuração de DNS e apontamentos', 'order' => 3],
    ['code' => 'hostgator_account', 'name' => 'Cadastro/ajuste na Hostgator', 'order' => 4],
    ['code' => 'deploy_ssl', 'name' => 'Deploy + SSL + validação técnica', 'order' => 5],
    ['code' => 'go_live_monitor', 'name' => 'Monitoramento de entrada no ar', 'order' => 6],
  ];
  foreach ($substeps as $substep) {
    db()->exec("
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        :deal_id, 'publicacao', :substep_code, :substep_name, :substep_order, 'PENDING', true, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    ", [
      ':deal_id' => $dealId,
      ':substep_code' => $substep['code'],
      ':substep_name' => $substep['name'],
      ':substep_order' => $substep['order'],
    ]);
  }
}

function moveDealOperationStage(string $dealId, string $stageCode): void {
  $meta = operationStageMeta($stageCode);
  $active = db()->one("
    SELECT id
    FROM crm.deal_operation
    WHERE deal_id=:did AND status='ACTIVE'
    ORDER BY stage_order DESC, started_at DESC
    LIMIT 1
  ", [':did' => $dealId]);

  if ($active) {
    db()->exec("UPDATE crm.deal_operation SET status='COMPLETED', completed_at=now(), updated_at=now() WHERE id=:id", [':id' => $active['id']]);
  }

  db()->exec("
    INSERT INTO crm.deal_operation(deal_id, operation_type, stage_code, stage_name, stage_order, status, started_at, updated_at)
    VALUES(:did, 'HOSPEDAGEM', :code, :name, :ord, 'ACTIVE', now(), now())
  ", [
    ':did' => $dealId,
    ':code' => $stageCode,
    ':name' => $meta['name'],
    ':ord' => $meta['order'],
  ]);

  if ($stageCode === 'publicacao') {
    initializePublicationSubstepsForDeal($dealId);
  }
}

function resolveHospedagemPipelineMeta(): ?array {
  static $cache = null;
  if (is_array($cache)) {
    return $cache;
  }

  $pipeline = db()->one("SELECT id FROM crm.pipeline WHERE code='comercial_hospedagem' LIMIT 1");
  if (!$pipeline) {
    return null;
  }
  $stages = db()->all("
    SELECT id, code, stage_order
    FROM crm.pipeline_stage
    WHERE pipeline_id=:pid
    ORDER BY stage_order ASC
  ", [':pid' => $pipeline['id']]);

  $map = [];
  foreach ($stages as $stage) {
    $map[(string)$stage['code']] = $stage;
  }
  $cache = ['id' => (string)$pipeline['id'], 'stages' => $map];
  return $cache;
}

function deriveHospedagemStageAndLifecycle(?string $subscriptionStatus): array {
  $status = strtoupper(trim((string)$subscriptionStatus));
  if ($status === 'ACTIVE') {
    return ['stage_code' => 'fechado_ganho', 'lifecycle' => 'CLIENT', 'closed' => true];
  }
  if (in_array($status, ['PENDING', 'TRIALING', 'INCOMPLETE', 'PAST_DUE', 'OVERDUE'], true)) {
    return ['stage_code' => 'pagamento_pendente', 'lifecycle' => 'OPEN', 'closed' => false];
  }
  if (in_array($status, ['CANCELED', 'SUSPENDED', 'CANCELLED'], true)) {
    return ['stage_code' => 'perdido', 'lifecycle' => 'LOST', 'closed' => true];
  }
  return ['stage_code' => 'cadastro_iniciado', 'lifecycle' => 'OPEN', 'closed' => false];
}

function ensureInitialHospedagemOperationForDeal(string $dealId): void {
  $active = db()->one("
    SELECT id
    FROM crm.deal_operation
    WHERE deal_id=:did AND status='ACTIVE'
    ORDER BY stage_order DESC, started_at DESC
    LIMIT 1
  ", [':did' => $dealId]);
  if (!$active) {
    moveDealOperationStage($dealId, 'briefing_pendente');
  }
}

function syncHospedagemDealByOrganization(string $organizationId, ?string $subscriptionId = null, string $reason = 'webhook_payment_confirmed'): ?string {
  $pipeline = resolveHospedagemPipelineMeta();
  if (!$pipeline) {
    return null;
  }

  $subscriptionId = trim((string)$subscriptionId);
  $org = db()->one("
    SELECT
      o.id AS organization_id,
      o.legal_name,
      o.billing_email,
      o.whatsapp,
      s.id AS subscription_row_id,
      s.asaas_subscription_id,
      s.status AS subscription_status,
      p.code AS plan_code,
      p.monthly_price
    FROM client.organizations o
    LEFT JOIN LATERAL (
      SELECT s1.*
      FROM client.subscriptions s1
      WHERE s1.organization_id = o.id
      ORDER BY
        CASE WHEN :sid <> '' AND s1.asaas_subscription_id = :sid THEN 0 ELSE 1 END,
        s1.created_at DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN client.plans p ON p.id = s.plan_id
    WHERE o.id=:oid
    LIMIT 1
  ", [
    ':oid' => $organizationId,
    ':sid' => $subscriptionId,
  ]);
  if (!$org) {
    return null;
  }

  $derivation = deriveHospedagemStageAndLifecycle((string)($org['subscription_status'] ?? ''));
  $stage = $pipeline['stages'][$derivation['stage_code']] ?? null;
  if (!$stage) {
    return null;
  }

  $title = trim((string)($org['legal_name'] ?? ''));
  if ($title === '') {
    $title = trim((string)($org['billing_email'] ?? ''));
  }
  if ($title === '') {
    $title = 'Cliente ' . substr($organizationId, 0, 8);
  }

  $planCode = !empty($org['plan_code']) ? strtolower((string)$org['plan_code']) : null;
  $valueCents = isset($org['monthly_price']) ? (int)round((float)$org['monthly_price'] * 100) : null;
  $closedAt = !empty($derivation['closed']) ? date('Y-m-d H:i:s') : null;

  $existing = db()->one("
    SELECT id, stage_id, lifecycle_status
    FROM crm.deal
    WHERE pipeline_id=:pid
      AND deal_type='HOSPEDAGEM'
      AND organization_id=:oid
    ORDER BY updated_at DESC
    LIMIT 1
  ", [
    ':pid' => $pipeline['id'],
    ':oid' => $organizationId,
  ]);

  if ($existing) {
    db()->exec("
      UPDATE crm.deal
      SET
        stage_id=:stage_id,
        subscription_id=:subscription_id,
        title=:title,
        contact_name=:contact_name,
        contact_email=:contact_email,
        contact_phone=:contact_phone,
        plan_code=:plan_code,
        value_cents=:value_cents,
        lifecycle_status=:lifecycle_status,
        is_closed=:is_closed,
        closed_at=:closed_at,
        updated_at=now()
      WHERE id=:id
    ", [
      ':id' => $existing['id'],
      ':stage_id' => $stage['id'],
      ':subscription_id' => $org['subscription_row_id'] ?? null,
      ':title' => $title,
      ':contact_name' => $title,
      ':contact_email' => $org['billing_email'] ?? null,
      ':contact_phone' => normalizeDigits((string)($org['whatsapp'] ?? '')),
      ':plan_code' => $planCode,
      ':value_cents' => $valueCents,
      ':lifecycle_status' => $derivation['lifecycle'],
      ':is_closed' => !empty($derivation['closed']) ? 'true' : 'false',
      ':closed_at' => $closedAt,
    ]);

    if ((string)$existing['stage_id'] !== (string)$stage['id']) {
      db()->exec("
        INSERT INTO crm.deal_stage_history(deal_id, from_stage_id, to_stage_id, changed_by, reason, created_at)
        VALUES(:deal_id, :from_stage_id, :to_stage_id, 'SYSTEM', :reason, now())
      ", [
        ':deal_id' => $existing['id'],
        ':from_stage_id' => $existing['stage_id'],
        ':to_stage_id' => $stage['id'],
        ':reason' => 'Webhook pagamento confirmado',
      ]);
    }

    db()->exec("
      INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
      VALUES(:deal_id, 'FLOW_UPDATE', :content, :metadata::jsonb, 'WEBHOOK')
    ", [
      ':deal_id' => $existing['id'],
      ':content' => 'Sincronização imediata do CRM via webhook ASAAS.',
      ':metadata' => json_encode([
        'reason' => $reason,
        'organization_id' => $organizationId,
        'asaas_subscription_id' => $subscriptionId,
      ], JSON_UNESCAPED_UNICODE),
    ]);

    if ($derivation['lifecycle'] === 'CLIENT') {
      ensureInitialHospedagemOperationForDeal((string)$existing['id']);
    }
    return (string)$existing['id'];
  }

  $position = db()->one("
    SELECT COUNT(*)::int AS c
    FROM crm.deal
    WHERE pipeline_id=:pid
      AND stage_id=:sid
      AND lifecycle_status <> 'CLIENT'
  ", [
    ':pid' => $pipeline['id'],
    ':sid' => $stage['id'],
  ]);
  $positionIndex = (int)($position['c'] ?? 0);

  $created = db()->one("
    INSERT INTO crm.deal(
      pipeline_id, stage_id, organization_id, subscription_id, title, contact_name, contact_email, contact_phone,
      deal_type, category, intent, origin, plan_code, product_code, value_cents, position_index,
      lifecycle_status, is_closed, closed_at, metadata, created_at, updated_at
    )
    VALUES(
      :pipeline_id, :stage_id, :organization_id, :subscription_id, :title, :contact_name, :contact_email, :contact_phone,
      'HOSPEDAGEM', 'RECORRENTE', :intent, 'PAYMENT_WEBHOOK', :plan_code, NULL, :value_cents, :position_index,
      :lifecycle_status, :is_closed, :closed_at, :metadata::jsonb, now(), now()
    )
    RETURNING id
  ", [
    ':pipeline_id' => $pipeline['id'],
    ':stage_id' => $stage['id'],
    ':organization_id' => $organizationId,
    ':subscription_id' => $org['subscription_row_id'] ?? null,
    ':title' => $title,
    ':contact_name' => $title,
    ':contact_email' => $org['billing_email'] ?? null,
    ':contact_phone' => normalizeDigits((string)($org['whatsapp'] ?? '')),
    ':intent' => $planCode ? ('hospedagem_' . $planCode) : 'hospedagem_basico',
    ':plan_code' => $planCode,
    ':value_cents' => $valueCents,
    ':position_index' => $positionIndex,
    ':lifecycle_status' => $derivation['lifecycle'],
    ':is_closed' => !empty($derivation['closed']) ? 'true' : 'false',
    ':closed_at' => $closedAt,
    ':metadata' => json_encode([
      'source' => 'webhook_sync_hospedagem',
      'reason' => $reason,
      'asaas_subscription_id' => $subscriptionId,
    ], JSON_UNESCAPED_UNICODE),
  ]);

  if (!$created || empty($created['id'])) {
    return null;
  }

  db()->exec("
    INSERT INTO crm.deal_stage_history(deal_id, from_stage_id, to_stage_id, changed_by, reason, created_at)
    VALUES(:deal_id, NULL, :to_stage_id, 'SYSTEM', :reason, now())
  ", [
    ':deal_id' => $created['id'],
    ':to_stage_id' => $stage['id'],
    ':reason' => 'Webhook pagamento confirmado',
  ]);

  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(:deal_id, 'FLOW_UPDATE', :content, :metadata::jsonb, 'WEBHOOK')
  ", [
    ':deal_id' => $created['id'],
    ':content' => 'Deal criado por sincronização imediata do webhook ASAAS.',
    ':metadata' => json_encode([
      'reason' => $reason,
      'organization_id' => $organizationId,
      'asaas_subscription_id' => $subscriptionId,
    ], JSON_UNESCAPED_UNICODE),
  ]);

  if ($derivation['lifecycle'] === 'CLIENT') {
    ensureInitialHospedagemOperationForDeal((string)$created['id']);
  }

  return (string)$created['id'];
}

function approvalContextByToken(string $token): ?array {
  $tokenHash = hash('sha256', $token);
  $row = db()->one("
    SELECT
      a.id AS approval_id,
      a.deal_id,
      a.template_revision_id,
      a.expires_at,
      a.status AS approval_status,
      a.client_note,
      a.acted_at,
      tr.preview_url,
      tr.source_hash,
      tr.status AS template_status,
      tr.version AS template_version,
      d.title AS deal_title,
      d.organization_id,
      d.lifecycle_status,
      o.legal_name,
      o.domain,
      o.billing_email
    FROM crm.deal_client_approval a
    JOIN crm.deal d ON d.id = a.deal_id
    JOIN crm.deal_template_revision tr ON tr.id = a.template_revision_id
    LEFT JOIN client.organizations o ON o.id = d.organization_id
    WHERE a.token_hash = :hash
    ORDER BY a.created_at DESC
    LIMIT 1
  ", [':hash' => $tokenHash]);

  return $row ?: null;
}

function renderApprovalPage(array $ctx, string $token): string {
  $isPending = strtoupper((string)($ctx['approval_status'] ?? '')) === 'PENDING';
  $isExpired = !empty($ctx['expires_at']) && strtotime((string)$ctx['expires_at']) < time();
  $statusText = $ctx['approval_status'] ?? 'N/D';
  $preview = (string)($ctx['preview_url'] ?? '');
  $title = (string)($ctx['deal_title'] ?? 'Projeto');
  $orgName = (string)($ctx['legal_name'] ?? 'Cliente');
  $note = (string)($ctx['client_note'] ?? '');
  ob_start();
  ?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aprovação de Site - KoddaHub</title>
  <link rel="icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="shortcut icon" type="image/png" href="/assets/koddahub-logo-v2.png">
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body data-page="approval" data-csrf-token="<?= h(csrfToken()) ?>">
  <div class="portal-wrap" style="max-width:900px;margin:24px auto;padding:0 12px;">
    <div class="portal-card">
      <h2 style="margin-top:0;">Aprovação do cliente</h2>
      <p><strong>Projeto:</strong> <?= h($title) ?></p>
      <p><strong>Empresa:</strong> <?= h($orgName) ?></p>
      <p><strong>Status do link:</strong> <?= h((string)$statusText) ?><?= $isExpired ? ' (expirado)' : '' ?></p>
      <p><strong>Expira em:</strong> <?= h(!empty($ctx['expires_at']) ? date('d/m/Y H:i', strtotime((string)$ctx['expires_at'])) : 'N/D') ?></p>
      <?php if ($preview !== ''): ?>
        <p><a class="btn btn-ghost" href="<?= h($preview) ?>" target="_blank" rel="noreferrer">Abrir prévia do site</a></p>
      <?php endif; ?>
      <?php if ($note !== ''): ?>
        <div class="alert ok">Última observação enviada: <?= h($note) ?></div>
      <?php endif; ?>
      <div id="approvalNotice" class="alert hidden"></div>
      <?php if ($isPending && !$isExpired): ?>
        <div class="grid-2">
          <div class="form-col full">
            <label for="approvalNote">Observação (opcional)</label>
            <textarea id="approvalNote" rows="4" placeholder="Ex: ajustar botão do WhatsApp e aumentar contraste do título."></textarea>
          </div>
          <div class="form-col" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="approveBtn" class="btn btn-primary" type="button">Aprovar versão</button>
            <button id="changesBtn" class="btn btn-ghost" type="button">Solicitar micro ajustes</button>
          </div>
        </div>
      <?php else: ?>
        <p>Este link já foi utilizado ou expirou. Solicite um novo envio pelo atendimento KoddaHub.</p>
      <?php endif; ?>
      <p style="margin-top:14px;"><a href="/portal/dashboard#operacao">Voltar para o painel</a></p>
    </div>
  </div>

  <script>
    (function () {
      const token = <?= json_encode($token, JSON_UNESCAPED_UNICODE) ?>;
      const notice = document.getElementById('approvalNotice');
      const noteEl = document.getElementById('approvalNote');
      const approveBtn = document.getElementById('approveBtn');
      const changesBtn = document.getElementById('changesBtn');
      const csrfToken = document.body?.dataset?.csrfToken || '';

      function show(msg, ok) {
        if (!notice) return;
        notice.textContent = msg || '';
        notice.classList.remove('hidden', 'ok', 'err');
        notice.classList.add(ok ? 'ok' : 'err');
      }

      async function send(kind) {
        const endpoint = kind === 'approve'
          ? `/api/portal/approval/${token}/approve`
          : `/api/portal/approval/${token}/request-changes`;
        const note = noteEl ? noteEl.value : '';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ note })
        });
        const data = await res.json();
        if (!res.ok) {
          show(data.error || 'Falha ao registrar resposta.', false);
          return;
        }
        show(kind === 'approve' ? 'Aprovação registrada com sucesso.' : 'Solicitação de ajustes enviada com sucesso.', true);
        setTimeout(() => { window.location.href = '/portal/dashboard#operacao'; }, 900);
      }

      if (approveBtn) approveBtn.addEventListener('click', () => send('approve'));
      if (changesBtn) changesBtn.addEventListener('click', () => send('changes'));
    })();
  </script>
</body>
</html>
<?php
  return (string)ob_get_clean();
}

function normalizeDigits(?string $value): string {
  return preg_replace('/\D+/', '', (string)$value) ?? '';
}

function normalizeState(?string $value): string {
  return strtoupper(substr(trim((string)$value), 0, 2));
}

function isValidCpf(string $cpf): bool {
  if (!preg_match('/^\d{11}$/', $cpf)) {
    return false;
  }
  if (preg_match('/^(\d)\1{10}$/', $cpf)) {
    return false;
  }
  for ($t = 9; $t < 11; $t++) {
    $sum = 0;
    for ($c = 0; $c < $t; $c++) {
      $sum += (int)$cpf[$c] * (($t + 1) - $c);
    }
    $digit = ((10 * $sum) % 11) % 10;
    if ((int)$cpf[$c] !== $digit) {
      return false;
    }
  }
  return true;
}

function isValidCnpj(string $cnpj): bool {
  if (!preg_match('/^\d{14}$/', $cnpj)) {
    return false;
  }
  if (preg_match('/^(\d)\1{13}$/', $cnpj)) {
    return false;
  }
  $weights1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  $weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  $sum1 = 0;
  for ($i = 0; $i < 12; $i++) {
    $sum1 += (int)$cnpj[$i] * $weights1[$i];
  }
  $rest1 = $sum1 % 11;
  $digit1 = $rest1 < 2 ? 0 : 11 - $rest1;
  if ((int)$cnpj[12] !== $digit1) {
    return false;
  }
  $sum2 = 0;
  for ($i = 0; $i < 13; $i++) {
    $sum2 += (int)$cnpj[$i] * $weights2[$i];
  }
  $rest2 = $sum2 % 11;
  $digit2 = $rest2 < 2 ? 0 : 11 - $rest2;
  return (int)$cnpj[13] === $digit2;
}

function isValidCpfCnpj(string $doc): bool {
  if (strlen($doc) === 11) {
    return isValidCpf($doc);
  }
  if (strlen($doc) === 14) {
    return isValidCnpj($doc);
  }
  return false;
}

function hasActiveSubscriptionByEmail(string $email): bool {
  $email = strtolower(trim($email));
  if ($email === '') {
    return false;
  }
  $row = db()->one("
    SELECT 1
    FROM client.users u
    JOIN client.organizations o ON o.user_id=u.id
    JOIN client.subscriptions s ON s.organization_id=o.id
    WHERE lower(u.email)=:email
      AND upper(s.status)='ACTIVE'
    LIMIT 1
  ", [':email' => $email]);
  return $row !== null;
}

function hasActiveSubscriptionByDocument(string $cpfCnpj): bool {
  $doc = normalizeDigits($cpfCnpj);
  if ($doc === '') {
    return false;
  }
  $row = db()->one("
    SELECT 1
    FROM client.organizations o
    JOIN client.subscriptions s ON s.organization_id=o.id
    WHERE regexp_replace(coalesce(o.cpf_cnpj,''),'\\D','','g')=:doc
      AND upper(s.status)='ACTIVE'
    LIMIT 1
  ", [':doc' => $doc]);
  return $row !== null;
}

function pendingPaymentByEmail(string $email): ?array {
  $email = strtolower(trim($email));
  if ($email === '') {
    return null;
  }
  if (hasActiveSubscriptionByEmail($email)) {
    return null;
  }
  return db()->one("
    SELECT s.asaas_subscription_id, s.status, ss.updated_at, ss.id AS signup_session_id,
           coalesce(ss.metadata->>'payment_pending_until','') AS payment_pending_until,
           coalesce(ss.metadata->>'payment_redirect_url','') AS payment_redirect_url
    FROM client.users u
    JOIN client.organizations o ON o.user_id=u.id
    JOIN client.subscriptions s ON s.organization_id=o.id
    LEFT JOIN crm.signup_session ss ON ss.organization_id=o.id
    WHERE lower(u.email)=:email
      AND upper(s.status) IN ('PENDING','OVERDUE')
    ORDER BY s.created_at DESC, ss.updated_at DESC NULLS LAST
    LIMIT 1
  ", [':email' => $email]);
}

function pendingPaymentByDocument(string $cpfCnpj): ?array {
  $doc = normalizeDigits($cpfCnpj);
  if ($doc === '') {
    return null;
  }
  if (hasActiveSubscriptionByDocument($doc)) {
    return null;
  }
  return db()->one("
    SELECT s.asaas_subscription_id, s.status, ss.updated_at, ss.id AS signup_session_id,
           coalesce(ss.metadata->>'payment_pending_until','') AS payment_pending_until,
           coalesce(ss.metadata->>'payment_redirect_url','') AS payment_redirect_url
    FROM client.organizations o
    JOIN client.subscriptions s ON s.organization_id=o.id
    LEFT JOIN crm.signup_session ss ON ss.organization_id=o.id
    WHERE regexp_replace(coalesce(o.cpf_cnpj,''),'\\D','','g')=:doc
      AND upper(s.status) IN ('PENDING','OVERDUE')
    ORDER BY s.created_at DESC, ss.updated_at DESC NULLS LAST
    LIMIT 1
  ", [':doc' => $doc]);
}

function hasActiveSubscriptionByOrganization(string $organizationId): bool {
  if ($organizationId === '') {
    return false;
  }
  $row = db()->one("
    SELECT 1
    FROM client.subscriptions s
    WHERE s.organization_id=:oid
      AND upper(s.status)='ACTIVE'
    LIMIT 1
  ", [':oid' => $organizationId]);
  return $row !== null;
}

function isCrmClientReadyByOrganization(string $organizationId): bool {
  if ($organizationId === '') {
    return false;
  }
  $row = db()->one("
    SELECT id
    FROM crm.deal
    WHERE organization_id=:oid
      AND deal_type='HOSPEDAGEM'
      AND lifecycle_status='CLIENT'
    LIMIT 1
  ", [':oid' => $organizationId]);
  return $row !== null;
}

function pendingPaymentByOrganization(string $organizationId): ?array {
  if ($organizationId === '') {
    return null;
  }
  if (hasActiveSubscriptionByOrganization($organizationId)) {
    return null;
  }
  return db()->one("
    SELECT
      s.asaas_subscription_id,
      s.status,
      ss.updated_at,
      ss.id AS signup_session_id,
      coalesce(ss.metadata->>'payment_pending_until','') AS payment_pending_until,
      coalesce(ss.metadata->>'payment_redirect_url','') AS payment_redirect_url
    FROM client.subscriptions s
    LEFT JOIN crm.signup_session ss ON ss.organization_id=s.organization_id
    WHERE s.organization_id=:oid
      AND upper(s.status) IN ('PENDING','OVERDUE')
    ORDER BY s.created_at DESC, ss.updated_at DESC NULLS LAST
    LIMIT 1
  ", [':oid' => $organizationId]);
}

function registerContract(Request $request): void {
  if (!rateLimitAllow('register-contract', 30, 300)) {
    apiError('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429, 'RATE_LIMIT', 'Espere alguns minutos e tente novamente.');
    return;
  }
  requireCsrf($request);

  $d = $request->body;
  $required = ['name','email','password','phone','person_type','cpf_cnpj','legal_name','billing_email','plan_code','billing_zip','billing_street','billing_number','billing_district','billing_city','billing_state'];
  $errors = Validator::required($d, $required);

  if (!Validator::email($d['email'] ?? null) || !Validator::email($d['billing_email'] ?? null)) {
    $errors['email'] = 'E-mail inválido';
  }
  if (!verifyTurnstileToken((string)($d['cf-turnstile-response'] ?? ''))) {
    $errors['cf-turnstile-response'] = 'CAPTCHA inválido, tente novamente.';
  }
  if (!boolInput($d['lgpd'] ?? false)) {
    $errors['lgpd'] = 'Aceite LGPD é obrigatório';
  }
  if (strlen((string)($d['password'] ?? '')) < 8 || !preg_match('/[A-Za-z]/', (string)$d['password']) || !preg_match('/\d/', (string)$d['password'])) {
    $errors['password'] = 'Senha precisa ter no mínimo 8 caracteres com letras e números';
  }

  $paymentMethod = strtoupper((string)($d['payment_method'] ?? 'CREDIT_CARD'));
  if ($paymentMethod !== 'CREDIT_CARD') {
    $errors['payment_method'] = 'Nesta etapa aceitamos apenas cartão de crédito.';
  }

  $docDigits = normalizeDigits((string)($d['cpf_cnpj'] ?? ''));
  if (!isValidCpfCnpj($docDigits)) {
    $errors['cpf_cnpj'] = 'CPF/CNPJ inválido';
  }
  $zipDigits = normalizeDigits((string)($d['billing_zip'] ?? ''));
  if (strlen($zipDigits) !== 8) {
    $errors['billing_zip'] = 'CEP inválido';
  }
  $phoneDigits = normalizeDigits((string)($d['phone'] ?? ''));
  if (strlen($phoneDigits) < 10 || strlen($phoneDigits) > 13) {
    $errors['phone'] = 'Telefone inválido';
  }
  $state = normalizeState((string)($d['billing_state'] ?? ''));
  if (!preg_match('/^[A-Z]{2}$/', $state)) {
    $errors['billing_state'] = 'UF inválida';
  }
  $billingCity = trim((string)($d['billing_city'] ?? ''));
  if (mb_strlen($billingCity) < 2) {
    $errors['billing_city'] = 'Cidade inválida';
  }

  if (!empty($errors)) {
    apiError('Dados inválidos', 422, 'VALIDATION_ERROR', 'Revise os campos destacados e tente novamente.', ['details' => $errors]);
    return;
  }

  $emailNormalized = strtolower(trim((string)$d['email']));
  $exists = db()->one("SELECT id FROM client.users WHERE email=:email", [':email' => $emailNormalized]);
  if ($exists) {
    $existingSub = db()->one("
      SELECT s.asaas_subscription_id, s.status
      FROM client.users u
      JOIN client.organizations o ON o.user_id=u.id
      JOIN client.subscriptions s ON s.organization_id=o.id
      WHERE u.email=:email
      ORDER BY s.created_at DESC
      LIMIT 1
    ", [':email' => $emailNormalized]);
    if ($existingSub && in_array(strtoupper((string)$existingSub['status']), ['PENDING', 'OVERDUE'], true)) {
      $asaas = new AsaasClient();
      $payments = $asaas->getPaymentsBySubscription((string)$existingSub['asaas_subscription_id'], 1);
      $payment = $payments['data'][0] ?? null;
      $redirectUrl = is_array($payment)
        ? (string)($payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? $payment['paymentLink'] ?? '')
        : '';
      Response::json([
        'ok' => true,
        'existing' => true,
        'code' => 'PAYMENT_PENDING',
        'status' => $existingSub['status'],
        'asaas_subscription_id' => $existingSub['asaas_subscription_id'],
        'payment_redirect_url' => $redirectUrl !== '' ? $redirectUrl : null,
        'awaiting_payment' => true,
        'pending_until' => date('c', time() + 900),
      ], 200);
      return;
    }
    apiError('E-mail já cadastrado', 409, 'ACCOUNT_EXISTS', 'Use a opção Entrar ou recupere o acesso.');
    return;
  }

  $existingByDocPlan = db()->one("
    SELECT s.asaas_subscription_id, s.status
    FROM client.organizations o
    JOIN client.subscriptions s ON s.organization_id=o.id
    JOIN client.plans p ON p.id=s.plan_id
    WHERE regexp_replace(o.cpf_cnpj,'\\D','','g')=:doc
      AND p.code=:plan
      AND upper(s.status) IN ('ACTIVE','PENDING','OVERDUE')
    ORDER BY s.created_at DESC
    LIMIT 1
  ", [':doc' => $docDigits, ':plan' => (string)$d['plan_code']]);
  if ($existingByDocPlan) {
    $redirectUrl = null;
    if (in_array(strtoupper((string)$existingByDocPlan['status']), ['PENDING','OVERDUE'], true)) {
      $asaasLookup = new AsaasClient();
      $payments = $asaasLookup->getPaymentsBySubscription((string)$existingByDocPlan['asaas_subscription_id'], 1);
      $payment = $payments['data'][0] ?? null;
      if (is_array($payment)) {
        $redirectUrl = (string)($payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? $payment['paymentLink'] ?? '');
      }
    }
    apiError(
      'Já existe assinatura ativa ou pendente para este CPF/CNPJ neste plano.',
      409,
      'DUPLICATE_SUBSCRIPTION',
      $redirectUrl ? 'Reabra o link de pagamento para concluir a contratação pendente.' : 'Acesse sua conta ou entre em contato para ajustar a assinatura.',
      [
        'asaas_subscription_id' => (string)$existingByDocPlan['asaas_subscription_id'],
        'status' => (string)$existingByDocPlan['status'],
        'payment_redirect_url' => $redirectUrl ?: null,
      ]
    );
    return;
  }

  $simultaneousSignup = db()->one("
    SELECT id
    FROM crm.signup_session
    WHERE (lower(email)=:email OR regexp_replace(coalesce(metadata->>'cpf_cnpj',''),'\\D','','g')=:doc)
      AND status IN ('SIGNUP_STARTED','CHECKOUT_STARTED','SUBSCRIPTION_CREATED')
      AND updated_at > (now() - interval '15 minutes')
    LIMIT 1
  ", [':email' => $emailNormalized, ':doc' => $docDigits]);
  if ($simultaneousSignup) {
    apiError('Já existe um cadastro em andamento para este cliente. Aguarde alguns minutos para tentar novamente.', 409, 'SIGNUP_IN_PROGRESS', 'Aguarde alguns minutos e tente novamente.');
    return;
  }

  $signupSessionId = db()->one("INSERT INTO crm.signup_session(email,phone,plan_code,status,source,payment_confirmed,metadata)
VALUES(:email,:phone,:plan,'SIGNUP_STARTED','SIGNUP_FLOW',false,:meta) RETURNING id", [
    ':email' => strtolower((string)$d['email']),
    ':phone' => $phoneDigits,
    ':plan' => $d['plan_code'],
    ':meta' => json_encode(['entrypoint' => 'portal_register', 'cpf_cnpj' => $docDigits], JSON_UNESCAPED_UNICODE),
  ])['id'];

  $uid = db()->one("INSERT INTO client.users(name,email,password_hash,phone,role) VALUES(:n,:e,:p,:ph,'CLIENTE') RETURNING id", [
    ':n' => $d['name'], ':e' => $d['email'], ':p' => Auth::hashPassword((string)$d['password']), ':ph' => $d['phone'],
  ])['id'];

  $orgId = db()->one("INSERT INTO client.organizations(user_id,person_type,cpf_cnpj,legal_name,trade_name,billing_email,whatsapp,domain,billing_zip,billing_street,billing_number,billing_complement,billing_district,billing_city,billing_state,billing_country,has_domain,has_site,current_site_url)
VALUES(:u,:pt,:doc,:ln,:tn,:be,:wa,:dom,:zip,:street,:num,:comp,:district,:city,:state,:country,:hasDomain,:hasSite,:siteUrl) RETURNING id", [
    ':u' => $uid,
    ':pt' => $d['person_type'],
    ':doc' => $docDigits,
    ':ln' => $d['legal_name'],
    ':tn' => $d['trade_name'] ?? null,
    ':be' => $d['billing_email'],
    ':wa' => $d['phone'],
    ':dom' => $d['domain'] ?? null,
    ':zip' => $zipDigits,
    ':street' => $d['billing_street'],
    ':num' => $d['billing_number'],
    ':comp' => $d['billing_complement'] ?? null,
    ':district' => $d['billing_district'],
    ':city' => $billingCity,
    ':state' => $state,
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
    apiError('Plano inválido', 422, 'PLAN_INVALID', 'Selecione um plano válido e tente novamente.');
    return;
  }

  $asaas = new AsaasClient();
  $usingAsaasApi = trim((string)(getenv('ASAAS_API_KEY') ?: '')) !== '';
  $rawPhone = $phoneDigits;
  if (strlen($rawPhone) > 11 && str_starts_with($rawPhone, '55')) {
    $rawPhone = substr($rawPhone, 2);
  }
  $existingCustomer = $asaas->findCustomerByCpfCnpj($docDigits);
  $customer = $existingCustomer ?: $asaas->createCustomer([
    'name' => $d['legal_name'],
    'email' => $d['billing_email'],
    'mobilePhone' => $rawPhone,
    'cpfCnpj' => $docDigits,
    'postalCode' => $zipDigits,
    'address' => trim((string)$d['billing_street']),
    'addressNumber' => trim((string)$d['billing_number']),
    'complement' => trim((string)($d['billing_complement'] ?? '')),
    'province' => trim((string)$d['billing_district']),
    'city' => $billingCity,
    'state' => $state,
  ]);
  if ($usingAsaasApi && empty($customer['id'])) {
    db()->exec("DELETE FROM client.organizations WHERE id=:id", [':id' => $orgId]);
    db()->exec("DELETE FROM client.users WHERE id=:id", [':id' => $uid]);
    db()->exec("UPDATE crm.signup_session SET status='CHECKOUT_ERROR', metadata = coalesce(metadata,'{}'::jsonb) || :meta::jsonb, updated_at=now() WHERE id=:id", [
      ':id' => $signupSessionId,
      ':meta' => json_encode(['asaas_error' => $customer], JSON_UNESCAPED_UNICODE),
    ]);
    $gatewayMsg = is_array($customer['errors'] ?? null) ? (($customer['errors'][0]['description'] ?? null) ?: null) : null;
    apiError(
      'Falha ao criar cliente no gateway de pagamento. Verifique os dados e credenciais do ASAAS sandbox.',
      502,
      'ASAAS_CUSTOMER_ERROR',
      'Confirme CPF/CNPJ, endereço e tente novamente.',
      ['gateway_message' => $gatewayMsg]
    );
    return;
  }

  $subscriptionPayload = [
    'customer' => $customer['id'] ?? null,
    'billingType' => $paymentMethod,
    'value' => (float)$plan['monthly_price'],
    'nextDueDate' => date('Y-m-d'),
    'cycle' => 'MONTHLY',
    'description' => 'Assinatura KoddaHub plano ' . $plan['code'],
  ];
  $callbackEnabled = in_array(strtolower((string)(getenv('ASAAS_CHECKOUT_CALLBACK_ENABLED') ?: 'false')), ['1','true','yes','on'], true);
  if ($callbackEnabled) {
    $successReturnUrl = rtrim((string)(getenv('APP_URL_CLIENTE') ?: 'https://clientes.koddahub.com.br'), '/') . '/checkout/return';
    $subscriptionPayload['callback'] = [
      'successUrl' => $successReturnUrl,
      'autoRedirect' => true,
    ];
  }

  $subscription = $asaas->createSubscription($subscriptionPayload);
  if ($usingAsaasApi && empty($subscription['id'])) {
    $firstError = is_array($subscription['errors'] ?? null) ? (string)($subscription['errors'][0]['description'] ?? '') : '';
    if ($firstError !== '' && (
      stripos($firstError, 'callback') !== false ||
      stripos($firstError, 'successUrl') !== false ||
      stripos($firstError, 'autoRedirect') !== false ||
      stripos($firstError, 'domínio configurado') !== false ||
      stripos($firstError, 'cadastre um site') !== false
    )) {
      // Fallback resiliente: alguns fluxos ASAAS podem não aceitar callback em criação de assinatura.
      unset($subscriptionPayload['callback']);
      $subscription = $asaas->createSubscription($subscriptionPayload);
    }
  }
  if ($usingAsaasApi && empty($subscription['id'])) {
    db()->exec("DELETE FROM client.organizations WHERE id=:id", [':id' => $orgId]);
    db()->exec("DELETE FROM client.users WHERE id=:id", [':id' => $uid]);
    db()->exec("UPDATE crm.signup_session SET status='CHECKOUT_ERROR', metadata = coalesce(metadata,'{}'::jsonb) || :meta::jsonb, updated_at=now() WHERE id=:id", [
      ':id' => $signupSessionId,
      ':meta' => json_encode(['asaas_error' => $subscription], JSON_UNESCAPED_UNICODE),
    ]);
    $gatewayMsg = is_array($subscription['errors'] ?? null) ? (($subscription['errors'][0]['description'] ?? null) ?: null) : null;
    apiError(
      'Falha ao iniciar assinatura no ASAAS. Revise wallet, webhook e credenciais sandbox.',
      502,
      'ASAAS_SUBSCRIPTION_ERROR',
      'Tente novamente em instantes. Se persistir, valide a configuração da conta ASAAS.',
      ['gateway_message' => $gatewayMsg]
    );
    return;
  }
  $paymentRedirectUrl = $asaas->extractPaymentRedirectUrl($subscription) ?? null;
  if ($usingAsaasApi && (string)$paymentRedirectUrl === '' && !empty($subscription['id'])) {
    for ($i = 0; $i < 4; $i++) {
      usleep(350000);
      $payments = $asaas->getPaymentsBySubscription((string)$subscription['id'], 1);
      $payment = $payments['data'][0] ?? null;
      if (is_array($payment)) {
        $paymentRedirectUrl = (string)($payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? $payment['paymentLink'] ?? '');
        if ($paymentRedirectUrl !== '') {
          break;
        }
      }
    }
    if ($paymentRedirectUrl === '') {
      $paymentRedirectUrl = null;
    }
  }
  $subStatus = (!$usingAsaasApi && $paymentMethod === 'CREDIT_CARD') ? 'ACTIVE' : 'PENDING';

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
      'payment_redirect_url' => $paymentRedirectUrl,
      'payment_pending_until' => date('c', time() + 900),
    ], JSON_UNESCAPED_UNICODE),
    ':id' => $signupSessionId,
  ]);

  if ($subStatus === 'ACTIVE') {
    db()->exec("UPDATE crm.signup_session SET payment_confirmed=true, updated_at=now() WHERE id=:id", [
      ':id' => $signupSessionId,
    ]);
  }

  if ((getenv('ASAAS_API_KEY') ?: '') === '') {
    db()->exec("INSERT INTO client.payments(subscription_id,asaas_payment_id,amount,status,billing_type,due_date,paid_at,raw_payload)
VALUES(:sid,:pid,:amount,'RECEIVED',:type,CURRENT_DATE,now(),:raw)", [
      ':sid' => $subId,
      ':pid' => 'mock_pay_' . substr((string)$subId, 0, 8),
      ':amount' => (float)$plan['monthly_price'],
      ':type' => $paymentMethod,
      ':raw' => json_encode(['simulated' => true], JSON_UNESCAPED_UNICODE),
    ]);
  }

  $safeLeadPayload = $d;
  unset(
    $safeLeadPayload['password'],
    $safeLeadPayload['password_confirm'],
    $safeLeadPayload['cf-turnstile-response']
  );

  db()->exec("INSERT INTO crm.leads(source,source_ref,name,email,phone,interest,payload,stage) VALUES('assinatura','site',:name,:email,:phone,:interest,:payload,'NOVO')", [
    ':name' => $d['name'],
    ':email' => $d['email'],
    ':phone' => $d['phone'],
    ':interest' => 'Plano ' . $plan['code'],
    ':payload' => json_encode($safeLeadPayload, JSON_UNESCAPED_UNICODE),
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

  Response::json([
    'ok' => true,
    'signup_session_id' => $signupSessionId,
    'subscription_id' => $subId,
    'asaas_subscription_id' => ($subscription['id'] ?? null),
    'status' => $subStatus,
    'payment_redirect_url' => $paymentRedirectUrl,
    'pending_until' => date('c', time() + 900),
    'awaiting_payment' => $subStatus !== 'ACTIVE',
  ], 201);
}

$router = new Router();

$router->get('/health', function() {
  Response::json(['service' => 'cliente', 'status' => 'ok', 'time' => date('c')]);
});

$router->get('/', function(Request $request) {
  $paymentState = (string)$request->input('payment', '');
  $resetState = (string)$request->input('reset', '');
  $alert = '';
  if ($resetState === 'success') {
    $alert = 'Senha redefinida com sucesso. Faça login para continuar.';
  } elseif ($paymentState === 'confirmed') {
    $alert = 'Pagamento confirmado! Entre agora e preencha o briefing para publicar seu primeiro site em até 24h.';
  } elseif ($paymentState === 'pending') {
    $alert = 'Finalize o pagamento no ASAAS. Assim que confirmar, entre e preencha o briefing para publicar seu primeiro site em até 24h.';
  }
  Response::html(renderAuthPage((string)$request->input('plan', 'basic'), $alert));
});

$router->get('/login', function(Request $request) {
  $paymentState = (string)$request->input('payment', '');
  $resetState = (string)$request->input('reset', '');
  $alert = '';
  if ($resetState === 'success') {
    $alert = 'Senha redefinida com sucesso. Faça login para continuar.';
  } elseif ($paymentState === 'confirmed') {
    $alert = 'Pagamento confirmado! Entre agora e preencha o briefing para publicar seu primeiro site em até 24h.';
  } elseif ($paymentState === 'pending') {
    $alert = 'Finalize o pagamento no ASAAS. Assim que confirmar, entre e preencha o briefing para publicar seu primeiro site em até 24h.';
  }
  Response::html(renderAuthPage((string)$request->input('plan', 'basic'), $alert));
});

$router->get('/signup', function(Request $request) {
  Response::html(renderAuthPage((string)$request->input('plan', 'basic')));
});

$router->get('/esqueci-senha', function(Request $request) {
  $state = (string)$request->input('state', '');
  $alert = $state === 'sent' ? 'Se o e-mail existir, enviaremos instruções para redefinição.' : '';
  Response::html(renderForgotPasswordPage($alert));
});

$router->get('/redefinir-senha', function(Request $request) {
  $token = trim((string)$request->input('token', ''));
  $alert = '';
  $tokenValid = false;
  if ($token === '') {
    $alert = 'Token inválido ou expirado.';
  } else {
    ensurePasswordResetTable();
    $tokenHash = hashPasswordResetToken(strtolower($token));
    $valid = db()->one("
      SELECT id
      FROM client.password_resets
      WHERE token_hash=:hash
        AND used_at IS NULL
        AND expires_at > now()
      LIMIT 1
    ", [':hash' => $tokenHash]);
    if ($valid) {
      $tokenValid = true;
    } else {
      $alert = 'Token inválido ou expirado.';
    }
  }
  Response::html(renderResetPasswordPage($token, $alert, $tokenValid));
});

$router->get('/checkout/pending', function(Request $request) {
  requireClientAuth();
  $sid = trim((string)$request->input('sid', ''));
  $pay = trim((string)$request->input('pay', ''));
  if ($sid === '') {
    header('Location: /portal/dashboard');
    return;
  }
  Response::html(renderCheckoutPendingPage($sid, $pay));
});

$router->get('/checkout/return', function() {
  requireClientAuth();
  $orgId = $_SESSION['client_user']['organization_id'] ?? null;
  if (!$orgId) {
    header('Location: /login');
    return;
  }
  $sub = db()->one("SELECT status FROM client.subscriptions WHERE organization_id=:oid ORDER BY created_at DESC LIMIT 1", [':oid' => $orgId]);
  $status = strtoupper((string)($sub['status'] ?? ''));
  if ($status === 'ACTIVE') {
    header('Location: /login?payment=confirmed');
    return;
  }
  header('Location: /portal/dashboard#pagamentos');
});

$router->get('/portal/logout', function() {
  session_destroy();
  header('Location: /login');
});

$router->get('/portal/approval/{token}', function(Request $request) {
  $token = (string)($request->query['token'] ?? '');
  if ($token === '') {
    Response::html('<h1>Link inválido</h1>', 404);
    return;
  }

  if (!isset($_SESSION['client_user'])) {
    $_SESSION['after_login_redirect'] = '/portal/approval/' . rawurlencode($token);
    header('Location: /login');
    return;
  }

  $ctx = approvalContextByToken($token);
  if (!$ctx) {
    Response::html('<h1>Link de aprovação inválido</h1>', 404);
    return;
  }

  $orgId = $_SESSION['client_user']['organization_id'] ?? null;
  if (empty($orgId) || (string)$ctx['organization_id'] !== (string)$orgId) {
    Response::html('<h1>Acesso negado para este link de aprovação</h1>', 403);
    return;
  }

  if (strtoupper((string)$ctx['approval_status']) === 'PENDING' && !empty($ctx['expires_at']) && strtotime((string)$ctx['expires_at']) < time()) {
    db()->exec("UPDATE crm.deal_client_approval SET status='EXPIRED', updated_at=now() WHERE id=:id", [':id' => $ctx['approval_id']]);
    $ctx['approval_status'] = 'EXPIRED';
  }

  Response::html(renderApprovalPage($ctx, $token));
});

$router->get('/portal/dashboard', function(Request $request) {
  requireClientAuth();
  $pending = currentClientPendingContext();
  if ($pending) {
    $qs = [];
    if (!empty($pending['sid'])) {
      $qs['sid'] = (string)$pending['sid'];
    }
    if (!empty($pending['signup_session_id'])) {
      $qs['ssid'] = (string)$pending['signup_session_id'];
    }
    $target = '/portal/pagamento-pendente';
    if (!empty($qs)) {
      $target .= '?' . http_build_query($qs);
    }
    header('Location: ' . $target);
    return;
  }
  $notice = $request->input('new') ? 'Contratação concluída. Seu acesso foi liberado.' : null;
  Response::html(renderDashboard($notice));
});

$router->get('/portal/pagamento-pendente', function(Request $request) {
  requireClientAuth('/portal/pagamento-pendente');
  $pending = currentClientPendingContext();
  if (!$pending) {
    header('Location: /portal/dashboard');
    return;
  }
  Response::html(renderPortalPaymentPendingPage($pending));
});

$router->get('/onboarding/site-brief', function(Request $request) {
  requireClientAuth();
  $pending = currentClientPendingContext();
  if ($pending) {
    $qs = [];
    if (!empty($pending['sid'])) {
      $qs['sid'] = (string)$pending['sid'];
    }
    if (!empty($pending['signup_session_id'])) {
      $qs['ssid'] = (string)$pending['signup_session_id'];
    }
    $target = '/portal/pagamento-pendente';
    if (!empty($qs)) {
      $target .= '?' . http_build_query($qs);
    }
    header('Location: ' . $target);
    return;
  }
  Response::html(onboardingPage($request->input('ok') ? 'Briefing salvo com sucesso. Prompt gerado e enviado para a operação.' : null));
});

$router->post('/api/auth/pending-check', function(Request $request) {
  if (!rateLimitAllow('auth-pending-check', 40, 300)) {
    apiError('Muitas tentativas. Aguarde alguns minutos.', 429, 'RATE_LIMIT', 'Aguarde alguns minutos para nova consulta.');
    return;
  }
  requireCsrf($request);
  $email = trim((string)$request->input('email', ''));
  $doc = trim((string)$request->input('cpf_cnpj', ''));

  $pending = null;
  if ($email !== '') {
    $pending = pendingPaymentByEmail($email);
  }
  if (!$pending && $doc !== '') {
    $pending = pendingPaymentByDocument($doc);
  }
  if (!$pending) {
    Response::json(['ok' => true, 'has_pending' => false]);
    return;
  }

  $sid = (string)($pending['asaas_subscription_id'] ?? '');
  $signupSessionId = (string)($pending['signup_session_id'] ?? '');
  $pendingUntil = (string)($pending['payment_pending_until'] ?? '');
  if ($pendingUntil === '') {
    $pendingUntil = date('c', strtotime((string)$pending['updated_at'] . ' +15 minutes'));
  }
  $redirectUrl = (string)($pending['payment_redirect_url'] ?? '');
  if ($sid !== '') {
    $asaas = new AsaasClient();
    $payments = $asaas->getPaymentsBySubscription($sid, 1);
    $payment = $payments['data'][0] ?? null;
    if (is_array($payment)) {
      $redirectUrl = (string)($payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? $payment['paymentLink'] ?? $redirectUrl);
    }
  }
  Response::json([
    'ok' => true,
    'has_pending' => true,
    'sid' => $sid,
    'signup_session_id' => $signupSessionId !== '' ? $signupSessionId : null,
    'pending_until' => $pendingUntil,
    'payment_redirect_url' => $redirectUrl !== '' ? $redirectUrl : null,
  ]);
});

$router->post('/api/auth/signup-precheck', function(Request $request) {
  if (!rateLimitAllow('auth-signup-precheck', 80, 300)) {
    apiError('Muitas validações em pouco tempo.', 429, 'RATE_LIMIT', 'Aguarde alguns segundos para tentar novamente.');
    return;
  }
  requireCsrf($request);
  $d = $request->body;
  $step = (int)($d['step'] ?? 0);

  if ($step === 1) {
    $doc = normalizeDigits((string)($d['cpf_cnpj'] ?? ''));
    $phone = normalizeDigits((string)($d['phone'] ?? ''));
    if (!isValidCpfCnpj($doc)) {
      Response::json([
        'ok' => true,
        'can_proceed' => false,
        'field' => 'cpf_cnpj',
        'error' => 'CPF/CNPJ inválido para o tipo selecionado.',
        'error_code' => 'DOC_INVALID',
      ]);
      return;
    }
    $docExists = db()->one("
      SELECT o.id
      FROM client.organizations o
      WHERE regexp_replace(coalesce(o.cpf_cnpj,''),'\\D','','g')=:doc
      LIMIT 1
    ", [':doc' => $doc]);
    if ($docExists) {
      Response::json([
        'ok' => true,
        'can_proceed' => false,
        'field' => 'cpf_cnpj',
        'error' => 'CPF/CNPJ já cadastrado. Use o login ou recuperação de senha.',
        'error_code' => 'DOC_ALREADY_REGISTERED',
      ]);
      return;
    }

    if ($phone !== '') {
      $phoneExists = db()->one("
        SELECT 1
        FROM (
          SELECT regexp_replace(coalesce(u.phone,''),'\\D','','g') AS ph FROM client.users u
          UNION ALL
          SELECT regexp_replace(coalesce(o.whatsapp,''),'\\D','','g') AS ph FROM client.organizations o
          UNION ALL
          SELECT regexp_replace(coalesce(ss.phone,''),'\\D','','g') AS ph FROM crm.signup_session ss
            WHERE ss.status IN ('SIGNUP_STARTED','CHECKOUT_STARTED','SUBSCRIPTION_CREATED','PAYMENT_CONFIRMED')
        ) p
        WHERE p.ph=:ph
        LIMIT 1
      ", [':ph' => $phone]);
      if ($phoneExists) {
        Response::json([
          'ok' => true,
          'can_proceed' => false,
          'field' => 'phone',
          'error' => 'Telefone já cadastrado. Use o login da conta existente.',
          'error_code' => 'PHONE_ALREADY_REGISTERED',
        ]);
        return;
      }
    }
  }

  if ($step === 3) {
    $email = normalizeEmail((string)($d['email'] ?? ''));
    if (!Validator::email($email)) {
      Response::json([
        'ok' => true,
        'can_proceed' => false,
        'field' => 'email',
        'error' => 'Informe um e-mail válido para continuar.',
        'error_code' => 'EMAIL_INVALID',
      ]);
      return;
    }
    if (!boolInput($d['lgpd'] ?? false)) {
      Response::json([
        'ok' => true,
        'can_proceed' => false,
        'field' => 'lgpd',
        'error' => 'Aceite os termos LGPD para continuar.',
        'error_code' => 'LGPD_REQUIRED',
      ]);
      return;
    }
    $turnstileToken = trim((string)($d['turnstile_token'] ?? ''));
    if ($turnstileToken === '') {
      Response::json([
        'ok' => true,
        'can_proceed' => false,
        'field' => 'turnstile',
        'error' => 'Conclua a validação de segurança para continuar.',
        'error_code' => 'TURNSTILE_REQUIRED',
      ]);
      return;
    }
    $emailExists = db()->one("SELECT id FROM client.users WHERE lower(email)=:email LIMIT 1", [':email' => $email]);
    if ($emailExists) {
      Response::json([
        'ok' => true,
        'can_proceed' => false,
        'field' => 'email',
        'error' => 'E-mail já cadastrado. Faça login ou recupere sua senha.',
        'error_code' => 'ACCOUNT_EXISTS',
      ]);
      return;
    }
  }

  Response::json(['ok' => true, 'can_proceed' => true]);
});

$router->post('/api/auth/signup-session/{id}/status', function(Request $request) {
  requireCsrf($request);
  $sessionId = (string)($request->query['id'] ?? '');
  if ($sessionId === '') {
    Response::json(['error' => 'Sessão inválida'], 422);
    return;
  }

  $session = db()->one("
    SELECT
      ss.id,
      ss.organization_id,
      ss.status,
      ss.payment_confirmed,
      ss.updated_at,
      coalesce(ss.metadata->>'asaas_subscription_id','') AS asaas_subscription_id,
      coalesce(ss.metadata->>'payment_pending_until','') AS payment_pending_until,
      coalesce(ss.metadata->>'payment_redirect_url','') AS payment_redirect_url
    FROM crm.signup_session ss
    WHERE ss.id=:id
    LIMIT 1
  ", [':id' => $sessionId]);
  if (!$session) {
    Response::json(['error' => 'Sessão não encontrada'], 404);
    return;
  }

  $sid = (string)($session['asaas_subscription_id'] ?? '');
  $orgId = (string)($session['organization_id'] ?? '');
  $sub = null;
  if ($sid !== '') {
    $sub = db()->one("
      SELECT status
      FROM client.subscriptions
      WHERE asaas_subscription_id=:sid
      LIMIT 1
    ", [':sid' => $sid]);
  }
  if (!$sub && $orgId !== '') {
    $sub = db()->one("
      SELECT status, asaas_subscription_id
      FROM client.subscriptions
      WHERE organization_id=:oid
      ORDER BY created_at DESC
      LIMIT 1
    ", [':oid' => $orgId]);
    if ($sid === '' && $sub) {
      $sid = (string)($sub['asaas_subscription_id'] ?? '');
    }
  }

  $subStatus = strtoupper((string)($sub['status'] ?? ''));
  $blockedStatuses = ['CANCELED', 'CANCELLED', 'SUSPENDED', 'OVERDUE', 'FAILED'];
  $isBlockedByGateway = in_array($subStatus, $blockedStatuses, true);
  $paymentConfirmed = !$isBlockedByGateway && (
    (bool)($session['payment_confirmed'] ?? false)
    || strtoupper((string)($session['status'] ?? '')) === 'PAYMENT_CONFIRMED'
    || $subStatus === 'ACTIVE'
  );

  $crmReady = false;
  if ($orgId !== '') {
    $crmDeal = db()->one("
      SELECT id
      FROM crm.deal
      WHERE organization_id=:oid
        AND deal_type='HOSPEDAGEM'
        AND lifecycle_status='CLIENT'
      LIMIT 1
    ", [':oid' => $orgId]);
    $crmReady = $crmDeal !== null;
  }

  $pendingUntil = (string)($session['payment_pending_until'] ?? '');
  if ($pendingUntil === '') {
    $pendingUntil = date('c', strtotime((string)$session['updated_at'] . ' +15 minutes'));
  }

  Response::json([
    'ok' => true,
    'session_id' => $sessionId,
    'sid' => $sid !== '' ? $sid : null,
    'payment_confirmed' => $paymentConfirmed,
    'crm_ready' => $crmReady,
    'ready' => ($paymentConfirmed && $crmReady),
    'payment_status' => $subStatus !== '' ? $subStatus : strtoupper((string)($session['status'] ?? 'PENDING')),
    'pending_until' => $pendingUntil,
    'payment_redirect_url' => ((string)($session['payment_redirect_url'] ?? '')) !== '' ? (string)$session['payment_redirect_url'] : null,
  ]);
});

$router->post('/api/portal/pagamento-pendente/status', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  if ($orgId === '') {
    Response::json(['error' => 'Organização inválida'], 422);
    return;
  }

  $pending = currentClientPendingContext();
  $latestSub = db()->one("
    SELECT asaas_subscription_id, status, created_at
    FROM client.subscriptions
    WHERE organization_id=:oid
    ORDER BY created_at DESC
    LIMIT 1
  ", [':oid' => $orgId]);
  $subStatus = strtoupper((string)($latestSub['status'] ?? ''));
  $paymentConfirmed = $subStatus === 'ACTIVE';
  $crmReady = isCrmClientReadyByOrganization($orgId);
  $sid = trim((string)($latestSub['asaas_subscription_id'] ?? ''));

  Response::json([
    'ok' => true,
    'ready' => ($paymentConfirmed && $crmReady),
    'payment_confirmed' => $paymentConfirmed,
    'crm_ready' => $crmReady,
    'payment_status' => $subStatus !== '' ? $subStatus : 'PENDING',
    'sid' => $sid !== '' ? $sid : ($pending['sid'] ?? null),
    'signup_session_id' => $pending['signup_session_id'] ?? null,
    'pending_until' => $pending['pending_until'] ?? null,
    'payment_redirect_url' => $pending['payment_redirect_url'] ?? null,
  ]);
});

$router->post('/api/auth/forgot-password', function(Request $request) {
  requireCsrf($request);
  if (!rateLimitAllow('auth-forgot-ip', 10, 3600)) {
    apiError('Muitas solicitações. Aguarde para tentar novamente.', 429, 'PASSWORD_RESET_RATE_LIMIT', 'Aguarde alguns minutos e tente novamente.');
    return;
  }
  $d = $request->body;
  if (!verifyTurnstileToken((string)($d['cf-turnstile-response'] ?? ''))) {
    apiError('CAPTCHA inválido, tente novamente.', 422, 'TURNSTILE_INVALID', 'Conclua a validação para continuar.');
    return;
  }

  $email = normalizeEmail((string)($d['email'] ?? ''));
  if ($email !== '' && !rateLimitAllowKeyed('auth-forgot-email', $email, 3, 3600)) {
    apiError('Muitas solicitações para este e-mail. Tente novamente mais tarde.', 429, 'PASSWORD_RESET_RATE_LIMIT', 'Aguarde alguns minutos e tente novamente.');
    return;
  }

  ensurePasswordResetTable();
  db()->exec("DELETE FROM client.password_resets WHERE expires_at < now() OR (used_at IS NOT NULL AND used_at < now() - interval '7 day')");

  if (Validator::email($email)) {
    $account = db()->one("
      SELECT u.email, o.id AS organization_id
      FROM client.users u
      LEFT JOIN client.organizations o ON o.user_id=u.id
      WHERE lower(u.email)=:email
      LIMIT 1
    ", [':email' => $email]);
    if ($account) {
      $rawToken = generatePasswordResetToken();
      $tokenHash = hashPasswordResetToken($rawToken);
      db()->exec("
        INSERT INTO client.password_resets(email, token_hash, expires_at, ip_address, user_agent)
        VALUES(:email, :token_hash, now() + interval '15 minutes', :ip, :ua)
      ", [
        ':email' => $email,
        ':token_hash' => $tokenHash,
        ':ip' => getClientIp(),
        ':ua' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 1000),
      ]);
      queuePasswordResetEmail($account['organization_id'] ?? null, $email, $rawToken);
    }
  }

  Response::json([
    'ok' => true,
    'message' => 'Se o e-mail existir, enviaremos instruções para redefinição em instantes.',
  ]);
});

$router->post('/api/auth/reset-password', function(Request $request) {
  requireCsrf($request);
  if (!rateLimitAllow('auth-reset-ip', 10, 60)) {
    apiError('Muitas tentativas. Aguarde e tente novamente.', 429, 'PASSWORD_RESET_RATE_LIMIT', 'Aguarde um minuto para tentar novamente.');
    return;
  }
  $d = $request->body;
  $token = strtolower(trim((string)($d['token'] ?? '')));
  if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
    apiError('Token inválido ou expirado.', 422, 'PASSWORD_RESET_TOKEN_INVALID', 'Solicite um novo link de recuperação.');
    return;
  }
  $password = (string)($d['password'] ?? '');
  $passwordConfirm = (string)($d['password_confirm'] ?? '');
  if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
    apiError('A senha deve ter no mínimo 8 caracteres com letras e números.', 422, 'VALIDATION_ERROR', 'Defina uma senha mais forte para continuar.');
    return;
  }
  if ($password !== $passwordConfirm) {
    apiError('A confirmação da senha não confere.', 422, 'VALIDATION_ERROR', 'Revise os dois campos de senha e tente novamente.');
    return;
  }
  if (!verifyTurnstileToken((string)($d['cf-turnstile-response'] ?? ''))) {
    apiError('CAPTCHA inválido, tente novamente.', 422, 'TURNSTILE_INVALID', 'Conclua a validação para continuar.');
    return;
  }

  ensurePasswordResetTable();
  $tokenHash = hashPasswordResetToken($token);
  $row = db()->one("
    SELECT id, email, token_hash, expires_at, used_at
    FROM client.password_resets
    WHERE token_hash=:token_hash
    LIMIT 1
  ", [':token_hash' => $tokenHash]);
  if (!$row || !hash_equals((string)$row['token_hash'], $tokenHash)) {
    apiError('Token inválido ou expirado.', 422, 'PASSWORD_RESET_TOKEN_INVALID', 'Solicite um novo link de recuperação.');
    return;
  }
  if (!empty($row['used_at'])) {
    apiError('Este link já foi utilizado.', 422, 'PASSWORD_RESET_TOKEN_USED', 'Solicite um novo link para redefinir sua senha.');
    return;
  }
  if (strtotime((string)$row['expires_at']) < time()) {
    apiError('Token inválido ou expirado.', 422, 'PASSWORD_RESET_TOKEN_EXPIRED', 'Solicite um novo link de recuperação.');
    return;
  }

  $email = normalizeEmail((string)$row['email']);
  $user = db()->one("SELECT id FROM client.users WHERE lower(email)=:email LIMIT 1", [':email' => $email]);
  if ($user) {
    db()->exec("UPDATE client.users SET password_hash=:ph, updated_at=now() WHERE id=:id", [
      ':ph' => Auth::hashPassword($password),
      ':id' => $user['id'],
    ]);
  }
  db()->exec("UPDATE client.password_resets SET used_at=now() WHERE id=:id", [':id' => $row['id']]);
  db()->exec("UPDATE client.password_resets SET used_at=now() WHERE email=:email AND used_at IS NULL AND id<>:id", [
    ':email' => $email,
    ':id' => $row['id'],
  ]);

  Response::json([
    'ok' => true,
    'message' => 'Senha redefinida com sucesso. Faça login para continuar.',
    'redirect' => '/login?reset=success',
  ]);
});

$router->post('/api/auth/login', function(Request $request) {
  if (!rateLimitAllow('auth-login', 5, 60)) {
    apiError('Muitas tentativas de login. Aguarde alguns minutos.', 429, 'RATE_LIMIT', 'Aguarde alguns minutos para tentar novamente.');
    return;
  }
  requireCsrf($request);

  $d = $request->body;
  if (!verifyTurnstileToken((string)($d['cf-turnstile-response'] ?? ''))) {
    apiError('CAPTCHA inválido, tente novamente.', 422, 'TURNSTILE_INVALID', 'Conclua a validação para continuar.');
    return;
  }

  $email = normalizeEmail((string)($d['email'] ?? ''));
  $password = (string)($d['password'] ?? '');
  $u = db()->one("SELECT u.id,u.name,u.email,u.password_hash,o.id AS organization_id FROM client.users u LEFT JOIN client.organizations o ON o.user_id=u.id WHERE u.email=:e", [':e' => $email]);
  if (!$u || !Auth::verifyPassword($password, (string)$u['password_hash'])) {
    apiError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS', 'Revise e-mail e senha e tente novamente.');
    return;
  }

  $orgId = trim((string)($u['organization_id'] ?? ''));
  $pending = $orgId !== '' ? pendingPaymentByOrganization($orgId) : pendingPaymentByEmail((string)$email);
  if ($pending) {
    ensureClientSession($u);
    $sid = (string)($pending['asaas_subscription_id'] ?? '');
    $signupSessionId = (string)($pending['signup_session_id'] ?? '');
    $pendingUntil = (string)($pending['payment_pending_until'] ?? '');
    if ($pendingUntil === '') {
      $pendingUntil = date('c', strtotime((string)$pending['updated_at'] . ' +15 minutes'));
    }
    $redirectUrl = (string)($pending['payment_redirect_url'] ?? '');
    if ($sid !== '') {
      $asaas = new AsaasClient();
      $payments = $asaas->getPaymentsBySubscription($sid, 1);
      $payment = $payments['data'][0] ?? null;
      if (is_array($payment)) {
        $redirectUrl = (string)($payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? $payment['paymentLink'] ?? $redirectUrl);
      }
    }
    $next = '/portal/pagamento-pendente';
    $qs = [];
    if ($sid !== '') {
      $qs['sid'] = $sid;
    }
    if ($signupSessionId !== '') {
      $qs['ssid'] = $signupSessionId;
    }
    if (!empty($qs)) {
      $next .= '?' . http_build_query($qs);
    }
    Response::json([
      'ok' => true,
      'redirect' => $next,
      'payment_pending' => true,
      'sid' => $sid !== '' ? $sid : null,
      'signup_session_id' => $signupSessionId !== '' ? $signupSessionId : null,
      'pending_until' => $pendingUntil,
      'payment_redirect_url' => $redirectUrl !== '' ? $redirectUrl : null,
      'message' => 'Pagamento pendente. Continue no monitoramento de pagamento para liberar o acesso completo.',
    ]);
    return;
  }

  ensureClientSession($u);
  Response::json(['ok' => true, 'redirect' => resolveAfterLoginRedirect()]);
});

$router->post('/api/auth/register', function(Request $request) {
  registerContract($request);
});

$router->post('/api/auth/register-contract', function(Request $request) {
  registerContract($request);
});

$router->post('/api/billing/subscriptions/{id}/change-plan', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
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

$router->get('/api/billing/subscriptions/{id}/status', function(Request $request) {
  $sid = (string)($request->query['id'] ?? '');
  if ($sid === '') {
    Response::json(['error' => 'Assinatura inválida'], 422);
    return;
  }
  $sub = db()->one("
    SELECT s.id, s.status, s.asaas_subscription_id, s.next_due_date, s.payment_method, p.name AS plan_name, p.monthly_price
    FROM client.subscriptions s
    JOIN client.plans p ON p.id=s.plan_id
    WHERE s.asaas_subscription_id=:sid
    LIMIT 1
  ", [':sid' => $sid]);
  if (!$sub) {
    Response::json(['error' => 'Assinatura não encontrada'], 404);
    return;
  }
  $status = strtoupper((string)($sub['status'] ?? ''));
  $paymentStatus = $status === 'ACTIVE' ? 'CONFIRMED' : ($status === 'PENDING' ? 'PENDING' : $status);
  Response::json([
    'ok' => true,
    'subscription' => $sub,
    'payment_status' => $paymentStatus,
    'can_login' => $status === 'ACTIVE',
  ]);
});

$router->post('/api/billing/subscriptions/{id}/retry', function(Request $request) {
  requireCsrf($request);
  $sid = (string)($request->query['id'] ?? '');
  if ($sid === '') {
    Response::json(['error' => 'Assinatura inválida'], 422);
    return;
  }
  $sub = db()->one("SELECT asaas_subscription_id FROM client.subscriptions WHERE asaas_subscription_id=:sid LIMIT 1", [':sid' => $sid]);
  if (!$sub) {
    Response::json(['error' => 'Assinatura não encontrada'], 404);
    return;
  }
  $asaas = new AsaasClient();
  $payments = $asaas->getPaymentsBySubscription($sid, 1);
  $payment = $payments['data'][0] ?? null;
  $redirectUrl = null;
  if (is_array($payment)) {
    $redirectUrl = $payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? $payment['paymentLink'] ?? null;
  }
  Response::json(['ok' => true, 'payment_redirect_url' => $redirectUrl, 'retry_url' => $redirectUrl]);
});

$router->post('/api/billing/card/update', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  Response::json([
    'error' => 'Atualização direta de cartão desativada. Utilize o checkout seguro do ASAAS para alterar o método de pagamento.',
  ], 410);
});

$router->post('/api/profile/update', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
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
  requireCsrf($request);
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

  $deal = db()->one("
    SELECT id, deal_type
    FROM crm.deal
    WHERE organization_id=:oid AND lifecycle_status='CLIENT'
    ORDER BY updated_at DESC
    LIMIT 1
  ", [':oid' => $org['id']]);
  if ($deal && strtoupper((string)$deal['deal_type']) === 'HOSPEDAGEM') {
    moveDealOperationStage((string)$deal['id'], 'pre_prompt');

    $maxPromptVersion = db()->one("SELECT COALESCE(MAX(version),0) AS version FROM crm.deal_prompt_revision WHERE deal_id=:did", [
      ':did' => $deal['id'],
    ]);
    $nextVersion = ((int)($maxPromptVersion['version'] ?? 0)) + 1;
    db()->exec("
      INSERT INTO crm.deal_prompt_revision(deal_id, version, prompt_text, prompt_json, status, created_by, created_at, updated_at)
      VALUES(:did, :version, :prompt_text, :prompt_json, 'DRAFT', 'CLIENT_PORTAL', now(), now())
    ", [
      ':did' => $deal['id'],
      ':version' => $nextVersion,
      ':prompt_text' => $prompt['text'],
      ':prompt_json' => json_encode($prompt['json'], JSON_UNESCAPED_UNICODE),
    ]);

    db()->exec("INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by) VALUES(:did,'FLOW_UPDATE',:content,:metadata,'CLIENT_PORTAL')", [
      ':did' => $deal['id'],
      ':content' => 'Briefing enviado pelo cliente e operação movida para Pré-prompt.',
      ':metadata' => json_encode(['brief_id' => $briefId, 'prompt_version' => $nextVersion], JSON_UNESCAPED_UNICODE),
    ]);
  }

  Response::json(['ok' => true, 'brief_id' => $briefId, 'prompt_json' => $prompt['json'], 'prompt_text' => $prompt['text']], 201);
});

$router->post('/api/portal/approval/request-link', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);

  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  if ($orgId === '') {
    Response::json(['error' => 'Organização não vinculada à sessão.'], 422);
    return;
  }

  $deal = db()->one("
    SELECT d.id, d.title, o.billing_email
    FROM crm.deal d
    LEFT JOIN client.organizations o ON o.id = d.organization_id
    WHERE d.organization_id=:oid
      AND d.deal_type='HOSPEDAGEM'
      AND d.lifecycle_status='CLIENT'
    ORDER BY d.updated_at DESC
    LIMIT 1
  ", [':oid' => $orgId]);

  if (!$deal) {
    Response::json(['error' => 'Nenhum deal de hospedagem fechado encontrado para gerar link de validação.'], 404);
    return;
  }

  $template = db()->one("
    SELECT id, version, preview_url
    FROM crm.deal_template_revision
    WHERE deal_id=:did
    ORDER BY version DESC, created_at DESC
    LIMIT 1
  ", [':did' => $deal['id']]);

  if (!$template) {
    Response::json(['error' => 'Nenhuma revisão de template disponível para aprovação.'], 422);
    return;
  }

  db()->exec("
    UPDATE crm.deal_client_approval
    SET status='EXPIRED', updated_at=now()
    WHERE deal_id=:did
      AND status='PENDING'
  ", [':did' => $deal['id']]);

  $rawToken = bin2hex(random_bytes(32));
  $tokenHash = hash('sha256', $rawToken);
  $expiresHours = 72;
  $expiresAt = date('Y-m-d H:i:s', time() + ($expiresHours * 3600));

  $approval = db()->one("
    INSERT INTO crm.deal_client_approval(
      deal_id, template_revision_id, token_hash, expires_at, status, created_at, updated_at
    )
    VALUES(
      :did, :trid, :thash, :expires_at, 'PENDING', now(), now()
    )
    RETURNING id
  ", [
    ':did' => $deal['id'],
    ':trid' => $template['id'],
    ':thash' => $tokenHash,
    ':expires_at' => $expiresAt,
  ]);

  db()->exec("UPDATE crm.deal_template_revision SET status='SENT_CLIENT', updated_at=now() WHERE id=:id", [
    ':id' => $template['id'],
  ]);
  moveDealOperationStage((string)$deal['id'], 'aprovacao_cliente');

  $approvalUrl = '/portal/approval/' . $rawToken;

  if (!empty($deal['billing_email'])) {
    db()->exec("
      INSERT INTO crm.email_queue(organization_id, email_to, subject, body, status, created_at)
      VALUES(:oid, :email, :subject, :body, 'PENDING', now())
    ", [
      ':oid' => $orgId,
      ':email' => $deal['billing_email'],
      ':subject' => '[KoddaHub] Link temporário para validação do template',
      ':body' => "Olá!\n\nSeu template está pronto para validação.\n\nAcesse: " . (rtrim((string)(getenv('PORTAL_BASE_URL') ?: ''), '/') . $approvalUrl) . "\n\nEste link expira em {$expiresHours}h.\n\nEquipe KoddaHub.",
    ]);
  }

  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(:deal_id, 'CLIENT_APPROVAL_REQUESTED', :content, :metadata::jsonb, 'CLIENT_PORTAL')
  ", [
    ':deal_id' => $deal['id'],
    ':content' => 'Link temporário de validação gerado no portal do cliente.',
    ':metadata' => json_encode([
      'approval_id' => $approval['id'] ?? null,
      'template_revision_id' => $template['id'],
      'approval_path' => $approvalUrl,
      'expires_at' => $expiresAt,
    ], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json([
    'ok' => true,
    'approval_url' => $approvalUrl,
    'preview_url' => $template['preview_url'] ?? null,
    'expires_at' => $expiresAt,
  ]);
});

$router->post('/api/portal/approval/{token}/approve', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  $token = (string)($request->query['token'] ?? '');
  if ($token === '') {
    Response::json(['error' => 'Token inválido'], 422);
    return;
  }

  $ctx = approvalContextByToken($token);
  if (!$ctx) {
    Response::json(['error' => 'Link de aprovação inválido'], 404);
    return;
  }

  $orgId = $_SESSION['client_user']['organization_id'] ?? null;
  if (empty($orgId) || (string)$ctx['organization_id'] !== (string)$orgId) {
    Response::json(['error' => 'Acesso negado'], 403);
    return;
  }

  if (strtoupper((string)$ctx['approval_status']) !== 'PENDING') {
    Response::json(['error' => 'Este link já foi utilizado ou expirou'], 409);
    return;
  }
  if (!empty($ctx['expires_at']) && strtotime((string)$ctx['expires_at']) < time()) {
    db()->exec("UPDATE crm.deal_client_approval SET status='EXPIRED', updated_at=now() WHERE id=:id", [':id' => $ctx['approval_id']]);
    Response::json(['error' => 'Link expirado'], 410);
    return;
  }

  $note = trim((string)($request->input('note', '')));

  db()->exec("UPDATE crm.deal_client_approval SET status='APPROVED', client_note=:note, acted_at=now(), updated_at=now() WHERE id=:id", [
    ':id' => $ctx['approval_id'],
    ':note' => $note !== '' ? $note : null,
  ]);
  db()->exec("UPDATE crm.deal_template_revision SET status='APPROVED_CLIENT', updated_at=now() WHERE id=:id", [
    ':id' => $ctx['template_revision_id'],
  ]);
  moveDealOperationStage((string)$ctx['deal_id'], 'publicacao');

  db()->exec("
    INSERT INTO crm.deal_publish_check(deal_id, template_revision_id, target_domain, expected_hash, matches, checked_at)
    VALUES(:deal_id, :template_revision_id, :target_domain, :expected_hash, false, now())
  ", [
    ':deal_id' => $ctx['deal_id'],
    ':template_revision_id' => $ctx['template_revision_id'],
    ':target_domain' => !empty($ctx['domain']) ? $ctx['domain'] : null,
    ':expected_hash' => !empty($ctx['source_hash']) ? $ctx['source_hash'] : null,
  ]);

  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(:deal_id,'CLIENT_APPROVED','Cliente aprovou o template para publicação.',:metadata,'CLIENT_PORTAL')
  ", [
    ':deal_id' => $ctx['deal_id'],
    ':metadata' => json_encode(['approval_id' => $ctx['approval_id'], 'note' => $note], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json(['ok' => true]);
});

$router->post('/api/portal/approval/{token}/request-changes', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  $token = (string)($request->query['token'] ?? '');
  if ($token === '') {
    Response::json(['error' => 'Token inválido'], 422);
    return;
  }

  $ctx = approvalContextByToken($token);
  if (!$ctx) {
    Response::json(['error' => 'Link de aprovação inválido'], 404);
    return;
  }

  $orgId = $_SESSION['client_user']['organization_id'] ?? null;
  if (empty($orgId) || (string)$ctx['organization_id'] !== (string)$orgId) {
    Response::json(['error' => 'Acesso negado'], 403);
    return;
  }

  if (strtoupper((string)$ctx['approval_status']) !== 'PENDING') {
    Response::json(['error' => 'Este link já foi utilizado ou expirou'], 409);
    return;
  }
  if (!empty($ctx['expires_at']) && strtotime((string)$ctx['expires_at']) < time()) {
    db()->exec("UPDATE crm.deal_client_approval SET status='EXPIRED', updated_at=now() WHERE id=:id", [':id' => $ctx['approval_id']]);
    Response::json(['error' => 'Link expirado'], 410);
    return;
  }

  $note = trim((string)($request->input('note', '')));

  db()->exec("UPDATE crm.deal_client_approval SET status='CHANGES_REQUESTED', client_note=:note, acted_at=now(), updated_at=now() WHERE id=:id", [
    ':id' => $ctx['approval_id'],
    ':note' => $note !== '' ? $note : 'Cliente solicitou micro ajustes.',
  ]);
  db()->exec("UPDATE crm.deal_template_revision SET status='NEEDS_ADJUSTMENTS', updated_at=now() WHERE id=:id", [
    ':id' => $ctx['template_revision_id'],
  ]);
  moveDealOperationStage((string)$ctx['deal_id'], 'ajustes');

  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(:deal_id,'CLIENT_REQUESTED_CHANGES','Cliente solicitou micro ajustes no template.',:metadata,'CLIENT_PORTAL')
  ", [
    ':deal_id' => $ctx['deal_id'],
    ':metadata' => json_encode(['approval_id' => $ctx['approval_id'], 'note' => $note], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json(['ok' => true]);
});

$router->post('/api/tickets', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
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
  if (!rateLimitAllow('asaas-webhook', 600, 300)) {
    Response::json(['error' => 'Rate limit'], 429);
    return;
  }
  $token = requestHeader($request, 'X-Webhook-Token')
    ?? requestHeader($request, 'Asaas-Access-Token')
    ?? '';
  $expected = getenv('ASAAS_WEBHOOK_TOKEN') ?: '';

  if ($expected !== '' && !hash_equals($expected, (string)$token)) {
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

  $safeEvent = $event;
  if (isset($safeEvent['payment']['creditCard'])) {
    unset($safeEvent['payment']['creditCard']);
  }
  if (isset($safeEvent['payment']['creditCardHolderInfo'])) {
    unset($safeEvent['payment']['creditCardHolderInfo']);
  }

  db()->exec("INSERT INTO client.webhook_events(provider,event_id,event_type,payload,processed) VALUES('ASAAS',:eid,:et,:p,false)", [
    ':eid' => $eventId,
    ':et' => $eventType,
    ':p' => json_encode($safeEvent, JSON_UNESCAPED_UNICODE),
  ]);

  $subCode = $event['payment']['subscription'] ?? $event['subscription']['id'] ?? null;
  if ($subCode) {
    if (str_contains($eventType, 'SUBSCRIPTION_CREATED') || str_contains($eventType, 'SUBSCRIPTION_UPDATED')) {
      db()->exec("UPDATE client.subscriptions SET status='PENDING', updated_at=now() WHERE asaas_subscription_id=:sid AND status <> 'ACTIVE'", [':sid' => $subCode]);
      $org = db()->one("
        SELECT organization_id
        FROM client.subscriptions
        WHERE asaas_subscription_id=:sid
        ORDER BY created_at DESC
        LIMIT 1
      ", [':sid' => $subCode]);
      if ($org && !empty($org['organization_id'])) {
        syncHospedagemDealByOrganization((string)$org['organization_id'], (string)$subCode, 'webhook_subscription_updated');
      }
    }
    if (str_contains($eventType, 'PAYMENT_CONFIRMED') || str_contains($eventType, 'PAYMENT_RECEIVED')) {
      db()->exec("UPDATE client.subscriptions SET status='ACTIVE', updated_at=now() WHERE asaas_subscription_id=:sid", [':sid' => $subCode]);

      $sub = db()->one("SELECT s.id, s.organization_id, p.monthly_price FROM client.subscriptions s JOIN client.plans p ON p.id=s.plan_id WHERE s.asaas_subscription_id=:sid", [':sid' => $subCode]);
      if ($sub) {
        $paymentId = (string)($event['payment']['id'] ?? ('pay_' . substr($eventId, 0, 12)));
        $alreadyPayment = db()->one("SELECT id FROM client.payments WHERE asaas_payment_id=:pid LIMIT 1", [
          ':pid' => $paymentId,
        ]);
        if (!$alreadyPayment) {
          db()->exec("INSERT INTO client.payments(subscription_id,asaas_payment_id,amount,status,billing_type,due_date,paid_at,raw_payload) VALUES(:sid,:pay,:amount,'RECEIVED',:type,CURRENT_DATE,now(),:raw)", [
            ':sid' => $sub['id'],
            ':pay' => $paymentId,
            ':amount' => (float)$sub['monthly_price'],
            ':type' => (string)($event['payment']['billingType'] ?? 'PIX'),
            ':raw' => json_encode($safeEvent, JSON_UNESCAPED_UNICODE),
          ]);
        }

        $org = db()->one("SELECT legal_name,billing_email,whatsapp FROM client.organizations WHERE id=:oid", [':oid' => $sub['organization_id']]);
        if ($org) {
          queueWelcomeMessages((string)$sub['organization_id'], (string)$org['legal_name'], (string)$org['billing_email'], (string)$org['whatsapp']);
          queueBillingEventEmail(
            (string)$sub['organization_id'],
            (string)$org['billing_email'],
            'Pagamento confirmado - Assinatura KoddaHub',
            "Recebemos a confirmação do seu pagamento.\n\nEntre agora em https://clientes.koddahub.com.br/login e preencha o briefing para publicar seu primeiro site em até 24h."
          );
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

        syncHospedagemDealByOrganization((string)$sub['organization_id'], (string)$subCode, 'webhook_payment_confirmed');
      }
    }
    if (str_contains($eventType, 'PAYMENT_OVERDUE') || str_contains($eventType, 'PAYMENT_FAILED')) {
      db()->exec("UPDATE client.subscriptions SET status='OVERDUE', updated_at=now() WHERE asaas_subscription_id=:sid", [':sid' => $subCode]);
      db()->exec("INSERT INTO crm.activities(activity_type,message,metadata) VALUES('PAYMENT_ISSUE','Pagamento pendente ou falhou no ASAAS',:meta)", [
        ':meta' => json_encode(['asaas_subscription_id' => $subCode, 'event_type' => $eventType], JSON_UNESCAPED_UNICODE),
      ]);
      $org = db()->one("
        SELECT o.id, o.billing_email
        FROM client.organizations o
        JOIN client.subscriptions s ON s.organization_id=o.id
        WHERE s.asaas_subscription_id=:sid
        LIMIT 1
      ", [':sid' => $subCode]);
      if ($org) {
        queueBillingEventEmail(
          (string)$org['id'],
          (string)$org['billing_email'],
          'Ação necessária - Pagamento pendente da assinatura KoddaHub',
          'Identificamos uma pendência no pagamento da sua assinatura. Acesse sua área do cliente para regularizar a cobrança.'
        );
        syncHospedagemDealByOrganization((string)$org['id'], (string)$subCode, 'webhook_payment_overdue');
      }
    }
    if (str_contains($eventType, 'SUBSCRIPTION_DELETED') || str_contains($eventType, 'SUBSCRIPTION_CANCELED')) {
      db()->exec("UPDATE client.subscriptions SET status='CANCELED', updated_at=now() WHERE asaas_subscription_id=:sid", [':sid' => $subCode]);
      $org = db()->one("
        SELECT organization_id
        FROM client.subscriptions
        WHERE asaas_subscription_id=:sid
        ORDER BY created_at DESC
        LIMIT 1
      ", [':sid' => $subCode]);
      if ($org && !empty($org['organization_id'])) {
        syncHospedagemDealByOrganization((string)$org['organization_id'], (string)$subCode, 'webhook_subscription_canceled');
      }
    }
  }

  db()->exec("UPDATE client.webhook_events SET processed=true WHERE provider='ASAAS' AND event_id=:eid", [':eid' => $eventId]);

  Response::json(['ok' => true]);
});

$router->run();
