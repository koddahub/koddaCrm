<?php
declare(strict_types=1);

// Never leak PHP warnings/notices into API JSON responses.
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');

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
use Shared\Support\BillingSnapshotService;
use Shared\Support\ClientProjectBillingService;
use Shared\Support\FinancialAuditNotifier;
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

function normalizeDomainInput(?string $value): string {
  $domain = strtolower(trim((string)$value));
  $domain = preg_replace('#^https?://#i', '', $domain) ?? $domain;
  $domain = preg_replace('#/.*$#', '', $domain) ?? $domain;
  return trim($domain, " \t\n\r\0\x0B.");
}

function normalizeProjectTagInput(?string $value): string {
  $raw = strtoupper(trim((string)$value));
  if ($raw === '') {
    return '';
  }
  $raw = preg_replace('/[^A-Z0-9_-]+/', '-', $raw) ?? $raw;
  $raw = preg_replace('/-+/', '-', $raw) ?? $raw;
  $raw = trim($raw, '-_');
  if ($raw === '') {
    return '';
  }
  if (!str_starts_with($raw, 'PRJ-')) {
    $raw = 'PRJ-' . $raw;
  }
  if (strlen($raw) > 190) {
    $raw = substr($raw, 0, 190);
  }
  return $raw;
}

function isProjectTag(string $value): bool {
  return (bool)preg_match('/^PRJ-[A-Z0-9_-]{3,186}$/', strtoupper(trim($value)));
}

function projectDisplayLabel(?string $domain): string {
  $raw = trim((string)$domain);
  if ($raw === '') {
    return 'PRJ-UNSET';
  }
  if (isValidDomainName(strtolower($raw))) {
    return strtolower($raw);
  }
  return strtoupper($raw);
}

function generateProjectTag(string $organizationId): string {
  for ($attempt = 0; $attempt < 10; $attempt++) {
    $suffix = strtoupper(substr(md5($organizationId . '|' . $attempt . '|' . microtime(true)), 0, 4));
    $candidate = 'PRJ-' . $suffix;
    $exists = db()->one("
      SELECT id::text AS id
      FROM client.projects
      WHERE organization_id = CAST(:oid AS uuid)
        AND lower(coalesce(domain, '')) = lower(:domain)
      LIMIT 1
    ", [
      ':oid' => $organizationId,
      ':domain' => $candidate,
    ]);
    if (!$exists) {
      return $candidate;
    }
  }
  return 'PRJ-' . strtoupper(substr(md5($organizationId . '|fallback|' . microtime(true)), 0, 4));
}

function isValidDomainName(string $domain): bool {
  if ($domain === '' || strlen($domain) > 253) {
    return false;
  }
  return (bool)preg_match('/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $domain);
}

function getClientIp(): string {
  $forwarded = trim((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
  if ($forwarded !== '') {
    $parts = explode(',', $forwarded);
    $candidate = trim((string)($parts[0] ?? ''));
    if ($candidate !== '') {
      return $candidate;
    }
  }
  return (string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
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

function featureFlagEnabled(string $key, bool $default = false): bool {
  $raw = getenv($key);
  if ($raw === false) {
    return $default;
  }
  return in_array(strtolower(trim((string)$raw)), ['1', 'true', 'yes', 'on'], true);
}

function requestCorrelationId(Request $request): string {
  $raw = trim((string)(
    requestHeader($request, 'X-Request-Id')
    ?? requestHeader($request, 'X-Correlation-Id')
    ?? ''
  ));
  if ($raw === '') {
    $raw = 'req_' . bin2hex(random_bytes(12));
  }
  header('X-Request-Id: ' . $raw);
  return $raw;
}

function toUuidFromScalar(string $seed): string {
  return FinancialAuditNotifier::uuidFromString($seed);
}

function financialAuditNotifier(): FinancialAuditNotifier {
  static $instance = null;
  if ($instance instanceof FinancialAuditNotifier) {
    return $instance;
  }
  $instance = new FinancialAuditNotifier(
    db(),
    featureFlagEnabled('FEATURE_FINANCIAL_AUDIT_NOTIFICATIONS', true)
  );
  return $instance;
}

function safeJson(mixed $value): string {
  return json_encode($value, JSON_UNESCAPED_UNICODE) ?: '{}';
}

function projectBillingService(): ClientProjectBillingService {
  static $instance = null;
  if ($instance instanceof ClientProjectBillingService) {
    return $instance;
  }
  $instance = new ClientProjectBillingService(db());
  return $instance;
}

function readIdempotencyKey(Request $request): string {
  return trim((string)(requestHeader($request, 'Idempotency-Key') ?? requestHeader($request, 'X-Idempotency-Key') ?? ''));
}

function decodeAuditJsonValue(mixed $raw): array {
  if (is_array($raw)) {
    return $raw;
  }
  if (is_string($raw) && trim($raw) !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
      return $decoded;
    }
  }
  return [];
}

function loadConfirmedActionPayload(string $actionId): ?array {
  if ($actionId === '') {
    return null;
  }
  $row = db()->one("
    SELECT status, payload, after_state
    FROM audit.financial_actions
    WHERE action_id = CAST(:action_id AS uuid)
    LIMIT 1
  ", [':action_id' => $actionId]);
  if (!$row || strtoupper((string)($row['status'] ?? '')) !== 'CONFIRMED') {
    return null;
  }
  $payload = decodeAuditJsonValue($row['payload'] ?? null);
  $afterState = decodeAuditJsonValue($row['after_state'] ?? null);
  return [
    'payload' => $payload,
    'after_state' => $afterState,
  ];
}

function logPortalAudit(
  string $action,
  ?string $targetType,
  ?string $targetId,
  array $details = [],
  ?string $actor = null,
  ?string $actorRole = null
): void {
  try {
    db()->exec("
      INSERT INTO audit.logs(actor, actor_role, action, target_type, target_id, details, created_at)
      VALUES(:actor, :actor_role, :action, :target_type, :target_id, CAST(:details AS jsonb), now())
    ", [
      ':actor' => $actor,
      ':actor_role' => $actorRole,
      ':action' => $action,
      ':target_type' => $targetType,
      ':target_id' => $targetId,
      ':details' => safeJson($details),
    ]);
  } catch (Throwable) {
    // best-effort audit log
  }
}

function ensureClientProjectTables(): void {
  static $ready = false;
  if ($ready) {
    return;
  }
  db()->exec("
    CREATE TABLE IF NOT EXISTS client.projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
      domain VARCHAR(190),
      project_type VARCHAR(40) NOT NULL DEFAULT 'hospedagem',
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ");
  db()->exec("
    CREATE TABLE IF NOT EXISTS client.subscription_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES client.projects(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES client.plans(id),
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      price_override NUMERIC(10,2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ");
  db()->exec("ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS consolidated_value NUMERIC(10,2)");
  db()->exec("ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS last_recalc_at TIMESTAMPTZ");
  db()->exec("ALTER TABLE client.project_briefs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL");
  db()->exec("
    CREATE TABLE IF NOT EXISTS client.project_prorata_payment_sessions (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES client.projects(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
      target_plan_id UUID NOT NULL REFERENCES client.plans(id),
      payment_id VARCHAR(80) NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      confirmed_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ
    )
  ");
  db()->exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_client_projects_org_domain ON client.projects(organization_id, lower(coalesce(domain, '')))");
  db()->exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_client_subscription_items_project ON client.subscription_items(project_id)");
  db()->exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_client_project_prorata_payment_sessions_payment ON client.project_prorata_payment_sessions(payment_id)");
  db()->exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_client_project_prorata_payment_sessions_project_pending ON client.project_prorata_payment_sessions(project_id) WHERE status='PENDING'");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_client_projects_org_status ON client.projects(organization_id, status, created_at DESC)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_client_subscription_items_org_status ON client.subscription_items(organization_id, status, created_at DESC)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_client_project_prorata_payment_sessions_project_created ON client.project_prorata_payment_sessions(project_id, created_at DESC)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_client_project_prorata_payment_sessions_subscription_status ON client.project_prorata_payment_sessions(subscription_id, status, created_at DESC)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_client_project_briefs_project_created ON client.project_briefs(project_id, created_at DESC)");
  $ready = true;
}

function loadProjectOwnedByOrganization(string $projectId, string $organizationId): ?array {
  if ($projectId === '' || $organizationId === '') {
    return null;
  }
  return db()->one("
    SELECT id::text AS id, organization_id::text AS organization_id, domain, project_type, status
    FROM client.projects
    WHERE id = CAST(:pid AS uuid)
      AND organization_id = CAST(:oid AS uuid)
    LIMIT 1
  ", [
    ':pid' => $projectId,
    ':oid' => $organizationId,
  ]);
}

function currentClientProjectId(string $organizationId): ?string {
  $raw = trim((string)($_SESSION['current_project_id'] ?? ''));
  if ($raw === '' || $organizationId === '') {
    return null;
  }
  $project = loadProjectOwnedByOrganization($raw, $organizationId);
  if (!$project) {
    unset($_SESSION['current_project_id']);
    return null;
  }
  return (string)$project['id'];
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

function ensureSubscriptionRecurringTables(): void {
  static $ready = false;
  if ($ready) {
    return;
  }

  db()->exec("ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS price_override NUMERIC(10,2)");
  db()->exec("ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS billing_profile_updated_at TIMESTAMPTZ");
  db()->exec("ALTER TABLE client.subscriptions ADD COLUMN IF NOT EXISTS last_asaas_event_at TIMESTAMPTZ");
  db()->exec("
    CREATE TABLE IF NOT EXISTS client.subscription_change_schedule (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action_id UUID UNIQUE NOT NULL,
      subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
      asaas_subscription_id VARCHAR(80) NOT NULL,
      change_type VARCHAR(40) NOT NULL,
      current_plan_id UUID REFERENCES client.plans(id),
      target_plan_id UUID REFERENCES client.plans(id),
      current_value NUMERIC(10,2),
      target_value NUMERIC(10,2) NOT NULL,
      effective_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      failure_reason TEXT
    )
  ");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_subscription_change_schedule_status_effective ON client.subscription_change_schedule(status, effective_at)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_subscription_change_schedule_subscription ON client.subscription_change_schedule(subscription_id, created_at DESC)");
  db()->exec("
    CREATE TABLE IF NOT EXISTS client.plan_change_payment_sessions (
      id UUID PRIMARY KEY,
      subscription_id UUID NOT NULL REFERENCES client.subscriptions(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES client.organizations(id) ON DELETE CASCADE,
      target_plan_id UUID NOT NULL REFERENCES client.plans(id),
      target_plan_code VARCHAR(40) NOT NULL,
      payment_id VARCHAR(80) NOT NULL,
      request_id VARCHAR(120),
      action_id UUID,
      amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      confirmed_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ
    )
  ");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_plan_change_payment_sessions_subscription ON client.plan_change_payment_sessions(subscription_id, created_at DESC)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_plan_change_payment_sessions_status ON client.plan_change_payment_sessions(status, created_at DESC)");
  db()->exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_change_payment_sessions_active ON client.plan_change_payment_sessions(subscription_id, target_plan_code) WHERE status='PENDING'");
  $ready = true;
}

function resetOpenPlanChangeStateAndCancelPix(
  AsaasClient $asaas,
  string $subscriptionUuid,
  string $asaasSubscriptionId,
  string $requestId
): array {
  $summary = [
    'scheduled_reset_count' => 0,
    'pix_found' => 0,
    'pix_cancelled' => 0,
    'pix_failed' => 0,
  ];

  $resetCountRow = db()->one("
    WITH upd AS (
      UPDATE client.subscription_change_schedule
      SET
        status = 'FAILED',
        failed_at = now(),
        failure_reason = 'SUPERSEDED_BY_NEW_CHANGE_PLAN_REQUEST',
        updated_at = now()
      WHERE subscription_id = CAST(:sid AS uuid)
        AND status = 'SCHEDULED'
      RETURNING 1
    )
    SELECT count(*)::int AS qty FROM upd
  ", [':sid' => $subscriptionUuid]);
  $summary['scheduled_reset_count'] = (int)($resetCountRow['qty'] ?? 0);

  $paymentIds = [];
  $localOpenPix = db()->all("
    SELECT asaas_payment_id
    FROM client.payments
    WHERE subscription_id = CAST(:sid AS uuid)
      AND upper(coalesce(billing_type, '')) = 'PIX'
      AND upper(coalesce(status, '')) IN ('PENDING', 'OVERDUE')
  ", [':sid' => $subscriptionUuid]);
  foreach ($localOpenPix as $row) {
    $pid = trim((string)($row['asaas_payment_id'] ?? ''));
    if ($pid !== '') {
      $paymentIds[$pid] = true;
    }
  }

  if ($asaasSubscriptionId !== '') {
    $providerList = $asaas->listPaymentsOfSubscription($asaasSubscriptionId, 100, 0);
    if ((int)($providerList['http_status'] ?? 0) >= 200 && (int)($providerList['http_status'] ?? 0) < 300) {
      $providerData = $providerList['data'] ?? [];
      if (is_array($providerData)) {
        foreach ($providerData as $item) {
          if (!is_array($item)) {
            continue;
          }
          $billingType = strtoupper(trim((string)($item['billingType'] ?? '')));
          $status = strtoupper(trim((string)($item['status'] ?? '')));
          $pid = trim((string)($item['id'] ?? ''));
          if ($pid !== '' && $billingType === 'PIX' && in_array($status, ['PENDING', 'OVERDUE'], true)) {
            $paymentIds[$pid] = true;
          }
        }
      }
    }
  }

  $summary['pix_found'] = count($paymentIds);
  foreach (array_keys($paymentIds) as $paymentId) {
    $providerCancel = $asaas->cancelPayment($paymentId);
    $isCancelled = (bool)($providerCancel['ok'] ?? false);
    if ($isCancelled) {
      $summary['pix_cancelled']++;
      db()->exec("
        UPDATE client.payments
        SET
          status = 'CANCELED',
          raw_payload = CASE
            WHEN raw_payload IS NULL
            THEN CAST(:payload AS jsonb)
            ELSE raw_payload || CAST(:payload AS jsonb)
          END
        WHERE asaas_payment_id = :pid
          AND subscription_id = CAST(:sid AS uuid)
          AND upper(coalesce(status, '')) IN ('PENDING', 'OVERDUE')
      ", [
        ':pid' => $paymentId,
        ':sid' => $subscriptionUuid,
        ':payload' => safeJson([
          'cancelled_by' => 'CHANGE_PLAN_RESET',
          'cancelled_at' => gmdate(DATE_ATOM),
          'cancelled_request_id' => $requestId,
        ]),
      ]);
      continue;
    }
    $summary['pix_failed']++;
  }

  return $summary;
}

function asaasCreatePaymentResilient(AsaasClient $asaas, array $payload, int $maxAttempts = 3): array {
  $attempts = max(1, $maxAttempts);
  $last = ['ok' => false, 'status_code' => 0, 'error_message_safe' => 'Falha ao criar pagamento.'];
  for ($i = 1; $i <= $attempts; $i++) {
    $res = $asaas->createPayment($payload);
    if ((bool)($res['ok'] ?? false)) {
      return $res;
    }
    $last = $res;
    $status = (int)($res['status_code'] ?? 0);
    $retryable = in_array($status, [0, 429, 500, 502, 503, 504], true);
    if (!$retryable || $i === $attempts) {
      break;
    }
    usleep($i * 300000);
  }
  return $last;
}

function asaasGetPixQrCodeResilient(AsaasClient $asaas, string $paymentId, int $maxAttempts = 12): array {
  $attempts = max(1, $maxAttempts);
  $last = ['ok' => false, 'status_code' => 0, 'error_message_safe' => 'Falha ao obter QR Code PIX.'];
  for ($i = 1; $i <= $attempts; $i++) {
    $res = $asaas->getPixQrCode($paymentId);
    $last = $res;
    if ((bool)($res['ok'] ?? false)) {
      $data = is_array($res['data'] ?? null) ? $res['data'] : [];
      $payload = trim((string)($data['payload'] ?? ($data['copyPasteKey'] ?? '')));
      $qr = trim((string)($data['encodedImage'] ?? ''));
      if ($payload !== '' || $qr !== '') {
        return $res;
      }
    }
    if ($i < $attempts) {
      usleep(min(1500000, 350000 * $i));
    }
  }
  return $last;
}

function upsertClientPaymentByAsaasId(
  string $subscriptionUuid,
  string $paymentId,
  float $amount,
  string $status,
  string $billingType,
  ?string $dueDate,
  array $rawPayload
): void {
  $baseParams = [
    ':payment_id' => $paymentId,
    ':amount' => round($amount, 2),
    ':status' => strtoupper(trim($status !== '' ? $status : 'PENDING')),
    ':billing_type' => strtoupper(trim($billingType !== '' ? $billingType : 'UNDEFINED')),
    ':due_date' => $dueDate,
    ':raw_payload' => safeJson($rawPayload),
  ];

  $updated = db()->exec(
    "UPDATE client.payments
     SET
       amount=:amount,
       status=:status,
       billing_type=:billing_type,
       due_date=CAST(:due_date AS date),
       raw_payload=CAST(:raw_payload AS jsonb)
     WHERE asaas_payment_id=:payment_id",
    $baseParams
  );
  if ($updated > 0) {
    return;
  }

  $insertParams = $baseParams + [
    ':subscription_id' => $subscriptionUuid,
  ];

  db()->exec(
    "INSERT INTO client.payments(
       subscription_id,
       asaas_payment_id,
       amount,
       status,
       billing_type,
       due_date,
       raw_payload
     ) VALUES(
       CAST(:subscription_id AS uuid),
       :payment_id,
       :amount,
       :status,
       :billing_type,
       CAST(:due_date AS date),
       CAST(:raw_payload AS jsonb)
     )",
    $insertParams
  );
}

function resolveSubscriptionForPlanChange(string $sid, string $orgId): ?array {
  $sub = db()->one("
    SELECT
           s.id::text AS id,
           s.organization_id::text AS organization_id,
           s.plan_id::text AS plan_id,
           s.status,
           s.payment_method,
           s.asaas_customer_id,
           s.asaas_subscription_id,
           s.next_due_date::text AS next_due_date,
           s.grace_until::text AS grace_until,
           p.code AS current_plan_code,
           p.name AS current_plan_name,
           p.monthly_price::float AS current_price,
           d.id::text AS deal_id
    FROM client.subscriptions s
    JOIN client.plans p ON p.id = s.plan_id
    LEFT JOIN LATERAL (
      SELECT id
      FROM crm.deal
      WHERE organization_id = s.organization_id
      ORDER BY updated_at DESC
      LIMIT 1
    ) d ON true
    WHERE s.asaas_subscription_id=:sid
    LIMIT 1
  ", [':sid' => $sid]);
  if (!$sub && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $sid)) {
    $sub = db()->one("
      SELECT
             s.id::text AS id,
             s.organization_id::text AS organization_id,
             s.plan_id::text AS plan_id,
             s.status,
             s.payment_method,
             s.asaas_customer_id,
             s.asaas_subscription_id,
             s.next_due_date::text AS next_due_date,
             s.grace_until::text AS grace_until,
             p.code AS current_plan_code,
             p.name AS current_plan_name,
             p.monthly_price::float AS current_price,
             d.id::text AS deal_id
      FROM client.subscriptions s
      JOIN client.plans p ON p.id = s.plan_id
      LEFT JOIN LATERAL (
        SELECT id
        FROM crm.deal
        WHERE organization_id = s.organization_id
        ORDER BY updated_at DESC
        LIMIT 1
      ) d ON true
      WHERE s.id=CAST(:sid AS uuid)
      LIMIT 1
    ", [':sid' => $sid]);
  }
  if (!$sub || (string)($sub['organization_id'] ?? '') !== $orgId) {
    return null;
  }
  return $sub;
}

function resolvePlanByCode(string $planCode): ?array {
  return db()->one("
    SELECT id::text AS id, code, name, monthly_price::float AS monthly_price
    FROM client.plans
    WHERE code=:code AND is_active=true
    LIMIT 1
  ", [':code' => $planCode]);
}

function resolveSubscriptionNextDueDate(AsaasClient $asaas, array $sub): array {
  $resolvedNextDueDate = trim((string)($sub['next_due_date'] ?? ''));
  $detailsData = [];
  if ($resolvedNextDueDate === '' || trim((string)($sub['asaas_customer_id'] ?? '')) === '') {
    $asaasSubscriptionId = trim((string)($sub['asaas_subscription_id'] ?? ''));
    if ($asaasSubscriptionId !== '') {
      $subscriptionDetails = $asaas->getSubscription($asaasSubscriptionId);
      $detailsData = is_array($subscriptionDetails['data'] ?? null) ? $subscriptionDetails['data'] : [];
      if ($resolvedNextDueDate === '') {
        $resolvedNextDueDate = trim((string)($detailsData['nextDueDate'] ?? ''));
      }
    }
  }
  return [$resolvedNextDueDate, $detailsData];
}

function cancelOpenPixPaymentsForSubscription(
  AsaasClient $asaas,
  string $subscriptionUuid,
  string $asaasSubscriptionId,
  string $requestId,
  string $asaasCustomerId = ''
): array {
  $summary = resetOpenPlanChangeStateAndCancelPix($asaas, $subscriptionUuid, $asaasSubscriptionId, $requestId);
  $customerId = trim($asaasCustomerId);
  if ($customerId === '') {
    return $summary;
  }

  $providerSubscriptionIds = [];
  $subsByCustomer = $asaas->listSubscriptionsByCustomer($customerId, 100, 0);
  if ((int)($subsByCustomer['http_status'] ?? 0) >= 200 && (int)($subsByCustomer['http_status'] ?? 0) < 300) {
    $subList = $subsByCustomer['data'] ?? [];
    if (is_array($subList)) {
      foreach ($subList as $item) {
        if (!is_array($item)) {
          continue;
        }
        $sid = trim((string)($item['id'] ?? ''));
        if ($sid !== '') {
          $providerSubscriptionIds[$sid] = true;
        }
      }
    }
  }
  if ($asaasSubscriptionId !== '') {
    $providerSubscriptionIds[$asaasSubscriptionId] = true;
  }

  $paymentIds = [];
  foreach (array_keys($providerSubscriptionIds) as $providerSid) {
    $payments = $asaas->listPaymentsOfSubscription($providerSid, 100, 0);
    if ((int)($payments['http_status'] ?? 0) < 200 || (int)($payments['http_status'] ?? 0) >= 300) {
      continue;
    }
    $items = $payments['data'] ?? [];
    if (!is_array($items)) {
      continue;
    }
    foreach ($items as $item) {
      if (!is_array($item)) {
        continue;
      }
      $billingType = strtoupper(trim((string)($item['billingType'] ?? '')));
      $status = strtoupper(trim((string)($item['status'] ?? '')));
      $pid = trim((string)($item['id'] ?? ''));
      if ($pid !== '' && $billingType === 'PIX' && in_array($status, ['PENDING', 'OVERDUE'], true)) {
        $paymentIds[$pid] = true;
      }
    }
  }

  foreach (array_keys($paymentIds) as $paymentId) {
    $providerCancel = $asaas->cancelPayment($paymentId);
    if ((bool)($providerCancel['ok'] ?? false)) {
      $summary['pix_cancelled']++;
      db()->exec("
        UPDATE client.payments
        SET
          status='CANCELED',
          raw_payload = CASE
            WHEN raw_payload IS NULL THEN CAST(:payload AS jsonb)
            ELSE raw_payload || CAST(:payload AS jsonb)
          END
        WHERE asaas_payment_id=:pid
          AND upper(coalesce(status, '')) IN ('PENDING', 'OVERDUE')
      ", [
        ':pid' => $paymentId,
        ':payload' => safeJson([
          'cancelled_by' => 'CHANGE_PLAN_CUSTOMER_RESET',
          'cancelled_at' => gmdate(DATE_ATOM),
          'cancelled_request_id' => $requestId,
        ]),
      ]);
    } else {
      $summary['pix_failed']++;
    }
  }
  $summary['pix_found'] = (int)($summary['pix_found'] ?? 0) + count($paymentIds);
  return $summary;
}

function loadActivePlanChangePixSession(string $subscriptionId, string $targetPlanCode): ?array {
  return db()->one("
    SELECT
      id::text AS id,
      subscription_id::text AS subscription_id,
      organization_id::text AS organization_id,
      target_plan_id::text AS target_plan_id,
      target_plan_code,
      payment_id,
      request_id,
      action_id::text AS action_id,
      amount::float AS amount,
      status,
      metadata,
      created_at::text AS created_at
    FROM client.plan_change_payment_sessions
    WHERE subscription_id=CAST(:sid AS uuid)
      AND target_plan_code=:plan_code
      AND status='PENDING'
    ORDER BY created_at DESC
    LIMIT 1
  ", [
    ':sid' => $subscriptionId,
    ':plan_code' => $targetPlanCode,
  ]);
}

function createPlanChangePixSession(
  string $sessionId,
  string $subscriptionId,
  string $organizationId,
  string $targetPlanId,
  string $targetPlanCode,
  string $paymentId,
  string $requestId,
  ?string $actionId,
  float $amount,
  array $metadata = []
): void {
  db()->exec("
    INSERT INTO client.plan_change_payment_sessions(
      id, subscription_id, organization_id, target_plan_id, target_plan_code,
      payment_id, request_id, action_id, amount, status, metadata, created_at, updated_at
    )
    VALUES(
      CAST(:id AS uuid),
      CAST(:subscription_id AS uuid),
      CAST(:organization_id AS uuid),
      CAST(:target_plan_id AS uuid),
      :target_plan_code,
      :payment_id,
      :request_id,
      CASE WHEN :action_id <> '' THEN CAST(:action_id AS uuid) ELSE NULL END,
      :amount,
      'PENDING',
      CAST(:metadata AS jsonb),
      now(),
      now()
    )
  ", [
    ':id' => $sessionId,
    ':subscription_id' => $subscriptionId,
    ':organization_id' => $organizationId,
    ':target_plan_id' => $targetPlanId,
    ':target_plan_code' => $targetPlanCode,
    ':payment_id' => $paymentId,
    ':request_id' => $requestId,
    ':action_id' => (string)($actionId ?? ''),
    ':amount' => round($amount, 2),
    ':metadata' => safeJson($metadata),
  ]);
}

function loadPlanChangePixSessionById(string $sessionId): ?array {
  return db()->one("
    SELECT
      id::text AS id,
      subscription_id::text AS subscription_id,
      organization_id::text AS organization_id,
      target_plan_id::text AS target_plan_id,
      target_plan_code,
      payment_id,
      request_id,
      action_id::text AS action_id,
      amount::float AS amount,
      status,
      metadata
    FROM client.plan_change_payment_sessions
    WHERE id=CAST(:id AS uuid)
    LIMIT 1
  ", [':id' => $sessionId]);
}

function markPlanChangePixSessionCanceled(string $sessionId, array $metadata = []): void {
  db()->exec("
    UPDATE client.plan_change_payment_sessions
    SET
      status='CANCELED',
      canceled_at=now(),
      updated_at=now(),
      metadata = CASE
        WHEN metadata IS NULL THEN CAST(:metadata AS jsonb)
        ELSE metadata || CAST(:metadata AS jsonb)
      END
    WHERE id=CAST(:id AS uuid)
  ", [
    ':id' => $sessionId,
    ':metadata' => safeJson($metadata),
  ]);
}

function markPlanChangePixSessionConfirmed(string $sessionId, array $metadata = []): void {
  db()->exec("
    UPDATE client.plan_change_payment_sessions
    SET
      status='CONFIRMED',
      confirmed_at=now(),
      updated_at=now(),
      metadata = CASE
        WHEN metadata IS NULL THEN CAST(:metadata AS jsonb)
        ELSE metadata || CAST(:metadata AS jsonb)
      END
    WHERE id=CAST(:id AS uuid)
  ", [
    ':id' => $sessionId,
    ':metadata' => safeJson($metadata),
  ]);
}

function resolveLatestOrganizationSubscription(string $organizationId): ?array {
  if ($organizationId === '') {
    return null;
  }
  return db()->one("
    SELECT
      s.id::text AS id,
      s.organization_id::text AS organization_id,
      s.plan_id::text AS plan_id,
      s.status,
      s.payment_method,
      s.asaas_customer_id,
      s.asaas_subscription_id,
      s.next_due_date::text AS next_due_date,
      s.grace_until::text AS grace_until
    FROM client.subscriptions s
    WHERE s.organization_id = CAST(:oid AS uuid)
    ORDER BY s.created_at DESC
    LIMIT 1
  ", [':oid' => $organizationId]);
}

function loadActiveProjectProrataSession(string $projectId): ?array {
  if ($projectId === '') {
    return null;
  }
  return db()->one("
    SELECT
      id::text AS id,
      organization_id::text AS organization_id,
      project_id::text AS project_id,
      subscription_id::text AS subscription_id,
      target_plan_id::text AS target_plan_id,
      payment_id,
      amount::float AS amount,
      status,
      metadata
    FROM client.project_prorata_payment_sessions
    WHERE project_id = CAST(:pid AS uuid)
      AND status = 'PENDING'
    ORDER BY created_at DESC
    LIMIT 1
  ", [':pid' => $projectId]);
}

function createProjectProrataSession(
  string $sessionId,
  string $organizationId,
  string $projectId,
  string $subscriptionId,
  string $targetPlanId,
  string $paymentId,
  float $amount,
  array $metadata = []
): void {
  db()->exec("
    INSERT INTO client.project_prorata_payment_sessions(
      id, organization_id, project_id, subscription_id, target_plan_id,
      payment_id, amount, status, metadata, created_at, updated_at
    ) VALUES(
      CAST(:id AS uuid),
      CAST(:organization_id AS uuid),
      CAST(:project_id AS uuid),
      CAST(:subscription_id AS uuid),
      CAST(:target_plan_id AS uuid),
      :payment_id,
      :amount,
      'PENDING',
      CAST(:metadata AS jsonb),
      now(),
      now()
    )
  ", [
    ':id' => $sessionId,
    ':organization_id' => $organizationId,
    ':project_id' => $projectId,
    ':subscription_id' => $subscriptionId,
    ':target_plan_id' => $targetPlanId,
    ':payment_id' => $paymentId,
    ':amount' => round($amount, 2),
    ':metadata' => safeJson($metadata),
  ]);
}

function markProjectProrataSessionCanceled(string $sessionId, array $metadata = []): void {
  db()->exec("
    UPDATE client.project_prorata_payment_sessions
    SET
      status='CANCELED',
      canceled_at=now(),
      updated_at=now(),
      metadata = CASE
        WHEN metadata IS NULL THEN CAST(:metadata AS jsonb)
        ELSE metadata || CAST(:metadata AS jsonb)
      END
    WHERE id=CAST(:id AS uuid)
  ", [
    ':id' => $sessionId,
    ':metadata' => safeJson($metadata),
  ]);
}

function markProjectProrataSessionConfirmed(string $sessionId, array $metadata = []): void {
  db()->exec("
    UPDATE client.project_prorata_payment_sessions
    SET
      status='CONFIRMED',
      confirmed_at=now(),
      updated_at=now(),
      metadata = CASE
        WHEN metadata IS NULL THEN CAST(:metadata AS jsonb)
        ELSE metadata || CAST(:metadata AS jsonb)
      END
    WHERE id=CAST(:id AS uuid)
  ", [
    ':id' => $sessionId,
    ':metadata' => safeJson($metadata),
  ]);
}

function safeDateTime(string $value): ?DateTimeImmutable {
  $value = trim($value);
  if ($value === '') {
    return null;
  }
  try {
    return new DateTimeImmutable($value);
  } catch (Throwable) {
    return null;
  }
}

function calculateProrataAmount(float $currentValue, float $newValue, ?string $nextDueDate, int $defaultCycleDays = 30): float {
  $difference = round($newValue - $currentValue, 2);
  if ($difference <= 0) {
    return 0.0;
  }
  $cycleDays = max(1, $defaultCycleDays);
  $today = new DateTimeImmutable('today');
  $due = safeDateTime((string)$nextDueDate);
  if (!$due) {
    return $difference;
  }
  $remaining = (int)$today->diff($due)->format('%r%a');
  if ($remaining < 0) {
    return $difference;
  }
  if ($remaining === 0) {
    return 0.0;
  }
  $ratio = min(1, max(0, $remaining / $cycleDays));
  return round($difference * $ratio, 2);
}

function resolveAsaasEventTime(array $event): ?DateTimeImmutable {
  $candidates = [
    (string)($event['dateCreated'] ?? ''),
    (string)($event['date'] ?? ''),
    (string)($event['payment']['dateCreated'] ?? ''),
    (string)($event['payment']['confirmedDate'] ?? ''),
    (string)($event['subscription']['dateCreated'] ?? ''),
  ];
  foreach ($candidates as $candidate) {
    $dt = safeDateTime($candidate);
    if ($dt) {
      return $dt;
    }
  }
  return null;
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
                      Seus dados são tokenizados e enviados ao Asaas para criar a assinatura recorrente de cartão de crédito.
                    </div>
                  </div>
                  <div class="form-col full">
                    <div class="signup-card-preview" id="signupCardPreview" aria-live="polite">
                      <div class="signup-card-preview-head">
                        <span class="signup-card-preview-title">Cartão para assinatura</span>
                        <span class="signup-card-brand" id="card_brand_chip">Bandeira não identificada</span>
                      </div>
                      <div class="signup-card-number" id="card_preview_number">•••• •••• •••• ••••</div>
                      <div class="signup-card-footer">
                        <div>
                          <small>Portador</small>
                          <strong id="card_preview_holder">NOME DO TITULAR</strong>
                        </div>
                        <div>
                          <small>Validade</small>
                          <strong id="card_preview_expiry">MM/AAAA</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="form-col full"><label for="card_holder_name">Nome impresso no cartão</label><input id="card_holder_name" name="card_holder_name" autocomplete="cc-name" data-required="true"></div>
                  <div class="form-col full"><label for="card_number">Número do cartão</label><input id="card_number" name="card_number" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" data-required="true"></div>
                  <div class="form-col half"><label for="card_expiry_month">Mês de validade</label><input id="card_expiry_month" name="card_expiry_month" inputmode="numeric" autocomplete="cc-exp-month" maxlength="2" placeholder="MM" data-required="true"></div>
                  <div class="form-col half"><label for="card_expiry_year">Ano de validade</label><input id="card_expiry_year" name="card_expiry_year" inputmode="numeric" autocomplete="cc-exp-year" maxlength="4" placeholder="AAAA" data-required="true"></div>
                  <div class="form-col half"><label for="card_ccv">CVV</label><input id="card_ccv" name="card_ccv" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="3 ou 4 dígitos" data-required="true"></div>
                </div>
              </div>

              <div class="wizard-nav">
                <button type="button" class="btn btn-ghost" id="wizardPrev">Voltar</button>
                <button type="button" class="btn btn-primary" id="wizardNext">Próximo</button>
                <button type="submit" class="btn btn-accent hidden" id="wizardSubmit">Ativar assinatura</button>
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
      <h3 id="authFlowTitle">Ativando assinatura no cartão...</h3>
      <p id="authFlowMessage">Estamos validando o cartão e criando sua assinatura recorrente no Asaas.</p>
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
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
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
  ensureSubscriptionRecurringTables();
  ensureClientProjectTables();
  $user = $_SESSION['client_user'];
  $orgId = $user['organization_id'] ?? null;
  $assetCssVersion = (string)@filemtime(__DIR__ . '/assets/app.css');
  $assetOperacaoVersion = (string)@filemtime(__DIR__ . '/assets/operacao.css');
  $assetOperacaoTabletVersion = (string)@filemtime(__DIR__ . '/assets/operacao-tablet.css');
  $assetOperacaoDesktopVersion = (string)@filemtime(__DIR__ . '/assets/operacao-desktop.css');
  $assetJsVersion = (string)@filemtime(__DIR__ . '/assets/app.js');

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

  $sub = $orgId ? db()->one("SELECT s.id, s.asaas_subscription_id, s.asaas_customer_id, s.status, s.next_due_date, s.payment_method, s.price_override, s.billing_profile_updated_at, p.code AS plan_code, p.name as plan_name, p.monthly_price, COALESCE(s.price_override, p.monthly_price) AS effective_monthly_price FROM client.subscriptions s JOIN client.plans p ON p.id=s.plan_id WHERE s.organization_id=:oid ORDER BY s.created_at DESC LIMIT 1", [':oid' => $orgId]) : null;
  if (!$sub) {
    $basicPlan = db()->one("SELECT name, monthly_price FROM client.plans WHERE code='basic' LIMIT 1");
    $sub = [
      'id' => null,
      'asaas_subscription_id' => null,
      'status' => 'EM CONFIGURACAO',
      'next_due_date' => null,
      'payment_method' => 'PIX',
      'plan_code' => 'basic',
      'plan_name' => $basicPlan['name'] ?? 'Básico',
      'monthly_price' => $basicPlan['monthly_price'] ?? 149.99,
      'effective_monthly_price' => $basicPlan['monthly_price'] ?? 149.99,
      'price_override' => null,
      'billing_profile_updated_at' => null,
    ];
  }
  $projectCreatePlans = db()->all("
    SELECT code, name, monthly_price::float AS monthly_price
    FROM client.plans
    WHERE is_active = true
    ORDER BY monthly_price ASC
  ");
  $projectCreatePlansAvailable = count($projectCreatePlans) > 0;

  $scheduledSubscriptionChange = null;
  if ($orgId && !empty($sub['id'])) {
    try {
      $scheduledSubscriptionChange = db()->one("
        SELECT
          sc.id::text AS id,
          sc.change_type,
          sc.target_value,
          sc.effective_at,
          tp.code AS target_plan_code,
          tp.name AS target_plan_name
        FROM client.subscription_change_schedule sc
        LEFT JOIN client.plans tp ON tp.id = sc.target_plan_id
        WHERE sc.subscription_id = CAST(:sid AS uuid)
          AND sc.status = 'SCHEDULED'
        ORDER BY sc.effective_at ASC
        LIMIT 1
      ", [':sid' => (string)$sub['id']]);
    } catch (Throwable) {
      $scheduledSubscriptionChange = null;
    }
  }

  $tickets = $orgId ? db()->all("SELECT id, ticket_type, priority, status, created_at, subject FROM client.tickets WHERE organization_id=:oid ORDER BY created_at DESC LIMIT 12", [':oid' => $orgId]) : [];
  $payments = $orgId ? db()->all("SELECT p.amount, p.status, p.billing_type, p.due_date, p.paid_at FROM client.payments p JOIN client.subscriptions s ON s.id=p.subscription_id WHERE s.organization_id=:oid ORDER BY p.created_at DESC LIMIT 8", [':oid' => $orgId]) : [];
  $billingProfile = $orgId ? db()->one("SELECT card_last4, card_brand, exp_month, exp_year FROM client.billing_profiles bp JOIN client.subscriptions s ON s.id=bp.subscription_id WHERE s.organization_id=:oid ORDER BY bp.created_at DESC LIMIT 1", [':oid' => $orgId]) : null;
  $hasBriefing = $orgId ? (db()->one("SELECT id FROM client.project_briefs WHERE organization_id=:oid LIMIT 1", [':oid' => $orgId]) !== null) : false;

  $projectRows = [];
  if ($orgId) {
    try {
      $projectRows = projectBillingService()->listProjectsByOrganization((string)$orgId);
    } catch (Throwable) {
      $projectRows = [];
    }
  }
  $currentProjectId = $orgId ? currentClientProjectId((string)$orgId) : null;
  $currentProject = null;
  foreach ($projectRows as $row) {
    if ($currentProjectId !== null && (string)($row['id'] ?? '') === $currentProjectId) {
      $currentProject = $row;
      break;
    }
  }
  $projectViewMode = $currentProject ? 'PROJECT' : 'GLOBAL';
  $currentProjectHasBriefing = false;
  if ($orgId && $currentProject) {
    $currentProjectHasBriefing = db()->one("
      SELECT id
      FROM client.project_briefs
      WHERE organization_id = CAST(:oid AS uuid)
        AND project_id = CAST(:pid AS uuid)
      LIMIT 1
    ", [
      ':oid' => $orgId,
      ':pid' => (string)($currentProject['id'] ?? ''),
    ]) !== null;
  }
  $briefingRequired = $projectViewMode === 'PROJECT' ? !$currentProjectHasBriefing : !$hasBriefing;
  $projectDomainForView = $currentProject ? trim((string)($currentProject['domain'] ?? '')) : trim((string)($org['domain'] ?? ''));
  $siteOnline = $projectViewMode === 'PROJECT'
    ? (strtoupper((string)($currentProject['status'] ?? '')) === 'ACTIVE' && strtoupper((string)($sub['status'] ?? '')) === 'ACTIVE')
    : (!empty($projectDomainForView) && strtoupper((string)($sub['status'] ?? '')) === 'ACTIVE');
  $siteStatusLabel = $siteOnline ? 'Online' : 'Aguardando publicação';
  $siteStatusClass = $siteOnline ? 'online' : 'offline';
  $uptime = $siteOnline ? '99,9%' : '--';
  $totalProjects = count($projectRows);
  $totalMonthly = 0.0;
  $activeProjectCount = 0;
  foreach ($projectRows as $projectRow) {
    $itemStatus = strtoupper((string)($projectRow['subscription_item_status'] ?? 'PENDING'));
    if ($itemStatus !== 'ACTIVE') {
      continue;
    }
    $activeProjectCount++;
    $totalMonthly += (float)($projectRow['effective_price'] ?? 0);
  }
  $totalMonthly = round($totalMonthly, 2);
  $nextDuePendingCount = 0;
  foreach ($payments as $payment) {
    $st = strtoupper((string)($payment['status'] ?? 'PENDING'));
    if (!in_array($st, ['PENDING', 'OVERDUE'], true)) {
      continue;
    }
    $due = trim((string)($payment['due_date'] ?? ''));
    if ($due !== '' && strtotime($due) !== false && strtotime($due) >= strtotime(date('Y-m-d'))) {
      $nextDuePendingCount++;
    }
  }
  $currentPlanCode = strtolower((string)($sub['plan_code'] ?? 'basic'));
  if ($currentProject) {
    $currentPlanCode = strtolower((string)($currentProject['plan_code'] ?? $currentPlanCode));
  }
  $subscriptionStatus = strtoupper((string)($sub['status'] ?? 'N/D'));
  $subscriptionStatusBadgeClass = match($subscriptionStatus) {
    'ACTIVE' => 'text-bg-success',
    'OVERDUE' => 'text-bg-warning',
    'CANCELED', 'CANCELLED', 'INACTIVE' => 'text-bg-danger',
    'PENDING' => 'text-bg-secondary',
    default => 'text-bg-secondary',
  };
  $featurePlanChangeWebhookConfirmed = featureFlagEnabled('FEATURE_PLAN_CHANGE_WEBHOOK_CONFIRMED', true);
  $featureBillingPixSessionFlow = featureFlagEnabled('FEATURE_BILLING_PIX_SESSION_FLOW', true);
  $featureTicketThreadSync = featureFlagEnabled('FEATURE_TICKET_THREAD_SYNC', false);
  $featurePortalCancelSubscription = featureFlagEnabled('FEATURE_PORTAL_CANCEL_SUBSCRIPTION', true);
  $nextDue = !empty($sub['next_due_date']) ? date('d/m/Y', strtotime((string)$sub['next_due_date'])) : 'N/D';
  $fullAddress = trim((string)($org['billing_street'] ?? '') . ', ' . (string)($org['billing_number'] ?? '') . ' - ' . (string)($org['billing_city'] ?? '') . '/' . (string)($org['billing_state'] ?? ''));
  if ($fullAddress === ',  - /') {
    $fullAddress = 'Não informado';
  }

  $operationProjectFilterSql = '';
  $operationProjectFilterParams = [':oid' => $orgId];
  if ($currentProject) {
    $operationProjectFilterSql = "
      AND (
        coalesce(d.metadata->>'project_id', '') = :project_id
        OR (
          :project_domain <> ''
          AND lower(coalesce(d.metadata->>'project_domain', '')) = lower(:project_domain)
        )
      )
    ";
    $operationProjectFilterParams[':project_id'] = (string)($currentProject['id'] ?? '');
    $operationProjectFilterParams[':project_domain'] = (string)($currentProject['domain'] ?? '');
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
  $operationCodeByOrder = [];
  foreach ($operationStagesBlueprint as $idx => $stage) {
    $order = $idx + 1;
    $operationOrderByCode[$stage['code']] = $order;
    $operationCodeByOrder[$order] = $stage['code'];
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
    SELECT
      d.id,
      d.title,
      d.deal_type,
      d.lifecycle_status,
      d.plan_code,
      d.product_code,
      d.updated_at,
      COALESCE(op.last_operation_at, d.updated_at) AS operation_sort_at
    FROM crm.deal d
    LEFT JOIN LATERAL (
      SELECT MAX(o.updated_at) AS last_operation_at
      FROM crm.deal_operation o
      WHERE o.deal_id = d.id
    ) op ON true
    WHERE d.organization_id=:oid
      AND d.lifecycle_status='CLIENT'
      AND upper(COALESCE(d.deal_type, ''))='HOSPEDAGEM'
      {$operationProjectFilterSql}
    ORDER BY COALESCE(op.last_operation_at, d.updated_at) DESC, d.updated_at DESC
    LIMIT 1
  ", $operationProjectFilterParams) : null;
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
  $operationLastUpdatedAt = !empty($operationDeal['updated_at']) ? (string)$operationDeal['updated_at'] : null;
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
    $updatedCandidate = !empty($row['updated_at']) ? strtotime((string)$row['updated_at']) : false;
    if ($updatedCandidate !== false && ($operationLastUpdatedAt === null || $updatedCandidate > strtotime($operationLastUpdatedAt))) {
      $operationLastUpdatedAt = (string)$row['updated_at'];
    }
  }

  $operationApprovalPending = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->one("
    SELECT
      a.id AS approval_id,
      a.status AS approval_status,
      a.expires_at,
      a.created_at AS approval_created_at,
      tr.preview_url,
      tr.version AS template_version,
      tr.created_at AS template_generated_at
    FROM crm.deal_client_approval a
    JOIN crm.deal_template_revision tr ON tr.id = a.template_revision_id
    WHERE a.deal_id=:did AND a.status='PENDING' AND a.expires_at > now()
    ORDER BY a.created_at DESC
    LIMIT 1
  ", [':did' => $operationDeal['id']]) : null;
  $operationApprovalLatest = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->one("
    SELECT
      a.id AS approval_id,
      a.status AS approval_status,
      a.client_note,
      a.expires_at,
      a.created_at AS approval_created_at,
      tr.preview_url,
      tr.version AS template_version,
      tr.created_at AS template_generated_at
    FROM crm.deal_client_approval a
    JOIN crm.deal_template_revision tr ON tr.id = a.template_revision_id
    WHERE a.deal_id=:did
    ORDER BY a.created_at DESC
    LIMIT 1
  ", [':did' => $operationDeal['id']]) : null;
  $operationTemplateLatest = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->one("
    SELECT status, version, created_at
    FROM crm.deal_template_revision
    WHERE deal_id=:did
    ORDER BY version DESC, created_at DESC
    LIMIT 1
  ", [':did' => $operationDeal['id']]) : null;

  $operationActivityRows = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->all("
    SELECT activity_type, content, metadata, created_at
    FROM crm.deal_activity
    WHERE deal_id=:did
      AND activity_type IN (
        'CLIENT_APPROVAL_REQUESTED',
        'CLIENT_REQUESTED_CHANGES',
        'CLIENT_APPROVED',
        'CLIENT_PUBLICATION_DOMAIN_APPROVED',
        'CLIENT_PUBLICATION_DOMAIN_REJECTED'
      )
    ORDER BY created_at DESC
    LIMIT 20
  ", [':did' => $operationDeal['id']]) : [];
  $operationPromptRequestsRaw = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->all("
    SELECT id, subject, request_items, message, due_at, status, created_at, updated_at
    FROM crm.deal_prompt_request
    WHERE deal_id=:did
    ORDER BY created_at DESC
    LIMIT 8
  ", [':did' => $operationDeal['id']]) : [];
  $operationPromptRequests = [];
  foreach ($operationPromptRequestsRaw as $requestRow) {
    $requestItemsRaw = $requestRow['request_items'] ?? [];
    if (is_string($requestItemsRaw)) {
      $decodedItems = json_decode($requestItemsRaw, true);
      $requestItemsRaw = is_array($decodedItems) ? $decodedItems : [];
    }
    $operationPromptRequests[] = [
      'id' => (string)($requestRow['id'] ?? ''),
      'subject' => (string)($requestRow['subject'] ?? ''),
      'message' => (string)($requestRow['message'] ?? ''),
      'status' => strtoupper((string)($requestRow['status'] ?? 'SENT')),
      'due_at' => $requestRow['due_at'] ?? null,
      'created_at' => $requestRow['created_at'] ?? null,
      'items' => array_values(array_filter(array_map(static fn($item) => trim((string)$item), is_array($requestItemsRaw) ? $requestItemsRaw : []))),
    ];
  }
  $operationPublicationRequests = array_values(array_filter($operationPromptRequests, static function(array $item): bool {
    $subject = strtolower((string)($item['subject'] ?? ''));
    if (str_contains($subject, 'domínio/publicação') || str_contains($subject, 'dominio/publicacao')) {
      return true;
    }
    foreach ((array)($item['items'] ?? []) as $entry) {
      $needle = strtolower((string)$entry);
      if (str_contains($needle, 'domínio para publicação') || str_contains($needle, 'dominio para publicacao')) {
        return true;
      }
    }
    return false;
  }));
  $operationPublicationLatestRequest = $operationPublicationRequests[0] ?? null;
  $operationPublicationLatestRequestDomain = null;
  if ($operationPublicationLatestRequest) {
    foreach ((array)($operationPublicationLatestRequest['items'] ?? []) as $entry) {
      $entryRaw = (string)$entry;
      if (stripos($entryRaw, 'domínio para publicação') !== false || stripos($entryRaw, 'dominio para publicacao') !== false) {
        $parts = explode(':', $entryRaw, 2);
        $operationPublicationLatestRequestDomain = isset($parts[1]) ? trim((string)$parts[1]) : null;
        break;
      }
    }
    if ($operationPublicationLatestRequestDomain === null) {
      if (preg_match('/[a-z0-9.-]+\.[a-z]{2,}/i', (string)($operationPublicationLatestRequest['message'] ?? ''), $m)) {
        $operationPublicationLatestRequestDomain = trim((string)($m[0] ?? ''));
      }
    }
  }
  $operationPublicationResponseRows = (!empty($operationDeal) && !empty($operationDeal['id'])) ? db()->all("
    SELECT activity_type, metadata, created_at
    FROM crm.deal_activity
    WHERE deal_id=:did
      AND activity_type IN ('CLIENT_PUBLICATION_DOMAIN_APPROVED', 'CLIENT_PUBLICATION_DOMAIN_REJECTED')
    ORDER BY created_at DESC
    LIMIT 20
  ", [':did' => $operationDeal['id']]) : [];
  $operationPublicationLatestResponse = $operationPublicationResponseRows[0] ?? null;
  $operationPublicationResponseMeta = [];
  if ($operationPublicationLatestResponse) {
    $metaRaw = $operationPublicationLatestResponse['metadata'] ?? null;
    if (is_string($metaRaw)) {
      $metaDecoded = json_decode($metaRaw, true);
      if (is_array($metaDecoded)) {
        $operationPublicationResponseMeta = $metaDecoded;
      }
    } elseif (is_array($metaRaw)) {
      $operationPublicationResponseMeta = $metaRaw;
    }
  }
  $operationPublicationDecisionStatus = 'PENDING';
  if ($operationPublicationLatestResponse) {
    $activityType = strtoupper((string)($operationPublicationLatestResponse['activity_type'] ?? ''));
    if ($activityType === 'CLIENT_PUBLICATION_DOMAIN_APPROVED') {
      $operationPublicationDecisionStatus = 'APPROVED';
    } elseif ($activityType === 'CLIENT_PUBLICATION_DOMAIN_REJECTED') {
      $operationPublicationDecisionStatus = 'REJECTED';
    }
  } elseif ($operationPublicationLatestRequest) {
    $requestStatus = strtoupper((string)($operationPublicationLatestRequest['status'] ?? ''));
    if ($requestStatus === 'RECEIVED') {
      $operationPublicationDecisionStatus = 'APPROVED';
    }
  }
  $operationPublicationApprovedDomain = trim((string)($operationPublicationResponseMeta['approved_domain'] ?? $operationPublicationResponseMeta['domain'] ?? ''));
  $operationPublicationSuggestedDomain = trim((string)($operationPublicationResponseMeta['suggested_domain'] ?? $operationPublicationResponseMeta['suggestedDomain'] ?? ''));
  $operationPublicationResponseNote = trim((string)($operationPublicationResponseMeta['note'] ?? $operationPublicationResponseMeta['response_note'] ?? ''));
  $operationPublicationRequestId = trim((string)($operationPublicationLatestRequest['id'] ?? ''));
  $operationPublicationRespondedAt = $operationPublicationLatestResponse['created_at'] ?? null;
  $operationPublicationDomainForDisplay = $operationPublicationLatestRequestDomain
    ?: ($operationPublicationApprovedDomain !== '' ? $operationPublicationApprovedDomain : ((string)($org['domain'] ?? '')));
  $operationHistory = [];
  $hasApproveAfterByIndex = [];
  foreach ($operationActivityRows as $idx => $row) {
    if (strtoupper((string)($row['activity_type'] ?? '')) === 'CLIENT_APPROVED') {
      $hasApproveAfterByIndex[$idx] = true;
    }
  }
  $seenApprove = false;
  foreach (array_reverse($operationActivityRows, true) as $idx => $row) {
    if (strtoupper((string)($row['activity_type'] ?? '')) === 'CLIENT_APPROVED') {
      $seenApprove = true;
    }
    $hasApproveAfterByIndex[$idx] = $seenApprove;
  }
  foreach ($operationActivityRows as $idx => $row) {
    $type = strtoupper((string)($row['activity_type'] ?? ''));
    $meta = $row['metadata'] ?? null;
    if (is_string($meta)) {
      $decoded = json_decode($meta, true);
      if (is_array($decoded)) {
        $meta = $decoded;
      }
    }
    if (!is_array($meta)) {
      $meta = [];
    }
    $status = 'enviado';
    $statusLabel = 'Enviado';
    $kind = 'Atualização';
    if ($type === 'CLIENT_REQUESTED_CHANGES') {
      $kind = 'Solicitação de ajustes';
      $resolved = (bool)($hasApproveAfterByIndex[$idx] ?? false);
      $status = $resolved ? 'resolvido' : 'em_andamento';
      $statusLabel = $resolved ? 'Resolvido' : 'Em andamento';
    } elseif ($type === 'CLIENT_APPROVED') {
      $kind = 'Aprovação';
      $status = 'resolvido';
      $statusLabel = 'Resolvido';
    } elseif ($type === 'CLIENT_APPROVAL_REQUESTED') {
      $kind = 'Envio para aprovação';
      $status = 'enviado';
      $statusLabel = 'Enviado';
    } elseif ($type === 'CLIENT_PUBLICATION_DOMAIN_APPROVED') {
      $kind = 'Publicação (domínio)';
      $status = 'resolvido';
      $statusLabel = 'Aprovado';
    } elseif ($type === 'CLIENT_PUBLICATION_DOMAIN_REJECTED') {
      $kind = 'Publicação (domínio)';
      $status = 'em_andamento';
      $statusLabel = 'Rejeitado';
    }
    $description = trim((string)($meta['descricao'] ?? $meta['note'] ?? $row['content'] ?? ''));
    if ($description === '') {
      $description = (string)$row['content'];
    }
    $operationHistory[] = [
      'date' => (string)($row['created_at'] ?? ''),
      'kind' => $kind,
      'status' => $status,
      'status_label' => $statusLabel,
      'description' => $description,
      'response' => trim((string)($meta['response'] ?? '')),
    ];
  }

  $operationUiStages = [
    [
      'code' => 'briefing',
      'name' => 'Briefing',
      'icon' => 'bi-clipboard-check',
      'description' => 'Coleta de informações sobre seu negócio',
      'internal_codes' => ['briefing_pendente'],
    ],
    [
      'code' => 'producao',
      'name' => 'Em produção',
      'icon' => 'bi-gear',
      'description' => 'Seu site está sendo desenvolvido',
      'internal_codes' => ['pre_prompt', 'template_v1', 'ajustes'],
    ],
    [
      'code' => 'aprovacao',
      'name' => 'Aprovação',
      'icon' => 'bi-check2-circle',
      'description' => 'Você aprova o site ou solicita ajustes',
      'internal_codes' => ['aprovacao_cliente'],
    ],
    [
      'code' => 'publicacao',
      'name' => 'Publicação',
      'icon' => 'bi-globe-americas',
      'description' => 'Configuração de domínio e e-mails',
      'internal_codes' => ['publicacao'],
    ],
    [
      'code' => 'publicado',
      'name' => 'Publicado',
      'icon' => 'bi-rocket-takeoff',
      'description' => 'Seu site está no ar!',
      'internal_codes' => ['publicado'],
    ],
  ];
  $operationUiByInternal = [
    'briefing_pendente' => 'briefing',
    'pre_prompt' => 'producao',
    'template_v1' => 'producao',
    'ajustes' => 'producao',
    'aprovacao_cliente' => 'aprovacao',
    'publicacao' => 'publicacao',
    'publicado' => 'publicado',
  ];
  $operationUiOrderByCode = [];
  foreach ($operationUiStages as $idx => $stage) {
    $operationUiOrderByCode[(string)$stage['code']] = $idx + 1;
  }
  $operationFallbackInternalCode = 'briefing_pendente';
  $templateStatus = strtoupper((string)($operationTemplateLatest['status'] ?? ''));
  if (!empty($operationApprovalPending)) {
    $operationFallbackInternalCode = 'aprovacao_cliente';
  } elseif (in_array($templateStatus, ['SENT_CLIENT', 'IN_REVIEW'], true)) {
    $operationFallbackInternalCode = 'aprovacao_cliente';
  } elseif ($templateStatus === 'APPROVED_CLIENT') {
    $operationFallbackInternalCode = 'publicacao';
  } elseif ($templateStatus === 'NEEDS_ADJUSTMENTS') {
    $operationFallbackInternalCode = 'ajustes';
  } elseif ($templateStatus !== '') {
    $operationFallbackInternalCode = 'template_v1';
  } elseif ($hasBriefing) {
    $operationFallbackInternalCode = 'pre_prompt';
  }

  $operationCurrentInternalCode = $operationActiveCode
    ?: ($operationCodeByOrder[$operationCompletedMaxOrder] ?? $operationFallbackInternalCode);
  $operationCurrentUiCode = $operationUiByInternal[$operationCurrentInternalCode] ?? 'briefing';
  $operationCurrentUiOrder = $operationUiOrderByCode[$operationCurrentUiCode] ?? 1;

  $productionSubsteps = [
    ['name' => 'Pré-prompt', 'code' => 'pre_prompt'],
    ['name' => 'Template V1', 'code' => 'template_v1'],
    ['name' => 'Ajustes', 'code' => 'ajustes'],
  ];
  $productionProgress = 0;
  $productionCurrentText = 'Aguardando início da produção.';
  if ($operationCurrentUiOrder > ($operationUiOrderByCode['producao'] ?? 2)) {
    $productionProgress = 100;
    $productionCurrentText = 'Produção concluída e aguardando aprovação.';
  } else {
    $activeProductionCode = in_array($operationActiveCode, ['pre_prompt', 'template_v1', 'ajustes'], true)
      ? (string)$operationActiveCode
      : null;
    if ($activeProductionCode === 'pre_prompt') {
      $productionProgress = 34;
      $productionCurrentText = 'Pré-prompt em validação final.';
    } elseif ($activeProductionCode === 'template_v1') {
      $productionProgress = 66;
      $productionCurrentText = 'Template V1 gerado, em ajustes finos.';
    } elseif ($activeProductionCode === 'ajustes') {
      $productionProgress = 90;
      $productionCurrentText = 'Ajustes em andamento para nova aprovação.';
    } elseif (!empty($operationRecords['ajustes']) && (string)($operationRecords['ajustes']['status'] ?? '') === 'COMPLETED') {
      $productionProgress = 100;
      $productionCurrentText = 'Ajustes concluídos e produção finalizada.';
    }
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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="/assets/app.css?v=<?= h($assetCssVersion) ?>">
  <link rel="stylesheet" href="/assets/operacao.css?v=<?= h($assetOperacaoVersion) ?>">
  <link rel="stylesheet" href="/assets/operacao-tablet.css?v=<?= h($assetOperacaoTabletVersion) ?>">
  <link rel="stylesheet" href="/assets/operacao-desktop.css?v=<?= h($assetOperacaoDesktopVersion) ?>">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body
  data-page="dashboard"
  data-theme="dark"
  data-current-project-id="<?= h((string)($currentProjectId ?? '')) ?>"
  data-project-view-mode="<?= h($projectViewMode) ?>"
  data-open-briefing="<?= $briefingRequired ? '1' : '0' ?>"
  data-csrf-token="<?= h(csrfToken()) ?>"
  data-feature-plan-change-webhook-confirmed="<?= $featurePlanChangeWebhookConfirmed ? '1' : '0' ?>"
  data-feature-billing-pix-session-flow="<?= $featureBillingPixSessionFlow ? '1' : '0' ?>"
  data-feature-ticket-thread-sync="<?= $featureTicketThreadSync ? '1' : '0' ?>"
  data-feature-cancel-subscription="<?= $featurePortalCancelSubscription ? '1' : '0' ?>"
>
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
      <div class="project-context-switcher">
        <label for="projectContextSelect">Projeto ativo</label>
        <select id="projectContextSelect" class="form-select form-select-sm" aria-label="Selecionar projeto ativo">
          <option value="" <?= $currentProject ? '' : 'selected' ?>>Visão geral (todos)</option>
          <?php foreach ($projectRows as $projectOption): ?>
            <?php
              $projectOptionId = (string)($projectOption['id'] ?? '');
              $projectOptionStatus = strtoupper((string)($projectOption['status'] ?? 'PENDING'));
              $projectOptionDomain = trim((string)($projectOption['domain'] ?? ''));
              $projectOptionLabel = projectDisplayLabel($projectOptionDomain);
            ?>
            <option value="<?= h($projectOptionId) ?>" <?= ($currentProjectId !== null && $currentProjectId === $projectOptionId) ? 'selected' : '' ?>>
              <?= h($projectOptionLabel) ?> (<?= h($projectOptionStatus) ?>)
            </option>
          <?php endforeach; ?>
        </select>
        <button type="button" class="btn btn-outline-primary btn-sm w-100 mt-2" id="openProjectCreateBtn">
          <i class="bi bi-plus-circle-fill" aria-hidden="true"></i> Novo projeto/hospedagem
        </button>
      </div>
      <nav class="client-sidebar-nav">
        <a class="active" data-nav-section="dashboard" data-nav-scope="ALL" href="/portal/dashboard#dashboard"><i class="bi bi-bar-chart-line-fill" aria-hidden="true"></i> Dashboard</a>
        <a data-nav-section="operacao" data-nav-scope="PROJECT" href="/portal/dashboard#operacao"><i class="bi bi-diagram-3-fill" aria-hidden="true"></i> Operação</a>
        <a data-nav-section="chamados" data-nav-scope="ALL" href="/portal/dashboard#chamados"><i class="bi bi-ticket-detailed-fill" aria-hidden="true"></i> Chamados</a>
        <a data-nav-section="planos" data-nav-scope="PROJECT" href="/portal/dashboard#planos"><i class="bi bi-box-seam-fill" aria-hidden="true"></i> Planos</a>
        <a data-nav-section="pagamentos" data-nav-scope="ALL" href="/portal/dashboard#pagamentos"><i class="bi bi-credit-card-2-front-fill" aria-hidden="true"></i> Pagamento</a>
        <a data-nav-section="perfil" data-nav-scope="ALL" href="/portal/dashboard#perfil"><i class="bi bi-person-badge-fill" aria-hidden="true"></i> Perfil</a>
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
          <p>
            <?= h((string)($org['legal_name'] ?? ($user['name'] ?? 'Cliente KoddaHub'))) ?>
            <?php if ($currentProject): ?>
              • Projeto ativo: <?= h((string)($currentProject['domain'] ?? ('Projeto ' . substr((string)($currentProject['id'] ?? ''), 0, 8)))) ?>
            <?php else: ?>
              • Visão geral consolidada
            <?php endif; ?>
          </p>
        </div>
        <div class="client-header-actions">
          <button class="btn btn-ghost theme-toggle-btn" type="button" id="themeToggle" aria-label="Alternar tema"><i class="bi bi-moon-stars-fill" aria-hidden="true"></i> Escuro</button>
          <button class="icon-btn" type="button" aria-label="Notificações"><i class="bi bi-bell-fill" aria-hidden="true"></i></button>
          <a class="btn btn-ghost" href="/portal/logout">Sair</a>
        </div>
      </header>

      <main id="dashboard-main" class="client-content">
        <div id="portalNotice" class="alert <?= $notice ? 'ok' : 'hidden' ?>" role="status" aria-live="polite"><?= $notice ? h($notice) : '' ?></div>
        <div class="toast-container position-fixed top-0 end-0 p-3 portal-toast-container" id="portalToastContainer" aria-live="polite" aria-atomic="true"></div>

        <?php if ($briefingRequired): ?>
          <section class="briefing-banner">
            <div class="briefing-banner-copy">
              <strong><i class="bi bi-rocket-takeoff-fill" aria-hidden="true"></i> Comece seu projeto agora!</strong>
              <span><?= h($projectViewMode === 'PROJECT' ? 'Esse projeto ainda precisa de briefing para avançar na produção.' : 'Preencha o briefing do seu primeiro site e garanta publicação em 24 horas.') ?></span>
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
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-globe2" aria-hidden="true"></i> Total projetos</h4><strong><?= h((string)$totalProjects) ?></strong></article>
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-cash-coin" aria-hidden="true"></i> Total mensal</h4><strong>R$ <?= h(number_format((float)$totalMonthly, 2, ',', '.')) ?></strong></article>
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-credit-card-2-front-fill" aria-hidden="true"></i> Cobrança</h4><strong class="<?= strtoupper((string)($sub['status'] ?? '')) === 'ACTIVE' ? 'status-text-ok' : 'status-text-warn' ?>"><?= h((string)($sub['status'] ?? 'N/D')) ?></strong></article>
            <article class="kpi-card skeleton-ready"><h4><i class="bi bi-calendar-event-fill" aria-hidden="true"></i> Próximos vencimentos</h4><strong><?= h((string)$nextDuePendingCount) ?></strong></article>
          </section>

          <section class="portal-card modern-card">
            <h3>Resumo do Contrato</h3>
            <div class="contract-grid">
              <div class="readonly-field"><label>Contexto atual</label><span><?= h($currentProject ? 'Projeto selecionado' : 'Visão geral') ?></span></div>
              <div class="readonly-field"><label>Domínio em foco</label><span><?= h($projectDomainForView !== '' ? $projectDomainForView : 'Não informado') ?></span></div>
              <div class="readonly-field"><label>WhatsApp</label><span><?= h((string)($org['whatsapp'] ?? 'Não informado')) ?></span></div>
              <div class="readonly-field"><label>E-mail cobrança</label><span><?= h((string)($org['billing_email'] ?? 'Não informado')) ?></span></div>
              <div class="readonly-field"><label>ID Assinatura</label><span><?= h((string)($sub['asaas_subscription_id'] ?? 'N/D')) ?></span></div>
              <div class="readonly-field"><label>CPF/CNPJ</label><span><?= h((string)($org['cpf_cnpj'] ?? 'Não informado')) ?></span></div>
              <div class="readonly-field"><label>Endereço completo</label><span><?= h($fullAddress) ?></span></div>
              <div class="readonly-field"><label>Projetos ativos</label><span><?= h((string)$activeProjectCount) ?></span></div>
            </div>
          </section>

          <section class="portal-card modern-card">
            <div class="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
              <div>
                <h3 class="mb-1">Projetos / Domínios</h3>
                <p class="note mb-0">Todos os projetos vinculados à sua organização com status operacional e financeiro.</p>
              </div>
              <button type="button" class="btn btn-outline-primary btn-sm align-self-start" id="openProjectCreateBtnDashboard">
                <i class="bi bi-plus-circle-fill" aria-hidden="true"></i> Novo projeto/hospedagem
              </button>
            </div>
            <?php if (count($projectRows) === 0): ?>
              <div class="empty-state text-center py-4">
                <i class="bi bi-diagram-3-fill fs-3 d-block mb-2" aria-hidden="true"></i>
                <p class="mb-1 fw-semibold">Nenhum projeto cadastrado.</p>
                <p class="note mb-0">Crie seu primeiro projeto/hospedagem para iniciar a operação.</p>
              </div>
            <?php else: ?>
              <div class="table-wrap table-responsive">
                <table class="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Domínio / Projeto</th>
                      <th>Plano</th>
                      <th class="text-end">Valor</th>
                      <th>Status operacional</th>
                      <th>Status financeiro</th>
                    </tr>
                  </thead>
                  <tbody>
                    <?php foreach ($projectRows as $projectRow): ?>
                    <?php
                      $projectIdCell = (string)($projectRow['id'] ?? '');
                      $projectDomainCell = trim((string)($projectRow['domain'] ?? ''));
                      $projectLabelCell = projectDisplayLabel($projectDomainCell);
                      $projectStatusCell = strtoupper((string)($projectRow['status'] ?? 'PENDING'));
                      $itemStatusCell = strtoupper((string)($projectRow['subscription_item_status'] ?? 'PENDING'));
                      $projectBadgeClass = match ($projectStatusCell) {
                        'ACTIVE' => 'text-bg-success',
                        'PENDING' => 'text-bg-warning',
                        'PAUSED' => 'text-bg-secondary',
                        'CANCELED', 'CANCELLED' => 'text-bg-danger',
                        default => 'text-bg-secondary',
                      };
                      $itemBadgeClass = match ($itemStatusCell) {
                        'ACTIVE' => 'text-bg-success',
                        'PENDING' => 'text-bg-warning',
                        'CANCELED', 'CANCELLED' => 'text-bg-secondary',
                        default => 'text-bg-secondary',
                      };
                    ?>
                    <tr>
                      <td data-label="Domínio / Projeto">
                        <div class="fw-semibold"><?= h($projectLabelCell) ?></div>
                        <div class="small text-body-secondary"><?= h($projectStatusCell) ?></div>
                      </td>
                      <td data-label="Plano"><?= h((string)($projectRow['plan_name'] ?? $projectRow['plan_code'] ?? 'N/D')) ?></td>
                      <td data-label="Valor" class="text-end">R$ <?= h(number_format((float)($projectRow['effective_price'] ?? 0), 2, ',', '.')) ?></td>
                      <td data-label="Status operacional"><span class="badge <?= h($projectBadgeClass) ?>"><?= h($projectStatusCell) ?></span></td>
                      <td data-label="Status financeiro"><span class="badge <?= h($itemBadgeClass) ?>"><?= h($itemStatusCell) ?></span></td>
                    </tr>
                    <?php endforeach; ?>
                  </tbody>
                </table>
              </div>
            <?php endif; ?>
          </section>
        </section>

        <section class="portal-section" data-section="chamados">
          <section class="portal-card modern-card">
            <div class="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
              <div>
                <h3 class="mb-1">Central de Chamados</h3>
                <p class="note mb-0">Abra solicitações e acompanhe os protocolos gerados no CRM.</p>
              </div>
            </div>
            <div id="ticketInlineNotice" class="alert d-none mb-3" role="alert"></div>
            <form id="ticketForm" class="row g-3" novalidate>
              <div class="col-12 col-md-6">
                <label class="form-label" for="ticketType">Tipo</label>
                <select class="form-select" id="ticketType" name="ticket_type" required>
                  <option value="SITE_FORA_DO_AR">Site fora do ar</option>
                  <option value="SUPORTE">Suporte técnico</option>
                  <option value="MUDANCA_PLANO">Dúvidas sobre plano</option>
                  <option value="ORCAMENTO_PRIORITARIO">Solicitar mudança</option>
                </select>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="ticketPriority">Prioridade</label>
                <select class="form-select" id="ticketPriority" name="priority" required>
                  <option>BAIXA</option>
                  <option selected>NORMAL</option>
                  <option>ALTA</option>
                  <option>CRITICA</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label" for="ticketSubject">Assunto</label>
                <input class="form-control" id="ticketSubject" name="subject" required minlength="3" maxlength="180" placeholder="Ex.: Ajuste no formulário de contato">
                <div class="form-text">Mínimo de 3 caracteres.</div>
              </div>
              <div class="col-12">
                <label class="form-label" for="ticketDescription">Descrição detalhada</label>
                <textarea class="form-control" id="ticketDescription" name="description" required minlength="10" rows="5" placeholder="Descreva o problema com contexto para agilizar o atendimento."></textarea>
                <div class="form-text">Mínimo de 10 caracteres.</div>
              </div>
              <div class="col-12 d-grid d-sm-flex justify-content-sm-end">
                <button class="btn btn-primary px-4" id="ticketSubmitBtn" type="submit" aria-label="Abrir chamado">
                  <span class="btn-label">Abrir chamado</span>
                  <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
                </button>
              </div>
            </form>
          </section>
          <section class="portal-card modern-card">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h3 class="mb-0">Histórico de Chamados</h3>
              <span class="badge text-bg-secondary"><?= h((string)count($tickets)) ?> chamado(s)</span>
            </div>
            <?php if (count($tickets) === 0): ?>
              <div class="empty-state text-center py-4">
                <i class="bi bi-inbox fs-3 d-block mb-2" aria-hidden="true"></i>
                <p class="mb-1 fw-semibold">Nenhum chamado registrado.</p>
                <p class="note mb-0">Abra seu primeiro chamado para iniciar o atendimento.</p>
              </div>
            <?php else: ?>
              <div class="table-wrap table-responsive">
                <table class="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Protocolo</th>
                      <th>Tipo</th>
                      <th>Assunto</th>
                      <th>Prioridade</th>
                      <th>Status</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    <?php foreach ($tickets as $t): ?>
                    <?php
                      $ticketStatus = strtoupper((string)($t['status'] ?? 'OPEN'));
                      $ticketBadgeClass = match ($ticketStatus) {
                        'OPEN' => 'text-bg-primary',
                        'IN_PROGRESS' => 'text-bg-warning',
                        'CLOSED' => 'text-bg-success',
                        default => 'text-bg-secondary',
                      };
                    ?>
                    <tr>
                      <td data-label="Protocolo"><code class="small"><?= h((string)$t['id']) ?></code></td>
                      <td data-label="Tipo"><?= h((string)$t['ticket_type']) ?></td>
                      <td data-label="Assunto"><?= h((string)$t['subject']) ?></td>
                      <td data-label="Prioridade"><?= h((string)$t['priority']) ?></td>
                      <td data-label="Status"><span class="badge <?= h($ticketBadgeClass) ?>"><?= h($ticketStatus) ?></span></td>
                      <td data-label="Data"><?= h(date('d/m/Y H:i', strtotime((string)$t['created_at']))) ?></td>
                    </tr>
                    <?php endforeach; ?>
                  </tbody>
                </table>
              </div>
            <?php endif; ?>
          </section>
        </section>

        <section class="portal-section" data-section="pagamentos">
          <section class="portal-card modern-card">
            <div class="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
              <div>
                <h3 class="mb-1">Pagamentos</h3>
                <p class="note mb-0">Acompanhe assinatura, método de pagamento e histórico das últimas cobranças.</p>
              </div>
              <span class="badge <?= h($subscriptionStatusBadgeClass) ?> align-self-start" id="billingStatusBadge"><?= h($subscriptionStatus) ?></span>
            </div>
            <div id="paymentInlineNotice" class="alert d-none mb-3" role="alert"></div>
            <div id="paymentProtocolCard" class="portal-protocol-card d-none mb-3" aria-live="polite"></div>
            <div class="row g-3 mb-3">
              <div class="col-12 col-lg-6">
                <article class="card h-100 border-0 shadow-sm">
                  <div class="card-body">
                    <h4 class="h6 mb-3">Assinatura</h4>
                    <div class="small text-body-secondary mb-1">Próximo vencimento</div>
                    <div class="fw-semibold" id="billingNextDueDate"><?= h(!empty($sub['next_due_date']) ? date('d/m/Y', strtotime((string)$sub['next_due_date'])) : 'N/D') ?></div>
                    <div class="small text-body-secondary mt-3 mb-1">Situação</div>
                    <div class="fw-semibold" id="billingOverdueText">Sem atrasos relevantes.</div>
                  </div>
                </article>
              </div>
              <div class="col-12 col-lg-6">
                <article class="card h-100 border-0 shadow-sm">
                  <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
                      <h4 class="h6 mb-0">Método de pagamento</h4>
                      <button class="btn btn-outline-secondary btn-sm" id="updateCardBtn" type="button" data-subscription-id="<?= h((string)($sub['asaas_subscription_id'] ?? '')) ?>" <?= empty($sub['asaas_subscription_id']) ? 'disabled' : '' ?>>
                        <span class="btn-label">Atualizar cartão</span>
                        <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
                      </button>
                    </div>
                    <div class="small text-body-secondary mb-1">Cartão atual</div>
                    <div class="fw-semibold" id="billingCardSummary"><?= h(($billingProfile['card_brand'] ?? 'N/D') . ' •••• ' . ($billingProfile['card_last4'] ?? '----')) ?></div>
                    <div class="small text-body-secondary mt-3 mb-1">Validade</div>
                    <div class="fw-semibold" id="billingCardExpiry"><?= h(!empty($billingProfile['exp_month']) ? str_pad((string)$billingProfile['exp_month'], 2, '0', STR_PAD_LEFT) . '/' . $billingProfile['exp_year'] : 'N/D') ?></div>
                    <p class="note mt-3 mb-0">Dados sensíveis não são armazenados neste portal.</p>
                  </div>
                </article>
              </div>
            </div>
            <div id="paymentOverdueAlert" class="alert alert-warning d-none d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-2 mb-0" role="alert">
              <div>
                <strong>Atenção:</strong> existem pagamentos em atraso.
                <span id="paymentOverdueAlertText"></span>
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-warning" id="payNowBtn" type="button" data-subscription-id="<?= h((string)($sub['asaas_subscription_id'] ?? '')) ?>">
                  <span class="btn-label">Pagar agora</span>
                  <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
                </button>
                <button class="btn btn-outline-warning d-none" id="anticipatePixBtn" type="button" data-subscription-id="<?= h((string)($sub['asaas_subscription_id'] ?? '')) ?>">
                  <span class="btn-label">Antecipar via Pix</span>
                  <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
                </button>
              </div>
            </div>
          </section>
          <section class="portal-card modern-card">
            <div class="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
              <div>
                <h3 class="mb-1">Assinaturas internas por projeto</h3>
                <p class="note mb-0">Cada projeto possui um item interno e a soma representa o valor consolidado cobrado no Asaas.</p>
              </div>
              <span class="badge text-bg-info align-self-start">Total consolidado: R$ <?= h(number_format((float)$totalMonthly, 2, ',', '.')) ?></span>
            </div>
            <div class="table-wrap table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Projeto</th>
                    <th>Plano</th>
                    <th class="text-end">Valor</th>
                    <th>Status do item</th>
                  </tr>
                </thead>
                <tbody>
                  <?php if (count($projectRows) === 0): ?>
                    <tr>
                      <td colspan="4" class="text-center text-body-secondary py-4">Nenhum item de assinatura interno encontrado.</td>
                    </tr>
                  <?php else: ?>
                    <?php foreach ($projectRows as $projectBillingRow): ?>
                    <?php
                      $projectBillingId = (string)($projectBillingRow['id'] ?? '');
                      $projectBillingDomain = trim((string)($projectBillingRow['domain'] ?? ''));
                      $projectBillingLabel = $projectBillingDomain !== '' ? $projectBillingDomain : ('Projeto ' . substr($projectBillingId, 0, 8));
                      $projectItemStatus = strtoupper((string)($projectBillingRow['subscription_item_status'] ?? 'PENDING'));
                      $projectItemBadgeClass = match ($projectItemStatus) {
                        'ACTIVE' => 'text-bg-success',
                        'PENDING' => 'text-bg-warning',
                        'CANCELED', 'CANCELLED' => 'text-bg-secondary',
                        default => 'text-bg-secondary',
                      };
                    ?>
                    <tr>
                      <td data-label="Projeto"><?= h($projectBillingLabel) ?></td>
                      <td data-label="Plano"><?= h((string)($projectBillingRow['plan_name'] ?? $projectBillingRow['plan_code'] ?? 'N/D')) ?></td>
                      <td data-label="Valor" class="text-end">R$ <?= h(number_format((float)($projectBillingRow['effective_price'] ?? 0), 2, ',', '.')) ?></td>
                      <td data-label="Status do item"><span class="badge <?= h($projectItemBadgeClass) ?>"><?= h($projectItemStatus) ?></span></td>
                    </tr>
                    <?php endforeach; ?>
                  <?php endif; ?>
                </tbody>
              </table>
            </div>
          </section>
          <section class="portal-card modern-card">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h3 class="mb-0">Últimos pagamentos</h3>
              <span class="badge text-bg-secondary" id="paymentsCountBadge"><?= h((string)count($payments)) ?> registro(s)</span>
            </div>
            <div class="table-wrap table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Data/Vencimento</th>
                    <th class="text-end">Valor</th>
                    <th>Método</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody id="paymentsTableBody">
                  <?php if (count($payments) === 0): ?>
                    <tr>
                      <td colspan="5" class="text-center text-body-secondary py-4">Nenhum pagamento recente.</td>
                    </tr>
                  <?php else: ?>
                    <?php foreach ($payments as $p): ?>
                    <?php
                      $paymentStatus = strtoupper((string)($p['status'] ?? 'PENDING'));
                      $paymentBadgeClass = match ($paymentStatus) {
                        'RECEIVED', 'PAID', 'CONFIRMED' => 'text-bg-success',
                        'PENDING' => 'text-bg-warning',
                        'OVERDUE' => 'text-bg-danger',
                        'CANCELED', 'CANCELLED' => 'text-bg-secondary',
                        default => 'text-bg-secondary',
                      };
                    ?>
                    <tr>
                      <td data-label="Data/Vencimento"><?= h(!empty($p['due_date']) ? date('d/m/Y', strtotime((string)$p['due_date'])) : 'N/D') ?></td>
                      <td data-label="Valor" class="text-end">R$ <?= h(number_format((float)$p['amount'], 2, ',', '.')) ?></td>
                      <td data-label="Método"><?= h((string)$p['billing_type']) ?></td>
                      <td data-label="Status"><span class="badge <?= h($paymentBadgeClass) ?>"><?= h($paymentStatus) ?></span></td>
                      <td data-label="Ação">-</td>
                    </tr>
                    <?php endforeach; ?>
                  <?php endif; ?>
                </tbody>
              </table>
            </div>
            <?php if (!empty($sub['asaas_subscription_id'])): ?>
              <div class="accordion mt-4" id="billingHelpAccordion">
                <div class="accordion-item">
                  <h2 class="accordion-header" id="billingHelpHeading">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#billingHelpBody" aria-expanded="false" aria-controls="billingHelpBody">
                      Precisa de ajuda?
                    </button>
                  </h2>
                  <div id="billingHelpBody" class="accordion-collapse collapse" aria-labelledby="billingHelpHeading" data-bs-parent="#billingHelpAccordion">
                    <div class="accordion-body">
                      <p class="small text-body-secondary mb-2">Se você quiser interromper o serviço, o cancelamento pode ser solicitado aqui.</p>
                      <button class="btn btn-link btn-sm text-danger p-0" id="cancelSubscriptionBtn" type="button" data-subscription-id="<?= h((string)$sub['asaas_subscription_id']) ?>" <?= $featurePortalCancelSubscription ? '' : 'disabled title="Cancelamento indisponível neste ambiente"' ?>>
                        Cancelar assinatura
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            <?php endif; ?>
          </section>
        </section>

        <section class="portal-section" data-section="planos">
          <section class="portal-card modern-card">
            <div class="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
              <div>
                <h3 class="mb-1">Planos Disponíveis</h3>
                <p class="note mb-0">Upgrade aplica imediatamente com cobrança proporcional da diferença. Downgrade fica agendado para o próximo vencimento.</p>
              </div>
              <span class="badge text-bg-info align-self-start">
                Plano atual:
                <?= h($currentProject ? ((string)($currentProject['plan_name'] ?? $currentProject['plan_code'] ?? 'N/D')) : 'Selecione um projeto') ?>
              </span>
            </div>
            <div id="planInlineNotice" class="alert d-none mb-3" role="alert"></div>
            <div class="alert alert-secondary py-2 mb-3">
              Mensalidade atual do projeto: <strong>R$ <?= h(number_format((float)($currentProject ? ($currentProject['effective_price'] ?? 0) : 0), 2, ',', '.')) ?></strong>
              <?php if (!empty($sub['next_due_date'])): ?>
                | Próximo vencimento: <strong><?= h(date('d/m/Y', strtotime((string)$sub['next_due_date']))) ?></strong>
              <?php endif; ?>
            </div>
            <?php if ($scheduledSubscriptionChange): ?>
              <div class="alert alert-warning py-2 mb-3">
                Mudança agendada:
                <strong><?= h((string)($scheduledSubscriptionChange['target_plan_name'] ?? 'Ajuste de valor')) ?></strong>
                (R$ <?= h(number_format((float)($scheduledSubscriptionChange['target_value'] ?? 0), 2, ',', '.')) ?>)
                para <strong><?= h(date('d/m/Y H:i', strtotime((string)$scheduledSubscriptionChange['effective_at']))) ?></strong>.
              </div>
            <?php endif; ?>
            <div class="plans-grid">
              <article class="plan-tile <?= $currentPlanCode === 'basic' ? 'is-current' : '' ?>" data-plan-code="basic">
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <h4>Básico</h4>
                  <?php if ($currentPlanCode === 'basic'): ?><span class="badge text-bg-success">Atual</span><?php endif; ?>
                </div>
                <strong>R$ 149,99/mês</strong>
                <ul>
                  <li>Site 1 página</li>
                  <li>Domínio incluso</li>
                  <li>1 e-mail profissional</li>
                  <li>Migração gratuita</li>
                </ul>
                <button class="btn btn-outline-primary btn-sm mt-2 plan-pick-btn" type="button" data-plan-code="basic" <?= $currentPlanCode === 'basic' ? 'disabled' : '' ?>><?= $currentPlanCode === 'basic' ? 'Plano atual' : 'Escolher plano' ?></button>
              </article>
              <article class="plan-tile featured <?= $currentPlanCode === 'profissional' ? 'is-current' : '' ?>" data-plan-code="profissional">
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <h4>Profissional</h4>
                  <?php if ($currentPlanCode === 'profissional'): ?><span class="badge text-bg-success">Atual</span><?php endif; ?>
                </div>
                <strong>R$ 249,00/mês</strong>
                <ul>
                  <li>Até 3 páginas</li>
                  <li>Formulário de contato</li>
                  <li>E-mails ilimitados</li>
                  <li>Suporte técnico</li>
                </ul>
                <button class="btn btn-outline-primary btn-sm mt-2 plan-pick-btn" type="button" data-plan-code="profissional" <?= $currentPlanCode === 'profissional' ? 'disabled' : '' ?>><?= $currentPlanCode === 'profissional' ? 'Plano atual' : 'Escolher plano' ?></button>
              </article>
              <article class="plan-tile <?= $currentPlanCode === 'pro' ? 'is-current' : '' ?>" data-plan-code="pro">
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <h4>Pro</h4>
                  <?php if ($currentPlanCode === 'pro'): ?><span class="badge text-bg-success">Atual</span><?php endif; ?>
                </div>
                <strong>R$ 399,00/mês</strong>
                <ul>
                  <li>Chatbot incluso</li>
                  <li>E-commerce básico</li>
                  <li>Catálogo de produtos</li>
                  <li>SEO profissional</li>
                </ul>
                <button class="btn btn-outline-primary btn-sm mt-2 plan-pick-btn" type="button" data-plan-code="pro" <?= $currentPlanCode === 'pro' ? 'disabled' : '' ?>><?= $currentPlanCode === 'pro' ? 'Plano atual' : 'Escolher plano' ?></button>
              </article>
            </div>
            <form id="planForm" class="row g-3 mt-1" data-current-plan="<?= h($currentPlanCode) ?>">
              <input type="hidden" name="asaas_subscription_id" value="<?= h((string)($sub['asaas_subscription_id'] ?? '')) ?>">
              <input type="hidden" name="next_due_date" value="<?= h((string)($sub['next_due_date'] ?? '')) ?>">
              <div class="col-12 col-md-6">
                <label class="form-label" for="planCodeSelect">Novo plano</label>
                <select class="form-select" id="planCodeSelect" name="plan_code" required>
                  <option value="basic" <?= $currentPlanCode === 'basic' ? 'selected' : '' ?>>Básico</option>
                  <option value="profissional" <?= $currentPlanCode === 'profissional' ? 'selected' : '' ?>>Profissional</option>
                  <option value="pro" <?= $currentPlanCode === 'pro' ? 'selected' : '' ?>>Pro</option>
                </select>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="planReason">Justificativa (opcional)</label>
                <textarea class="form-control" id="planReason" name="justificativa" rows="3" maxlength="500" placeholder="Se quiser, descreva o motivo da troca."></textarea>
                <div class="form-text" id="planJustificationCounter">0 / 500</div>
              </div>
              <div class="col-12 d-grid d-sm-flex justify-content-sm-end">
                <button class="btn btn-accent px-4" id="planSubmitBtn" type="submit" <?= empty($sub['asaas_subscription_id']) ? 'disabled title="Finalize a contratação para habilitar troca de plano"' : '' ?> <?= $currentProject ? '' : 'disabled title="Selecione um projeto ativo para trocar plano."' ?>>
                  <span class="btn-label">Solicitar troca</span>
                  <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
                </button>
              </div>
            </form>
          </section>
        </section>

        <section class="portal-section op-operacao" data-section="operacao">
          <section class="portal-card modern-card">
            <div class="mb-3">
              <h3 class="mb-1"><i class="bi bi-rocket-takeoff me-2" aria-hidden="true"></i>Operação do Site</h3>
              <p class="mb-0 text-body-secondary">Acompanhe o desenvolvimento do seu site em tempo real.</p>
              <?php if ($currentProject): ?>
                <p class="mb-0 mt-1 small text-body-secondary">Filtrando pelo projeto: <strong><?= h((string)($currentProject['domain'] ?? 'Projeto selecionado')) ?></strong>.</p>
              <?php endif; ?>
            </div>
            <?php if (!$operationDeal): ?>
              <p class="note">Ainda não existe uma operação ativa para este cliente. Assim que o pagamento e o fechamento forem confirmados, as etapas aparecem aqui automaticamente.</p>
            <?php else: ?>
              <?php if ($currentProject && !$currentProjectHasBriefing): ?>
                <div class="alert alert-warning">
                  Estamos aguardando o preenchimento completo do briefing para iniciar a produção deste projeto.
                </div>
              <?php endif; ?>
              <div class="row g-3 mb-3">
                <div class="col-12 col-sm-6 col-lg-3">
                  <article class="card shadow-sm h-100 op-kpi-card">
                    <div class="card-body">
                      <div class="small text-uppercase fw-semibold text-body-secondary">Cliente</div>
                      <div class="fs-6 fw-semibold"><?= h($currentProject ? ((string)($currentProject['domain'] ?? 'Projeto')) : ((string)($org['billing_email'] ?? ($user['email'] ?? '')))) ?></div>
                    </div>
                  </article>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <article class="card shadow-sm h-100 op-kpi-card">
                    <div class="card-body">
                      <div class="small text-uppercase fw-semibold text-body-secondary">Plano</div>
                      <div class="fs-5 fw-semibold"><?= h((string)($sub['plan_name'] ?? 'PRO')) ?></div>
                    </div>
                  </article>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <article class="card shadow-sm h-100 op-kpi-card">
                    <div class="card-body">
                      <div class="small text-uppercase fw-semibold text-body-secondary">Status</div>
                      <div class="fs-5 fw-semibold"><?= h(strtoupper(str_replace('_', ' ', $operationCurrentUiCode))) ?></div>
                    </div>
                  </article>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <article class="card shadow-sm h-100 op-kpi-card">
                    <div class="card-body">
                      <div class="small text-uppercase fw-semibold text-body-secondary">Última atualização</div>
                      <div class="fs-6 fw-semibold"><?= h(!empty($operationLastUpdatedAt) ? date('d/m/Y H:i', strtotime((string)$operationLastUpdatedAt)) : 'N/D') ?></div>
                    </div>
                  </article>
                </div>
              </div>

              <div class="row g-3 align-items-start">
                <aside class="col-12 col-lg-4">
                  <div class="op-stepper card shadow-sm border-0">
                    <div class="card-body d-flex flex-column gap-2">
                  <?php foreach ($operationUiStages as $idx => $stage): ?>
                    <?php
                      $order = $idx + 1;
                      $status = 'pending';
                      $statusText = 'Pendente';
                      $badgeClass = 'text-bg-secondary';
                      $isApprovalWaiting = false;
                      if ($order < $operationCurrentUiOrder) {
                        $status = 'done';
                        $statusText = 'Concluído';
                        $badgeClass = 'text-bg-success';
                      } elseif ($order === $operationCurrentUiOrder) {
                        $status = 'active';
                        if ((string)$stage['code'] === 'aprovacao') {
                          $isApprovalWaiting = true;
                          $statusText = 'Aguardando cliente';
                          $badgeClass = 'text-bg-warning';
                        } else {
                          $statusText = 'Em andamento';
                          $badgeClass = 'text-bg-primary';
                        }
                      }
                    ?>
                    <article class="op-step" data-status="<?= h($status) ?>" <?= $status === 'active' ? 'aria-current="step"' : '' ?>>
                      <div class="d-flex justify-content-between align-items-center gap-2">
                        <strong class="op-step-title">
                          <i class="bi <?= h((string)($stage['icon'] ?? 'bi-circle')) ?> op-step-icon" aria-hidden="true"></i>
                          <?= h((string)$stage['name']) ?>
                        </strong>
                        <span class="badge <?= h($badgeClass) ?> <?= $isApprovalWaiting ? 'op-badge-pulse' : '' ?>"><?= h($statusText) ?></span>
                      </div>
                      <p class="mb-0 text-body-secondary"><?= h((string)$stage['description']) ?></p>
                    </article>
                  <?php endforeach; ?>
                    </div>
                  </div>
                </aside>

                <div class="col-12 col-lg-8">
                  <div class="d-flex flex-column gap-3">
                  <?php if ($operationCurrentUiCode === 'briefing'): ?>
                    <div class="card shadow-sm border-0">
                      <div class="card-body">
                        <h4 class="h5"><i class="bi bi-clipboard-check me-2" aria-hidden="true"></i>Briefing do Projeto</h4>
                        <p class="mb-0">Estamos aguardando o preenchimento completo do briefing para iniciar a produção do site.</p>
                      </div>
                    </div>
                  <?php endif; ?>

                  <?php if ($operationCurrentUiCode === 'producao'): ?>
                    <div class="card shadow-sm border-0">
                      <div class="card-body">
                        <h4 class="h5"><i class="bi bi-gear me-2" aria-hidden="true"></i>Site em produção</h4>
                        <p>Seu site está sendo desenvolvido pela nossa equipe.</p>
                        <div class="mb-2">
                          <div class="progress" role="progressbar" aria-label="Progresso da produção" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?= h((string)$productionProgress) ?>">
                            <div class="progress-bar" style="width: <?= h((string)$productionProgress) ?>%"></div>
                          </div>
                          <small class="text-body-secondary"><?= h((string)$productionProgress) ?>% concluído</small>
                        </div>
                        <ul class="list-group list-group-flush op-substages">
                        <?php foreach ($productionSubsteps as $substep): ?>
                          <?php
                            $internalCode = (string)$substep['code'];
                            $internalOrder = $operationOrderByCode[$internalCode] ?? 0;
                            $subStatus = 'pending';
                            if ($internalCode === $operationActiveCode) {
                              $subStatus = 'current';
                            } elseif (($operationCompletedMaxOrder >= $internalOrder && $internalOrder > 0) || $operationCurrentUiOrder > ($operationUiOrderByCode['producao'] ?? 2)) {
                              $subStatus = 'completed';
                            }
                          ?>
                          <li class="list-group-item d-flex justify-content-between align-items-center px-0 op-substage-item" data-status="<?= h($subStatus) ?>">
                            <span><?= h((string)$substep['name']) ?></span>
                            <span class="badge <?= $subStatus === 'completed' ? 'text-bg-success' : ($subStatus === 'current' ? 'text-bg-primary' : 'text-bg-secondary') ?>">
                              <?= $subStatus === 'completed' ? 'Concluído' : ($subStatus === 'current' ? 'Atual' : 'Pendente') ?>
                            </span>
                          </li>
                        <?php endforeach; ?>
                        </ul>
                        <p class="mt-2 mb-0 text-body-secondary">Status atual: <?= h($productionCurrentText) ?></p>
                        <?php if (count($operationPromptRequests) > 0): ?>
                        <div class="mt-3">
                          <h5 class="h6 mb-2"><i class="bi bi-envelope-paper me-2" aria-hidden="true"></i>Solicitações pendentes da equipe</h5>
                          <div class="d-flex flex-column gap-2">
                            <?php foreach ($operationPromptRequests as $request): ?>
                              <?php
                                $requestStatus = strtoupper((string)($request['status'] ?? 'SENT'));
                                $requestBadgeClass = $requestStatus === 'RECEIVED' ? 'text-bg-success' : ($requestStatus === 'SENT' ? 'text-bg-warning' : 'text-bg-secondary');
                                $requestBadgeLabel = $requestStatus === 'RECEIVED' ? 'Recebido' : ($requestStatus === 'SENT' ? 'Aguardando envio' : $requestStatus);
                              ?>
                              <article class="card border">
                                <div class="card-body py-2">
                                  <div class="d-flex justify-content-between align-items-center gap-2">
                                    <strong><?= h((string)($request['subject'] ?? 'Solicitação de informações')) ?></strong>
                                    <span class="badge <?= h($requestBadgeClass) ?>"><?= h($requestBadgeLabel) ?></span>
                                  </div>
                                  <?php if (!empty($request['items'])): ?>
                                    <small class="text-body-secondary d-block"><?= h(implode(', ', (array)$request['items'])) ?></small>
                                  <?php elseif (!empty($request['message'])): ?>
                                    <small class="text-body-secondary d-block"><?= h((string)$request['message']) ?></small>
                                  <?php endif; ?>
                                  <?php if (!empty($request['due_at'])): ?>
                                    <small class="text-body-secondary d-block">Prazo: <?= h(date('d/m/Y H:i', strtotime((string)$request['due_at']))) ?></small>
                                  <?php endif; ?>
                                </div>
                              </article>
                            <?php endforeach; ?>
                          </div>
                        </div>
                        <?php endif; ?>
                      </div>
                    </div>
                  <?php endif; ?>

                  <?php if ($operationCurrentUiCode === 'aprovacao'): ?>
                    <div class="card shadow-sm border-0 op-active-panel">
                      <div class="card-body">
                        <div class="d-flex align-items-center justify-content-between mb-2 gap-2">
                          <h4 class="h5 mb-0"><i class="bi bi-check2-circle me-2" aria-hidden="true"></i>Aprovação do Site</h4>
                          <span class="badge text-bg-warning op-badge-pulse">Aguardando cliente</span>
                        </div>
                        <p class="mb-3">Visualize o template e aprove ou solicite ajustes.</p>
                        <div class="row g-2 mb-3">
                          <div class="col-12 col-md-4">
                            <div class="card h-100 border">
                              <div class="card-body py-2">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Versão</div>
                                <div class="fw-semibold"><?= h('V' . (string)($operationApprovalPending['template_version'] ?? $operationApprovalLatest['template_version'] ?? '1')) ?></div>
                              </div>
                            </div>
                          </div>
                          <div class="col-12 col-md-4">
                            <div class="card h-100 border">
                              <div class="card-body py-2">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Gerado em</div>
                                <div class="fw-semibold"><?= h(!empty($operationApprovalPending['template_generated_at']) ? date('d/m/Y H:i', strtotime((string)$operationApprovalPending['template_generated_at'])) : (!empty($operationApprovalLatest['template_generated_at']) ? date('d/m/Y H:i', strtotime((string)$operationApprovalLatest['template_generated_at'])) : 'N/D')) ?></div>
                              </div>
                            </div>
                          </div>
                          <div class="col-12 col-md-4">
                            <div class="card h-100 border">
                              <div class="card-body py-2">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Expira em</div>
                                <div class="fw-semibold"><?= h(!empty($operationApprovalPending['expires_at']) ? date('d/m/Y H:i', strtotime((string)$operationApprovalPending['expires_at'])) : 'N/D') ?></div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <?php if (!empty($operationApprovalPending['preview_url']) || !empty($operationApprovalLatest['preview_url'])): ?>
                        <div class="d-flex flex-wrap gap-2">
                          <a class="btn btn-outline-primary" href="<?= h((string)($operationApprovalPending['preview_url'] ?? $operationApprovalLatest['preview_url'] ?? '')) ?>" target="_blank" rel="noreferrer">Abrir preview</a>
                          <button type="button" class="btn btn-success" id="portalApproveBtn">Aprovar site</button>
                          <button type="button" class="btn btn-warning" id="portalChangesBtn">Solicitar ajustes</button>
                        </div>
                        <?php else: ?>
                        <div class="d-flex flex-wrap gap-2">
                          <button type="button" class="btn btn-success" id="portalApproveBtn">Aprovar site</button>
                          <button type="button" class="btn btn-warning" id="portalChangesBtn">Solicitar ajustes</button>
                        </div>
                        <?php endif; ?>
                        <div class="alert hidden mt-3" id="portalApprovalNotice"></div>
                      </div>
                    </div>
                  <?php endif; ?>

                  <?php if ($operationCurrentUiCode === 'publicacao'): ?>
                    <div class="card shadow-sm border-0">
                      <div class="card-body">
                        <h4 class="h5"><i class="bi bi-globe-americas me-2" aria-hidden="true"></i>Publicação do Site</h4>
                        <p>Configure seu domínio e e-mails profissionais para concluirmos a publicação.</p>
                        <div class="row g-2">
                          <div class="col-12 col-md-6">
                            <div class="card border h-100">
                              <div class="card-body py-2">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Domínio</div>
                                <div class="fw-semibold"><?= h((string)($org['domain'] ?? 'Não informado')) ?></div>
                              </div>
                            </div>
                          </div>
                          <div class="col-12 col-md-6">
                            <div class="card border h-100">
                              <div class="card-body py-2">
                                <div class="small text-uppercase fw-semibold text-body-secondary">E-mail profissional</div>
                                <div class="fw-semibold"><?= h('contato@' . ((string)($org['domain'] ?? 'dominio.com.br'))) ?></div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <?php if (!empty($operationPublicationLatestRequest)): ?>
                        <?php
                          $publicationBadgeClass = 'text-bg-secondary';
                          $publicationBadgeLabel = 'Pendente';
                          if ($operationPublicationDecisionStatus === 'APPROVED') {
                            $publicationBadgeClass = 'text-bg-success';
                            $publicationBadgeLabel = 'Respondida: Aprovado';
                          } elseif ($operationPublicationDecisionStatus === 'REJECTED') {
                            $publicationBadgeClass = 'text-bg-danger';
                            $publicationBadgeLabel = 'Respondida: Rejeitado';
                          }
                          $canRespondPublicationRequest = $operationPublicationDecisionStatus === 'PENDING';
                        ?>
                        <div class="card border mt-3 publication-domain-response-card">
                          <div class="card-body py-3">
                            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                              <div>
                                <div class="small text-uppercase fw-semibold text-body-secondary">Solicitação de domínio</div>
                                <div class="fw-semibold"><?= h((string)($operationPublicationLatestRequest['subject'] ?? 'Aprovação de domínio/publicação')) ?></div>
                              </div>
                              <span class="badge <?= h($publicationBadgeClass) ?>"><?= h($publicationBadgeLabel) ?></span>
                            </div>
                            <div class="row g-2">
                              <div class="col-12 col-md-6">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Domínio solicitado</div>
                                <div class="fw-semibold"><?= h($operationPublicationDomainForDisplay !== '' ? $operationPublicationDomainForDisplay : 'Não informado') ?></div>
                              </div>
                              <div class="col-12 col-md-6">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Respondido em</div>
                                <div class="fw-semibold"><?= h(!empty($operationPublicationRespondedAt) ? date('d/m/Y H:i', strtotime((string)$operationPublicationRespondedAt)) : 'Aguardando resposta') ?></div>
                              </div>
                              <?php if ($operationPublicationDecisionStatus === 'REJECTED'): ?>
                              <div class="col-12 col-md-6">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Domínio sugerido pelo cliente</div>
                                <div class="fw-semibold"><?= h($operationPublicationSuggestedDomain !== '' ? $operationPublicationSuggestedDomain : 'Não informado') ?></div>
                              </div>
                              <?php endif; ?>
                              <?php if ($operationPublicationDecisionStatus === 'APPROVED'): ?>
                              <div class="col-12 col-md-6">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Domínio aprovado</div>
                                <div class="fw-semibold"><?= h($operationPublicationApprovedDomain !== '' ? $operationPublicationApprovedDomain : ((string)($org['domain'] ?? 'Não informado'))) ?></div>
                              </div>
                              <?php endif; ?>
                              <?php if ($operationPublicationResponseNote !== ''): ?>
                              <div class="col-12">
                                <div class="small text-uppercase fw-semibold text-body-secondary">Observação</div>
                                <div class="fw-semibold"><?= h($operationPublicationResponseNote) ?></div>
                              </div>
                              <?php endif; ?>
                            </div>
                            <div class="alert hidden mt-3" id="portalPublicationNotice"></div>
                            <?php if ($canRespondPublicationRequest): ?>
                            <div class="mt-3 d-flex flex-wrap gap-2">
                              <button
                                type="button"
                                class="btn btn-primary"
                                id="portalPublicationRespondBtn"
                                data-request-id="<?= h($operationPublicationRequestId) ?>"
                                data-request-domain="<?= h((string)($operationPublicationDomainForDisplay ?? '')) ?>"
                              >
                                Responder solicitação de domínio
                              </button>
                            </div>
                            <?php endif; ?>
                          </div>
                        </div>
                        <?php endif; ?>
                      </div>
                    </div>
                  <?php endif; ?>

                  <?php if ($operationCurrentUiCode === 'publicado'): ?>
                    <div class="card shadow-sm border-0">
                      <div class="card-body">
                        <h4 class="h5"><i class="bi bi-rocket-takeoff me-2" aria-hidden="true"></i>Site Publicado!</h4>
                        <p>Seu site está no ar e sendo monitorado.</p>
                      <?php if (!empty($org['domain'])): ?>
                        <div class="d-flex flex-wrap gap-2">
                          <a class="btn btn-primary" href="<?= h('https://' . (string)$org['domain']) ?>" target="_blank" rel="noreferrer">Acessar site</a>
                          <a class="btn btn-outline-primary" href="<?= h('https://' . (string)$org['domain'] . '/admin') ?>" target="_blank" rel="noreferrer">Painel administrativo</a>
                        </div>
                      <?php endif; ?>
                      </div>
                    </div>
                  <?php endif; ?>

                  <section class="card shadow-sm border-0">
                    <div class="card-body">
                    <details class="op-history" open>
                      <summary class="fw-semibold"><i class="bi bi-clock-history me-2" aria-hidden="true"></i>Histórico de solicitações</summary>
                      <div class="d-flex flex-column gap-2 mt-2">
                      <?php if (count($operationHistory) === 0): ?>
                        <p class="note">Nenhum histórico de solicitações até o momento.</p>
                      <?php else: ?>
                        <?php foreach ($operationHistory as $item): ?>
                          <article class="card border-0 op-history-item">
                            <div class="card-body py-2">
                            <div class="d-flex justify-content-between align-items-center gap-2">
                              <strong><?= h((string)$item['kind']) ?></strong>
                              <span class="badge <?= $item['status'] === 'resolvido' ? 'text-bg-success' : ($item['status'] === 'em_andamento' ? 'text-bg-primary' : 'text-bg-secondary') ?>"><?= h((string)$item['status_label']) ?></span>
                            </div>
                            <small class="text-body-secondary"><?= h(!empty($item['date']) ? date('d/m/Y H:i', strtotime((string)$item['date'])) : 'N/D') ?></small>
                            <p class="mb-0"><?= h((string)$item['description']) ?></p>
                            <?php if (!empty($item['response'])): ?>
                              <p><strong>Resposta:</strong> <?= h((string)$item['response']) ?></p>
                            <?php endif; ?>
                            </div>
                          </article>
                        <?php endforeach; ?>
                      <?php endif; ?>
                      </div>
                    </details>
                    </div>
                  </section>
                </div>
                </div>
              </div>
            <?php endif; ?>
          </section>
        </section>

        <div class="portal-modal hidden" id="portalApprovalConfirmModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog">
            <header class="portal-modal-header">
              <h3>Confirmar aprovação</h3>
            </header>
            <p>Ao aprovar, seu site seguirá para a etapa de publicação. Deseja continuar?</p>
            <div class="operation-actions">
              <button type="button" class="btn btn-primary" id="portalApproveConfirmBtn">Sim, aprovar</button>
              <button type="button" class="btn btn-ghost" id="portalApproveCancelBtn">Revisar novamente</button>
            </div>
          </div>
        </div>

        <div class="portal-modal hidden" id="portalRequestChangesModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog">
            <header class="portal-modal-header">
              <h3>Solicitar ajustes no site</h3>
            </header>
            <form id="portalRequestChangesForm" enctype="multipart/form-data">
              <div class="grid-2">
                <div class="form-col full">
                  <label for="portalTipoAjuste">Tipo de ajuste *</label>
                  <select id="portalTipoAjuste" name="tipo_ajuste" required>
                    <option value="">Selecione...</option>
                    <option>Alteração de texto/conteúdo</option>
                    <option>Alteração de cores/estilo</option>
                    <option>Reorganização de seções</option>
                    <option>Adicionar/remover seções</option>
                    <option>Ajustes de imagens</option>
                    <option>Funcionalidades adicionais</option>
                    <option>Correções de responsividade (mobile/tablet)</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div class="form-col full">
                  <label for="portalDescricaoAjuste">Descreva detalhadamente o que deseja alterar *</label>
                  <textarea id="portalDescricaoAjuste" name="descricao_ajuste" rows="6" maxlength="2000" required placeholder="Descreva com detalhes (mínimo 100 caracteres)."></textarea>
                  <div class="approval-counter-wrap">
                    <small id="portalDescricaoCounter">0 / 2000 (mínimo 100)</small>
                    <div class="approval-counter-bar"><span id="portalDescricaoCounterFill" style="width:0%"></span></div>
                  </div>
                </div>
                <div class="form-col">
                  <label for="portalPrioridadeAjuste">Prioridade</label>
                  <select id="portalPrioridadeAjuste" name="prioridade">
                    <option>Baixa</option>
                    <option selected>Média</option>
                    <option>Alta</option>
                  </select>
                </div>
                <div class="form-col">
                  <label for="portalAnexosAjuste">Anexar referências (opcional)</label>
                  <input id="portalAnexosAjuste" type="file" name="anexos[]" accept="image/*,.pdf" multiple>
                  <small>Até 5 arquivos, máximo 10MB por arquivo.</small>
                </div>
              </div>
              <div class="alert hidden" id="portalChangesNotice"></div>
              <div class="operation-actions">
                <button type="button" class="btn btn-ghost" id="portalChangesCancelBtn">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="portalChangesSubmitBtn" disabled>Enviar solicitação</button>
              </div>
            </form>
          </div>
        </div>

        <div class="portal-modal hidden" id="portalPublicationDomainModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog publication-domain-modal">
            <header class="portal-modal-header">
              <h3>Responder solicitação de domínio</h3>
              <button type="button" class="icon-btn" id="portalPublicationDomainCloseBtn" aria-label="Fechar">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </header>
            <form id="portalPublicationDomainForm">
              <input type="hidden" name="request_id" id="portalPublicationRequestId" value="">
              <div class="publication-domain-form-grid">
                <div class="form-col full">
                  <label for="portalPublicationAction">Ação *</label>
                  <select id="portalPublicationAction" name="action" required>
                    <option value="approve">Aprovar domínio</option>
                    <option value="reject">Rejeitar e sugerir domínio</option>
                  </select>
                </div>
                <div class="form-col full">
                  <label for="portalPublicationDomain">Domínio</label>
                  <input id="portalPublicationDomain" name="domain" placeholder="exemplo.com.br" autocomplete="off">
                  <small id="portalPublicationDomainHint" class="text-body-secondary">Opcional para aprovação. Obrigatório ao rejeitar.</small>
                </div>
                <div class="form-col full">
                  <label for="portalPublicationNote">Observação</label>
                  <textarea id="portalPublicationNote" name="note" rows="4" maxlength="1000" placeholder="Descreva o contexto para o time da KoddaHub."></textarea>
                </div>
              </div>
              <div class="alert hidden mt-2" id="portalPublicationDomainNotice"></div>
              <div class="operation-actions mt-3">
                <button type="button" class="btn btn-ghost" id="portalPublicationDomainCancelBtn">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="portalPublicationDomainSubmitBtn">Confirmar resposta</button>
              </div>
            </form>
          </div>
        </div>

        <div class="portal-modal hidden" id="planChangeConfirmModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog">
            <header class="portal-modal-header">
              <h3>Confirmar troca de plano</h3>
              <button type="button" class="icon-btn" id="planChangeConfirmCloseBtn" aria-label="Fechar">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </header>
            <p id="planChangeConfirmText" class="mb-2">Revise sua solicitação antes de enviar.</p>
            <p class="note mb-0">No upgrade, a diferença é cobrada no próprio modal (PIX ou cartão). No downgrade, o valor é atualizado agora e as funcionalidades atuais seguem até o próximo vencimento.</p>
            <div class="alert alert-info py-2 px-3 mt-3 mb-0 d-none" id="planUpgradeAmountInfo"></div>
            <div class="mt-3 d-none" id="planUpgradePaymentWrap">
              <div class="nav nav-tabs mb-2" id="planUpgradePaymentTabs" role="tablist">
                <button type="button" class="nav-link active" id="planUpgradeTabPix" data-tab="PIX" role="tab" aria-selected="true">PIX</button>
                <button type="button" class="nav-link" id="planUpgradeTabCard" data-tab="CARD" role="tab" aria-selected="false">Cartão de crédito</button>
              </div>
              <input type="hidden" id="planUpgradePaymentMethod" value="PIX">
              <div class="billing-card-mode d-none mt-2" id="planUpgradeCardModeWrap">
                <button type="button" class="btn btn-outline-primary btn-sm active" id="planUpgradeCardModeSavedBtn" data-card-mode="CREDIT_CARD_SAVED">Usar cartão cadastrado</button>
                <button type="button" class="btn btn-outline-primary btn-sm" id="planUpgradeCardModeNewBtn" data-card-mode="CREDIT_CARD_NEW">Usar outro cartão</button>
              </div>
            </div>
            <div class="row g-2 mt-2 d-none" id="planUpgradeCardForm">
              <div class="col-12">
                <label class="form-label" for="planUpgradeCardHolderName">Nome no cartão</label>
                <input class="form-control" id="planUpgradeCardHolderName" name="holder_name" autocomplete="cc-name">
              </div>
              <div class="col-12">
                <label class="form-label" for="planUpgradeCardNumber">Número do cartão</label>
                <input class="form-control" id="planUpgradeCardNumber" name="number" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000">
              </div>
              <div class="col-4">
                <label class="form-label" for="planUpgradeCardExpMonth">Mês</label>
                <input class="form-control" id="planUpgradeCardExpMonth" name="expiry_month" inputmode="numeric" maxlength="2" placeholder="MM">
              </div>
              <div class="col-4">
                <label class="form-label" for="planUpgradeCardExpYear">Ano</label>
                <input class="form-control" id="planUpgradeCardExpYear" name="expiry_year" inputmode="numeric" maxlength="4" placeholder="AAAA">
              </div>
              <div class="col-4">
                <label class="form-label" for="planUpgradeCardCcv">CVV</label>
                <input class="form-control" id="planUpgradeCardCcv" name="ccv" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="000">
              </div>
            </div>
            <div class="mt-3 d-none" id="planUpgradePixWrap">
              <div class="pix-qr-wrap mb-3">
                <img id="planUpgradePixQr" alt="QR Code PIX Upgrade" class="pix-qr-image d-none">
              </div>
              <div class="small text-body-secondary mb-2" id="planUpgradePixCountdown">Aguardando geração do PIX...</div>
              <label class="form-label" for="planUpgradePixPayload">PIX Copia e Cola</label>
              <textarea class="form-control" id="planUpgradePixPayload" rows="3" readonly></textarea>
              <div class="d-flex justify-content-end mt-2">
                <button type="button" class="btn btn-outline-primary btn-sm" id="planUpgradeCopyPixBtn" data-copy-target="planUpgradePixPayload">Copiar código PIX</button>
              </div>
            </div>
            <div class="alert d-none mt-3" id="planChangeConfirmNotice" role="alert"></div>
            <div class="operation-actions mt-3">
              <button type="button" class="btn btn-ghost" id="planChangeConfirmCancelBtn">Cancelar solicitação</button>
              <button type="button" class="btn btn-primary" id="planChangeConfirmSubmitBtn">
                <span class="btn-label">Iniciar pagamento</span>
                <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </div>

        <div class="portal-modal hidden" id="updateCardModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog">
            <header class="portal-modal-header">
              <h3>Atualizar cartão</h3>
              <button type="button" class="icon-btn" id="updateCardCloseBtn" aria-label="Fechar">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </header>
            <p class="mb-2">Atualize o cartão sem cobrança imediata. Os dados são tokenizados antes de enviar ao Asaas.</p>
            <form id="updateCardForm" class="row g-3">
              <div class="col-12">
                <label class="form-label" for="updateCardHolderName">Nome impresso no cartão</label>
                <input class="form-control" id="updateCardHolderName" name="holder_name" required>
              </div>
              <div class="col-12">
                <label class="form-label" for="updateCardNumber">Número do cartão</label>
                <input class="form-control" id="updateCardNumber" name="number" inputmode="numeric" autocomplete="cc-number" required>
              </div>
              <div class="col-6">
                <label class="form-label" for="updateCardExpMonth">Mês</label>
                <input class="form-control" id="updateCardExpMonth" name="expiry_month" inputmode="numeric" maxlength="2" placeholder="MM" required>
              </div>
              <div class="col-6">
                <label class="form-label" for="updateCardExpYear">Ano</label>
                <input class="form-control" id="updateCardExpYear" name="expiry_year" inputmode="numeric" maxlength="4" placeholder="AAAA" required>
              </div>
              <div class="col-6">
                <label class="form-label" for="updateCardCcv">CVV</label>
                <input class="form-control" id="updateCardCcv" name="ccv" inputmode="numeric" maxlength="4" autocomplete="off" required>
              </div>
            </form>
            <div class="alert d-none mt-3" id="updateCardNotice" role="alert"></div>
            <div class="operation-actions mt-3">
              <button type="button" class="btn btn-ghost" id="updateCardCancelBtn">Voltar</button>
              <button type="button" class="btn btn-primary" id="updateCardConfirmBtn">
                <span class="btn-label">Salvar novo cartão</span>
                <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </div>

        <div class="portal-modal hidden" id="paymentAlternativeModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog">
            <header class="portal-modal-header">
              <h3 id="paymentAlternativeTitle">Pagar cobrança</h3>
              <button type="button" class="icon-btn" id="paymentAlternativeCloseBtn" aria-label="Fechar">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </header>
            <p class="note mb-2">O pagamento é gerado e concluído dentro da plataforma, sem redirecionamento externo.</p>
            <form id="paymentAlternativeForm" class="row g-3">
              <div class="col-12">
                <div class="nav nav-tabs" id="paymentAlternativeTabs" role="tablist">
                  <button type="button" class="nav-link active" id="paymentAlternativeTabPix" data-tab="PIX" role="tab" aria-selected="true">PIX</button>
                  <button type="button" class="nav-link" id="paymentAlternativeTabCard" data-tab="CARD" role="tab" aria-selected="false">Cartão de crédito</button>
                </div>
                <input type="hidden" id="paymentAlternativeMethod" name="billing_type" value="PIX">
                <div class="billing-card-mode d-none mt-2" id="paymentAlternativeCardModeWrap">
                  <button type="button" class="btn btn-outline-primary btn-sm active" id="paymentAlternativeCardModeSavedBtn" data-card-mode="CREDIT_CARD_SAVED">Usar cartão cadastrado</button>
                  <button type="button" class="btn btn-outline-primary btn-sm" id="paymentAlternativeCardModeNewBtn" data-card-mode="CREDIT_CARD_NEW">Usar outro cartão</button>
                </div>
              </div>
              <div class="row g-2 mt-1 d-none" id="paymentAlternativeCardForm">
                <div class="col-12">
                  <label class="form-label" for="paymentAlternativeCardHolderName">Nome no cartão</label>
                  <input class="form-control" id="paymentAlternativeCardHolderName" name="holder_name" autocomplete="cc-name">
                </div>
                <div class="col-12">
                  <label class="form-label" for="paymentAlternativeCardNumber">Número do cartão</label>
                  <input class="form-control" id="paymentAlternativeCardNumber" name="number" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000">
                </div>
                <div class="col-4">
                  <label class="form-label" for="paymentAlternativeCardExpMonth">Mês</label>
                  <input class="form-control" id="paymentAlternativeCardExpMonth" name="expiry_month" inputmode="numeric" maxlength="2" placeholder="MM">
                </div>
                <div class="col-4">
                  <label class="form-label" for="paymentAlternativeCardExpYear">Ano</label>
                  <input class="form-control" id="paymentAlternativeCardExpYear" name="expiry_year" inputmode="numeric" maxlength="4" placeholder="AAAA">
                </div>
                <div class="col-4">
                  <label class="form-label" for="paymentAlternativeCardCcv">CVV</label>
                  <input class="form-control" id="paymentAlternativeCardCcv" name="ccv" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="000">
                </div>
              </div>
              <div class="col-12">
                <div class="alert d-none" id="paymentAlternativeNotice" role="alert"></div>
              </div>
              <div class="col-12" id="paymentAlternativePixBox" hidden>
                <div class="pix-qr-wrap mb-3">
                  <img id="paymentAlternativePixQr" alt="QR Code PIX" class="pix-qr-image d-none">
                </div>
                <div class="small text-body-secondary mb-2" id="paymentAlternativePixCountdown">Aguardando geração do PIX...</div>
                <div class="small text-body-secondary mb-1">PIX Copia e Cola</div>
                <textarea class="form-control" id="paymentAlternativePixPayload" rows="3" readonly></textarea>
                <div class="d-flex justify-content-end mt-2">
                  <button type="button" class="btn btn-outline-primary btn-sm" id="paymentAlternativeCopyPixBtn" data-copy-target="paymentAlternativePixPayload">Copiar código PIX</button>
                </div>
              </div>
            </form>
            <div class="operation-actions mt-3">
              <button type="button" class="btn btn-ghost" id="paymentAlternativeCancelBtn">Cancelar solicitação</button>
              <button type="button" class="btn btn-primary" id="paymentAlternativeConfirmBtn">
                <span class="btn-label">Iniciar pagamento</span>
                <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </div>

        <div class="portal-modal hidden" id="cancelSubscriptionModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog">
            <header class="portal-modal-header">
              <h3>Solicitar cancelamento</h3>
              <button type="button" class="icon-btn" id="cancelSubscriptionCloseBtn" aria-label="Fechar">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </header>
            <form id="cancelSubscriptionForm" class="row g-3">
              <input type="hidden" name="asaas_subscription_id" value="<?= h((string)($sub['asaas_subscription_id'] ?? '')) ?>">
              <div class="col-12">
                <div class="alert alert-warning mb-0">
                  Este processo pode interromper serviços ativos. Confirme apenas se deseja realmente cancelar.
                </div>
              </div>
              <div class="col-12">
                <label class="form-label">Quando cancelar</label>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="mode" id="cancelModeEndCycle" value="END_OF_CYCLE" checked>
                  <label class="form-check-label" for="cancelModeEndCycle">No fim do ciclo atual</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="mode" id="cancelModeImmediate" value="IMMEDIATE">
                  <label class="form-check-label" for="cancelModeImmediate">Imediato</label>
                </div>
              </div>
              <div class="col-12">
                <label class="form-label" for="cancelConfirmText">Digite <strong>CANCELAR</strong> para confirmar</label>
                <input class="form-control" id="cancelConfirmText" name="confirm_text" autocomplete="off" placeholder="CANCELAR">
                <div class="form-text">Você poderá acompanhar o status final após confirmação no gateway.</div>
              </div>
              <div class="col-12">
                <div class="alert d-none" id="cancelSubscriptionNotice" role="alert"></div>
              </div>
              <div class="col-12 operation-actions">
                <button type="button" class="btn btn-ghost" id="cancelSubscriptionCancelBtn">Voltar</button>
                <button type="submit" class="btn btn-danger" id="cancelSubscriptionSubmitBtn">
                  <span class="btn-label">Confirmar cancelamento</span>
                  <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <div class="portal-modal hidden" id="projectCreateModal" aria-hidden="true">
          <div class="portal-modal-backdrop"></div>
          <div class="portal-modal-dialog approval-dialog">
            <header class="portal-modal-header">
              <h3>Novo projeto / hospedagem</h3>
              <button type="button" class="icon-btn" id="projectCreateCloseBtn" aria-label="Fechar">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </header>
            <p class="note mb-2">Selecione o plano e o tipo. Em seguida você preencherá o briefing e aprovará a cobrança pró-rata até o próximo vencimento.</p>
            <form id="projectCreateForm" class="row g-3">
              <div class="col-12 col-md-6">
                <label class="form-label" for="projectCreateType">Tipo de projeto *</label>
                <select class="form-select" id="projectCreateType" name="project_type" required>
                  <option value="hospedagem">Hospedagem</option>
                  <option value="ecommerce">Ecommerce</option>
                  <option value="landingpage">Landing Page</option>
                  <option value="institucional">Site institucional</option>
                </select>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="projectCreatePlanCode">Plano *</label>
                <select class="form-select" id="projectCreatePlanCode" name="plan_code" required>
                  <?php if ($projectCreatePlansAvailable): ?>
                    <?php foreach ($projectCreatePlans as $projectCreatePlan): ?>
                      <option value="<?= h((string)$projectCreatePlan['code']) ?>">
                        <?= h((string)$projectCreatePlan['name']) ?> - R$ <?= h(number_format((float)($projectCreatePlan['monthly_price'] ?? 0), 2, ',', '.')) ?>
                      </option>
                    <?php endforeach; ?>
                  <?php else: ?>
                    <option value="" selected disabled>Nenhum plano ativo disponível</option>
                  <?php endif; ?>
                </select>
                <?php if (!$projectCreatePlansAvailable): ?>
                  <small class="text-body-secondary d-block mt-1">Ative um plano no cadastro interno para liberar novas solicitações.</small>
                <?php endif; ?>
              </div>
            </form>
            <div class="alert d-none mt-3" id="projectCreateNotice" role="alert"></div>
            <div class="operation-actions mt-3">
              <button type="button" class="btn btn-ghost" id="projectCreateCancelBtn">Cancelar</button>
              <button type="button" class="btn btn-primary" id="projectCreateSubmitBtn" <?= $projectCreatePlansAvailable ? '' : 'disabled' ?>>
                <span class="btn-label">Continuar para briefing</span>
                <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </div>

        <section class="portal-section" data-section="perfil">
          <section class="portal-card modern-card">
            <div class="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
              <div>
                <h3 class="mb-1">Perfil e Conta</h3>
                <p class="note mb-0">Mantenha seus dados atualizados para comunicação e cobrança.</p>
              </div>
            </div>
            <div id="profileInlineNotice" class="alert d-none mb-3" role="alert"></div>
            <form id="profileForm" class="row g-3" novalidate>
              <div class="col-12 col-md-6">
                <label class="form-label" for="profileName">Nome da conta</label>
                <input class="form-control" id="profileName" name="name" value="<?= h((string)($org['legal_name'] ?? ($user['name'] ?? 'Cliente KoddaHub'))) ?>" required>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="profileEmail">E-mail de acesso</label>
                <input class="form-control" id="profileEmail" type="email" name="email" value="<?= h((string)($org['billing_email'] ?? ($user['email'] ?? ''))) ?>" required>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="profilePhone">WhatsApp</label>
                <input class="form-control" id="profilePhone" name="phone" value="<?= h((string)($org['whatsapp'] ?? '')) ?>" placeholder="(41) 99999-9999">
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="profileBillingEmail">E-mail de cobrança</label>
                <input class="form-control" id="profileBillingEmail" type="email" name="billing_email" value="<?= h((string)($org['billing_email'] ?? ($user['email'] ?? ''))) ?>" required>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="profileNewPassword">Nova senha (opcional)</label>
                <input class="form-control" id="profileNewPassword" type="password" name="new_password" placeholder="mínimo 6 caracteres" minlength="6">
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="profileNewPasswordConfirm">Confirmar nova senha</label>
                <input class="form-control" id="profileNewPasswordConfirm" type="password" name="new_password_confirm" placeholder="repita a nova senha" minlength="6">
              </div>
              <div class="col-12">
                <label class="form-label" for="profileAccountPassword">Senha atual (obrigatória para salvar)</label>
                <input class="form-control" id="profileAccountPassword" type="password" name="account_password" required>
              </div>
              <div class="col-12 d-grid d-sm-flex justify-content-sm-end">
                <button type="submit" class="btn btn-primary px-4" id="profileSubmitBtn">
                  <span class="btn-label">Salvar alterações</span>
                  <span class="spinner-border spinner-border-sm ms-2 d-none" role="status" aria-hidden="true"></span>
                </button>
              </div>
            </form>
            <div class="contract-grid mt-3">
              <div class="readonly-field">
                <label>Plano atual</label>
                <span><?= h((string)($sub['plan_name'] ?? 'N/D')) ?></span>
              </div>
              <div class="readonly-field">
                <label>Status assinatura</label>
                <span><span class="badge <?= h($subscriptionStatusBadgeClass) ?>"><?= h($subscriptionStatus) ?></span></span>
              </div>
              <div class="readonly-field">
                <label>ID assinatura</label>
                <span class="d-flex align-items-center gap-2 flex-wrap">
                  <code id="profileSubscriptionId"><?= h((string)($sub['asaas_subscription_id'] ?? 'N/D')) ?></code>
                  <button class="btn btn-outline-secondary btn-sm" type="button" data-copy-target="profileSubscriptionId" aria-label="Copiar ID da assinatura">Copiar</button>
                </span>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  </div>

  <nav class="mobile-bottom-nav" aria-label="Navegação mobile">
    <a class="active" data-nav-section="dashboard" data-nav-scope="ALL" href="/portal/dashboard#dashboard"><span class="icon"><i class="bi bi-bar-chart-line-fill" aria-hidden="true"></i></span><span class="label">Dashboard</span></a>
    <a data-nav-section="operacao" data-nav-scope="PROJECT" href="/portal/dashboard#operacao"><span class="icon"><i class="bi bi-diagram-3-fill" aria-hidden="true"></i></span><span class="label">Operação</span></a>
    <a data-nav-section="chamados" data-nav-scope="ALL" href="/portal/dashboard#chamados"><span class="icon"><i class="bi bi-ticket-detailed-fill" aria-hidden="true"></i></span><span class="label">Chamados</span></a>
    <a data-nav-section="planos" data-nav-scope="PROJECT" href="/portal/dashboard#planos"><span class="icon"><i class="bi bi-box-seam-fill" aria-hidden="true"></i></span><span class="label">Planos</span></a>
    <a data-nav-section="pagamentos" data-nav-scope="ALL" href="/portal/dashboard#pagamentos"><span class="icon"><i class="bi bi-credit-card-2-front-fill" aria-hidden="true"></i></span><span class="label">Pagamento</span></a>
    <a data-nav-section="perfil" data-nav-scope="ALL" href="/portal/dashboard#perfil"><span class="icon"><i class="bi bi-person-badge-fill" aria-hidden="true"></i></span><span class="label">Perfil</span></a>
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
        <input type="hidden" name="project_id" id="briefProjectId" value="<?= h((string)($currentProjectId ?? '')) ?>">
        <input type="hidden" name="brief_source" id="briefSource" value="dashboard">
        <input type="hidden" name="brief_plan_code" id="briefPlanCode" value="">
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

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/assets/app.js?v=<?= h($assetJsVersion) ?>"></script>
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
  if (session_status() === PHP_SESSION_ACTIVE) {
    session_regenerate_id(true);
  }
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
        'type' => (string)($f['type'][$i] ?? ''),
        'size' => (int)($f['size'][$i] ?? 0),
        'error' => (int)($f['error'][$i] ?? UPLOAD_ERR_NO_FILE),
      ];
    }
    return $out;
  }
  if (($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
    $out[] = [
      'name' => (string)$f['name'],
      'tmp_name' => (string)$f['tmp_name'],
      'type' => (string)($f['type'] ?? ''),
      'size' => (int)($f['size'] ?? 0),
      'error' => (int)($f['error'] ?? UPLOAD_ERR_NO_FILE),
    ];
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

function textLength(string $value): int {
  return function_exists('mb_strlen') ? (int)mb_strlen($value, 'UTF-8') : strlen($value);
}

function textSlice(string $value, int $limit): string {
  return function_exists('mb_substr') ? (string)mb_substr($value, 0, $limit, 'UTF-8') : substr($value, 0, $limit);
}

function approvalAdjustmentsBaseDir(array $ctx): string {
  $orgId = trim((string)($ctx['organization_id'] ?? ''));
  $orgName = trim((string)($ctx['legal_name'] ?? 'Cliente'));
  $dealId = trim((string)($ctx['deal_id'] ?? ''));
  $orgSlug = site24hBuildOrgSlug($orgName !== '' ? $orgName : 'cliente', $orgId !== '' ? $orgId : '00000000');
  return rtrim(site24hClientProjectsRoot(), '/') . '/' . $orgSlug . '/approval_requests/' . ($dealId !== '' ? $dealId : 'deal');
}

function storeApprovalRequestAttachments(array $ctx, string $ticketCode): array {
  $files = normalizeUploadFiles('anexos');
  if (count($files) === 0) {
    return ['ok' => true, 'files' => []];
  }
  if (count($files) > 5) {
    return ['ok' => false, 'error' => 'Envie no máximo 5 anexos por solicitação.'];
  }

  $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : null;
  $targetDir = approvalAdjustmentsBaseDir($ctx) . '/' . date('Y/m');
  if (!is_dir($targetDir)) {
    @mkdir($targetDir, 0775, true);
  }
  $root = dirname(__DIR__, 3);
  $stored = [];
  $idx = 0;
  foreach ($files as $file) {
    $idx++;
    $tmpName = (string)($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_file($tmpName)) {
      continue;
    }
    $size = (int)($file['size'] ?? @filesize($tmpName) ?: 0);
    if ($size > 10 * 1024 * 1024) {
      if ($finfo) {
        finfo_close($finfo);
      }
      return ['ok' => false, 'error' => 'Cada anexo pode ter no máximo 10MB.'];
    }
    $mime = $finfo ? (string)(finfo_file($finfo, $tmpName) ?: '') : (string)($file['type'] ?? '');
    $allowed = str_starts_with($mime, 'image/') || $mime === 'application/pdf';
    if (!$allowed) {
      if ($finfo) {
        finfo_close($finfo);
      }
      return ['ok' => false, 'error' => 'Formato de anexo inválido. Use apenas imagens ou PDF.'];
    }
    $originalName = (string)($file['name'] ?? ('arquivo_' . $idx));
    $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalName) ?: ('arquivo_' . $idx);
    $ext = pathinfo($safeName, PATHINFO_EXTENSION);
    $fileName = strtolower($ticketCode) . '_' . $idx . '_' . time() . ($ext !== '' ? '.' . strtolower($ext) : '');
    $targetPath = rtrim($targetDir, '/') . '/' . $fileName;
    $ok = @move_uploaded_file($tmpName, $targetPath);
    if (!$ok && is_file($tmpName)) {
      $ok = @copy($tmpName, $targetPath);
    }
    if (!$ok) {
      if ($finfo) {
        finfo_close($finfo);
      }
      return ['ok' => false, 'error' => 'Não foi possível salvar um dos anexos enviados.'];
    }
    $stored[] = [
      'name' => $safeName,
      'path' => str_replace($root . '/', '', $targetPath),
      'mime' => $mime,
      'size' => $size,
    ];
  }
  if ($finfo) {
    finfo_close($finfo);
  }
  return ['ok' => true, 'files' => $stored];
}

function site24hEnv(string $key, string $default = ''): string {
  $value = getenv($key);
  if ($value === false) {
    return $default;
  }
  $value = trim((string)$value);
  return $value !== '' ? $value : $default;
}

function site24hSlugify(string $value): string {
  $value = trim((string)$value);
  if ($value === '') {
    return 'cliente';
  }
  $value = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
  $value = strtolower($value);
  $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?: '';
  $value = trim($value, '-');
  return $value !== '' ? $value : 'cliente';
}

function site24hBuildOrgSlug(string $legalName, string $orgId): string {
  $prefix = site24hSlugify($legalName);
  $suffix = substr(str_replace('-', '', strtolower($orgId)), 0, 8);
  if ($suffix === '') {
    $suffix = '00000000';
  }
  return $prefix . '-' . $suffix;
}

function site24hClientProjectsRoot(): string {
  return rtrim(site24hEnv('CLIENT_PROJECTS_ROOT', '/home/server/projects/clientes'), '/');
}

function site24hTemplateLibraryRoot(): string {
  return rtrim(site24hEnv('SITE24H_TEMPLATE_LIBRARY_ROOT', '/home/server/projects/projeto-area-cliente/storage/site-models'), '/');
}

function site24hBuildPreviewUrl(string $orgSlug, string $releaseLabel, string $variantCode, string $entryFile = 'index.html'): string {
  $base = rtrim(site24hEnv('CRM_PUBLIC_BASE_URL', 'https://koddacrm.koddahub.com.br'), '/');
  $entry = ltrim(trim($entryFile), '/');
  if ($entry === '') {
    $entry = 'index.html';
  }
  $query = http_build_query([
    'release' => $releaseLabel,
    'variant' => strtolower($variantCode),
    'entry' => $entry,
  ]);
  return $base . '/' . rawurlencode($orgSlug) . '/previewv1?' . $query;
}

function site24hEnsureReleaseTables(): void {
  static $ready = false;
  if ($ready) {
    return;
  }

  db()->exec("
    CREATE TABLE IF NOT EXISTS crm.deal_site_release (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      version INT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      project_root VARCHAR(500) NOT NULL,
      assets_path VARCHAR(500) NOT NULL,
      prompt_md_path VARCHAR(500),
      prompt_json_path VARCHAR(500),
      created_by VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (deal_id, version)
    )
  ");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version ON crm.deal_site_release(deal_id, version DESC)");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_status ON crm.deal_site_release(deal_id, status)");

  db()->exec("
    CREATE TABLE IF NOT EXISTS crm.deal_site_variant (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      variant_code VARCHAR(10) NOT NULL,
      folder_path VARCHAR(500) NOT NULL,
      entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
      preview_url VARCHAR(500),
      source_hash VARCHAR(128),
      status VARCHAR(40) NOT NULL DEFAULT 'BASE_PREPARED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (release_id, variant_code)
    )
  ");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_deal_site_variant_release_status ON crm.deal_site_variant(release_id, status)");

  db()->exec("
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      asset_type VARCHAR(40) NOT NULL,
      original_path VARCHAR(500) NOT NULL,
      release_path VARCHAR(500) NOT NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ");
  db()->exec("CREATE INDEX IF NOT EXISTS idx_deal_prompt_asset_release_type ON crm.deal_prompt_asset(release_id, asset_type)");

  $ready = true;
}

function site24hVariantFolders(): array {
  return [
    'V1' => 'modelo_v1',
    'V2' => 'modelo_v2',
    'V3' => 'modelo_v3',
  ];
}

function site24hTemplateCodesByVariant(): array {
  return [
    'V1' => 'template_v1_institucional_1pagina',
    'V2' => 'template_v2_institucional_3paginas',
    'V3' => 'template_v3_institucional_chatbot',
  ];
}

function site24hResolveTemplateCatalog(): array {
  db()->exec("
    CREATE TABLE IF NOT EXISTS crm.template_model_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      root_path VARCHAR(500) NOT NULL,
      entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ");
  $rows = db()->all("
    SELECT code, root_path, entry_file, is_default
    FROM crm.template_model_catalog
    WHERE is_active=true
  ");
  $map = [];
  foreach ($rows as $row) {
    $code = strtolower(trim((string)$row['code']));
    if ($code === '') {
      continue;
    }
    $map[$code] = [
      'root_path' => (string)$row['root_path'],
      'entry_file' => trim((string)($row['entry_file'] ?? 'index.html')) ?: 'index.html',
      'is_default' => (bool)($row['is_default'] ?? false),
    ];
  }

  $libraryRoot = site24hTemplateLibraryRoot();
  foreach (site24hTemplateCodesByVariant() as $variant => $code) {
    $normalized = strtolower($code);
    if (!isset($map[$normalized])) {
      $fallbackFolder = match ($variant) {
        'V1' => 'template_v1_institucional_1pagina',
        'V2' => 'template_v2_institucional_3paginas',
        default => 'template_v3_institucional_chatbot',
      };
      $map[$normalized] = [
        'root_path' => $libraryRoot . '/' . $fallbackFolder,
        'entry_file' => 'index.html',
        'is_default' => $variant === 'V1',
      ];
    }
  }

  return $map;
}

function site24hCopyDirectory(string $sourceDir, string $targetDir): void {
  if (!is_dir($sourceDir)) {
    return;
  }
  if (!is_dir($targetDir)) {
    @mkdir($targetDir, 0775, true);
  }

  $it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($sourceDir, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
  );
  foreach ($it as $item) {
    $sourcePath = (string)$item->getPathname();
    $relative = substr($sourcePath, strlen(rtrim($sourceDir, '/')) + 1);
    if ($relative === false) {
      continue;
    }
    $targetPath = rtrim($targetDir, '/') . '/' . str_replace('\\', '/', $relative);
    if ($item->isDir()) {
      if (!is_dir($targetPath)) {
        @mkdir($targetPath, 0775, true);
      }
      continue;
    }
    $targetParent = dirname($targetPath);
    if (!is_dir($targetParent)) {
      @mkdir($targetParent, 0775, true);
    }
    @copy($sourcePath, $targetPath);
  }
}

function site24hWriteAtomic(string $targetFile, string $content): bool {
  $parent = dirname($targetFile);
  if (!is_dir($parent)) {
    @mkdir($parent, 0775, true);
  }
  $tmp = $targetFile . '.tmp_' . bin2hex(random_bytes(6));
  $ok = @file_put_contents($tmp, $content);
  if ($ok === false) {
    @unlink($tmp);
    return false;
  }
  if (!@rename($tmp, $targetFile)) {
    @unlink($tmp);
    return false;
  }
  return true;
}

function site24hDirectoryIsEmpty(string $dir): bool {
  if (!is_dir($dir)) {
    return true;
  }
  $entries = @scandir($dir);
  if (!is_array($entries)) {
    return true;
  }
  foreach ($entries as $entry) {
    if ($entry === '.' || $entry === '..') {
      continue;
    }
    return false;
  }
  return true;
}

function site24hCopyIfMissingOrEmpty(string $sourceDir, string $targetDir, string $entryFile = 'index.html'): bool {
  if (!is_dir($sourceDir)) {
    return false;
  }
  if (!is_dir($targetDir)) {
    @mkdir($targetDir, 0775, true);
  }
  $entryPath = rtrim($targetDir, '/') . '/' . ltrim($entryFile, '/');
  $shouldCopy = site24hDirectoryIsEmpty($targetDir) || !is_file($entryPath);
  if (!$shouldCopy) {
    return false;
  }
  site24hCopyDirectory($sourceDir, $targetDir);
  return true;
}

function site24hResolveActiveRelease(string $dealId): ?array {
  $row = db()->one("
    SELECT id, version, status, project_root, assets_path, prompt_md_path, prompt_json_path
    FROM crm.deal_site_release
    WHERE deal_id=:did
      AND status IN ('DRAFT','READY','IN_REVIEW')
    ORDER BY version DESC, updated_at DESC
    LIMIT 1
  ", [':did' => $dealId]);
  return $row ?: null;
}

function site24hBuildIdentityVisualMarkdown(array $params): string {
  $organizationName = trim((string)($params['organization_name'] ?? 'Cliente'));
  $promptJson = is_array($params['prompt_json'] ?? null) ? $params['prompt_json'] : [];
  $identity = is_array($promptJson['identity'] ?? null) ? $promptJson['identity'] : [];
  $business = is_array($promptJson['business'] ?? null) ? $promptJson['business'] : [];
  $style = is_array($promptJson['style'] ?? null) ? $promptJson['style'] : [];
  $content = is_array($promptJson['content'] ?? null) ? $promptJson['content'] : [];

  $palette = trim((string)($identity['paleta_cores'] ?? ($style['paleta_cores'] ?? 'Nao informado')));
  $tone = trim((string)($style['tom_voz'] ?? 'nao informado'));
  $cta = trim((string)($style['cta_principal'] ?? 'Fale conosco'));
  $objective = trim((string)($business['objetivo_principal'] ?? 'nao informado'));
  $audience = trim((string)($business['publico_alvo'] ?? 'nao informado'));
  $logoStatus = !empty($identity['possui_logo']) ? 'recebido' : 'pendente';
  $manualStatus = !empty($identity['possui_manual_marca']) ? 'recebido' : 'pendente';
  $contentStatus = trim((string)($content['status_conteudo'] ?? 'nao informado'));

  $manualRefs = array_values(array_filter(array_map(
    static fn($item) => trim((string)$item),
    (array)($params['manual_assets'] ?? [])
  )));
  $allAssets = array_values(array_filter(array_map(
    static fn($item) => trim((string)$item),
    (array)($params['all_assets'] ?? [])
  )));

  $lines = [];
  $lines[] = '# Identidade Visual - Site24h';
  $lines[] = '';
  $lines[] = '- Cliente: **' . ($organizationName !== '' ? $organizationName : 'Cliente') . '**';
  $lines[] = '- Atualizado em: **' . date('c') . '**';
  $lines[] = '';
  $lines[] = '## Diretrizes principais';
  $lines[] = '- Paleta de cores: **' . ($palette !== '' ? $palette : 'Nao informado') . '**';
  $lines[] = '- Tom de voz: **' . ($tone !== '' ? $tone : 'nao informado') . '**';
  $lines[] = '- CTA principal: **' . ($cta !== '' ? $cta : 'Fale conosco') . '**';
  $lines[] = '';
  $lines[] = '## Contexto de negocio';
  $lines[] = '- Objetivo principal: ' . ($objective !== '' ? $objective : 'nao informado');
  $lines[] = '- Publico-alvo: ' . ($audience !== '' ? $audience : 'nao informado');
  $lines[] = '';
  $lines[] = '## Status de assets';
  $lines[] = '- Logo: **' . $logoStatus . '**';
  $lines[] = '- Manual de marca: **' . $manualStatus . '**';
  $lines[] = '- Conteudo (textos/imagens): **' . ($contentStatus !== '' ? $contentStatus : 'nao informado') . '**';
  $lines[] = '';
  $lines[] = '## Referencias de manual de marca';
  if (count($manualRefs) > 0) {
    foreach ($manualRefs as $item) {
      $lines[] = '- ' . $item;
    }
  } else {
    $lines[] = '- Nao informado';
  }
  $lines[] = '';
  $lines[] = '## Inventario de arquivos recebidos';
  if (count($allAssets) > 0) {
    foreach ($allAssets as $item) {
      $lines[] = '- ' . $item;
    }
  } else {
    $lines[] = '- Nenhum arquivo recebido.';
  }
  $lines[] = '';
  $lines[] = '## Regras de aplicacao visual';
  $lines[] = '- Aplicar identidade em header e footer de todas as variantes.';
  $lines[] = '- Manter contraste minimo AA para textos e botoes.';
  $lines[] = '- Priorizar logo oficial; se ausente, usar placeholder tecnico.';
  $lines[] = '- Preservar responsividade desktop/mobile sem quebrar grid base.';
  $lines[] = '';

  return implode("\n", $lines);
}

function site24hAssetTypeByPath(string $path): string {
  $name = strtolower(basename($path));
  if (str_contains($name, 'logo')) {
    return 'logo';
  }
  if (str_contains($name, 'manual') || str_contains($name, 'brand')) {
    return 'manual';
  }
  if (str_contains($name, 'conteudo') || str_contains($name, 'content')) {
    return 'conteudo';
  }
  return 'outro';
}

function site24hWriteLogoPlaceholder(string $targetFile): void {
  $svg = <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96" role="img" aria-label="Logo temporaria">
  <rect width="320" height="96" rx="16" fill="#0f172a"/>
  <circle cx="48" cy="48" r="24" fill="#f59e0b"/>
  <text x="88" y="44" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#f8fafc">Logo</text>
  <text x="88" y="66" font-family="Arial, sans-serif" font-size="14" fill="#cbd5e1">placeholder tecnico</text>
</svg>
SVG;
  @file_put_contents($targetFile, $svg);
}

function site24hDefaultAssetSourceWhitelist(): array {
  return [
    'https://unsplash.com',
    'https://www.pexels.com',
    'https://pixabay.com',
    'https://openverse.org',
    'https://commons.wikimedia.org',
    'https://burst.shopify.com',
    'https://www.svgrepo.com',
    'https://heroicons.com',
    'https://tabler.io/icons',
    'https://lucide.dev/icons',
    'https://undraw.co',
    'https://storyset.com',
  ];
}

function site24hProvisionReleaseForBrief(array $params): ?array {
  site24hEnsureReleaseTables();

  $dealId = trim((string)($params['deal_id'] ?? ''));
  $organizationId = trim((string)($params['organization_id'] ?? ''));
  $organizationName = trim((string)($params['organization_name'] ?? 'Cliente'));
  if ($dealId === '' || $organizationId === '') {
    return null;
  }

  $projectRoot = site24hClientProjectsRoot();
  $orgSlug = site24hBuildOrgSlug($organizationName, $organizationId);
  $orgRoot = $projectRoot . '/' . $orgSlug;
  $releasesRoot = $orgRoot . '/releases';
  @mkdir($releasesRoot, 0775, true);

  $activeRelease = site24hResolveActiveRelease($dealId);
  $releaseReused = false;
  if ($activeRelease) {
    $releaseId = (string)($activeRelease['id'] ?? '');
    $version = (int)($activeRelease['version'] ?? 0);
    $releaseLabel = 'v' . $version;
    $releaseRoot = trim((string)($activeRelease['project_root'] ?? ''));
    if ($releaseRoot === '') {
      $releaseRoot = $releasesRoot . '/' . $releaseLabel;
    }
    $assetsPath = trim((string)($activeRelease['assets_path'] ?? ''));
    if ($assetsPath === '') {
      $assetsPath = $orgRoot . '/assets';
    }
    $releaseReused = true;
  } else {
    $max = db()->one("SELECT COALESCE(MAX(version), 0) AS version FROM crm.deal_site_release WHERE deal_id=:did", [
      ':did' => $dealId,
    ]);
    $version = ((int)($max['version'] ?? 0)) + 1;
    $releaseLabel = 'v' . $version;
    $releaseRoot = $releasesRoot . '/' . $releaseLabel;
    $assetsPath = $orgRoot . '/assets';
    $releaseId = '';
  }

  @mkdir($releaseRoot, 0775, true);
  @mkdir($assetsPath, 0775, true);

  $promptJsonPath = $orgRoot . '/prompt_personalizacao.json';
  $promptMdPath = $orgRoot . '/prompt_personalizacao.md';
  $masterPromptPath = $orgRoot . '/prompt_pai_orquestrador.md';
  $identityPath = $orgRoot . '/identidade_visual.md';
  $manifestPath = $orgRoot . '/release_manifest.json';
  $assetsManifestPath = $assetsPath . '/assets_manifest.json';

  $prompt = is_array($params['prompt'] ?? null) ? $params['prompt'] : [];
  $promptJson = $prompt['json'] ?? [];
  $promptMarkdown = trim((string)($prompt['markdown'] ?? ''));
  $fileWarnings = [];
  if ($promptMarkdown === '') {
    $promptMarkdown = trim((string)($prompt['text'] ?? ''));
  }

  if (!site24hWriteAtomic($promptJsonPath, json_encode($promptJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) {
    $fileWarnings[] = 'Falha ao salvar prompt_personalizacao.json na raiz do cliente.';
  }
  if (!site24hWriteAtomic($promptMdPath, $promptMarkdown !== '' ? $promptMarkdown : '# Prompt de personalizacao')) {
    $fileWarnings[] = 'Falha ao salvar prompt_personalizacao.md na raiz do cliente.';
  }
  $masterPrompt = trim((string)($prompt['master_prompt_markdown'] ?? ($promptJson['master_prompt_markdown'] ?? '')));
  if ($masterPrompt === '') {
    $masterPrompt = "# Prompt Pai Orquestrador - Site24h\n\nEste arquivo define as regras globais de qualidade e completude para execucao dos prompts V1/V2/V3.\n";
  }
  if (!site24hWriteAtomic($masterPromptPath, $masterPrompt)) {
    $fileWarnings[] = 'Falha ao salvar prompt_pai_orquestrador.md na raiz do cliente.';
  }
  $variantPrompts = is_array($promptJson['variant_prompts'] ?? null) ? $promptJson['variant_prompts'] : [];
  $variantDraftPaths = [
    'V1' => $orgRoot . '/prompt_v1_draft.md',
    'V2' => $orgRoot . '/prompt_v2_draft.md',
    'V3' => $orgRoot . '/prompt_v3_draft.md',
  ];
  foreach ($variantDraftPaths as $variantCode => $draftPath) {
    $content = trim((string)($variantPrompts[$variantCode] ?? ''));
    if ($content === '') {
      $content = $promptMarkdown !== '' ? $promptMarkdown : '# Prompt de personalizacao';
    }
    if (!site24hWriteAtomic($draftPath, $content)) {
      $fileWarnings[] = 'Falha ao salvar ' . basename($draftPath) . ' na raiz do cliente.';
    }
  }

  if ($releaseReused) {
    db()->exec("
      UPDATE crm.deal_site_release
      SET status='DRAFT', project_root=:project_root, assets_path=:assets_path, prompt_md_path=:prompt_md_path, prompt_json_path=:prompt_json_path, updated_at=now()
      WHERE id=:id
    ", [
      ':id' => $releaseId,
      ':project_root' => $releaseRoot,
      ':assets_path' => $assetsPath,
      ':prompt_md_path' => $promptMdPath,
      ':prompt_json_path' => $promptJsonPath,
    ]);
  } else {
    $release = db()->one("
      INSERT INTO crm.deal_site_release(
        deal_id, version, status, project_root, assets_path, prompt_md_path, prompt_json_path, created_by, created_at, updated_at
      )
      VALUES(
        :deal_id, :version, 'DRAFT', :project_root, :assets_path, :prompt_md_path, :prompt_json_path, :created_by, now(), now()
      )
      RETURNING id
    ", [
      ':deal_id' => $dealId,
      ':version' => $version,
      ':project_root' => $releaseRoot,
      ':assets_path' => $assetsPath,
      ':prompt_md_path' => $promptMdPath,
      ':prompt_json_path' => $promptJsonPath,
      ':created_by' => (string)($params['created_by'] ?? 'CLIENT_PORTAL'),
    ]);
    $releaseId = (string)($release['id'] ?? '');
    if ($releaseId === '') {
      return null;
    }
  }

  $catalog = site24hResolveTemplateCatalog();
  $variantFolders = site24hVariantFolders();
  $variantCodes = site24hTemplateCodesByVariant();
  $variants = [];
  foreach ($variantFolders as $variantCode => $folderName) {
    $catalogCode = strtolower($variantCodes[$variantCode] ?? '');
    $model = $catalog[$catalogCode] ?? null;
    $sourceRoot = trim((string)($model['root_path'] ?? ''));
    $entryFile = trim((string)($model['entry_file'] ?? 'index.html')) ?: 'index.html';
    $variantRoot = $releaseRoot . '/' . $folderName;
    @mkdir($variantRoot, 0775, true);
    if ($sourceRoot !== '' && is_dir($sourceRoot)) {
      site24hCopyIfMissingOrEmpty($sourceRoot, $variantRoot, $entryFile);
    }

    $previewUrl = site24hBuildPreviewUrl($orgSlug, $releaseLabel, strtolower($variantCode), $entryFile);
    db()->exec("
      INSERT INTO crm.deal_site_variant(
        release_id, variant_code, folder_path, entry_file, preview_url, status, created_at, updated_at
      )
      VALUES(
        :release_id, :variant_code, :folder_path, :entry_file, :preview_url, 'BASE_PREPARED', now(), now()
      )
      ON CONFLICT (release_id, variant_code)
      DO UPDATE SET
        folder_path=EXCLUDED.folder_path,
        entry_file=EXCLUDED.entry_file,
        preview_url=EXCLUDED.preview_url,
        updated_at=now()
    ", [
      ':release_id' => $releaseId,
      ':variant_code' => $variantCode,
      ':folder_path' => $variantRoot,
      ':entry_file' => $entryFile,
      ':preview_url' => $previewUrl,
    ]);

    $variants[] = [
      'variantCode' => $variantCode,
      'folderPath' => $variantRoot,
      'entryFile' => $entryFile,
      'previewUrl' => $previewUrl,
      'templateModelCode' => $catalogCode,
      'sourceRoot' => $sourceRoot,
    ];
  }

  $root = dirname(__DIR__, 3);
  $uploadedFiles = array_values(array_filter(array_map(static fn($item) => trim((string)$item), (array)($params['uploaded_files'] ?? []))));
  $logoCount = 0;
  foreach ($uploadedFiles as $relativePath) {
    if ($relativePath === '' || str_contains($relativePath, '..')) {
      continue;
    }
    $source = $root . '/' . ltrim($relativePath, '/');
    if (!is_file($source)) {
      continue;
    }

    $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($source)) ?: 'asset.bin';
    $target = $assetsPath . '/' . uniqid('asset_', true) . '_' . $safeName;
    if (!@copy($source, $target)) {
      continue;
    }

    $assetType = site24hAssetTypeByPath($safeName);
    if ($assetType === 'logo') {
      $logoCount++;
    }

    db()->exec("
      INSERT INTO crm.deal_prompt_asset(release_id, asset_type, original_path, release_path, meta_json, created_at)
      VALUES(:release_id, :asset_type, :original_path, :release_path, :meta_json::jsonb, now())
    ", [
      ':release_id' => $releaseId,
      ':asset_type' => $assetType,
      ':original_path' => $relativePath,
      ':release_path' => $target,
      ':meta_json' => json_encode([
        'file_name' => $safeName,
        'size' => @filesize($target) ?: null,
      ], JSON_UNESCAPED_UNICODE),
    ]);
  }

  if ($logoCount === 0 && !is_file($assetsPath . '/logo_placeholder.svg')) {
    $placeholderFile = $assetsPath . '/logo_placeholder.svg';
    site24hWriteLogoPlaceholder($placeholderFile);
    db()->exec("
      INSERT INTO crm.deal_prompt_asset(release_id, asset_type, original_path, release_path, meta_json, created_at)
      VALUES(:release_id, 'logo', 'generated:logo_placeholder', :release_path, :meta_json::jsonb, now())
    ", [
      ':release_id' => $releaseId,
      ':release_path' => $placeholderFile,
      ':meta_json' => json_encode(['generated' => true], JSON_UNESCAPED_UNICODE),
    ]);
  }

  $manualAssets = [];
  $allAssets = [];
  $allAssetRows = [];
  foreach (db()->all("SELECT asset_type, release_path FROM crm.deal_prompt_asset WHERE release_id=:rid ORDER BY created_at ASC", [':rid' => $releaseId]) as $assetRow) {
    $assetPath = (string)($assetRow['release_path'] ?? '');
    if ($assetPath === '') continue;
    $allAssetRows[] = [
      'asset_type' => (string)($assetRow['asset_type'] ?? 'outro'),
      'release_path' => $assetPath,
    ];
    $allAssets[] = $assetPath;
    if ((string)($assetRow['asset_type'] ?? '') === 'manual') {
      $manualAssets[] = $assetPath;
    }
  }

  $identityMarkdown = site24hBuildIdentityVisualMarkdown([
    'organization_name' => $organizationName,
    'prompt_json' => $promptJson,
    'manual_assets' => $manualAssets,
    'all_assets' => $allAssets,
  ]);
  if (is_array($promptJson) && trim((string)($promptJson['identity_markdown'] ?? '')) !== '') {
    $identityMarkdown = (string)$promptJson['identity_markdown'];
  }
  if (!site24hWriteAtomic($identityPath, $identityMarkdown)) {
    $fileWarnings[] = 'Falha ao salvar identidade_visual.md na raiz do cliente.';
  }

  $sourceWhitelist = (array)($promptJson['assets_manifest_schema']['allowed_sources'] ?? []);
  $sourceWhitelist = array_values(array_filter(array_map(static fn($item) => trim((string)$item), $sourceWhitelist)));
  if (count($sourceWhitelist) === 0) {
    $sourceWhitelist = site24hDefaultAssetSourceWhitelist();
  }
  $manifestAssets = [];
  foreach ($allAssetRows as $assetRow) {
    $localPath = trim((string)($assetRow['release_path'] ?? ''));
    if ($localPath === '') {
      continue;
    }
    $manifestAssets[] = [
      'category' => (string)($assetRow['asset_type'] ?? 'outro'),
      'local_path' => $localPath,
      'source_url' => null,
      'license' => 'local_upload_or_generated',
      'attribution_required' => false,
      'downloaded_at' => date('c'),
    ];
  }
  if (!site24hWriteAtomic($assetsManifestPath, json_encode([
    'version' => '1.0',
    'generatedAt' => date('c'),
    'organizationId' => $organizationId,
    'organizationSlug' => $orgSlug,
    'releaseId' => $releaseId,
    'releaseLabel' => $releaseLabel,
    'allowed_sources' => $sourceWhitelist,
    'assets' => $manifestAssets,
  ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) {
    $fileWarnings[] = 'Falha ao salvar assets/assets_manifest.json.';
  }

  if (!site24hWriteAtomic($manifestPath, json_encode([
    'dealId' => $dealId,
    'organizationId' => $organizationId,
    'organizationSlug' => $orgSlug,
    'releaseId' => $releaseId,
    'releaseVersion' => $version,
    'releaseLabel' => $releaseLabel,
    'releaseReused' => $releaseReused,
    'createdAt' => date('c'),
    'variants' => $variants,
  ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) {
    $fileWarnings[] = 'Falha ao salvar release_manifest.json.';
  }

  return [
    'releaseReused' => $releaseReused,
    'releaseId' => $releaseId,
    'releaseVersion' => $version,
    'releaseLabel' => $releaseLabel,
    'orgSlug' => $orgSlug,
    'clientRoot' => $orgRoot,
    'releaseRoot' => $releaseRoot,
    'assetsPath' => $assetsPath,
    'promptMdPath' => $promptMdPath,
    'promptJsonPath' => $promptJsonPath,
    'masterPromptPath' => $masterPromptPath,
    'identityPath' => $identityPath,
    'manifestPath' => $manifestPath,
    'assetsManifestPath' => $assetsManifestPath,
    'variantDraftPaths' => $variantDraftPaths,
    'fileWarnings' => $fileWarnings,
    'variants' => $variants,
  ];
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
    // Defensive recovery: infer the most advanced persisted stage instead of
    // blindly resetting to briefing when no ACTIVE row exists.
    $latestApproval = db()->one("
      SELECT status
      FROM crm.deal_client_approval
      WHERE deal_id=:did
      ORDER BY created_at DESC
      LIMIT 1
    ", [':did' => $dealId]);
    $latestTemplate = db()->one("
      SELECT status
      FROM crm.deal_template_revision
      WHERE deal_id=:did
      ORDER BY version DESC, created_at DESC
      LIMIT 1
    ", [':did' => $dealId]);
    $latestOperation = db()->one("
      SELECT stage_code
      FROM crm.deal_operation
      WHERE deal_id=:did
      ORDER BY stage_order DESC, updated_at DESC, started_at DESC
      LIMIT 1
    ", [':did' => $dealId]);
    $latestActivity = db()->one("
      SELECT activity_type
      FROM crm.deal_activity
      WHERE deal_id=:did
        AND activity_type IN ('CLIENT_APPROVAL_REQUESTED','CLIENT_REQUESTED_CHANGES','CLIENT_APPROVED')
      ORDER BY created_at DESC
      LIMIT 1
    ", [':did' => $dealId]);

    $approvalStatus = strtoupper((string)($latestApproval['status'] ?? ''));
    $templateStatus = strtoupper((string)($latestTemplate['status'] ?? ''));
    $operationStage = trim((string)($latestOperation['stage_code'] ?? ''));
    $activityType = strtoupper((string)($latestActivity['activity_type'] ?? ''));

    $targetStage = 'briefing_pendente';
    if ($approvalStatus === 'PENDING'
      || in_array($templateStatus, ['SENT_CLIENT', 'IN_REVIEW'], true)
      || $activityType === 'CLIENT_APPROVAL_REQUESTED'
      || $operationStage === 'aprovacao_cliente'
    ) {
      $targetStage = 'aprovacao_cliente';
    } elseif ($approvalStatus === 'CHANGES_REQUESTED'
      || $templateStatus === 'NEEDS_ADJUSTMENTS'
      || $activityType === 'CLIENT_REQUESTED_CHANGES'
      || $operationStage === 'ajustes'
    ) {
      $targetStage = 'ajustes';
    } elseif ($approvalStatus === 'APPROVED'
      || $templateStatus === 'APPROVED_CLIENT'
      || $activityType === 'CLIENT_APPROVED'
      || $operationStage === 'publicacao'
    ) {
      $targetStage = 'publicacao';
    } elseif ($templateStatus !== '' || in_array($operationStage, ['template_v1', 'pre_prompt'], true)) {
      $targetStage = $operationStage !== '' ? $operationStage : 'template_v1';
    }

    moveDealOperationStage($dealId, $targetStage);
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

function deriveProjectDealStageAndLifecycle(?string $projectStatus): array {
  $status = strtoupper(trim((string)$projectStatus));
  if (in_array($status, ['CANCELED', 'CANCELLED'], true)) {
    return ['stage_code' => 'perdido', 'lifecycle' => 'LOST', 'closed' => true];
  }
  if ($status === 'ACTIVE') {
    return ['stage_code' => 'pagamento_pendente', 'lifecycle' => 'OPEN', 'closed' => false];
  }
  return ['stage_code' => 'cadastro_iniciado', 'lifecycle' => 'OPEN', 'closed' => false];
}

function syncProjectDealByOrganization(
  string $organizationId,
  array $project,
  ?string $planCode = null,
  ?float $effectivePrice = null,
  string $reason = 'portal_project_sync'
): ?string {
  $projectId = trim((string)($project['id'] ?? ''));
  if ($projectId === '') {
    return null;
  }

  $domain = trim((string)($project['domain'] ?? ''));
  $safePlanCode = $planCode !== null ? strtolower(trim($planCode)) : null;
  $projectType = strtolower(trim((string)($project['project_type'] ?? 'hospedagem')));
  $deal = db()->one("
    SELECT id::text AS id, metadata
    FROM crm.deal
    WHERE organization_id = CAST(:oid AS uuid)
      AND deal_type = 'HOSPEDAGEM'
    ORDER BY
      CASE WHEN lifecycle_status = 'CLIENT' THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  ", [':oid' => $organizationId]);
  if (!$deal || empty($deal['id'])) {
    return null;
  }

  $projectMeta = [
    'source' => 'client_portal_project',
    'project_id' => $projectId,
    'project_domain' => $domain !== '' ? $domain : null,
    'project_type' => $projectType,
    'project_status' => strtoupper((string)($project['status'] ?? 'PENDING')),
    'plan_code' => $safePlanCode,
    'effective_price' => $effectivePrice,
    'sync_reason' => $reason,
    'synced_at' => gmdate(DATE_ATOM),
  ];
  db()->exec("
    UPDATE crm.deal
    SET
      plan_code = coalesce(:plan_code, plan_code),
      value_cents = coalesce(CAST(:value_cents AS integer), value_cents),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('last_project_sync', CAST(:project_meta AS jsonb)),
      updated_at = now()
    WHERE id = CAST(:id AS uuid)
  ", [
    ':id' => (string)$deal['id'],
    ':plan_code' => $safePlanCode,
    ':value_cents' => $effectivePrice !== null ? (int)round($effectivePrice * 100) : null,
    ':project_meta' => safeJson($projectMeta),
  ]);

  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(CAST(:deal_id AS uuid), 'FLOW_UPDATE', :content, CAST(:metadata AS jsonb), 'CLIENT_PORTAL')
  ", [
    ':deal_id' => (string)$deal['id'],
    ':content' => 'Projeto sincronizado pela área do cliente (sem criação de novo deal).',
    ':metadata' => safeJson($projectMeta),
  ]);

  return (string)$deal['id'];
}

function parseReleaseVariantFromProjectPath(?string $projectPath): array {
  $normalized = str_replace('\\', '/', (string)$projectPath);
  $releaseVersion = null;
  $variantCode = null;

  if (preg_match('#/releases/v([0-9]+)(?:/|$)#i', $normalized, $m)) {
    $releaseVersion = (int)$m[1];
  }
  if (preg_match('#/(modelo_v[123])(?:/|$)#i', $normalized, $m)) {
    $variantCode = strtoupper(str_replace('modelo_', '', strtolower($m[1])));
  }

  return [
    'release_version' => $releaseVersion,
    'variant_code' => $variantCode,
  ];
}

function syncReleaseStateByTemplateRevision(string $templateRevisionId, string $variantStatus, string $releaseStatus): void {
  site24hEnsureReleaseTables();
  $row = db()->one("
    SELECT id, deal_id, project_path
    FROM crm.deal_template_revision
    WHERE id=:id
    LIMIT 1
  ", [':id' => $templateRevisionId]);
  if (!$row) {
    return;
  }

  $parsed = parseReleaseVariantFromProjectPath((string)($row['project_path'] ?? ''));
  $releaseVersion = $parsed['release_version'] ?? null;
  $variantCode = $parsed['variant_code'] ?? null;
  if ($releaseVersion === null || $variantCode === null) {
    return;
  }

  $release = db()->one("
    SELECT id
    FROM crm.deal_site_release
    WHERE deal_id=:did
      AND version=:version
    LIMIT 1
  ", [
    ':did' => $row['deal_id'],
    ':version' => $releaseVersion,
  ]);
  if (!$release) {
    return;
  }

  db()->exec("
    UPDATE crm.deal_site_release
    SET status=:status, updated_at=now()
    WHERE id=:id
  ", [
    ':id' => $release['id'],
    ':status' => $releaseStatus,
  ]);
  db()->exec("
    UPDATE crm.deal_site_variant
    SET status=:status, updated_at=now()
    WHERE release_id=:rid
      AND upper(variant_code)=:variant
  ", [
    ':rid' => $release['id'],
    ':status' => $variantStatus,
    ':variant' => strtoupper((string)$variantCode),
  ]);
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

function approvalPendingContextByOrganization(string $organizationId): ?array {
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
    WHERE d.organization_id = :oid
      AND d.lifecycle_status = 'CLIENT'
      AND upper(COALESCE(d.deal_type, '')) = 'HOSPEDAGEM'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
    ORDER BY a.created_at DESC
    LIMIT 1
  ", [':oid' => $organizationId]);

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
  $templateVersion = (string)($ctx['template_version'] ?? '1');
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
  <div class="portal-wrap approval-wrap">
    <div class="portal-card approval-card">
      <h2>Aprovação do Site</h2>
      <p class="note">Projeto: <strong><?= h($title) ?></strong> • Cliente: <strong><?= h($orgName) ?></strong></p>
      <div class="approval-meta">
        <div><label>Status do link</label><strong><?= h((string)$statusText) ?><?= $isExpired ? ' (expirado)' : '' ?></strong></div>
        <div><label>Versão</label><strong><?= h('V' . $templateVersion) ?></strong></div>
        <div><label>Expira em</label><strong><?= h(!empty($ctx['expires_at']) ? date('d/m/Y H:i', strtotime((string)$ctx['expires_at'])) : 'N/D') ?></strong></div>
      </div>
      <?php if ($preview !== ''): ?>
        <div class="approval-preview">
          <a class="btn btn-ghost" href="<?= h($preview) ?>" target="_blank" rel="noreferrer">Abrir preview em tela cheia</a>
        </div>
      <?php endif; ?>
      <?php if ($note !== ''): ?>
        <div class="alert ok">Última observação enviada: <?= h($note) ?></div>
      <?php endif; ?>
      <div id="approvalNotice" class="alert hidden"></div>
      <?php if ($isPending && !$isExpired): ?>
        <div class="approval-actions">
          <button id="approveBtn" class="btn btn-primary" type="button">Aprovar site</button>
          <button id="changesBtn" class="btn btn-ghost" type="button">Solicitar ajustes</button>
        </div>
      <?php else: ?>
        <p>Este link já foi utilizado ou expirou. Solicite um novo envio pelo atendimento.</p>
      <?php endif; ?>
      <p><a href="/portal/dashboard#operacao">Voltar para o painel</a></p>
    </div>
  </div>

  <div class="portal-modal hidden" id="approvalConfirmModal" aria-hidden="true">
    <div class="portal-modal-backdrop"></div>
    <div class="portal-modal-dialog approval-dialog">
      <header class="portal-modal-header">
        <h3>Confirmar aprovação</h3>
      </header>
      <p>Ao aprovar, seu site seguirá para a etapa de publicação. Deseja continuar?</p>
      <div class="operation-actions">
        <button type="button" class="btn btn-primary" id="approveConfirmBtn">Sim, aprovar</button>
        <button type="button" class="btn btn-ghost" id="approveCancelBtn">Revisar novamente</button>
      </div>
    </div>
  </div>

  <div class="portal-modal hidden" id="requestChangesModal" aria-hidden="true">
    <div class="portal-modal-backdrop"></div>
    <div class="portal-modal-dialog approval-dialog">
      <header class="portal-modal-header">
        <h3>Solicitar ajustes no site</h3>
      </header>
      <form id="requestChangesForm" enctype="multipart/form-data">
        <div class="grid-2">
          <div class="form-col full">
            <label for="tipoAjuste">Tipo de ajuste *</label>
            <select id="tipoAjuste" name="tipo_ajuste" required>
              <option value="">Selecione...</option>
              <option>Alteração de texto/conteúdo</option>
              <option>Alteração de cores/estilo</option>
              <option>Reorganização de seções</option>
              <option>Adicionar/remover seções</option>
              <option>Ajustes de imagens</option>
              <option>Funcionalidades adicionais</option>
              <option>Correções de responsividade (mobile/tablet)</option>
              <option>Outro</option>
            </select>
          </div>
          <div class="form-col full">
            <label for="descricaoAjuste">Descreva detalhadamente o que deseja alterar *</label>
            <textarea id="descricaoAjuste" name="descricao_ajuste" rows="6" maxlength="2000" required placeholder="Descreva com detalhes (mínimo 100 caracteres)."></textarea>
            <div class="approval-counter-wrap">
              <small id="descricaoCounter">0 / 2000 (mínimo 100)</small>
              <div class="approval-counter-bar"><span id="descricaoCounterFill" style="width:0%"></span></div>
            </div>
          </div>
          <div class="form-col">
            <label for="prioridadeAjuste">Prioridade</label>
            <select id="prioridadeAjuste" name="prioridade">
              <option>Baixa</option>
              <option selected>Média</option>
              <option>Alta</option>
            </select>
          </div>
          <div class="form-col">
            <label for="anexosAjuste">Anexar referências (opcional)</label>
            <input id="anexosAjuste" type="file" name="anexos[]" accept="image/*,.pdf" multiple>
            <small>Até 5 arquivos, máximo 10MB por arquivo.</small>
          </div>
        </div>
        <div class="alert hidden" id="changesNotice"></div>
        <div class="operation-actions">
          <button type="button" class="btn btn-ghost" id="changesCancelBtn">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="changesSubmitBtn" disabled>Enviar solicitação</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    (function () {
      const token = <?= json_encode($token, JSON_UNESCAPED_UNICODE) ?>;
      const notice = document.getElementById('approvalNotice');
      const approveBtn = document.getElementById('approveBtn');
      const changesBtn = document.getElementById('changesBtn');
      const csrfToken = document.body?.dataset?.csrfToken || '';
      const approvalConfirmModal = document.getElementById('approvalConfirmModal');
      const requestChangesModal = document.getElementById('requestChangesModal');
      const requestChangesForm = document.getElementById('requestChangesForm');
      const descricaoEl = document.getElementById('descricaoAjuste');
      const counterEl = document.getElementById('descricaoCounter');
      const counterFillEl = document.getElementById('descricaoCounterFill');
      const changesSubmitBtn = document.getElementById('changesSubmitBtn');
      const changesNotice = document.getElementById('changesNotice');
      let sending = false;

      function show(msg, ok) {
        if (!notice) return;
        notice.textContent = msg || '';
        notice.classList.remove('hidden', 'ok', 'err');
        notice.classList.add(ok ? 'ok' : 'err');
      }

      function showChangesNotice(message, ok) {
        if (!changesNotice) return;
        changesNotice.textContent = message || '';
        changesNotice.classList.remove('hidden', 'ok', 'err');
        changesNotice.classList.add(ok ? 'ok' : 'err');
      }

      function openModal(el) {
        if (!el) return;
        el.classList.remove('hidden');
        el.setAttribute('aria-hidden', 'false');
      }

      function closeModal(el) {
        if (!el) return;
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      }

      function updateCounter() {
        if (!descricaoEl || !counterEl || !counterFillEl || !changesSubmitBtn) return;
        const value = String(descricaoEl.value || '');
        const len = value.trim().length;
        const ratio = Math.max(0, Math.min(100, Math.round((len / 100) * 100)));
        counterEl.textContent = `${len} / 2000 (mínimo 100)`;
        counterEl.classList.toggle('counter-valid', len >= 100);
        counterEl.classList.toggle('counter-invalid', len < 100);
        counterFillEl.style.width = `${ratio}%`;
        changesSubmitBtn.disabled = len < 100 || sending;
      }

      async function sendApprove() {
        if (sending) return;
        sending = true;
        approveBtn?.setAttribute('disabled', 'disabled');
        const res = await fetch(`/api/portal/approval/${token}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ note: 'Aprovação registrada pelo cliente.' })
        });
        const payload = await res.json();
        sending = false;
        approveBtn?.removeAttribute('disabled');
        closeModal(approvalConfirmModal);
        if (!res.ok) {
          show(payload.error || 'Falha ao registrar aprovação.', false);
          return;
        }
        show('Aprovação registrada com sucesso.', true);
        setTimeout(() => { window.location.href = '/portal/dashboard#operacao'; }, 900);
      }

      if (approveBtn) {
        approveBtn.addEventListener('click', () => openModal(approvalConfirmModal));
      }
      document.getElementById('approveCancelBtn')?.addEventListener('click', () => closeModal(approvalConfirmModal));
      document.getElementById('approveConfirmBtn')?.addEventListener('click', sendApprove);

      if (changesBtn) {
        changesBtn.addEventListener('click', () => {
          showChangesNotice('', true);
          openModal(requestChangesModal);
          updateCounter();
        });
      }
      document.getElementById('changesCancelBtn')?.addEventListener('click', () => closeModal(requestChangesModal));
      descricaoEl?.addEventListener('input', updateCounter);
      updateCounter();

      requestChangesForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending) return;
        updateCounter();
        const descricao = String(descricaoEl?.value || '').trim();
        if (descricao.length < 100) {
          showChangesNotice('Descreva sua solicitação com no mínimo 100 caracteres.', false);
          return;
        }
        const formData = new FormData(requestChangesForm);
        sending = true;
        changesSubmitBtn?.setAttribute('disabled', 'disabled');
        const res = await fetch(`/api/portal/approval/${token}/request-changes`, {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken },
          body: formData
        });
        const payload = await res.json();
        sending = false;
        changesSubmitBtn?.removeAttribute('disabled');
        updateCounter();
        if (!res.ok) {
          showChangesNotice(payload.error || 'Falha ao enviar solicitação.', false);
          return;
        }
        showChangesNotice(`Solicitação enviada! Protocolo ${payload.ticket || '-'}.`, true);
        show('Solicitação de ajustes enviada com sucesso.', true);
        setTimeout(() => { window.location.href = '/portal/dashboard#operacao'; }, 1000);
      });
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

  $previousErrorHandler = set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    throw new \ErrorException($message, 0, $severity, $file, $line);
  });

  try {
  $d = $request->body;
  $required = [
    'name','email','password','phone','person_type','cpf_cnpj','legal_name','billing_email','plan_code',
    'billing_zip','billing_street','billing_number','billing_district','billing_city','billing_state',
    'card_holder_name','card_number','card_expiry_month','card_expiry_year','card_ccv'
  ];
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
  $cardNumberDigits = normalizeDigits((string)($d['card_number'] ?? ''));
  if (strlen($cardNumberDigits) < 13 || strlen($cardNumberDigits) > 19) {
    $errors['card_number'] = 'Número de cartão inválido';
  }
  $cardExpiryMonth = (int)normalizeDigits((string)($d['card_expiry_month'] ?? '0'));
  if ($cardExpiryMonth < 1 || $cardExpiryMonth > 12) {
    $errors['card_expiry_month'] = 'Mês de validade inválido';
  }
  $cardExpiryYear = (int)normalizeDigits((string)($d['card_expiry_year'] ?? '0'));
  if ($cardExpiryYear < (int)date('Y') || $cardExpiryYear > ((int)date('Y') + 20)) {
    $errors['card_expiry_year'] = 'Ano de validade inválido';
  }
  $cardCcv = normalizeDigits((string)($d['card_ccv'] ?? ''));
  if (strlen($cardCcv) < 3 || strlen($cardCcv) > 4) {
    $errors['card_ccv'] = 'CVV inválido';
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

  $remoteIp = getClientIp();
  $tokenPayload = [
    'customer' => $customer['id'] ?? null,
    'creditCard' => [
      'holderName' => trim((string)($d['card_holder_name'] ?? '')),
      'number' => $cardNumberDigits,
      'expiryMonth' => str_pad((string)$cardExpiryMonth, 2, '0', STR_PAD_LEFT),
      'expiryYear' => (string)$cardExpiryYear,
      'ccv' => $cardCcv,
    ],
    'creditCardHolderInfo' => [
      'name' => trim((string)$d['legal_name']),
      'email' => trim((string)$d['billing_email']),
      'cpfCnpj' => $docDigits,
      'postalCode' => $zipDigits,
      'addressNumber' => trim((string)$d['billing_number']),
      'phone' => $phoneDigits,
    ],
    'remoteIp' => $remoteIp,
  ];
  $tokenizeResult = $asaas->tokenizeCreditCard($tokenPayload);
  if ($usingAsaasApi && !(bool)($tokenizeResult['ok'] ?? false)) {
    db()->exec("DELETE FROM client.organizations WHERE id=:id", [':id' => $orgId]);
    db()->exec("DELETE FROM client.users WHERE id=:id", [':id' => $uid]);
    db()->exec("UPDATE crm.signup_session SET status='CHECKOUT_ERROR', metadata = coalesce(metadata,'{}'::jsonb) || :meta::jsonb, updated_at=now() WHERE id=:id", [
      ':id' => $signupSessionId,
      ':meta' => json_encode(['asaas_error' => ['tokenize' => $tokenizeResult['error_code'] ?? 'TOKENIZE_ERROR']], JSON_UNESCAPED_UNICODE),
    ]);
    $tokenizeErrorCode = strtoupper(trim((string)($tokenizeResult['error_code'] ?? '')));
    if (str_contains($tokenizeErrorCode, 'TOKEN') || str_contains($tokenizeErrorCode, 'CREDIT_CARD')) {
      apiError(
        'Tokenização não habilitada na conta Asaas. Solicite liberação ao gerente de contas.',
        422,
        'ASAAS_TOKENIZATION_NOT_ENABLED',
        'A tokenização de cartão precisa estar habilitada para concluir o cadastro.'
      );
      return;
    }
    apiError(
      $tokenizeResult['error_message_safe'] ?? 'Falha ao tokenizar cartão no Asaas.',
      502,
      'ASAAS_TOKENIZE_ERROR',
      'Revise os dados do cartão e tente novamente.'
    );
    return;
  }
  $tokenData = is_array($tokenizeResult['data'] ?? null) ? $tokenizeResult['data'] : [];
  $creditCardToken = trim((string)($tokenData['creditCardToken'] ?? $tokenData['token'] ?? ''));
  if ($creditCardToken === '' && !$usingAsaasApi) {
    $creditCardToken = 'mock_card_token_' . substr((string)$orgId, 0, 8);
  }
  if ($creditCardToken === '') {
    db()->exec("DELETE FROM client.organizations WHERE id=:id", [':id' => $orgId]);
    db()->exec("DELETE FROM client.users WHERE id=:id", [':id' => $uid]);
    apiError('Falha ao tokenizar cartão para criar assinatura.', 502, 'ASAAS_TOKENIZE_ERROR', 'Tente novamente em instantes.');
    return;
  }

  $subscriptionPayload = [
    'customer' => $customer['id'] ?? null,
    'billingType' => 'CREDIT_CARD',
    'creditCardToken' => $creditCardToken,
    'creditCardHolderInfo' => [
      'name' => trim((string)$d['legal_name']),
      'email' => trim((string)$d['billing_email']),
      'cpfCnpj' => $docDigits,
      'postalCode' => $zipDigits,
      'addressNumber' => trim((string)$d['billing_number']),
      'phone' => $phoneDigits,
    ],
    'remoteIp' => $remoteIp,
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

  $subscriptionResult = $asaas->createSubscriptionWithCreditCard($subscriptionPayload);
  $subscriptionData = is_array($subscriptionResult['data'] ?? null) ? $subscriptionResult['data'] : [];
  $subscriptionId = trim((string)($subscriptionData['id'] ?? ''));
  if ($usingAsaasApi && $subscriptionId === '') {
    $firstError = trim((string)($subscriptionResult['error_message_safe'] ?? ''));
    if ($firstError !== '' && (
      stripos($firstError, 'callback') !== false ||
      stripos($firstError, 'successUrl') !== false ||
      stripos($firstError, 'autoRedirect') !== false ||
      stripos($firstError, 'domínio configurado') !== false ||
      stripos($firstError, 'cadastre um site') !== false
    )) {
      // Fallback resiliente: alguns fluxos ASAAS podem não aceitar callback em criação de assinatura.
      unset($subscriptionPayload['callback']);
      $subscriptionResult = $asaas->createSubscriptionWithCreditCard($subscriptionPayload);
      $subscriptionData = is_array($subscriptionResult['data'] ?? null) ? $subscriptionResult['data'] : [];
      $subscriptionId = trim((string)($subscriptionData['id'] ?? ''));
    }
  }
  if ($usingAsaasApi && $subscriptionId === '') {
    $tokenFailure = strtoupper(trim((string)($subscriptionResult['error_code'] ?? '')));
    $tokenMessage = strtoupper(trim((string)($subscriptionResult['error_message_safe'] ?? '')));
    if (
      str_contains($tokenFailure, 'TOKEN')
      || str_contains($tokenFailure, 'CREDIT_CARD')
      || str_contains($tokenMessage, 'TOKEN')
      || str_contains($tokenMessage, 'CREDIT CARD')
    ) {
      $fallbackPayload = $subscriptionPayload;
      unset($fallbackPayload['creditCardToken']);
      $fallbackPayload['creditCard'] = [
        'holderName' => trim((string)($d['card_holder_name'] ?? '')),
        'number' => $cardNumberDigits,
        'expiryMonth' => str_pad((string)$cardExpiryMonth, 2, '0', STR_PAD_LEFT),
        'expiryYear' => (string)$cardExpiryYear,
        'ccv' => $cardCcv,
      ];
      $subscriptionResult = $asaas->createSubscriptionWithCreditCard($fallbackPayload);
      $subscriptionData = is_array($subscriptionResult['data'] ?? null) ? $subscriptionResult['data'] : [];
      $subscriptionId = trim((string)($subscriptionData['id'] ?? ''));
    }
  }
  if ($usingAsaasApi && $subscriptionId === '') {
    db()->exec("DELETE FROM client.organizations WHERE id=:id", [':id' => $orgId]);
    db()->exec("DELETE FROM client.users WHERE id=:id", [':id' => $uid]);
    db()->exec("UPDATE crm.signup_session SET status='CHECKOUT_ERROR', metadata = coalesce(metadata,'{}'::jsonb) || :meta::jsonb, updated_at=now() WHERE id=:id", [
      ':id' => $signupSessionId,
      ':meta' => json_encode(['asaas_error' => $subscriptionResult], JSON_UNESCAPED_UNICODE),
    ]);
    $gatewayMsg = $subscriptionResult['error_message_safe'] ?? null;
    apiError(
      'Falha ao iniciar assinatura no ASAAS. Revise wallet, webhook e credenciais sandbox.',
      502,
      'ASAAS_SUBSCRIPTION_ERROR',
      'Tente novamente em instantes. Se persistir, valide a configuração da conta ASAAS.',
      ['gateway_message' => $gatewayMsg]
    );
    return;
  }
  $subStatus = 'ACTIVE';

  $subId = db()->one("INSERT INTO client.subscriptions(organization_id,plan_id,asaas_customer_id,asaas_subscription_id,status,payment_method,next_due_date,grace_until) VALUES(:o,:p,:cid,:sid,:status,:pm,:due,:grace) RETURNING id", [
    ':o' => $orgId,
    ':p' => $plan['id'],
    ':cid' => $customer['id'] ?? null,
    ':sid' => $subscriptionId !== '' ? $subscriptionId : ('mock_sub_' . substr((string)$orgId, 0, 8)),
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
    ':status' => 'PAYMENT_CONFIRMED',
    ':meta' => json_encode([
      'subscription_id' => $subId,
      'asaas_subscription_id' => $subscriptionId !== '' ? $subscriptionId : ('mock_sub_' . substr((string)$orgId, 0, 8)),
      'payment_method' => $paymentMethod,
      'card_token_present' => true,
    ], JSON_UNESCAPED_UNICODE),
    ':id' => $signupSessionId,
  ]);

  db()->exec("UPDATE crm.signup_session SET payment_confirmed=true, updated_at=now() WHERE id=:id", [
    ':id' => $signupSessionId,
  ]);

  try {
    db()->exec("INSERT INTO client.billing_profiles(subscription_id, card_last4, card_brand, card_token, card_token_updated_at, is_validated, created_at)
VALUES(CAST(:sid AS uuid), :last4, :brand, :token, now(), true, now())
ON CONFLICT (subscription_id) DO UPDATE SET
  card_last4 = COALESCE(EXCLUDED.card_last4, client.billing_profiles.card_last4),
  card_brand = COALESCE(EXCLUDED.card_brand, client.billing_profiles.card_brand),
  card_token = COALESCE(EXCLUDED.card_token, client.billing_profiles.card_token),
  card_token_updated_at = now(),
  is_validated = true", [
      ':sid' => $subId,
      ':last4' => strlen($cardNumberDigits) >= 4 ? substr($cardNumberDigits, -4) : null,
      ':brand' => is_string($tokenData['creditCardBrand'] ?? null) ? trim((string)$tokenData['creditCardBrand']) : null,
      ':token' => $creditCardToken,
    ]);
  } catch (\Throwable) {
    // best-effort: não bloqueia ativação se schema legado ainda não tiver card_token
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
    $safeLeadPayload['cf-turnstile-response'],
    $safeLeadPayload['card_number'],
    $safeLeadPayload['card_ccv']
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
    'asaas_subscription_id' => ($subscriptionId !== '' ? $subscriptionId : null),
    'status' => $subStatus,
    'payment_redirect_url' => null,
    'pending_until' => null,
    'awaiting_payment' => false,
  ], 201);
  } catch (\Throwable) {
    apiError(
      'Falha inesperada ao concluir o cadastro da assinatura.',
      500,
      'REGISTER_CONTRACT_UNEXPECTED',
      'Tente novamente em instantes. Se persistir, acione o suporte com o horário da tentativa.'
    );
  } finally {
    if ($previousErrorHandler !== null) {
      set_error_handler($previousErrorHandler);
    } else {
      restore_error_handler();
    }
  }
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

$router->get('/api/billing/me', function(Request $request) {
  requireClientAuth();
  ensureSubscriptionRecurringTables();
  ensureClientProjectTables();
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  if ($orgId === '') {
    Response::json(['error' => 'Organização não vinculada à sessão.'], 422);
    return;
  }

  $reconcile = boolInput($request->query['reconcile'] ?? '0');
  $service = new BillingSnapshotService(db());
  $snapshot = $service->snapshot($orgId, $reconcile);
  Response::json($snapshot);
});

$router->get('/api/projects', function(Request $request) {
  requireClientAuth();
  ensureClientProjectTables();
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  if ($orgId === '') {
    Response::json(['error' => 'Organização não vinculada à sessão.'], 422);
    return;
  }

  $itemsRaw = projectBillingService()->listProjectsByOrganization($orgId);
  $items = array_map(static function(array $row): array {
    $domain = (string)($row['domain'] ?? '');
    $isDomain = isValidDomainName(strtolower($domain));
    return [
      'id' => (string)($row['id'] ?? ''),
      'domain' => $isDomain ? strtolower($domain) : null,
      'project_tag' => $isDomain ? null : projectDisplayLabel($domain),
      'label' => projectDisplayLabel($domain),
      'type' => (string)($row['project_type'] ?? 'hospedagem'),
      'status' => strtoupper((string)($row['status'] ?? 'PENDING')),
      'plan_code' => isset($row['plan_code']) ? (string)$row['plan_code'] : null,
      'price' => isset($row['effective_price']) ? round((float)$row['effective_price'], 2) : null,
      'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : null,
      'operational_status' => isset($row['operational_status']) ? (string)$row['operational_status'] : null,
      'financial_status' => isset($row['subscription_item_status']) ? strtoupper((string)$row['subscription_item_status']) : null,
      'deal_id' => isset($row['deal_id']) ? (string)$row['deal_id'] : null,
    ];
  }, $itemsRaw);

  $currentProjectId = currentClientProjectId($orgId);
  Response::json([
    'ok' => true,
    'current_project_id' => $currentProjectId,
    'items' => $items,
  ]);
});

$router->post('/api/projects/select', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  if ($orgId === '') {
    Response::json(['error' => 'Organização não vinculada à sessão.'], 422);
    return;
  }

  $rawProjectId = trim((string)$request->input('project_id', ''));
  if ($rawProjectId === '' || strtolower($rawProjectId) === 'null') {
    unset($_SESSION['current_project_id']);
    Response::json([
      'ok' => true,
      'current_project_id' => null,
      'mode' => 'GLOBAL',
    ]);
    return;
  }

  $project = loadProjectOwnedByOrganization($rawProjectId, $orgId);
  if (!$project) {
    Response::json(['error' => 'Projeto não pertence à organização autenticada.'], 403);
    return;
  }

  $_SESSION['current_project_id'] = (string)$project['id'];
  $label = projectDisplayLabel((string)($project['domain'] ?? ''));
  Response::json([
    'ok' => true,
    'current_project_id' => (string)$project['id'],
    'mode' => 'PROJECT',
    'project' => [
      'id' => (string)$project['id'],
      'domain' => isValidDomainName(strtolower((string)($project['domain'] ?? ''))) ? strtolower((string)$project['domain']) : null,
      'project_tag' => isValidDomainName(strtolower((string)($project['domain'] ?? ''))) ? null : $label,
      'label' => $label,
      'status' => strtoupper((string)($project['status'] ?? 'PENDING')),
      'type' => (string)($project['project_type'] ?? 'hospedagem'),
    ],
  ]);
});

$router->post('/api/projects', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  $requestId = requestCorrelationId($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  $userId = trim((string)($_SESSION['client_user']['id'] ?? ''));
  if ($orgId === '') {
    Response::json(['error' => 'Organização não vinculada à sessão.', 'request_id' => $requestId], 422);
    return;
  }

  $domain = normalizeDomainInput((string)$request->input('domain', ''));
  $projectTagInput = normalizeProjectTagInput((string)$request->input('project_tag', ''));
  $projectTag = $projectTagInput;
  $projectType = trim((string)$request->input('project_type', 'hospedagem'));
  $planCode = strtolower(trim((string)$request->input('plan_code', '')));
  if ($domain !== '' && !isValidDomainName($domain)) {
    $domain = '';
  }
  if ($domain === '' && $projectTag === '') {
    $projectTag = generateProjectTag($orgId);
  }
  if ($planCode === '') {
    Response::json([
      'error' => 'Dados inválidos para criação do projeto.',
      'request_id' => $requestId,
      'details' => [
        'plan_code' => $planCode !== '' ? null : 'Plano obrigatório.',
      ],
    ], 422);
    return;
  }

  $idempotencyKey = readIdempotencyKey($request);
  $actionSeed = $idempotencyKey !== '' ? $idempotencyKey : $requestId;
  $projectIdentifier = $domain !== '' ? $domain : ($projectTagInput !== '' ? $projectTagInput : 'AUTO');
  $actionId = toUuidFromScalar('PROJECT_CREATE:' . $orgId . ':' . $projectIdentifier . ':' . $actionSeed);
  if ($idempotencyKey !== '') {
    $existingConfirmed = loadConfirmedActionPayload($actionId);
    if ($existingConfirmed) {
      Response::json([
        'ok' => true,
        'idempotent' => true,
        'action_id' => $actionId,
        'request_id' => $requestId,
        'result' => $existingConfirmed['payload'] ?: $existingConfirmed['after_state'],
      ]);
      return;
    }
  }

  financialAuditNotifier()->recordActionRequested([
    'action_id' => $actionId,
    'org_id' => $orgId,
    'user_id' => $userId,
    'action_type' => 'CREATE_PROJECT',
    'entity_type' => 'PROJECT',
    'entity_id' => '',
    'request_id' => $requestId,
    'correlation_id' => $idempotencyKey,
    'payload' => [
      'domain' => $domain !== '' ? $domain : null,
      'project_tag' => $domain === '' ? $projectTag : null,
      'project_type' => $projectType,
      'plan_code' => $planCode,
    ],
    'source' => 'PORTAL_API',
  ], false);

  try {
    $project = projectBillingService()->createProjectWithItem($orgId, [
      'domain' => $domain,
      'project_tag' => $projectTag,
      'project_type' => $projectType,
      'plan_code' => $planCode,
      'project_status' => 'PENDING',
      'item_status' => 'PENDING',
    ]);
    $summary = projectBillingService()->billingSummaryByOrganization($orgId);

    $resultPayload = [
      'project' => $project,
      'billing_summary' => $summary,
    ];
    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => $actionId,
      'after_state' => [
        'project_id' => (string)($project['id'] ?? ''),
        'project_status' => (string)($project['status'] ?? 'PENDING'),
        'consolidated_value' => (float)($summary['total_monthly'] ?? 0),
      ],
      'payload' => $resultPayload,
    ], false);

    logPortalAudit('PROJECT_CREATED', 'PROJECT', (string)($project['id'] ?? ''), [
      'request_id' => $requestId,
      'organization_id' => $orgId,
      'user_id' => $userId,
      'domain' => $domain,
      'project_tag' => $projectTag,
      'action_id' => $actionId,
    ], $userId, 'CLIENTE');

    Response::json([
      'ok' => true,
      'action_id' => $actionId,
      'request_id' => $requestId,
      'result' => $resultPayload,
    ], 201);
  } catch (Throwable $e) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha ao criar projeto no portal',
      'payload' => ['error' => substr($e->getMessage(), 0, 350)],
    ], false);
    $status = str_contains(strtolower($e->getMessage()), 'já existe projeto') ? 409 : 500;
    Response::json([
      'error' => $status === 409 ? 'Projeto já cadastrado para esta organização.' : 'Não foi possível criar o projeto agora.',
      'request_id' => $requestId,
      'action_id' => $actionId,
    ], $status);
  }
});

$router->post('/api/projects/{project_id}/briefing', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  $requestId = requestCorrelationId($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  $userId = trim((string)($_SESSION['client_user']['id'] ?? ''));
  $projectId = trim((string)($request->query['project_id'] ?? ''));
  if ($orgId === '' || $projectId === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes.', 'request_id' => $requestId], 422);
    return;
  }
  $project = loadProjectOwnedByOrganization($projectId, $orgId);
  if (!$project) {
    Response::json(['error' => 'Projeto não pertence à organização autenticada.', 'request_id' => $requestId], 403);
    return;
  }

  $data = $request->body;
  if (empty($data) && !empty($_POST)) {
    $data = $_POST;
  }
  $required = ['objective', 'audience'];
  $errors = Validator::required($data, $required);
  if ($errors) {
    Response::json(['error' => 'Dados inválidos', 'details' => $errors, 'request_id' => $requestId], 422);
    return;
  }

  $brief = db()->one("
    INSERT INTO client.project_briefs(
      organization_id, project_id, objective, audience, differentials, services, cta_text, tone_of_voice,
      color_palette, visual_references, legal_content, integrations, domain_target, extra_requirements, status
    )
    VALUES(
      CAST(:oid AS uuid), CAST(:project_id AS uuid), :objective, :audience, :d, :s, :cta, :tone,
      :color, :vref, :legal, :int, :dom, :extra, 'SUBMITTED'
    )
    RETURNING id::text AS id, created_at::text AS created_at
  ", [
    ':oid' => $orgId,
    ':project_id' => $projectId,
    ':objective' => (string)$data['objective'],
    ':audience' => (string)$data['audience'],
    ':d' => $data['differentials'] ?? null,
    ':s' => $data['services'] ?? null,
    ':cta' => $data['cta_text'] ?? null,
    ':tone' => $data['tone_of_voice'] ?? null,
    ':color' => $data['color_palette'] ?? null,
    ':vref' => $data['visual_references'] ?? ($data['references'] ?? null),
    ':legal' => $data['legal_content'] ?? null,
    ':int' => $data['integrations'] ?? null,
    ':dom' => $data['domain_target'] ?? null,
    ':extra' => $data['extra_requirements'] ?? null,
  ]);

  db()->exec("
    UPDATE client.projects
    SET updated_at = now()
    WHERE id = CAST(:pid AS uuid)
      AND organization_id = CAST(:oid AS uuid)
  ", [
    ':pid' => $projectId,
    ':oid' => $orgId,
  ]);

  logPortalAudit('PROJECT_BRIEFING_SUBMITTED', 'PROJECT', $projectId, [
    'request_id' => $requestId,
    'organization_id' => $orgId,
    'user_id' => $userId,
    'brief_id' => (string)($brief['id'] ?? ''),
  ], $userId, 'CLIENTE');

  Response::json([
    'ok' => true,
    'request_id' => $requestId,
    'project_id' => $projectId,
    'brief_id' => (string)($brief['id'] ?? ''),
    'created_at' => $brief['created_at'] ?? null,
  ], 201);
});

$router->post('/api/projects/{project_id}/abort', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  ensureSubscriptionRecurringTables();

  $requestId = requestCorrelationId($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  $userId = trim((string)($_SESSION['client_user']['id'] ?? ''));
  $projectId = trim((string)($request->query['project_id'] ?? ''));
  if ($orgId === '' || $projectId === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes.', 'request_id' => $requestId], 422);
    return;
  }

  $project = loadProjectOwnedByOrganization($projectId, $orgId);
  if (!$project) {
    Response::json(['error' => 'Projeto não pertence à organização autenticada.', 'request_id' => $requestId], 403);
    return;
  }

  $projectStatus = strtoupper((string)($project['status'] ?? 'PENDING'));
  if ($projectStatus === 'ACTIVE') {
    Response::json(['error' => 'Projeto já ativo e não pode ser cancelado por este fluxo.', 'request_id' => $requestId], 409);
    return;
  }

  $pendingSession = db()->one("
    SELECT id::text AS id, payment_id, status
    FROM client.project_prorata_payment_sessions
    WHERE project_id = CAST(:pid AS uuid)
      AND organization_id = CAST(:oid AS uuid)
    ORDER BY created_at DESC
    LIMIT 1
  ", [':pid' => $projectId, ':oid' => $orgId]);
  if ($pendingSession && strtoupper((string)($pendingSession['status'] ?? '')) === 'CONFIRMED') {
    Response::json(['error' => 'Cobrança já confirmada para este projeto.', 'request_id' => $requestId], 409);
    return;
  }

  try {
    if ($pendingSession && trim((string)($pendingSession['payment_id'] ?? '')) !== '') {
      $asaas = new AsaasClient();
      $asaas->cancelPayment(trim((string)$pendingSession['payment_id']));
      markProjectProrataSessionCanceled((string)$pendingSession['id'], [
        'reason' => 'USER_ABORTED_PROJECT_FLOW',
        'request_id' => $requestId,
      ]);
    }
  } catch (Throwable) {
    // Se não for possível cancelar no provedor, ainda removemos o registro local pendente.
    if ($pendingSession && !empty($pendingSession['id'])) {
      markProjectProrataSessionCanceled((string)$pendingSession['id'], [
        'reason' => 'USER_ABORTED_PROJECT_FLOW_LOCAL_ONLY',
        'request_id' => $requestId,
      ]);
    }
  }

  db()->exec("
    DELETE FROM client.project_briefs
    WHERE organization_id = CAST(:oid AS uuid)
      AND project_id = CAST(:pid AS uuid)
  ", [':oid' => $orgId, ':pid' => $projectId]);
  db()->exec("
    DELETE FROM client.subscription_items
    WHERE organization_id = CAST(:oid AS uuid)
      AND project_id = CAST(:pid AS uuid)
  ", [':oid' => $orgId, ':pid' => $projectId]);
  db()->exec("
    DELETE FROM client.projects
    WHERE organization_id = CAST(:oid AS uuid)
      AND id = CAST(:pid AS uuid)
      AND upper(coalesce(status, 'PENDING')) <> 'ACTIVE'
  ", [':oid' => $orgId, ':pid' => $projectId]);

  logPortalAudit('PROJECT_ABORTED', 'PROJECT', $projectId, [
    'request_id' => $requestId,
    'organization_id' => $orgId,
    'user_id' => $userId,
  ], $userId, 'CLIENTE');

  Response::json([
    'ok' => true,
    'request_id' => $requestId,
    'project_id' => $projectId,
  ]);
});

$router->get('/api/billing/summary', function(Request $request) {
  requireClientAuth();
  ensureSubscriptionRecurringTables();
  ensureClientProjectTables();
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  if ($orgId === '') {
    Response::json(['error' => 'Organização não vinculada à sessão.'], 422);
    return;
  }

  $summary = projectBillingService()->billingSummaryByOrganization($orgId);
  $subscription = is_array($summary['subscription'] ?? null) ? $summary['subscription'] : null;
  $itemsRaw = is_array($summary['items'] ?? null) ? $summary['items'] : [];
  $items = array_map(static function(array $row): array {
    $domain = (string)($row['domain'] ?? '');
    $isDomain = isValidDomainName(strtolower($domain));
    return [
      'project_id' => (string)($row['id'] ?? ''),
      'domain' => $isDomain ? strtolower($domain) : null,
      'project_tag' => $isDomain ? null : projectDisplayLabel($domain),
      'label' => projectDisplayLabel($domain),
      'project_type' => (string)($row['project_type'] ?? 'hospedagem'),
      'project_status' => strtoupper((string)($row['status'] ?? 'PENDING')),
      'item_status' => strtoupper((string)($row['subscription_item_status'] ?? 'PENDING')),
      'plan_code' => isset($row['plan_code']) ? (string)$row['plan_code'] : null,
      'plan_name' => isset($row['plan_name']) ? (string)$row['plan_name'] : null,
      'price' => isset($row['effective_price']) ? round((float)$row['effective_price'], 2) : null,
      'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : null,
      'operational_status' => isset($row['operational_status']) ? (string)$row['operational_status'] : null,
    ];
  }, $itemsRaw);

  Response::json([
    'ok' => true,
    'subscription' => $subscription ? [
      'id' => (string)($subscription['id'] ?? ''),
      'asaas_subscription_id' => (string)($subscription['asaas_subscription_id'] ?? ''),
      'asaas_customer_id' => (string)($subscription['asaas_customer_id'] ?? ''),
      'status' => (string)($subscription['status'] ?? ''),
      'payment_method' => (string)($subscription['payment_method'] ?? ''),
      'next_due_date' => $subscription['next_due_date'] ?? null,
      'consolidated_value' => isset($subscription['consolidated_value']) ? (float)$subscription['consolidated_value'] : null,
      'last_recalc_at' => $subscription['last_recalc_at'] ?? null,
    ] : null,
    'items' => $items,
    'total' => round((float)($summary['total'] ?? 0), 2),
  ]);
});

$router->post('/api/billing/items/{project_id}/change-plan', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  $requestId = requestCorrelationId($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  $userId = trim((string)($_SESSION['client_user']['id'] ?? ''));
  $projectId = trim((string)($request->query['project_id'] ?? ''));
  $planCode = strtolower(trim((string)$request->input('plan_code', '')));
  if ($orgId === '' || $projectId === '' || $planCode === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes.', 'request_id' => $requestId], 422);
    return;
  }
  $project = loadProjectOwnedByOrganization($projectId, $orgId);
  if (!$project) {
    Response::json(['error' => 'Projeto não pertence à organização autenticada.', 'request_id' => $requestId], 403);
    return;
  }

  $idempotencyKey = readIdempotencyKey($request);
  $actionSeed = $idempotencyKey !== '' ? $idempotencyKey : $requestId;
  $actionId = toUuidFromScalar('PROJECT_ITEM_CHANGE_PLAN:' . $orgId . ':' . $projectId . ':' . $planCode . ':' . $actionSeed);
  if ($idempotencyKey !== '') {
    $existingConfirmed = loadConfirmedActionPayload($actionId);
    if ($existingConfirmed) {
      Response::json([
        'ok' => true,
        'idempotent' => true,
        'action_id' => $actionId,
        'request_id' => $requestId,
        'result' => $existingConfirmed['payload'] ?: $existingConfirmed['after_state'],
      ]);
      return;
    }
  }

  financialAuditNotifier()->recordActionRequested([
    'action_id' => $actionId,
    'org_id' => $orgId,
    'user_id' => $userId,
    'action_type' => 'CHANGE_PROJECT_PLAN',
    'entity_type' => 'PROJECT',
    'entity_id' => $projectId,
    'request_id' => $requestId,
    'correlation_id' => $idempotencyKey,
    'payload' => ['plan_code' => $planCode],
    'source' => 'PORTAL_API',
  ], false);

  try {
    $updatedProject = projectBillingService()->changeProjectPlan($orgId, $projectId, $planCode);
    $recalc = projectBillingService()->recalcConsolidatedSubscriptionValue($orgId, [
      'request_id' => $requestId,
      'user_id' => $userId,
      'action_seed' => 'item-change-plan:' . $actionSeed,
      'reason' => 'project_plan_changed',
      'source' => 'PORTAL_API',
    ]);
    $dealId = syncProjectDealByOrganization(
      $orgId,
      $updatedProject,
      isset($updatedProject['plan_code']) ? (string)$updatedProject['plan_code'] : $planCode,
      isset($updatedProject['effective_price']) ? (float)$updatedProject['effective_price'] : null,
      'portal_project_plan_changed'
    );
    $summary = projectBillingService()->billingSummaryByOrganization($orgId);

    $resultPayload = [
      'project' => $updatedProject,
      'deal_id' => $dealId,
      'billing_summary' => $summary,
      'recalc' => $recalc,
    ];
    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => $actionId,
      'after_state' => [
        'project_id' => $projectId,
        'plan_code' => (string)($updatedProject['plan_code'] ?? $planCode),
        'consolidated_value' => (float)($recalc['total'] ?? 0),
      ],
      'payload' => $resultPayload,
    ], false);

    logPortalAudit('PROJECT_PLAN_CHANGED', 'PROJECT', $projectId, [
      'request_id' => $requestId,
      'organization_id' => $orgId,
      'user_id' => $userId,
      'plan_code' => $planCode,
      'action_id' => $actionId,
      'deal_id' => $dealId,
    ], $userId, 'CLIENTE');

    Response::json([
      'ok' => true,
      'action_id' => $actionId,
      'request_id' => $requestId,
      'result' => $resultPayload,
    ]);
  } catch (Throwable $e) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha ao trocar plano do item do projeto',
      'payload' => ['error' => substr($e->getMessage(), 0, 350)],
    ], false);
    Response::json([
      'error' => 'Não foi possível trocar o plano do projeto.',
      'request_id' => $requestId,
      'action_id' => $actionId,
    ], 500);
  }
});

$router->post('/api/billing/items/{project_id}/cancel', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  $requestId = requestCorrelationId($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  $userId = trim((string)($_SESSION['client_user']['id'] ?? ''));
  $projectId = trim((string)($request->query['project_id'] ?? ''));
  if ($orgId === '' || $projectId === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes.', 'request_id' => $requestId], 422);
    return;
  }
  $project = loadProjectOwnedByOrganization($projectId, $orgId);
  if (!$project) {
    Response::json(['error' => 'Projeto não pertence à organização autenticada.', 'request_id' => $requestId], 403);
    return;
  }

  $idempotencyKey = readIdempotencyKey($request);
  $actionSeed = $idempotencyKey !== '' ? $idempotencyKey : $requestId;
  $actionId = toUuidFromScalar('PROJECT_ITEM_CANCEL:' . $orgId . ':' . $projectId . ':' . $actionSeed);
  if ($idempotencyKey !== '') {
    $existingConfirmed = loadConfirmedActionPayload($actionId);
    if ($existingConfirmed) {
      Response::json([
        'ok' => true,
        'idempotent' => true,
        'action_id' => $actionId,
        'request_id' => $requestId,
        'result' => $existingConfirmed['payload'] ?: $existingConfirmed['after_state'],
      ]);
      return;
    }
  }

  financialAuditNotifier()->recordActionRequested([
    'action_id' => $actionId,
    'org_id' => $orgId,
    'user_id' => $userId,
    'action_type' => 'CANCEL_PROJECT_ITEM',
    'entity_type' => 'PROJECT',
    'entity_id' => $projectId,
    'request_id' => $requestId,
    'correlation_id' => $idempotencyKey,
    'payload' => ['cancel' => true],
    'source' => 'PORTAL_API',
  ], false);

  try {
    $updatedProject = projectBillingService()->cancelProjectItem($orgId, $projectId);
    $recalc = projectBillingService()->recalcConsolidatedSubscriptionValue($orgId, [
      'request_id' => $requestId,
      'user_id' => $userId,
      'action_seed' => 'item-cancel:' . $actionSeed,
      'reason' => 'project_item_canceled',
      'source' => 'PORTAL_API',
    ]);
    $dealId = syncProjectDealByOrganization(
      $orgId,
      $updatedProject,
      isset($updatedProject['plan_code']) ? (string)$updatedProject['plan_code'] : null,
      isset($updatedProject['effective_price']) ? (float)$updatedProject['effective_price'] : null,
      'portal_project_item_canceled'
    );
    $summary = projectBillingService()->billingSummaryByOrganization($orgId);

    $resultPayload = [
      'project' => $updatedProject,
      'deal_id' => $dealId,
      'billing_summary' => $summary,
      'recalc' => $recalc,
    ];
    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => $actionId,
      'after_state' => [
        'project_id' => $projectId,
        'project_status' => (string)($updatedProject['status'] ?? 'CANCELED'),
        'item_status' => (string)($updatedProject['subscription_item_status'] ?? 'CANCELED'),
        'consolidated_value' => (float)($recalc['total'] ?? 0),
      ],
      'payload' => $resultPayload,
    ], false);

    logPortalAudit('PROJECT_ITEM_CANCELED', 'PROJECT', $projectId, [
      'request_id' => $requestId,
      'organization_id' => $orgId,
      'user_id' => $userId,
      'action_id' => $actionId,
      'deal_id' => $dealId,
    ], $userId, 'CLIENTE');

    Response::json([
      'ok' => true,
      'action_id' => $actionId,
      'request_id' => $requestId,
      'result' => $resultPayload,
    ]);
  } catch (Throwable $e) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha ao cancelar item do projeto',
      'payload' => ['error' => substr($e->getMessage(), 0, 350)],
    ], false);
    Response::json([
      'error' => 'Não foi possível cancelar o item do projeto.',
      'request_id' => $requestId,
      'action_id' => $actionId,
    ], 500);
  }
});

$router->post('/api/billing/items/{project_id}/prorata/prepare', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  $projectId = trim((string)($request->query['project_id'] ?? ''));
  $targetPlanCode = strtolower(trim((string)$request->input('plan_code', '')));
  if ($orgId === '' || $projectId === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes.', 'request_id' => $requestId], 422);
    return;
  }

  $project = loadProjectOwnedByOrganization($projectId, $orgId);
  if (!$project) {
    Response::json(['error' => 'Projeto não pertence à organização autenticada.', 'request_id' => $requestId], 403);
    return;
  }

  $item = db()->one("
    SELECT
      si.id::text AS subscription_item_id,
      si.status AS item_status,
      si.plan_id::text AS current_plan_id,
      coalesce(si.price_override, cp.monthly_price)::float AS current_value,
      cp.code AS current_plan_code
    FROM client.subscription_items si
    JOIN client.plans cp ON cp.id = si.plan_id
    WHERE si.project_id = CAST(:pid AS uuid)
      AND si.organization_id = CAST(:oid AS uuid)
    LIMIT 1
  ", [
    ':pid' => $projectId,
    ':oid' => $orgId,
  ]);
  if (!$item) {
    Response::json(['error' => 'Item de assinatura do projeto não encontrado.', 'request_id' => $requestId], 404);
    return;
  }

  if ($targetPlanCode === '') {
    $targetPlanCode = strtolower((string)($item['current_plan_code'] ?? ''));
  }
  $plan = resolvePlanByCode($targetPlanCode);
  if (!$plan) {
    Response::json(['error' => 'Plano de destino inválido.', 'request_id' => $requestId], 422);
    return;
  }

  $subscription = resolveLatestOrganizationSubscription($orgId);
  if (!$subscription) {
    Response::json(['error' => 'Assinatura consolidada não encontrada.', 'request_id' => $requestId], 404);
    return;
  }

  $asaas = new AsaasClient();
  [$resolvedNextDueDate, ] = resolveSubscriptionNextDueDate($asaas, $subscription);
  $currentValue = round((float)($item['current_value'] ?? 0), 2);
  $targetValue = round((float)($plan['monthly_price'] ?? 0), 2);
  $prorataAmount = calculateProrataAmount(
    $currentValue,
    $targetValue,
    $resolvedNextDueDate !== '' ? $resolvedNextDueDate : (string)($subscription['next_due_date'] ?? ''),
    max(1, (int)(getenv('ASAAS_DEFAULT_CYCLE_DAYS') ?: 30))
  );
  if ($targetValue > $currentValue && $prorataAmount < 0.01) {
    $prorataAmount = round(max(0.01, $targetValue - $currentValue), 2);
  }

  Response::json([
    'ok' => true,
    'request_id' => $requestId,
    'project' => [
      'id' => $projectId,
      'label' => projectDisplayLabel((string)($project['domain'] ?? '')),
      'domain' => isValidDomainName(strtolower((string)($project['domain'] ?? ''))) ? strtolower((string)$project['domain']) : null,
      'project_tag' => isValidDomainName(strtolower((string)($project['domain'] ?? ''))) ? null : projectDisplayLabel((string)($project['domain'] ?? '')),
    ],
    'subscription' => [
      'id' => (string)($subscription['id'] ?? ''),
      'asaas_subscription_id' => (string)($subscription['asaas_subscription_id'] ?? ''),
      'next_due_date' => $resolvedNextDueDate !== '' ? $resolvedNextDueDate : ($subscription['next_due_date'] ?? null),
    ],
    'pricing' => [
      'current_plan_code' => (string)($item['current_plan_code'] ?? ''),
      'target_plan_code' => (string)($plan['code'] ?? ''),
      'current_value' => $currentValue,
      'target_value' => $targetValue,
      'prorata_amount' => round($prorataAmount, 2),
      'requires_immediate_payment' => $prorataAmount >= 0.01,
    ],
  ]);
});

$router->post('/api/billing/items/{project_id}/prorata/confirm', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureClientProjectTables();
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  $orgId = trim((string)($_SESSION['client_user']['organization_id'] ?? ''));
  $userId = trim((string)($_SESSION['client_user']['id'] ?? ''));
  $projectId = trim((string)($request->query['project_id'] ?? ''));
  $targetPlanCode = strtolower(trim((string)$request->input('plan_code', '')));
  $paymentMethod = strtoupper(trim((string)$request->input('payment_method', 'PIX')));
  if ($orgId === '' || $projectId === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes.', 'request_id' => $requestId], 422);
    return;
  }
  if (!in_array($paymentMethod, ['PIX'], true)) {
    Response::json(['error' => 'Método de pagamento não suportado para pró-rata.', 'request_id' => $requestId], 422);
    return;
  }

  $project = loadProjectOwnedByOrganization($projectId, $orgId);
  if (!$project) {
    Response::json(['error' => 'Projeto não pertence à organização autenticada.', 'request_id' => $requestId], 403);
    return;
  }

  $item = db()->one("
    SELECT
      si.id::text AS subscription_item_id,
      si.status AS item_status,
      si.plan_id::text AS current_plan_id,
      coalesce(si.price_override, cp.monthly_price)::float AS current_value,
      cp.code AS current_plan_code
    FROM client.subscription_items si
    JOIN client.plans cp ON cp.id = si.plan_id
    WHERE si.project_id = CAST(:pid AS uuid)
      AND si.organization_id = CAST(:oid AS uuid)
    LIMIT 1
  ", [
    ':pid' => $projectId,
    ':oid' => $orgId,
  ]);
  if (!$item) {
    Response::json(['error' => 'Item de assinatura do projeto não encontrado.', 'request_id' => $requestId], 404);
    return;
  }

  if ($targetPlanCode === '') {
    $targetPlanCode = strtolower((string)($item['current_plan_code'] ?? ''));
  }
  $plan = resolvePlanByCode($targetPlanCode);
  if (!$plan) {
    Response::json(['error' => 'Plano de destino inválido.', 'request_id' => $requestId], 422);
    return;
  }

  $subscription = resolveLatestOrganizationSubscription($orgId);
  if (!$subscription) {
    Response::json(['error' => 'Assinatura consolidada não encontrada.', 'request_id' => $requestId], 404);
    return;
  }

  $idempotencyKey = readIdempotencyKey($request);
  $actionSeed = $idempotencyKey !== '' ? $idempotencyKey : $requestId;
  $actionId = toUuidFromScalar('PROJECT_PRORATA_CONFIRM:' . $orgId . ':' . $projectId . ':' . $targetPlanCode . ':' . $actionSeed);
  if ($idempotencyKey !== '') {
    $existingConfirmed = loadConfirmedActionPayload($actionId);
    if ($existingConfirmed) {
      Response::json([
        'ok' => true,
        'idempotent' => true,
        'action_id' => $actionId,
        'request_id' => $requestId,
        'result' => $existingConfirmed['payload'] ?: $existingConfirmed['after_state'],
      ]);
      return;
    }
  }

  $asaas = new AsaasClient();
  [$resolvedNextDueDate, ] = resolveSubscriptionNextDueDate($asaas, $subscription);
  $currentValue = round((float)($item['current_value'] ?? 0), 2);
  $targetValue = round((float)($plan['monthly_price'] ?? 0), 2);
  $prorataAmount = calculateProrataAmount(
    $currentValue,
    $targetValue,
    $resolvedNextDueDate !== '' ? $resolvedNextDueDate : (string)($subscription['next_due_date'] ?? ''),
    max(1, (int)(getenv('ASAAS_DEFAULT_CYCLE_DAYS') ?: 30))
  );
  if ($targetValue > $currentValue && $prorataAmount < 0.01) {
    $prorataAmount = round(max(0.01, $targetValue - $currentValue), 2);
  }

  financialAuditNotifier()->recordActionRequested([
    'action_id' => $actionId,
    'org_id' => $orgId,
    'user_id' => $userId,
    'action_type' => 'CONFIRM_PROJECT_PRORATA',
    'entity_type' => 'PROJECT',
    'entity_id' => $projectId,
    'request_id' => $requestId,
    'correlation_id' => $idempotencyKey,
    'payload' => [
      'target_plan_code' => $targetPlanCode,
      'prorata_amount' => $prorataAmount,
      'payment_method' => $paymentMethod,
    ],
    'source' => 'PORTAL_API',
  ], false);

  try {
    db()->exec("
      UPDATE client.subscription_items
      SET
        plan_id = CAST(:plan_id AS uuid),
        status = CASE WHEN :requires_payment THEN 'PENDING' ELSE 'ACTIVE' END,
        updated_at = now()
      WHERE project_id = CAST(:pid AS uuid)
        AND organization_id = CAST(:oid AS uuid)
    ", [
      ':plan_id' => (string)($plan['id'] ?? ''),
      ':requires_payment' => $prorataAmount >= 0.01 ? 'true' : 'false',
      ':pid' => $projectId,
      ':oid' => $orgId,
    ]);
    db()->exec("
      UPDATE client.projects
      SET
        status = CASE WHEN :requires_payment THEN 'PENDING' ELSE 'ACTIVE' END,
        updated_at = now()
      WHERE id = CAST(:pid AS uuid)
        AND organization_id = CAST(:oid AS uuid)
    ", [
      ':requires_payment' => $prorataAmount >= 0.01 ? 'true' : 'false',
      ':pid' => $projectId,
      ':oid' => $orgId,
    ]);

    $paymentPayload = null;
    $paymentData = null;
    $prorataSessionId = null;
    if ($prorataAmount >= 0.01) {
      $pendingSession = loadActiveProjectProrataSession($projectId);
      if ($pendingSession) {
        $providerPayment = $asaas->getPayment((string)$pendingSession['payment_id']);
        $providerData = is_array($providerPayment['data'] ?? null) ? $providerPayment['data'] : [];
        $providerStatus = strtoupper(trim((string)($providerData['status'] ?? '')));
        if (in_array($providerStatus, ['RECEIVED', 'CONFIRMED'], true)) {
          markProjectProrataSessionConfirmed((string)$pendingSession['id'], [
            'confirmed_by' => 'MANUAL_RECHECK',
            'confirmed_at' => gmdate(DATE_ATOM),
          ]);
          db()->exec("
            UPDATE client.subscription_items SET status='ACTIVE', updated_at=now()
            WHERE project_id=CAST(:pid AS uuid) AND organization_id=CAST(:oid AS uuid)
          ", [':pid' => $projectId, ':oid' => $orgId]);
          db()->exec("
            UPDATE client.projects SET status='ACTIVE', updated_at=now()
            WHERE id=CAST(:pid AS uuid) AND organization_id=CAST(:oid AS uuid)
          ", [':pid' => $projectId, ':oid' => $orgId]);
        } else {
          $paymentData = $providerData;
          $prorataSessionId = (string)$pendingSession['id'];
        }
      }

      if (!$paymentData) {
        $customerId = trim((string)($subscription['asaas_customer_id'] ?? ''));
        if ($customerId === '') {
          Response::json(['error' => 'Cliente ASAAS não encontrado para cobrança proporcional.', 'request_id' => $requestId], 422);
          return;
        }
        $paymentPayload = [
          'customer' => $customerId,
          'billingType' => 'PIX',
          'value' => $prorataAmount,
          'dueDate' => (new DateTimeImmutable('today'))->format('Y-m-d'),
          'description' => 'Pró-rata novo projeto ' . projectDisplayLabel((string)($project['domain'] ?? '')),
          'externalReference' => 'project_prorata:' . $projectId,
        ];
        $createResult = asaasCreatePaymentResilient($asaas, $paymentPayload, 3);
        if (!(bool)($createResult['ok'] ?? false)) {
          throw new RuntimeException((string)($createResult['error_message_safe'] ?? 'Falha ao gerar cobrança pró-rata.'));
        }
        $paymentData = is_array($createResult['data'] ?? null) ? $createResult['data'] : [];
        $paymentId = trim((string)($paymentData['id'] ?? ''));
        if ($paymentId === '') {
          throw new RuntimeException('Cobrança pró-rata criada sem payment_id.');
        }

        upsertClientPaymentByAsaasId(
          (string)($subscription['id'] ?? ''),
          $paymentId,
          $prorataAmount,
          (string)($paymentData['status'] ?? 'PENDING'),
          'PIX',
          isset($paymentData['dueDate']) ? (string)$paymentData['dueDate'] : null,
          [
            'kind' => 'PROJECT_PRORATA',
            'project_id' => $projectId,
            'target_plan_code' => $targetPlanCode,
            'action_id' => $actionId,
          ]
        );

        $prorataSessionId = toUuidFromScalar('PROJECT_PRORATA_SESSION:' . $projectId . ':' . $paymentId);
        createProjectProrataSession(
          $prorataSessionId,
          $orgId,
          $projectId,
          (string)($subscription['id'] ?? ''),
          (string)($plan['id'] ?? ''),
          $paymentId,
          $prorataAmount,
          [
            'action_id' => $actionId,
            'request_id' => $requestId,
            'target_plan_code' => $targetPlanCode,
          ]
        );
      }

      $pixQrResult = ['ok' => false, 'data' => []];
      $paymentId = trim((string)($paymentData['id'] ?? ''));
      if ($paymentId !== '') {
        $pixQrResult = asaasGetPixQrCodeResilient($asaas, $paymentId, 12);
      }
      $paymentStatusNormalized = strtoupper((string)($paymentData['status'] ?? 'PENDING'));
      $isConfirmedNow = in_array($paymentStatusNormalized, ['RECEIVED', 'CONFIRMED'], true);
      if ($isConfirmedNow) {
        if ($prorataSessionId) {
          markProjectProrataSessionConfirmed($prorataSessionId, [
            'confirmed_by' => 'ASAAS_SYNC',
            'confirmed_at' => gmdate(DATE_ATOM),
          ]);
        }
        db()->exec("
          UPDATE client.subscription_items SET status='ACTIVE', updated_at=now()
          WHERE project_id=CAST(:pid AS uuid) AND organization_id=CAST(:oid AS uuid)
        ", [':pid' => $projectId, ':oid' => $orgId]);
        db()->exec("
          UPDATE client.projects SET status='ACTIVE', updated_at=now()
          WHERE id=CAST(:pid AS uuid) AND organization_id=CAST(:oid AS uuid)
        ", [':pid' => $projectId, ':oid' => $orgId]);
      }

      $recalc = null;
      $dealId = null;
      if ($isConfirmedNow) {
        $recalc = projectBillingService()->recalcConsolidatedSubscriptionValue($orgId, [
          'request_id' => $requestId,
          'user_id' => $userId,
          'action_seed' => 'project-prorata-confirm:' . $actionSeed,
          'reason' => 'project_prorata_confirmed',
          'source' => 'PORTAL_API',
        ]);
      }
      $summary = projectBillingService()->billingSummaryByOrganization($orgId);
      if ($isConfirmedNow) {
        $updatedProject = loadProjectOwnedByOrganization($projectId, $orgId) ?? $project;
        $dealId = syncProjectDealByOrganization(
          $orgId,
          $updatedProject,
          $targetPlanCode,
          $targetValue,
          'portal_project_prorata_confirmed'
        );
      }

      $resultPayload = [
        'project_id' => $projectId,
        'prorata_amount' => $prorataAmount,
        'activation_pending' => !$isConfirmedNow,
        'payment' => [
          'id' => (string)($paymentData['id'] ?? ''),
          'status' => $paymentStatusNormalized,
          'invoice_url' => $paymentData['invoiceUrl'] ?? null,
          'pix_qrcode' => isset($pixQrResult['data']['encodedImage']) ? (string)$pixQrResult['data']['encodedImage'] : null,
          'pix_payload' => isset($pixQrResult['data']['payload']) ? (string)$pixQrResult['data']['payload'] : null,
        ],
        'billing_summary' => $summary,
        'recalc' => $recalc,
        'deal_id' => $dealId,
      ];
      financialAuditNotifier()->recordActionConfirmed([
        'action_id' => $actionId,
        'after_state' => [
          'project_id' => $projectId,
          'target_plan_code' => $targetPlanCode,
          'prorata_amount' => $prorataAmount,
          'payment_status' => $paymentStatusNormalized,
          'activation_pending' => !$isConfirmedNow,
        ],
        'payload' => $resultPayload,
      ], false);

      Response::json([
        'ok' => true,
        'request_id' => $requestId,
        'action_id' => $actionId,
        'result' => $resultPayload,
      ]);
      return;
    }

    db()->exec("
      UPDATE client.subscription_items SET status='ACTIVE', updated_at=now()
      WHERE project_id=CAST(:pid AS uuid) AND organization_id=CAST(:oid AS uuid)
    ", [':pid' => $projectId, ':oid' => $orgId]);
    db()->exec("
      UPDATE client.projects SET status='ACTIVE', updated_at=now()
      WHERE id=CAST(:pid AS uuid) AND organization_id=CAST(:oid AS uuid)
    ", [':pid' => $projectId, ':oid' => $orgId]);
    $recalc = projectBillingService()->recalcConsolidatedSubscriptionValue($orgId, [
      'request_id' => $requestId,
      'user_id' => $userId,
      'action_seed' => 'project-prorata-zero:' . $actionSeed,
      'reason' => 'project_prorata_zero',
      'source' => 'PORTAL_API',
    ]);
    $summary = projectBillingService()->billingSummaryByOrganization($orgId);
    $resultPayload = [
      'project_id' => $projectId,
      'prorata_amount' => 0.0,
      'payment' => null,
      'billing_summary' => $summary,
      'recalc' => $recalc,
    ];
    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => $actionId,
      'after_state' => [
        'project_id' => $projectId,
        'target_plan_code' => $targetPlanCode,
        'prorata_amount' => 0.0,
      ],
      'payload' => $resultPayload,
    ], false);
    Response::json([
      'ok' => true,
      'request_id' => $requestId,
      'action_id' => $actionId,
      'result' => $resultPayload,
    ]);
  } catch (Throwable $e) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha ao confirmar pró-rata do projeto',
      'payload' => ['error' => substr($e->getMessage(), 0, 350)],
    ], false);
    Response::json([
      'error' => 'Não foi possível confirmar o pró-rata do projeto.',
      'request_id' => $requestId,
      'action_id' => $actionId,
    ], 500);
  }
});

$router->post('/api/billing/subscriptions/{id}/change-plan/prepare', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  $sid = (string)($request->query['id'] ?? '');
  $planCode = strtolower(trim((string)$request->input('plan_code', '')));
  if ($sid === '' || $planCode === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes', 'request_id' => $requestId], 422);
    return;
  }

  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $userId = (string)($_SESSION['client_user']['id'] ?? '');
  $sub = resolveSubscriptionForPlanChange($sid, $orgId);
  if (!$sub) {
    Response::json(['error' => 'Assinatura não pertence ao usuário autenticado', 'request_id' => $requestId], 403);
    return;
  }
  $plan = resolvePlanByCode($planCode);
  if (!$plan) {
    Response::json(['error' => 'Plano não encontrado', 'request_id' => $requestId], 404);
    return;
  }

  $subscriptionUuid = (string)($sub['id'] ?? '');
  $asaasSubscriptionId = trim((string)($sub['asaas_subscription_id'] ?? ''));
  if ($asaasSubscriptionId === '') {
    Response::json(['error' => 'Assinatura sem vínculo no ASAAS', 'request_id' => $requestId], 422);
    return;
  }

  $currentValue = round((float)($sub['current_price'] ?? 0), 2);
  $targetValue = round((float)($plan['monthly_price'] ?? 0), 2);
  $delta = round($targetValue - $currentValue, 2);
  $direction = abs($delta) < 0.01 ? 'NOOP' : ($delta > 0 ? 'UPGRADE' : 'DOWNGRADE');
  if ($direction !== 'UPGRADE') {
    Response::json([
      'error' => 'Fluxo PIX de troca é permitido apenas para upgrade.',
      'direction' => $direction,
      'request_id' => $requestId,
    ], 422);
    return;
  }

  $asaas = new AsaasClient();
  [$resolvedNextDueDate, $detailsData] = resolveSubscriptionNextDueDate($asaas, $sub);
  $today = new DateTimeImmutable('today');
  $dueDateObj = null;
  if ($resolvedNextDueDate !== '') {
    try {
      $dueDateObj = new DateTimeImmutable(substr($resolvedNextDueDate, 0, 10));
    } catch (Throwable) {
      $dueDateObj = null;
    }
  }
  $defaultCycleDays = max(1, (int)(getenv('ASAAS_DEFAULT_CYCLE_DAYS') ?: 30));
  $remainingDays = ($dueDateObj instanceof DateTimeImmutable && $dueDateObj > $today)
    ? (int)$today->diff($dueDateObj)->days
    : ($resolvedNextDueDate === '' ? $defaultCycleDays : 0);
  $prorataAmount = round(max(0.0, (($targetValue - $currentValue) * $remainingDays) / $defaultCycleDays), 2);
  if ($prorataAmount < 0.01 && $delta > 0) {
    $prorataAmount = round(max(0.01, $delta), 2);
  }

  $customerId = trim((string)($sub['asaas_customer_id'] ?? ''));
  if ($customerId === '') {
    $customerId = trim((string)($detailsData['customer'] ?? ''));
  }
  if ($customerId === '') {
    Response::json(['error' => 'Cliente ASAAS não encontrado para gerar PIX.', 'request_id' => $requestId], 422);
    return;
  }

  $activeSession = loadActivePlanChangePixSession($subscriptionUuid, $planCode);
  if ($activeSession) {
    $activePaymentId = trim((string)($activeSession['payment_id'] ?? ''));
    if ($activePaymentId !== '') {
      $payment = $asaas->getPayment($activePaymentId);
      if ((bool)($payment['ok'] ?? false)) {
        $paymentData = is_array($payment['data'] ?? null) ? $payment['data'] : [];
        $status = strtoupper(trim((string)($paymentData['status'] ?? '')));
        if (in_array($status, ['PENDING', 'OVERDUE'], true)) {
          $pixResult = asaasGetPixQrCodeResilient($asaas, $activePaymentId, 12);
          $pixData = is_array($pixResult['data'] ?? null) ? $pixResult['data'] : [];
          $pixPayload = trim((string)($pixData['payload'] ?? ($pixData['copyPasteKey'] ?? '')));
          $pixEncodedImage = trim((string)($pixData['encodedImage'] ?? ''));
          if ($pixPayload !== '' || $pixEncodedImage !== '') {
            Response::json([
              'ok' => true,
              'idempotent' => true,
              'direction' => 'UPGRADE',
              'modal_session_id' => (string)$activeSession['id'],
              'amount' => (float)($activeSession['amount'] ?? $prorataAmount),
              'payment_id' => $activePaymentId,
              'pix' => [
                'payload' => $pixPayload,
                'encodedImage' => $pixEncodedImage,
                'expirationDate' => (string)($pixData['expirationDate'] ?? ''),
              ],
              'request_id' => $requestId,
            ]);
            return;
          }
        }
      }
    }
    markPlanChangePixSessionCanceled((string)$activeSession['id'], [
      'reason' => 'STALE_SESSION_REPLACED',
      'request_id' => $requestId,
    ]);
  }

  $resetSummary = cancelOpenPixPaymentsForSubscription(
    $asaas,
    $subscriptionUuid,
    $asaasSubscriptionId,
    $requestId,
    $customerId
  );
  $sessionId = toUuidFromScalar($requestId . ':PLAN_PIX_SESSION:' . $subscriptionUuid . ':' . $planCode);
  $actionId = toUuidFromScalar($requestId . ':CHANGE_PLAN_PIX:' . $subscriptionUuid . ':' . $planCode);
  financialAuditNotifier()->recordActionRequested([
    'action_id' => $actionId,
    'action_type' => 'CHANGE_PLAN',
    'entity_type' => 'SUBSCRIPTION',
    'entity_id' => $subscriptionUuid,
    'org_id' => $orgId,
    'user_id' => $userId,
    'deal_id' => (string)($sub['deal_id'] ?? ''),
    'request_id' => $requestId,
    'correlation_id' => $sessionId,
    'before_state' => [
      'current_plan_code' => (string)($sub['current_plan_code'] ?? ''),
      'current_price' => $currentValue,
      'status' => (string)($sub['status'] ?? ''),
    ],
    'payload' => [
      'mode' => 'PIX_SESSION_PREPARE',
      'session_id' => $sessionId,
      'asaas_subscription_id' => $asaasSubscriptionId,
      'from_plan' => (string)($sub['current_plan_code'] ?? ''),
      'to_plan' => $planCode,
      'direction' => 'UPGRADE',
      'prorata_amount' => $prorataAmount,
      'next_due_date' => $resolvedNextDueDate !== '' ? $resolvedNextDueDate : null,
    ],
    'source' => 'PORTAL_API',
  ], false);

  $chargePayload = [
    'customer' => $customerId,
    'value' => $prorataAmount,
    'dueDate' => date('Y-m-d'),
    'description' => sprintf('Upgrade de plano: %s -> %s', (string)($sub['current_plan_code'] ?? ''), $planCode),
    'externalReference' => sprintf('UPGRADE_PIX_SESSION:%s:%s', $subscriptionUuid, $sessionId),
    'billingType' => 'PIX',
  ];
  $chargeResult = asaasCreatePaymentResilient($asaas, $chargePayload, 3);
  if (!(bool)($chargeResult['ok'] ?? false)) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha na criação da cobrança PIX do upgrade',
      'payload' => ['provider' => FinancialAuditNotifier::sanitizePayload($chargeResult)],
    ], false);
    Response::json([
      'error' => 'Não foi possível criar cobrança PIX no Asaas.',
      'request_id' => $requestId,
      'action_id' => $actionId,
    ], 502);
    return;
  }
  $chargeData = is_array($chargeResult['data'] ?? null) ? $chargeResult['data'] : [];
  $paymentId = trim((string)($chargeData['id'] ?? ''));
  if ($paymentId === '') {
    Response::json(['error' => 'Resposta inválida ao gerar cobrança PIX.', 'request_id' => $requestId], 502);
    return;
  }

  upsertClientPaymentByAsaasId(
    $subscriptionUuid,
    $paymentId,
    $prorataAmount,
    (string)($chargeData['status'] ?? 'PENDING'),
    'PIX',
    date('Y-m-d'),
    [
      'upgrade_prorata' => true,
      'upgrade_payment_method' => 'PIX',
      'mode' => 'PIX_SESSION',
      'session_id' => $sessionId,
      'provider_payment' => $chargeData,
    ]
  );

  $pixResult = asaasGetPixQrCodeResilient($asaas, $paymentId, 12);
  $pixData = is_array($pixResult['data'] ?? null) ? $pixResult['data'] : [];
  $pixPayload = trim((string)($pixData['payload'] ?? ($pixData['copyPasteKey'] ?? '')));
  $pixEncodedImage = trim((string)($pixData['encodedImage'] ?? ''));
  if ($pixPayload === '' && $pixEncodedImage === '') {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'PIX criado sem QR/payload',
      'payload' => ['payment_id' => $paymentId],
    ], false);
    Response::json([
      'error' => 'Cobrança PIX criada sem QR Code. Gere uma nova cobrança.',
      'request_id' => $requestId,
      'action_id' => $actionId,
    ], 502);
    return;
  }

  try {
    createPlanChangePixSession(
      $sessionId,
      $subscriptionUuid,
      $orgId,
      (string)$plan['id'],
      $planCode,
      $paymentId,
      $requestId,
      $actionId,
      $prorataAmount,
      ['reset_summary' => $resetSummary]
    );
  } catch (Throwable) {
    $already = loadActivePlanChangePixSession($subscriptionUuid, $planCode);
    if ($already && trim((string)($already['payment_id'] ?? '')) !== '') {
      $sessionId = (string)$already['id'];
      $paymentId = (string)$already['payment_id'];
    }
  }

  Response::json([
    'ok' => true,
    'direction' => 'UPGRADE',
    'modal_session_id' => $sessionId,
    'amount' => $prorataAmount,
    'payment_id' => $paymentId,
    'pix' => [
      'payload' => $pixPayload,
      'encodedImage' => $pixEncodedImage,
      'expirationDate' => trim((string)($pixData['expirationDate'] ?? '')),
    ],
    'action_id' => $actionId,
    'request_id' => $requestId,
    'reset' => $resetSummary,
  ]);
});

$router->post('/api/billing/subscriptions/{id}/change-plan/confirm', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  $sid = (string)($request->query['id'] ?? '');
  $sessionId = trim((string)$request->input('modal_session_id', ''));
  $paymentIdInput = trim((string)$request->input('payment_id', ''));
  if ($sid === '' || $sessionId === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes', 'request_id' => $requestId], 422);
    return;
  }
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $sub = resolveSubscriptionForPlanChange($sid, $orgId);
  if (!$sub) {
    Response::json(['error' => 'Assinatura não pertence ao usuário autenticado', 'request_id' => $requestId], 403);
    return;
  }
  $session = loadPlanChangePixSessionById($sessionId);
  if (!$session || (string)($session['subscription_id'] ?? '') !== (string)($sub['id'] ?? '') || (string)($session['organization_id'] ?? '') !== $orgId) {
    Response::json(['error' => 'Sessão de pagamento não encontrada', 'request_id' => $requestId], 404);
    return;
  }
  if ($paymentIdInput !== '' && $paymentIdInput !== (string)$session['payment_id']) {
    Response::json(['error' => 'Pagamento não corresponde à sessão', 'request_id' => $requestId], 422);
    return;
  }
  if (strtoupper((string)($session['status'] ?? '')) === 'CONFIRMED') {
    Response::json([
      'ok' => true,
      'idempotent' => true,
      'request_id' => $requestId,
      'modal_session_id' => $sessionId,
    ]);
    return;
  }
  if (strtoupper((string)($session['status'] ?? '')) !== 'PENDING') {
    Response::json(['error' => 'Sessão não está pendente para confirmação', 'request_id' => $requestId], 409);
    return;
  }

  $asaas = new AsaasClient();
  $providerPayment = $asaas->getPayment((string)$session['payment_id']);
  if (!(bool)($providerPayment['ok'] ?? false)) {
    Response::json(['error' => 'Falha ao consultar pagamento no ASAAS', 'request_id' => $requestId], 502);
    return;
  }
  $paymentData = is_array($providerPayment['data'] ?? null) ? $providerPayment['data'] : [];
  $paymentStatus = strtoupper(trim((string)($paymentData['status'] ?? '')));
  if (!in_array($paymentStatus, ['RECEIVED', 'CONFIRMED', 'PAID'], true)) {
    Response::json([
      'ok' => false,
      'confirmed' => false,
      'payment_status' => $paymentStatus !== '' ? $paymentStatus : 'PENDING',
      'request_id' => $requestId,
    ], 409);
    return;
  }

  $targetPlan = db()->one("
    SELECT id::text AS id, code, monthly_price::float AS monthly_price
    FROM client.plans
    WHERE id=CAST(:id AS uuid)
    LIMIT 1
  ", [':id' => (string)$session['target_plan_id']]);
  if (!$targetPlan) {
    Response::json(['error' => 'Plano alvo da sessão não encontrado', 'request_id' => $requestId], 422);
    return;
  }

  $isOverdue = false;
  $nextDue = trim((string)($sub['next_due_date'] ?? ''));
  if ($nextDue !== '') {
    try {
      $isOverdue = (new DateTimeImmutable('today')) > new DateTimeImmutable(substr($nextDue, 0, 10));
    } catch (Throwable) {
      $isOverdue = false;
    }
  }

  $asaasSubscriptionId = trim((string)($sub['asaas_subscription_id'] ?? ''));
  $updateResult = $asaas->updateSubscriptionValue(
    $asaasSubscriptionId,
    (float)($targetPlan['monthly_price'] ?? 0),
    ['updatePendingPayments' => !$isOverdue]
  );
  if (!(bool)($updateResult['ok'] ?? false)) {
    Response::json([
      'error' => $updateResult['error_message_safe'] ?? 'Falha ao atualizar valor da assinatura',
      'request_id' => $requestId,
    ], 502);
    return;
  }

  db()->exec("UPDATE client.subscriptions SET plan_id=CAST(:plan_id AS uuid), price_override=NULL, updated_at=now() WHERE id=CAST(:sid AS uuid)", [
    ':plan_id' => (string)$targetPlan['id'],
    ':sid' => (string)$sub['id'],
  ]);
  markPlanChangePixSessionConfirmed($sessionId, [
    'confirmed_by' => 'CHANGE_PLAN_CONFIRM_ENDPOINT',
    'confirmed_request_id' => $requestId,
    'payment_status' => $paymentStatus,
  ]);
  if (trim((string)($session['action_id'] ?? '')) !== '') {
    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => (string)$session['action_id'],
      'after_state' => [
        'direction' => 'UPGRADE',
        'target_plan_code' => (string)($targetPlan['code'] ?? ''),
        'target_value' => (float)($targetPlan['monthly_price'] ?? 0),
        'scheduled' => false,
      ],
      'payload' => [
        'direction' => 'UPGRADE',
        'mode' => 'PIX_SESSION_CONFIRM',
        'payment_id' => (string)$session['payment_id'],
        'modal_session_id' => $sessionId,
      ],
    ], false);
  }

  Response::json([
    'ok' => true,
    'confirmed' => true,
    'direction' => 'UPGRADE',
    'modal_session_id' => $sessionId,
    'payment_id' => (string)$session['payment_id'],
    'request_id' => $requestId,
  ]);
});

$router->post('/api/billing/subscriptions/{id}/change-plan/cancel', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  $sid = (string)($request->query['id'] ?? '');
  $sessionId = trim((string)$request->input('modal_session_id', ''));
  if ($sid === '' || $sessionId === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes', 'request_id' => $requestId], 422);
    return;
  }
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $sub = resolveSubscriptionForPlanChange($sid, $orgId);
  if (!$sub) {
    Response::json(['error' => 'Assinatura não pertence ao usuário autenticado', 'request_id' => $requestId], 403);
    return;
  }
  $session = loadPlanChangePixSessionById($sessionId);
  if (!$session || (string)($session['subscription_id'] ?? '') !== (string)($sub['id'] ?? '') || (string)($session['organization_id'] ?? '') !== $orgId) {
    Response::json(['error' => 'Sessão de pagamento não encontrada', 'request_id' => $requestId], 404);
    return;
  }
  $status = strtoupper(trim((string)($session['status'] ?? '')));
  if ($status === 'CONFIRMED') {
    Response::json(['ok' => false, 'error' => 'Sessão já confirmada', 'request_id' => $requestId], 409);
    return;
  }
  if ($status === 'CANCELED') {
    Response::json(['ok' => true, 'idempotent' => true, 'request_id' => $requestId]);
    return;
  }

  $asaas = new AsaasClient();
  $paymentId = trim((string)($session['payment_id'] ?? ''));
  $cancelled = false;
  if ($paymentId !== '') {
    $payment = $asaas->getPayment($paymentId);
    $paymentData = is_array($payment['data'] ?? null) ? $payment['data'] : [];
    $paymentStatus = strtoupper(trim((string)($paymentData['status'] ?? '')));
    if (in_array($paymentStatus, ['PENDING', 'OVERDUE'], true)) {
      $cancel = $asaas->cancelPayment($paymentId);
      $cancelled = (bool)($cancel['ok'] ?? false);
      if ($cancelled) {
        db()->exec("
          UPDATE client.payments
          SET
            status='CANCELED',
            raw_payload = CASE
              WHEN raw_payload IS NULL THEN CAST(:payload AS jsonb)
              ELSE raw_payload || CAST(:payload AS jsonb)
            END
          WHERE asaas_payment_id=:payment_id
        ", [
          ':payment_id' => $paymentId,
          ':payload' => safeJson([
            'cancelled_by' => 'CHANGE_PLAN_CANCEL_ENDPOINT',
            'cancelled_request_id' => $requestId,
          ]),
        ]);
      }
    }
  }

  markPlanChangePixSessionCanceled($sessionId, [
    'cancelled_by' => 'PORTAL_MODAL',
    'request_id' => $requestId,
    'payment_cancelled' => $cancelled,
  ]);
  if (trim((string)($session['action_id'] ?? '')) !== '') {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => (string)$session['action_id'],
      'error_reason' => 'Sessão PIX cancelada no modal antes da confirmação',
      'payload' => [
        'mode' => 'PIX_SESSION_CANCEL',
        'payment_id' => $paymentId,
        'modal_session_id' => $sessionId,
      ],
    ], false);
  }

  Response::json([
    'ok' => true,
    'modal_session_id' => $sessionId,
    'payment_id' => $paymentId !== '' ? $paymentId : null,
    'cancelled' => $cancelled,
    'request_id' => $requestId,
  ]);
});

$router->post('/api/billing/subscriptions/{id}/change-plan', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  $sid = (string)($request->query['id'] ?? '');
  $planCode = trim((string)$request->input('plan_code', ''));
  $upgradePaymentMethod = strtoupper(trim((string)$request->input('upgrade_payment_method', 'PIX')));
  if (!in_array($upgradePaymentMethod, ['PIX', 'CREDIT_CARD_SAVED', 'CREDIT_CARD_NEW'], true)) {
    $upgradePaymentMethod = 'PIX';
  }
  if ($sid === '' || $planCode === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes', 'request_id' => $requestId], 422);
    return;
  }

  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $userId = (string)($_SESSION['client_user']['id'] ?? '');

  $sub = db()->one("
    SELECT
           s.id::text AS id,
           s.organization_id::text AS organization_id,
           s.plan_id::text AS plan_id,
           s.status,
           s.payment_method,
           s.asaas_customer_id,
           s.asaas_subscription_id,
           s.next_due_date::text AS next_due_date,
           s.grace_until::text AS grace_until,
           p.code AS current_plan_code,
           p.name AS current_plan_name,
           p.monthly_price::float AS current_price,
           d.id::text AS deal_id
    FROM client.subscriptions s
    JOIN client.plans p ON p.id = s.plan_id
    LEFT JOIN LATERAL (
      SELECT id
      FROM crm.deal
      WHERE organization_id = s.organization_id
      ORDER BY updated_at DESC
      LIMIT 1
    ) d ON true
    WHERE s.asaas_subscription_id=:sid
    LIMIT 1
  ", [':sid' => $sid]);
  if (!$sub && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $sid)) {
    $sub = db()->one("
      SELECT
             s.id::text AS id,
             s.organization_id::text AS organization_id,
             s.plan_id::text AS plan_id,
             s.status,
             s.payment_method,
             s.asaas_customer_id,
             s.asaas_subscription_id,
             s.next_due_date::text AS next_due_date,
             s.grace_until::text AS grace_until,
             p.code AS current_plan_code,
             p.name AS current_plan_name,
             p.monthly_price::float AS current_price,
             d.id::text AS deal_id
      FROM client.subscriptions s
      JOIN client.plans p ON p.id = s.plan_id
      LEFT JOIN LATERAL (
        SELECT id
        FROM crm.deal
        WHERE organization_id = s.organization_id
        ORDER BY updated_at DESC
        LIMIT 1
      ) d ON true
      WHERE s.id=CAST(:sid AS uuid)
      LIMIT 1
    ", [':sid' => $sid]);
  }
  if (!$sub || (string)($sub['organization_id'] ?? '') !== $orgId) {
    Response::json(['error' => 'Assinatura não pertence ao usuário autenticado', 'request_id' => $requestId], 403);
    return;
  }

  $plan = db()->one("
    SELECT id::text AS id, code, name, monthly_price::float AS monthly_price
    FROM client.plans
    WHERE code=:code AND is_active=true
    LIMIT 1
  ", [':code' => $planCode]);
  if (!$plan) {
    Response::json(['error' => 'Plano não encontrado', 'request_id' => $requestId], 404);
    return;
  }

  $subscriptionUuid = (string)($sub['id'] ?? '');
  $asaasSubscriptionId = trim((string)($sub['asaas_subscription_id'] ?? ''));
  if ($asaasSubscriptionId === '') {
    Response::json(['error' => 'Assinatura sem vínculo no ASAAS', 'request_id' => $requestId], 422);
    return;
  }
  $currentValue = round((float)($sub['current_price'] ?? 0), 2);
  $targetValue = round((float)($plan['monthly_price'] ?? 0), 2);
  $delta = round($targetValue - $currentValue, 2);
  $direction = abs($delta) < 0.01 ? 'NOOP' : ($delta > 0 ? 'UPGRADE' : 'DOWNGRADE');

  $actionId = toUuidFromScalar($requestId . ':CHANGE_PLAN:' . $subscriptionUuid);
  $existingAction = db()->one("
    SELECT status, payload
    FROM audit.financial_actions
    WHERE action_id=CAST(:action_id AS uuid)
    LIMIT 1
  ", [':action_id' => $actionId]);
  $existingPayload = [];
  if (is_string($existingAction['payload'] ?? null)) {
    $decoded = json_decode((string)$existingAction['payload'], true);
    if (is_array($decoded)) {
      $existingPayload = $decoded;
    }
  } elseif (is_array($existingAction['payload'] ?? null)) {
    $existingPayload = $existingAction['payload'];
  }
  if (strtoupper((string)($existingAction['status'] ?? '')) === 'CONFIRMED' && $existingPayload !== []) {
    Response::json([
      'ok' => true,
      'idempotent' => true,
      'direction' => (string)($existingPayload['direction'] ?? $direction),
      'prorata_amount' => (float)($existingPayload['prorata_amount'] ?? 0),
      'prorata_payment_url' => isset($existingPayload['prorata_payment_url']) ? (string)$existingPayload['prorata_payment_url'] : null,
      'upgrade_charge' => (isset($existingPayload['upgrade_charge']) && is_array($existingPayload['upgrade_charge'])) ? $existingPayload['upgrade_charge'] : null,
      'scheduled' => (bool)($existingPayload['scheduled'] ?? false),
      'effective_at' => isset($existingPayload['effective_at']) ? (string)$existingPayload['effective_at'] : null,
      'action_id' => $actionId,
      'request_id' => $requestId,
    ]);
    return;
  }

  $asaas = new AsaasClient();
  $resolvedNextDueDate = trim((string)($sub['next_due_date'] ?? ''));
  $detailsData = [];
  if ($resolvedNextDueDate === '' || trim((string)($sub['asaas_customer_id'] ?? '')) === '') {
    if ($asaasSubscriptionId !== '') {
      $subscriptionDetails = $asaas->getSubscription($asaasSubscriptionId);
      $detailsData = is_array($subscriptionDetails['data'] ?? null) ? $subscriptionDetails['data'] : [];
      if ($resolvedNextDueDate === '') {
        $resolvedNextDueDate = trim((string)($detailsData['nextDueDate'] ?? ''));
      }
    }
  }

  $resetSummary = resetOpenPlanChangeStateAndCancelPix(
    $asaas,
    $subscriptionUuid,
    $asaasSubscriptionId,
    $requestId
  );

  $today = new DateTimeImmutable('today');
  $dueDateObj = null;
  if ($resolvedNextDueDate !== '') {
    try {
      $dueDateObj = new DateTimeImmutable(substr($resolvedNextDueDate, 0, 10));
    } catch (Throwable) {
      $dueDateObj = null;
    }
  }

  $defaultCycleDays = max(1, (int)(getenv('ASAAS_DEFAULT_CYCLE_DAYS') ?: 30));
  $remainingDays = 0;
  if ($direction === 'UPGRADE') {
    if ($dueDateObj instanceof DateTimeImmutable) {
      $remainingDays = $dueDateObj > $today ? (int)$today->diff($dueDateObj)->days : 0;
    } elseif (trim((string)($sub['next_due_date'] ?? '')) === '') {
      $remainingDays = $defaultCycleDays;
    }
  }
  $prorataAmount = $direction === 'UPGRADE'
    ? round(max(0.0, (($targetValue - $currentValue) * $remainingDays) / $defaultCycleDays), 2)
    : 0.0;
  if ($direction === 'UPGRADE' && $upgradePaymentMethod === 'PIX' && $prorataAmount < 0.01 && $delta > 0) {
    $prorataAmount = round(max(0.01, $delta), 2);
  }

  $isOverdue = $dueDateObj instanceof DateTimeImmutable ? ($today > $dueDateObj) : false;
  $action = financialAuditNotifier()->recordActionRequested([
    'action_id' => $actionId,
    'action_type' => 'CHANGE_PLAN',
    'entity_type' => 'SUBSCRIPTION',
    'entity_id' => $subscriptionUuid,
    'org_id' => $orgId,
    'user_id' => $userId,
    'deal_id' => (string)($sub['deal_id'] ?? ''),
    'request_id' => $requestId,
    'correlation_id' => '',
    'before_state' => [
      'current_plan_code' => (string)($sub['current_plan_code'] ?? ''),
      'current_price' => $currentValue,
      'status' => (string)($sub['status'] ?? ''),
    ],
    'payload' => [
      'asaas_subscription_id' => $asaasSubscriptionId,
      'from_plan' => (string)($sub['current_plan_code'] ?? ''),
      'to_plan' => $planCode,
      'direction' => $direction,
      'prorata_amount' => $prorataAmount,
      'upgrade_payment_method' => $upgradePaymentMethod,
      'next_due_date' => $resolvedNextDueDate !== '' ? $resolvedNextDueDate : null,
    ],
    'source' => 'PORTAL_API',
  ]);
  $actionId = (string)($action['action_id'] ?? $actionId);

  if ($direction === 'NOOP') {
    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => $actionId,
      'after_state' => [
        'direction' => 'NOOP',
        'scheduled' => false,
      ],
      'payload' => [
        'direction' => 'NOOP',
        'prorata_amount' => 0.0,
        'prorata_payment_url' => null,
        'upgrade_charge' => null,
        'scheduled' => false,
        'effective_at' => null,
      ],
    ]);
    Response::json([
      'ok' => true,
      'direction' => 'NOOP',
      'prorata_amount' => 0.0,
      'prorata_payment_url' => null,
      'upgrade_charge' => null,
      'scheduled' => false,
      'effective_at' => null,
      'reset' => $resetSummary,
      'action_id' => $actionId,
      'request_id' => $requestId,
    ]);
    return;
  }

  if ($direction === 'DOWNGRADE') {
    if (!$dueDateObj && $resolvedNextDueDate !== '') {
      try {
        $dueDateObj = new DateTimeImmutable(substr($resolvedNextDueDate, 0, 10));
      } catch (Throwable) {
        $dueDateObj = null;
      }
    }
    if (!$dueDateObj) {
      $dueDateObj = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify('+30 days');
    }
    $effectiveAt = (new DateTimeImmutable($dueDateObj->format('Y-m-d') . ' 00:00:00', new DateTimeZone('UTC')));
    db()->exec("
      UPDATE client.subscription_change_schedule
      SET status='FAILED', failed_at=now(), failure_reason='SUPERSEDED_BY_IMMEDIATE_VALUE_UPDATE', updated_at=now()
      WHERE subscription_id=CAST(:subscription_id AS uuid)
        AND status='SCHEDULED'
    ", [':subscription_id' => $subscriptionUuid]);

    $updateResult = $asaas->updateSubscriptionValue(
      $asaasSubscriptionId,
      $targetValue,
      ['updatePendingPayments' => true]
    );
    if (!(bool)($updateResult['ok'] ?? false)) {
      financialAuditNotifier()->recordActionFailed([
        'action_id' => $actionId,
        'error_reason' => 'Falha ao reduzir valor da assinatura no ASAAS',
        'payload' => ['asaas_response' => FinancialAuditNotifier::sanitizePayload($updateResult)],
      ]);
      Response::json([
        'error' => $updateResult['error_message_safe'] ?? 'Falha ao ajustar valor do plano para downgrade',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 502);
      return;
    }

    $ticketId = db()->one("
      INSERT INTO crm.tasks(title, task_type, status, details, sla_deadline)
      VALUES(:title, 'PLAN_DOWNGRADE_FEATURES', 'PENDING', :details, :sla)
      RETURNING id::text AS id
    ", [
      ':title' => 'Aplicar downgrade de funcionalidades no vencimento - org ' . $orgId,
      ':details' => safeJson([
        'organization_id' => $orgId,
        'subscription_id' => $subscriptionUuid,
        'asaas_subscription_id' => $asaasSubscriptionId,
        'from_plan' => (string)($sub['current_plan_code'] ?? ''),
        'to_plan' => $planCode,
        'from_value' => $currentValue,
        'to_value' => $targetValue,
        'effective_at' => $effectiveAt->format(DATE_ATOM),
        'action_id' => $actionId,
        'request_id' => $requestId,
        'note' => 'Valor reduzido no ASAAS imediatamente; manter funcionalidades atuais até effective_at.',
      ]),
      ':sla' => $effectiveAt->format('Y-m-d H:i:sP'),
    ])['id'] ?? null;

    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => $actionId,
      'after_state' => [
        'direction' => 'DOWNGRADE',
        'scheduled' => false,
        'effective_at' => $effectiveAt->format(DATE_ATOM),
        'features_ticket_id' => $ticketId,
      ],
      'payload' => [
        'direction' => 'DOWNGRADE',
        'prorata_amount' => 0.0,
        'prorata_payment_url' => null,
        'upgrade_charge' => null,
        'scheduled' => false,
        'effective_at' => $effectiveAt->format(DATE_ATOM),
        'features_ticket_id' => $ticketId,
      ],
    ]);

    Response::json([
      'ok' => true,
      'direction' => 'DOWNGRADE',
      'prorata_amount' => 0.0,
      'prorata_payment_url' => null,
      'upgrade_charge' => null,
      'scheduled' => false,
      'effective_at' => $effectiveAt->format(DATE_ATOM),
      'features_ticket_id' => $ticketId,
      'reset' => $resetSummary,
      'action_id' => $actionId,
      'request_id' => $requestId,
    ]);
    return;
  }

  $prorataResult = ['ok' => true, 'data' => []];
  $upgradeCharge = null;
  $prorataPaymentUrl = null;
  if ($prorataAmount >= 0.01) {
    $customerId = trim((string)($sub['asaas_customer_id'] ?? ''));
    if ($customerId === '') {
      $customerId = trim((string)($detailsData['customer'] ?? ''));
    }
    if ($customerId === '') {
      financialAuditNotifier()->recordActionFailed([
        'action_id' => $actionId,
        'error_reason' => 'Cliente ASAAS não encontrado para cobrança pró-rata de upgrade',
      ]);
      Response::json([
        'error' => 'Cliente de cobrança não encontrado para aplicar upgrade.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 422);
      return;
    }

    $chargeBillingType = $upgradePaymentMethod === 'PIX' ? 'PIX' : 'CREDIT_CARD';
    $chargePayload = [
      'customer' => $customerId,
      'value' => $prorataAmount,
      'dueDate' => date('Y-m-d'),
      'description' => sprintf('Upgrade de plano: %s -> %s', (string)($sub['current_plan_code'] ?? ''), $planCode),
      'externalReference' => sprintf('UPGRADE_PRORATA:%s:%s', $subscriptionUuid, $requestId),
      'billingType' => $chargeBillingType,
    ];
    if ($chargeBillingType === 'CREDIT_CARD') {
      $billingProfile = db()->one("
        SELECT card_token
        FROM client.billing_profiles
        WHERE subscription_id=CAST(:sid AS uuid)
        LIMIT 1
      ", [':sid' => $subscriptionUuid]);
      $cardToken = $upgradePaymentMethod === 'CREDIT_CARD_SAVED'
        ? trim((string)($billingProfile['card_token'] ?? ''))
        : '';

      if ($upgradePaymentMethod === 'CREDIT_CARD_NEW') {
        $cardNode = $request->input('card', []);
        if (!is_array($cardNode)) {
          $cardNode = [];
        }
        $holderName = trim((string)($cardNode['holder_name'] ?? ''));
        $cardNumber = normalizeDigits((string)($cardNode['number'] ?? ''));
        $expMonth = normalizeDigits((string)($cardNode['expiry_month'] ?? ''));
        $expYear = normalizeDigits((string)($cardNode['expiry_year'] ?? ''));
        $ccv = normalizeDigits((string)($cardNode['ccv'] ?? ''));
        if ($holderName === '' || strlen($cardNumber) < 13 || strlen($cardNumber) > 19 || $expMonth === '' || $expYear === '' || strlen($ccv) < 3 || strlen($ccv) > 4) {
          Response::json([
            'error' => 'Dados do novo cartão inválidos para cobrança do upgrade.',
            'action_id' => $actionId,
            'request_id' => $requestId,
          ], 422);
          return;
        }
        $orgForToken = db()->one("
          SELECT legal_name, billing_email, cpf_cnpj, billing_zip, billing_number, whatsapp
          FROM client.organizations
          WHERE id=CAST(:org_id AS uuid)
          LIMIT 1
        ", [':org_id' => $orgId]) ?: [];
        $tokenizePayload = [
          'customer' => $customerId,
          'creditCard' => [
            'holderName' => $holderName,
            'number' => $cardNumber,
            'expiryMonth' => str_pad($expMonth, 2, '0', STR_PAD_LEFT),
            'expiryYear' => $expYear,
            'ccv' => $ccv,
          ],
          'creditCardHolderInfo' => array_filter([
            'name' => trim((string)($orgForToken['legal_name'] ?? $holderName)),
            'email' => trim((string)($orgForToken['billing_email'] ?? '')),
            'cpfCnpj' => trim((string)($orgForToken['cpf_cnpj'] ?? '')),
            'postalCode' => trim((string)($orgForToken['billing_zip'] ?? '')),
            'addressNumber' => trim((string)($orgForToken['billing_number'] ?? '')),
            'phone' => trim((string)($orgForToken['whatsapp'] ?? '')),
          ], static fn($value): bool => is_string($value) && trim($value) !== ''),
          'remoteIp' => getClientIp(),
        ];
        $tokenizeResult = $asaas->tokenizeCreditCard($tokenizePayload);
        if (!(bool)($tokenizeResult['ok'] ?? false)) {
          Response::json([
            'error' => $tokenizeResult['error_message_safe'] ?? 'Não foi possível tokenizar o novo cartão.',
            'action_id' => $actionId,
            'request_id' => $requestId,
          ], 502);
          return;
        }
        $tokenData = is_array($tokenizeResult['data'] ?? null) ? $tokenizeResult['data'] : [];
        $cardToken = trim((string)($tokenData['creditCardToken'] ?? $tokenData['token'] ?? ''));
        if ($cardToken === '') {
          Response::json([
            'error' => 'Token do novo cartão não retornado para cobrança do upgrade.',
            'action_id' => $actionId,
            'request_id' => $requestId,
          ], 502);
          return;
        }
      }

      if ($cardToken === '') {
        financialAuditNotifier()->recordActionFailed([
          'action_id' => $actionId,
          'error_reason' => 'Token de cartão ausente para cobrança pró-rata de upgrade',
        ]);
        Response::json([
          'error' => 'Não encontramos cartão tokenizado para cobrança da diferença. Atualize o cartão ou use PIX.',
          'action_id' => $actionId,
          'request_id' => $requestId,
        ], 422);
        return;
      }
      $org = db()->one("
        SELECT legal_name, billing_email, cpf_cnpj, billing_zip, billing_number, whatsapp
        FROM client.organizations
        WHERE id=CAST(:org_id AS uuid)
        LIMIT 1
      ", [':org_id' => $orgId]) ?: [];
      $chargePayload['creditCardToken'] = $cardToken;
      $chargePayload['remoteIp'] = getClientIp();
      $chargePayload['creditCardHolderInfo'] = array_filter([
        'name' => trim((string)($org['legal_name'] ?? '')),
        'email' => trim((string)($org['billing_email'] ?? '')),
        'cpfCnpj' => trim((string)($org['cpf_cnpj'] ?? '')),
        'postalCode' => trim((string)($org['billing_zip'] ?? '')),
        'addressNumber' => trim((string)($org['billing_number'] ?? '')),
        'phone' => trim((string)($org['whatsapp'] ?? '')),
      ], static fn($value): bool => is_string($value) && trim($value) !== '');
    }

    $prorataResult = asaasCreatePaymentResilient($asaas, $chargePayload, 3);
    if (!(bool)($prorataResult['ok'] ?? false)) {
      financialAuditNotifier()->recordActionFailed([
        'action_id' => $actionId,
        'error_reason' => 'Falha na cobrança pró-rata de upgrade',
        'payload' => ['asaas_prorata_response' => FinancialAuditNotifier::sanitizePayload($prorataResult)],
      ]);
      Response::json([
        'error' => 'Não foi possível gerar a cobrança pró-rata do upgrade.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 502);
      return;
    }

    $chargeData = is_array($prorataResult['data'] ?? null) ? $prorataResult['data'] : [];
    $chargePaymentId = trim((string)($chargeData['id'] ?? ''));
    if ($chargePaymentId === '') {
      Response::json([
        'error' => 'Resposta inválida ao gerar cobrança da diferença.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 502);
      return;
    }

    upsertClientPaymentByAsaasId(
      $subscriptionUuid,
      $chargePaymentId,
      $prorataAmount,
      (string)($chargeData['status'] ?? 'PENDING'),
      $chargeBillingType,
      date('Y-m-d'),
      [
        'upgrade_prorata' => true,
        'upgrade_payment_method' => $upgradePaymentMethod,
        'provider_payment' => $chargeData,
      ]
    );

    if ($chargeBillingType === 'PIX') {
      $pixPayload = null;
      $pixEncodedImage = null;
      $pixExpirationDate = null;
      $pixResult = asaasGetPixQrCodeResilient($asaas, $chargePaymentId, 12);
      if ((bool)($pixResult['ok'] ?? false)) {
        $pixData = is_array($pixResult['data'] ?? null) ? $pixResult['data'] : [];
        $pixPayload = trim((string)($pixData['payload'] ?? ($pixData['copyPasteKey'] ?? ''))) ?: null;
        $pixEncodedImage = trim((string)($pixData['encodedImage'] ?? '')) ?: null;
        $pixExpirationDate = trim((string)($pixData['expirationDate'] ?? '')) ?: null;
      }
      $upgradeCharge = [
        'method' => 'PIX',
        'payment_id' => $chargePaymentId,
        'status' => strtoupper(trim((string)($chargeData['status'] ?? 'PENDING'))),
        'amount' => (float)$prorataAmount,
        'pix' => [
          'payload' => $pixPayload,
          'encodedImage' => $pixEncodedImage,
          'expirationDate' => $pixExpirationDate,
        ],
      ];
      $pixHasData = ($pixPayload !== null && $pixPayload !== '') || ($pixEncodedImage !== null && $pixEncodedImage !== '');
      if (!$pixHasData) {
        financialAuditNotifier()->recordActionFailed([
          'action_id' => $actionId,
          'error_reason' => 'PIX sem payload/QR para cobrança pró-rata de upgrade',
          'payload' => ['payment_id' => $chargePaymentId],
        ]);
        Response::json([
          'error' => 'Cobrança PIX gerada sem QR Code/payload. Tente novamente.',
          'action_id' => $actionId,
          'request_id' => $requestId,
        ], 502);
        return;
      }
    } else {
      $upgradeCharge = [
        'method' => 'CREDIT_CARD',
        'payment_id' => $chargePaymentId,
        'status' => strtoupper(trim((string)($chargeData['status'] ?? 'PENDING'))),
        'amount' => (float)$prorataAmount,
      ];
    }
  }

  $updateResult = $asaas->updateSubscriptionValue(
    $asaasSubscriptionId,
    $targetValue,
    ['updatePendingPayments' => !$isOverdue]
  );
  if (!(bool)($updateResult['ok'] ?? false)) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha ao atualizar valor da assinatura no ASAAS',
      'payload' => ['asaas_response' => FinancialAuditNotifier::sanitizePayload($updateResult)],
    ]);
    Response::json([
      'error' => $updateResult['error_message_safe'] ?? 'Falha ao atualizar valor da assinatura',
      'action_id' => $actionId,
      'request_id' => $requestId,
    ], 502);
    return;
  }

  db()->exec("UPDATE client.subscriptions SET plan_id=CAST(:plan_id AS uuid), price_override=NULL, updated_at=now() WHERE id=CAST(:sid AS uuid)", [
    ':plan_id' => (string)$plan['id'],
    ':sid' => $subscriptionUuid,
  ]);

  financialAuditNotifier()->recordActionConfirmed([
    'action_id' => $actionId,
    'after_state' => [
      'direction' => 'UPGRADE',
      'target_plan_code' => $planCode,
      'target_value' => $targetValue,
      'scheduled' => false,
    ],
    'payload' => [
      'direction' => 'UPGRADE',
      'prorata_amount' => $prorataAmount,
      'prorata_payment_url' => $prorataPaymentUrl,
      'upgrade_charge' => $upgradeCharge,
      'upgrade_payment_method' => $upgradePaymentMethod,
      'scheduled' => false,
      'effective_at' => null,
      'update_pending_payments' => !$isOverdue,
    ],
  ]);

  Response::json([
    'ok' => true,
    'direction' => 'UPGRADE',
    'prorata_amount' => $prorataAmount,
    'prorata_payment_url' => $prorataPaymentUrl,
    'upgrade_charge' => $upgradeCharge,
    'scheduled' => false,
    'effective_at' => null,
    'reset' => $resetSummary,
    'action_id' => $actionId,
    'request_id' => $requestId,
  ]);
});

$router->post('/api/billing/subscriptions/{id}/update-value', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  Response::json([
    'ok' => false,
    'error' => 'FORBIDDEN',
    'message' => 'Ajuste de valor não disponível para clientes.',
    'request_id' => $requestId,
  ], 403);
});

$router->get('/api/billing/subscriptions/{id}/status', function(Request $request) {
  ensureSubscriptionRecurringTables();
  $sid = (string)($request->query['id'] ?? '');
  if ($sid === '') {
    Response::json(['error' => 'Assinatura inválida'], 422);
    return;
  }
  $sub = db()->one("
    SELECT s.id, s.status, s.asaas_subscription_id, s.next_due_date, s.payment_method, s.price_override, p.name AS plan_name, p.monthly_price, COALESCE(s.price_override, p.monthly_price) AS effective_monthly_price
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
  $scheduled = db()->one("
    SELECT id::text AS id, change_type, target_value, effective_at
    FROM client.subscription_change_schedule
    WHERE asaas_subscription_id=:sid
      AND status='SCHEDULED'
    ORDER BY effective_at ASC
    LIMIT 1
  ", [':sid' => $sid]);
  Response::json([
    'ok' => true,
    'subscription' => $sub,
    'payment_status' => $paymentStatus,
    'can_login' => $status === 'ACTIVE',
    'scheduled_change' => $scheduled ?: null,
  ]);
});

$router->get('/api/billing/payments/{id}/status', function(Request $request) {
  requireClientAuth();
  $paymentId = trim((string)($request->query['id'] ?? ''));
  if ($paymentId === '') {
    Response::json(['error' => 'Pagamento inválido'], 422);
    return;
  }
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $payment = db()->one("
    SELECT p.asaas_payment_id, p.status, p.billing_type, p.paid_at::text AS paid_at, p.created_at::text AS created_at
    FROM client.payments p
    JOIN client.subscriptions s ON s.id = p.subscription_id
    WHERE p.asaas_payment_id = :pid
      AND s.organization_id = CAST(:org_id AS uuid)
    LIMIT 1
  ", [
    ':pid' => $paymentId,
    ':org_id' => $orgId,
  ]);
  if (!$payment) {
    Response::json(['ok' => false, 'status' => 'NOT_FOUND'], 404);
    return;
  }

  $status = strtoupper(trim((string)($payment['status'] ?? 'PENDING')));
  if (in_array($status, ['PENDING', 'OVERDUE'], true)) {
    $asaas = new AsaasClient();
    $provider = $asaas->getPayment($paymentId);
    if ((bool)($provider['ok'] ?? false)) {
      $providerData = is_array($provider['data'] ?? null) ? $provider['data'] : [];
      $providerStatus = strtoupper(trim((string)($providerData['status'] ?? '')));
      if ($providerStatus !== '' && $providerStatus !== $status) {
        $paidAt = trim((string)($providerData['paymentDate'] ?? $providerData['confirmedDate'] ?? ''));
        db()->exec("
          UPDATE client.payments
          SET
            status = :status,
            paid_at = CASE WHEN :paid_at <> '' THEN CAST(:paid_at AS timestamptz) ELSE paid_at END,
            raw_payload = CASE
              WHEN raw_payload IS NULL THEN CAST(:raw_payload AS jsonb)
              ELSE raw_payload || CAST(:raw_payload AS jsonb)
            END
          WHERE asaas_payment_id = :pid
        ", [
          ':status' => $providerStatus,
          ':paid_at' => $paidAt,
          ':raw_payload' => safeJson([
            'status_sync_source' => 'ASAAS_STATUS_ENDPOINT',
            'provider_status_sync_at' => gmdate(DATE_ATOM),
            'provider_payment' => $providerData,
          ]),
          ':pid' => $paymentId,
        ]);
        $status = $providerStatus;
      }
    }
  }

  $confirmed = in_array($status, ['RECEIVED', 'CONFIRMED', 'PAID'], true);
  $cancelled = in_array($status, ['CANCELED', 'CANCELLED'], true);
  Response::json([
    'ok' => true,
    'payment_id' => (string)($payment['asaas_payment_id'] ?? $paymentId),
    'status' => $status,
    'billing_type' => (string)($payment['billing_type'] ?? ''),
    'confirmed' => $confirmed,
    'cancelled' => $cancelled,
    'paid_at' => isset($payment['paid_at']) ? (string)$payment['paid_at'] : null,
  ]);
});

$router->post('/api/billing/payments/{id}/cancel', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  $requestId = requestCorrelationId($request);
  $paymentId = trim((string)($request->query['id'] ?? ''));
  if ($paymentId === '') {
    Response::json(['error' => 'Pagamento inválido', 'request_id' => $requestId], 422);
    return;
  }
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $payment = db()->one("
    SELECT p.subscription_id::text AS subscription_id, p.asaas_payment_id, p.status, p.billing_type
    FROM client.payments p
    JOIN client.subscriptions s ON s.id = p.subscription_id
    WHERE p.asaas_payment_id = :pid
      AND s.organization_id = CAST(:org_id AS uuid)
    LIMIT 1
  ", [
    ':pid' => $paymentId,
    ':org_id' => $orgId,
  ]);
  if (!$payment) {
    Response::json(['error' => 'Pagamento não encontrado', 'request_id' => $requestId], 404);
    return;
  }

  $billingType = strtoupper(trim((string)($payment['billing_type'] ?? '')));
  $status = strtoupper(trim((string)($payment['status'] ?? '')));
  if ($billingType !== 'PIX') {
    Response::json([
      'ok' => true,
      'cancelled' => false,
      'reason' => 'ONLY_PIX_SUPPORTED',
      'request_id' => $requestId,
    ]);
    return;
  }
  if (in_array($status, ['CANCELED', 'CANCELLED'], true)) {
    Response::json([
      'ok' => true,
      'cancelled' => true,
      'already_cancelled' => true,
      'request_id' => $requestId,
    ]);
    return;
  }

  $asaas = new AsaasClient();
  $cancel = $asaas->cancelPayment($paymentId);
  if (!(bool)($cancel['ok'] ?? false)) {
    Response::json([
      'ok' => false,
      'error' => $cancel['error_message_safe'] ?? 'Não foi possível cancelar o PIX.',
      'request_id' => $requestId,
    ], 502);
    return;
  }

  db()->exec("
    UPDATE client.payments
    SET
      status='CANCELED',
      raw_payload = CASE
        WHEN raw_payload IS NULL THEN CAST(:payload AS jsonb)
        ELSE raw_payload || CAST(:payload AS jsonb)
      END
    WHERE asaas_payment_id = :pid
  ", [
    ':pid' => $paymentId,
    ':payload' => safeJson([
      'cancelled_by' => 'CLIENT_MODAL_CANCEL',
      'cancelled_at' => gmdate(DATE_ATOM),
      'cancelled_request_id' => $requestId,
    ]),
  ]);

  Response::json([
    'ok' => true,
    'cancelled' => true,
    'request_id' => $requestId,
  ]);
});

$router->post('/api/billing/subscriptions/{id}/retry', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  $requestId = requestCorrelationId($request);
  $sid = (string)($request->query['id'] ?? '');
  if ($sid === '') {
    Response::json(['error' => 'Assinatura inválida'], 422);
    return;
  }
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $userId = (string)($_SESSION['client_user']['id'] ?? '');
  $sub = db()->one("
    SELECT s.id::text AS id, s.asaas_customer_id, s.asaas_subscription_id, s.organization_id::text AS organization_id, d.id::text AS deal_id
    FROM client.subscriptions s
    LEFT JOIN LATERAL (
      SELECT id
      FROM crm.deal
      WHERE organization_id = s.organization_id
      ORDER BY updated_at DESC
      LIMIT 1
    ) d ON true
    WHERE s.asaas_subscription_id=:sid
       OR s.id::text=:sid
    LIMIT 1
  ", [':sid' => $sid]);
  if (!$sub) {
    Response::json(['error' => 'Assinatura não encontrada'], 404);
    return;
  }
  if ((string)($sub['organization_id'] ?? '') !== $orgId) {
    Response::json(['error' => 'Assinatura não pertence ao usuário autenticado'], 403);
    return;
  }

  $action = financialAuditNotifier()->recordActionRequested([
    'action_type' => 'RETRY_PAYMENT',
    'entity_type' => 'SUBSCRIPTION',
    'entity_id' => (string)($sub['id'] ?? $sid),
    'org_id' => $orgId,
    'user_id' => $userId,
    'deal_id' => (string)($sub['deal_id'] ?? ''),
    'request_id' => $requestId,
    'correlation_id' => $requestId,
    'payload' => [
      'asaas_subscription_id' => (string)($sub['asaas_subscription_id'] ?? ''),
      'mode' => strtoupper(trim((string)$request->input('mode', 'OVERDUE'))),
      'billing_type' => strtoupper(trim((string)$request->input('billing_type', 'PIX'))),
    ],
    'source' => 'PORTAL_API',
  ]);
  $actionId = (string)($action['action_id'] ?? '');

  $asaas = new AsaasClient();
  $subscriptionUuid = (string)($sub['id'] ?? '');
  $billingType = strtoupper(trim((string)$request->input('billing_type', 'PIX')));
  if (!in_array($billingType, ['PIX', 'CREDIT_CARD_SAVED', 'CREDIT_CARD_NEW'], true)) {
    $billingType = 'PIX';
  }
  $chargeBillingType = $billingType === 'PIX' ? 'PIX' : 'CREDIT_CARD';
  $mode = strtoupper(trim((string)$request->input('mode', 'OVERDUE')));
  if (!in_array($mode, ['OVERDUE', 'ANTICIPATE'], true)) {
    $mode = 'OVERDUE';
  }

  $original = db()->one("
    SELECT asaas_payment_id, amount, status, due_date::text AS due_date, raw_payload
    FROM client.payments
    WHERE subscription_id=CAST(:sid AS uuid)
      AND status IN ('PENDING','OVERDUE')
    ORDER BY due_date ASC NULLS LAST, created_at ASC
    LIMIT 1
  ", [':sid' => $subscriptionUuid]);
  if (!$original) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Nenhuma cobrança pendente encontrada para pagamento alternativo',
    ]);
    Response::json([
      'error' => 'Nenhuma cobrança pendente encontrada para pagamento.',
      'action_id' => $actionId,
      'request_id' => $requestId,
    ], 404);
    return;
  }

  $originalDue = trim((string)($original['due_date'] ?? ''));
  if ($mode === 'ANTICIPATE') {
    if ($originalDue === '') {
      Response::json([
        'error' => 'Não foi possível antecipar sem data de vencimento.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 422);
      return;
    }
    $daysToDue = (int)floor((strtotime($originalDue . ' 00:00:00') - strtotime(date('Y-m-d') . ' 00:00:00')) / 86400);
    if ($daysToDue < 0 || $daysToDue > 5) {
      Response::json([
        'error' => 'Antecipação via Pix disponível apenas nos 5 dias anteriores ao vencimento.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 422);
      return;
    }
  }

  $originalPaymentId = trim((string)($original['asaas_payment_id'] ?? ''));
  $existingAlt = db()->one("
    SELECT asaas_payment_id
    FROM client.payments
    WHERE subscription_id=CAST(:sid AS uuid)
      AND status IN ('PENDING','OVERDUE')
      AND coalesce(raw_payload->>'alt_for','')=:alt_for
      AND upper(coalesce(raw_payload->>'alt_billing_type',''))=:alt_billing_type
    ORDER BY created_at DESC
    LIMIT 1
  ", [
    ':sid' => $subscriptionUuid,
    ':alt_for' => $originalPaymentId,
    ':alt_billing_type' => $chargeBillingType,
  ]);

  $altPaymentId = trim((string)($existingAlt['asaas_payment_id'] ?? ''));
  $createdRaw = [];
  if ($altPaymentId === '') {
    $value = isset($original['amount']) && is_numeric($original['amount']) ? (float)$original['amount'] : 0.0;
    if ($value <= 0) {
      Response::json([
        'error' => 'Valor inválido para pagamento alternativo.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 422);
      return;
    }
    $paymentPayload = [
      'customer' => trim((string)($sub['asaas_customer_id'] ?? '')),
      'billingType' => $chargeBillingType,
      'value' => round($value, 2),
      'dueDate' => date('Y-m-d'),
      'description' => $mode === 'ANTICIPATE' ? 'Antecipação de cobrança da assinatura' : 'Pagamento alternativo de cobrança em atraso',
      'externalReference' => sprintf('ALT_FOR:%s:%s', $originalPaymentId, $subscriptionUuid),
    ];

    if ($chargeBillingType === 'CREDIT_CARD') {
      $billingProfile = db()->one("
        SELECT card_token
        FROM client.billing_profiles
        WHERE subscription_id=CAST(:sid AS uuid)
        LIMIT 1
      ", [':sid' => $subscriptionUuid]);
      $cardToken = $billingType === 'CREDIT_CARD_SAVED'
        ? trim((string)($billingProfile['card_token'] ?? ''))
        : '';

      if ($billingType === 'CREDIT_CARD_NEW') {
        $cardNode = $request->input('card', []);
        if (!is_array($cardNode)) {
          $cardNode = [];
        }
        $holderName = trim((string)($cardNode['holder_name'] ?? ''));
        $cardNumber = normalizeDigits((string)($cardNode['number'] ?? ''));
        $expMonth = normalizeDigits((string)($cardNode['expiry_month'] ?? ''));
        $expYear = normalizeDigits((string)($cardNode['expiry_year'] ?? ''));
        $ccv = normalizeDigits((string)($cardNode['ccv'] ?? ''));
        if ($holderName === '' || strlen($cardNumber) < 13 || strlen($cardNumber) > 19 || $expMonth === '' || $expYear === '' || strlen($ccv) < 3 || strlen($ccv) > 4) {
          Response::json([
            'error' => 'Dados do novo cartão inválidos para pagamento.',
            'action_id' => $actionId,
            'request_id' => $requestId,
          ], 422);
          return;
        }
        $orgForToken = db()->one("
          SELECT legal_name, billing_email, cpf_cnpj, billing_zip, billing_number, whatsapp
          FROM client.organizations
          WHERE id=CAST(:org_id AS uuid)
          LIMIT 1
        ", [':org_id' => $orgId]) ?: [];
        $tokenizePayload = [
          'customer' => trim((string)($sub['asaas_customer_id'] ?? '')),
          'creditCard' => [
            'holderName' => $holderName,
            'number' => $cardNumber,
            'expiryMonth' => str_pad($expMonth, 2, '0', STR_PAD_LEFT),
            'expiryYear' => $expYear,
            'ccv' => $ccv,
          ],
          'creditCardHolderInfo' => array_filter([
            'name' => trim((string)($orgForToken['legal_name'] ?? $holderName)),
            'email' => trim((string)($orgForToken['billing_email'] ?? '')),
            'cpfCnpj' => trim((string)($orgForToken['cpf_cnpj'] ?? '')),
            'postalCode' => trim((string)($orgForToken['billing_zip'] ?? '')),
            'addressNumber' => trim((string)($orgForToken['billing_number'] ?? '')),
            'phone' => trim((string)($orgForToken['whatsapp'] ?? '')),
          ], static fn($value): bool => is_string($value) && trim($value) !== ''),
          'remoteIp' => getClientIp(),
        ];
        $tokenizeResult = $asaas->tokenizeCreditCard($tokenizePayload);
        if (!(bool)($tokenizeResult['ok'] ?? false)) {
          Response::json([
            'error' => $tokenizeResult['error_message_safe'] ?? 'Não foi possível tokenizar o novo cartão.',
            'action_id' => $actionId,
            'request_id' => $requestId,
          ], 502);
          return;
        }
        $tokenData = is_array($tokenizeResult['data'] ?? null) ? $tokenizeResult['data'] : [];
        $cardToken = trim((string)($tokenData['creditCardToken'] ?? $tokenData['token'] ?? ''));
      }

      if ($cardToken === '') {
        Response::json([
          'error' => 'Não encontramos cartão tokenizado para pagamento. Atualize o cartão ou use PIX.',
          'action_id' => $actionId,
          'request_id' => $requestId,
        ], 422);
        return;
      }

      $org = db()->one("
        SELECT legal_name, billing_email, cpf_cnpj, billing_zip, billing_number, whatsapp
        FROM client.organizations
        WHERE id=CAST(:org_id AS uuid)
        LIMIT 1
      ", [':org_id' => $orgId]) ?: [];

      $paymentPayload['creditCardToken'] = $cardToken;
      $paymentPayload['remoteIp'] = getClientIp();
      $paymentPayload['creditCardHolderInfo'] = array_filter([
        'name' => trim((string)($org['legal_name'] ?? '')),
        'email' => trim((string)($org['billing_email'] ?? '')),
        'cpfCnpj' => trim((string)($org['cpf_cnpj'] ?? '')),
        'postalCode' => trim((string)($org['billing_zip'] ?? '')),
        'addressNumber' => trim((string)($org['billing_number'] ?? '')),
        'phone' => trim((string)($org['whatsapp'] ?? '')),
      ], static fn($value): bool => is_string($value) && trim($value) !== '');
    }
    $createResult = asaasCreatePaymentResilient($asaas, $paymentPayload, 3);
    if (!(bool)($createResult['ok'] ?? false)) {
      financialAuditNotifier()->recordActionFailed([
        'action_id' => $actionId,
        'error_reason' => 'Falha ao criar pagamento alternativo PIX',
        'payload' => ['asaas_response' => FinancialAuditNotifier::sanitizePayload($createResult)],
      ]);
      Response::json([
        'error' => $createResult['error_message_safe'] ?? 'Não foi possível gerar pagamento alternativo.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 502);
      return;
    }
    $createdRaw = is_array($createResult['data'] ?? null) ? $createResult['data'] : [];
    $altPaymentId = trim((string)($createdRaw['id'] ?? ''));
    if ($altPaymentId === '') {
      Response::json([
        'error' => 'Asaas não retornou identificador do pagamento alternativo.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 502);
      return;
    }
    upsertClientPaymentByAsaasId(
      $subscriptionUuid,
      $altPaymentId,
      (float)$paymentPayload['value'],
      (string)($createdRaw['status'] ?? 'PENDING'),
      $chargeBillingType,
      (string)$paymentPayload['dueDate'],
      [
        'alt_for' => $originalPaymentId,
        'alt_mode' => $mode,
        'alt_billing_type' => $chargeBillingType,
        'requested_payment_method' => $billingType,
        'created_from_request_id' => $requestId,
        'provider_payment' => $createdRaw,
      ]
    );
  }

  $pix = null;
  if ($chargeBillingType === 'PIX') {
    $pixResult = asaasGetPixQrCodeResilient($asaas, $altPaymentId, 12);
    if ((bool)($pixResult['ok'] ?? false)) {
      $pixData = is_array($pixResult['data'] ?? null) ? $pixResult['data'] : [];
      $pix = [
        'encodedImage' => $pixData['encodedImage'] ?? null,
        'payload' => $pixData['payload'] ?? ($pixData['copyPasteKey'] ?? null),
        'expirationDate' => $pixData['expirationDate'] ?? null,
      ];
    }
  }

  if ($altPaymentId === '') {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha ao preparar pagamento alternativo',
    ]);
    Response::json([
      'error' => 'Não foi possível preparar pagamento alternativo.',
      'action_id' => $actionId,
      'request_id' => $requestId,
    ], 502);
    return;
  }

  financialAuditNotifier()->recordActionConfirmed([
    'action_id' => $actionId,
    'after_state' => [
      'payment_id' => $altPaymentId,
      'billing_type' => $chargeBillingType,
      'original_payment_id' => $originalPaymentId !== '' ? $originalPaymentId : null,
      'mode' => $mode,
    ],
  ]);
  Response::json([
    'ok' => true,
    'mode' => $mode,
    'billing_type' => $chargeBillingType,
    'payment_id' => $altPaymentId,
    'original_payment_id' => $originalPaymentId !== '' ? $originalPaymentId : null,
    'pix' => $pix,
    'action_id' => $actionId,
    'request_id' => $requestId,
  ]);
});

$router->post('/api/billing/card/update', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $userId = (string)($_SESSION['client_user']['id'] ?? '');

  $subscription = db()->one("
    SELECT s.id::text AS id, s.asaas_subscription_id, s.asaas_customer_id, d.id::text AS deal_id
    FROM client.subscriptions s
    LEFT JOIN LATERAL (
      SELECT id
      FROM crm.deal
      WHERE organization_id = s.organization_id
      ORDER BY updated_at DESC
      LIMIT 1
    ) d ON true
    WHERE s.organization_id=CAST(:oid AS uuid)
    ORDER BY s.created_at DESC
    LIMIT 1
  ", [':oid' => $orgId]);
  if (!$subscription) {
    Response::json(['error' => 'Assinatura não encontrada para atualização de cartão', 'request_id' => $requestId], 404);
    return;
  }

  $requestedSid = trim((string)$request->input('asaas_subscription_id', ''));
  $sid = trim((string)($subscription['asaas_subscription_id'] ?? ''));
  if ($requestedSid !== '' && $sid !== '' && $requestedSid !== $sid) {
    Response::json(['error' => 'Assinatura não pertence ao usuário autenticado', 'request_id' => $requestId], 403);
    return;
  }
  if ($sid === '') {
    Response::json(['error' => 'Assinatura sem vínculo no ASAAS', 'request_id' => $requestId], 422);
    return;
  }

  $subscriptionUuid = (string)($subscription['id'] ?? '');
  $actionId = toUuidFromScalar($requestId . ':CARD_UPDATE:' . $subscriptionUuid);
  $existingAction = db()->one("
    SELECT status, payload
    FROM audit.financial_actions
    WHERE action_id=CAST(:action_id AS uuid)
    LIMIT 1
  ", [':action_id' => $actionId]);
  $existingPayload = [];
  if (is_string($existingAction['payload'] ?? null)) {
    $decoded = json_decode((string)$existingAction['payload'], true);
    if (is_array($decoded)) {
      $existingPayload = $decoded;
    }
  } elseif (is_array($existingAction['payload'] ?? null)) {
    $existingPayload = $existingAction['payload'];
  }
  if (strtoupper((string)($existingAction['status'] ?? '')) === 'CONFIRMED') {
    Response::json([
      'ok' => true,
      'idempotent' => true,
      'updated' => (bool)($existingPayload['updated'] ?? false),
      'provider_flow' => (string)($existingPayload['provider_flow'] ?? 'CUSTOMER_BILLING_UPDATE'),
      'card_update_url' => isset($existingPayload['card_update_url']) && is_string($existingPayload['card_update_url']) && trim($existingPayload['card_update_url']) !== ''
        ? trim((string)$existingPayload['card_update_url'])
        : null,
      'action_id' => $actionId,
      'request_id' => $requestId,
    ]);
    return;
  }

  $action = financialAuditNotifier()->recordActionRequested([
    'action_id' => $actionId,
    'action_type' => 'CARD_UPDATE_REQUESTED',
    'entity_type' => 'SUBSCRIPTION',
    'entity_id' => $subscriptionUuid,
    'org_id' => $orgId,
    'user_id' => $userId,
    'deal_id' => (string)($subscription['deal_id'] ?? ''),
    'request_id' => $requestId,
    'correlation_id' => $requestId,
    'payload' => [
      'asaas_subscription_id' => $sid,
      'asaas_customer_id' => (string)($subscription['asaas_customer_id'] ?? ''),
      'policy' => 'NO_CHARGE_CARD_UPDATE',
      'mode' => trim((string)$request->input('creditCardToken', '')) !== '' ? 'TOKEN' : 'LINK',
    ],
    'source' => 'PORTAL_API',
  ]);
  $actionId = (string)($action['action_id'] ?? $actionId);

  $asaas = new AsaasClient();
  $creditCardToken = trim((string)$request->input('creditCardToken', ''));
  $cardLast4 = null;
  $cardBrand = null;
  if ($creditCardToken === '') {
    $cardNode = $request->input('card', []);
    if (!is_array($cardNode)) {
      $cardNode = [];
    }
    $holderName = trim((string)($cardNode['holder_name'] ?? ''));
    $cardNumber = normalizeDigits((string)($cardNode['number'] ?? ''));
    $expMonth = normalizeDigits((string)($cardNode['expiry_month'] ?? ''));
    $expYear = normalizeDigits((string)($cardNode['expiry_year'] ?? ''));
    $ccv = normalizeDigits((string)($cardNode['ccv'] ?? ''));
    $cardLast4 = strlen($cardNumber) >= 4 ? substr($cardNumber, -4) : null;
    if ($holderName === '' || strlen($cardNumber) < 13 || strlen($cardNumber) > 19 || $expMonth === '' || $expYear === '' || strlen($ccv) < 3 || strlen($ccv) > 4) {
      Response::json([
        'error' => 'Dados do cartão inválidos para atualização.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 422);
      return;
    }

    $org = db()->one("
      SELECT legal_name, billing_email, cpf_cnpj, billing_zip, billing_number, whatsapp
      FROM client.organizations
      WHERE id=CAST(:org_id AS uuid)
      LIMIT 1
    ", [':org_id' => $orgId]) ?: [];

    $forwardedFor = trim((string)(requestHeader($request, 'X-Forwarded-For') ?? ''));
    $remoteIp = '';
    if ($forwardedFor !== '') {
      $parts = explode(',', $forwardedFor);
      $remoteIp = trim((string)($parts[0] ?? ''));
    }
    if ($remoteIp === '') {
      $remoteIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    }
    if ($remoteIp === '') {
      $remoteIp = '127.0.0.1';
    }

    $tokenizePayload = [
      'customer' => (string)($subscription['asaas_customer_id'] ?? ''),
      'creditCard' => [
        'holderName' => $holderName,
        'number' => $cardNumber,
        'expiryMonth' => str_pad($expMonth, 2, '0', STR_PAD_LEFT),
        'expiryYear' => $expYear,
        'ccv' => $ccv,
      ],
      'creditCardHolderInfo' => array_filter([
        'name' => trim((string)($org['legal_name'] ?? $holderName)),
        'email' => trim((string)($org['billing_email'] ?? '')),
        'cpfCnpj' => trim((string)($org['cpf_cnpj'] ?? '')),
        'postalCode' => trim((string)($org['billing_zip'] ?? '')),
        'addressNumber' => trim((string)($org['billing_number'] ?? '')),
        'phone' => trim((string)($org['whatsapp'] ?? '')),
      ], static fn($v) => is_string($v) && trim($v) !== ''),
      'remoteIp' => $remoteIp,
    ];
    $tokenizeResult = $asaas->tokenizeCreditCard($tokenizePayload);
    if (!(bool)($tokenizeResult['ok'] ?? false)) {
      $status = 502;
      $errorCode = strtoupper(trim((string)($tokenizeResult['error_code'] ?? '')));
      if (str_contains($errorCode, 'TOKEN')) {
        $status = 422;
      }
      Response::json([
        'error' => $status === 422
          ? 'Tokenização não habilitada na conta Asaas. Solicite liberação ao gerente de contas.'
          : ($tokenizeResult['error_message_safe'] ?? 'Não foi possível tokenizar o cartão.'),
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], $status);
      return;
    }
    $tokenData = is_array($tokenizeResult['data'] ?? null) ? $tokenizeResult['data'] : [];
    $cardBrandCandidate = trim((string)($tokenData['creditCardBrand'] ?? $tokenData['brand'] ?? ''));
    if ($cardBrandCandidate !== '') {
      $cardBrand = $cardBrandCandidate;
    }
    $creditCardToken = trim((string)($tokenData['creditCardToken'] ?? $tokenData['token'] ?? ''));
    if ($creditCardToken === '' && trim((string)(getenv('ASAAS_API_KEY') ?: '')) === '') {
      $creditCardToken = 'mock_card_token_' . substr((string)$subscriptionUuid, 0, 8);
    }
    if ($creditCardToken === '') {
      Response::json([
        'error' => 'Token do cartão não retornado pelo provedor.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], 502);
      return;
    }
  }

  if ($creditCardToken !== '') {
    $org = db()->one("
      SELECT legal_name, billing_email, cpf_cnpj, billing_zip, billing_number, whatsapp
      FROM client.organizations
      WHERE id=CAST(:org_id AS uuid)
      LIMIT 1
    ", [':org_id' => $orgId]) ?: [];

    $forwardedFor = trim((string)(requestHeader($request, 'X-Forwarded-For') ?? ''));
    $remoteIp = '';
    if ($forwardedFor !== '') {
      $parts = explode(',', $forwardedFor);
      $remoteIp = trim((string)($parts[0] ?? ''));
    }
    if ($remoteIp === '') {
      $remoteIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    }
    if ($remoteIp === '') {
      $remoteIp = '127.0.0.1';
    }

    $holderInfo = array_filter([
      'name' => trim((string)($org['legal_name'] ?? '')),
      'email' => trim((string)($org['billing_email'] ?? '')),
      'cpfCnpj' => trim((string)($org['cpf_cnpj'] ?? '')),
      'postalCode' => trim((string)($org['billing_zip'] ?? '')),
      'addressNumber' => trim((string)($org['billing_number'] ?? '')),
      'phone' => trim((string)($org['whatsapp'] ?? '')),
    ], static fn($v) => is_string($v) && trim($v) !== '');

    $providerPayload = [
      'creditCardToken' => $creditCardToken,
      'remoteIp' => $remoteIp,
      'creditCardHolderInfo' => $holderInfo,
    ];
    $updateResult = $asaas->updateSubscriptionCreditCardWithoutCharge($sid, $providerPayload);
    if (!(bool)($updateResult['ok'] ?? false)) {
      financialAuditNotifier()->recordActionFailed([
        'action_id' => $actionId,
        'error_reason' => 'Falha ao atualizar cartão da assinatura sem cobrança imediata',
        'payload' => ['asaas_response' => FinancialAuditNotifier::sanitizePayload($updateResult)],
      ]);
      $statusCode = (int)($updateResult['status_code'] ?? 502);
      if ($statusCode < 400 || $statusCode >= 600) {
        $statusCode = 502;
      } elseif ($statusCode >= 500) {
        $statusCode = 502;
      } elseif ($statusCode !== 400 && $statusCode !== 401 && $statusCode !== 403 && $statusCode !== 404 && $statusCode !== 422) {
        $statusCode = 400;
      }
      Response::json([
        'error' => $updateResult['error_message_safe'] ?? 'Não foi possível atualizar o cartão da assinatura neste momento.',
        'action_id' => $actionId,
        'request_id' => $requestId,
      ], $statusCode);
      return;
    }

    try {
      db()->exec("
        INSERT INTO client.billing_profiles(subscription_id, card_last4, card_brand, card_token, card_token_updated_at, is_validated, created_at)
        VALUES(CAST(:sid AS uuid), :card_last4, :card_brand, :card_token, now(), true, now())
        ON CONFLICT(subscription_id)
        DO UPDATE SET
          card_last4 = COALESCE(EXCLUDED.card_last4, client.billing_profiles.card_last4),
          card_brand = COALESCE(EXCLUDED.card_brand, client.billing_profiles.card_brand),
          card_token = COALESCE(EXCLUDED.card_token, client.billing_profiles.card_token),
          card_token_updated_at = CASE
            WHEN EXCLUDED.card_token IS NOT NULL THEN now()
            ELSE client.billing_profiles.card_token_updated_at
          END,
          is_validated = client.billing_profiles.is_validated OR EXCLUDED.is_validated
      ", [
        ':sid' => $subscriptionUuid,
        ':card_last4' => $cardLast4,
        ':card_brand' => $cardBrand,
        ':card_token' => $creditCardToken,
      ]);
    } catch (\Throwable) {
      // best-effort em schema legado
    }
    db()->exec("
      UPDATE client.subscriptions
      SET billing_profile_updated_at=now(), updated_at=now()
      WHERE id=CAST(:sid AS uuid)
    ", [':sid' => $subscriptionUuid]);

    financialAuditNotifier()->recordActionConfirmed([
      'action_id' => $actionId,
      'after_state' => [
        'provider_flow' => 'ASAAS_SUBSCRIPTION_CREDITCARD_PUT',
        'updated' => true,
      ],
      'payload' => [
        'asaas_subscription_id' => $sid,
        'provider_flow' => 'ASAAS_SUBSCRIPTION_CREDITCARD_PUT',
        'updated' => true,
        'card_token_present' => true,
      ],
    ]);

    Response::json([
      'ok' => true,
      'updated' => true,
      'provider_flow' => 'ASAAS_SUBSCRIPTION_CREDITCARD_PUT',
      'card_update_url' => null,
      'action_id' => $actionId,
      'request_id' => $requestId,
    ]);
    return;
  }
  Response::json([
    'error' => 'Token do cartão não informado.',
    'action_id' => $actionId,
    'request_id' => $requestId,
  ], 422);
});

$router->post('/api/billing/subscriptions/{id}/cancel', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  if (!featureFlagEnabled('FEATURE_PORTAL_CANCEL_SUBSCRIPTION', true)) {
    Response::json(['error' => 'Funcionalidade de cancelamento não habilitada neste ambiente', 'request_id' => $requestId], 403);
    return;
  }
  $sid = (string)($request->query['id'] ?? '');
  if ($sid === '') {
    Response::json(['error' => 'Assinatura inválida'], 422);
    return;
  }
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $userId = (string)($_SESSION['client_user']['id'] ?? '');
  $cancelMode = strtoupper(trim((string)$request->input('mode', 'END_OF_CYCLE')));
  if (!in_array($cancelMode, ['END_OF_CYCLE', 'IMMEDIATE'], true)) {
    $cancelMode = 'END_OF_CYCLE';
  }
  $sub = db()->one("
    SELECT s.id::text AS id, s.organization_id::text AS organization_id, s.status, s.asaas_subscription_id, d.id::text AS deal_id
    FROM client.subscriptions s
    LEFT JOIN LATERAL (
      SELECT id
      FROM crm.deal
      WHERE organization_id = s.organization_id
      ORDER BY updated_at DESC
      LIMIT 1
    ) d ON true
    WHERE s.asaas_subscription_id=:sid
    LIMIT 1
  ", [':sid' => $sid]);
  if (!$sub || (string)($sub['organization_id'] ?? '') !== $orgId) {
    Response::json(['error' => 'Assinatura não pertence ao usuário autenticado'], 403);
    return;
  }
  $action = financialAuditNotifier()->recordActionRequested([
    'action_type' => 'CANCEL_SUBSCRIPTION',
    'entity_type' => 'SUBSCRIPTION',
    'entity_id' => $sid,
    'org_id' => $orgId,
    'user_id' => $userId,
    'deal_id' => (string)($sub['deal_id'] ?? ''),
    'request_id' => $requestId,
    'correlation_id' => $requestId,
    'before_state' => ['subscription_status' => (string)($sub['status'] ?? '')],
    'payload' => ['mode' => $cancelMode, 'asaas_subscription_id' => $sid],
    'source' => 'PORTAL_API',
  ]);
  $actionId = (string)($action['action_id'] ?? '');
  $asaas = new AsaasClient();
  $result = $asaas->cancelSubscription($sid, $cancelMode);
  if (!(bool)($result['ok'] ?? false)) {
    financialAuditNotifier()->recordActionFailed([
      'action_id' => $actionId,
      'error_reason' => 'Falha ao solicitar cancelamento no ASAAS',
      'payload' => ['asaas_response' => FinancialAuditNotifier::sanitizePayload($result)],
    ]);
    Response::json([
      'error' => $result['error_message_safe'] ?? 'Falha ao solicitar cancelamento',
      'action_id' => $actionId,
      'request_id' => $requestId,
    ], 502);
    return;
  }
  $localStatus = $cancelMode === 'IMMEDIATE' ? 'CANCELED' : 'INACTIVE';
  $clearNextDue = $cancelMode === 'IMMEDIATE';
  db()->exec(
    "UPDATE client.subscriptions
     SET
       status = CAST(:status AS varchar),
       updated_at = now(),
       next_due_date = CASE WHEN CAST(:clear_next_due AS boolean) THEN NULL ELSE next_due_date END
     WHERE id = CAST(:id AS uuid)",
    [
      ':status' => $localStatus,
      ':clear_next_due' => $clearNextDue ? 'true' : 'false',
      ':id' => (string)$sub['id'],
    ]
  );
  financialAuditNotifier()->recordActionConfirmed([
    'action_id' => $actionId,
    'after_state' => [
      'subscription_status' => $localStatus,
      'cancel_mode' => $cancelMode,
    ],
    'payload' => [
      'mode' => $cancelMode,
      'asaas_subscription_id' => (string)($sub['asaas_subscription_id'] ?? $sid),
      'provider_status_code' => (int)($result['status_code'] ?? 200),
    ],
  ]);
  Response::json([
    'ok' => true,
    'mode' => $cancelMode,
    'subscription_status' => $localStatus,
    'action_id' => $actionId,
    'request_id' => $requestId,
  ]);
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
  ensureClientProjectTables();
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
  $projectId = trim((string)($data['project_id'] ?? ''));
  if ($projectId === '') {
    $projectId = currentClientProjectId((string)$org['id']) ?? '';
  }
  if ($projectId === '') {
    $fallbackProject = db()->one("
      SELECT id::text AS id
      FROM client.projects
      WHERE organization_id = CAST(:oid AS uuid)
      ORDER BY
        CASE WHEN upper(coalesce(status, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
    ", [':oid' => (string)$org['id']]);
    $projectId = trim((string)($fallbackProject['id'] ?? ''));
  }
  if ($projectId !== '') {
    $ownedProject = loadProjectOwnedByOrganization($projectId, (string)$org['id']);
    if (!$ownedProject) {
      Response::json(['error' => 'Projeto inválido para este briefing.'], 403);
      return;
    }
  }
  $required = ['objective','audience'];
  $errors = Validator::required($data, $required);
  if ($errors) {
    Response::json(['error' => 'Dados inválidos', 'details' => $errors], 422);
    return;
  }

  $data['legal_name'] = $org['legal_name'];
  $data['organization_slug'] = site24hBuildOrgSlug((string)$org['legal_name'], (string)$org['id']);

  $briefId = db()->one("INSERT INTO client.project_briefs(organization_id,project_id,objective,audience,differentials,services,cta_text,tone_of_voice,color_palette,visual_references,legal_content,integrations,domain_target,extra_requirements) VALUES(:o,CASE WHEN :pid <> '' THEN CAST(:pid AS uuid) ELSE NULL END,:objective,:audience,:d,:s,:cta,:tone,:color,:vref,:legal,:int,:dom,:extra) RETURNING id", [
    ':o' => $org['id'],
    ':pid' => $projectId,
    ':objective' => $data['objective'],
    ':audience' => $data['audience'],
    ':d' => $data['differentials'] ?? null,
    ':s' => $data['services'] ?? null,
    ':cta' => $data['cta_text'] ?? null,
    ':tone' => $data['tone_of_voice'] ?? null,
    ':color' => $data['color_palette'] ?? null,
    ':vref' => $data['visual_references'] ?? ($data['references'] ?? null),
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
  if (!isset($prompt['markdown']) || trim((string)$prompt['markdown']) === '') {
    $prompt['markdown'] = (string)($prompt['text'] ?? '');
  }
  if (is_array($prompt['json'])) {
    $prompt['json']['markdown'] = $prompt['markdown'];
    $prompt['json']['variantInstructions'] = $prompt['variantInstructions'] ?? ($prompt['json']['variantInstructions'] ?? []);
  }

  db()->exec("INSERT INTO client.ai_prompts(brief_id,prompt_json,prompt_text,version) VALUES(:b,:j,:t,2)", [
    ':b' => $briefId,
    ':j' => json_encode($prompt['json'], JSON_UNESCAPED_UNICODE),
    ':t' => (string)$prompt['text']
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
  $releaseInfo = null;
  $variantPaths = ['v1' => null, 'v2' => null, 'v3' => null];
  if ($deal && strtoupper((string)$deal['deal_type']) === 'HOSPEDAGEM') {
    $releaseInfo = site24hProvisionReleaseForBrief([
      'deal_id' => (string)$deal['id'],
      'organization_id' => (string)$org['id'],
      'organization_name' => (string)$org['legal_name'],
      'brief_id' => (string)$briefId,
      'prompt' => $prompt,
      'uploaded_files' => $uploadedFiles,
      'created_by' => 'CLIENT_PORTAL',
    ]);
    foreach ((array)($releaseInfo['variants'] ?? []) as $variantMeta) {
      $code = strtolower((string)($variantMeta['variantCode'] ?? ''));
      if (!in_array($code, ['v1', 'v2', 'v3'], true)) {
        continue;
      }
      $variantPaths[$code] = (string)($variantMeta['folderPath'] ?? '');
    }

    moveDealOperationStage((string)$deal['id'], 'pre_prompt');
    db()->exec("
      UPDATE crm.deal_prompt_request
      SET status='RECEIVED', updated_at=now()
      WHERE id IN (
        SELECT id
        FROM crm.deal_prompt_request
        WHERE deal_id=:did
          AND status IN ('SENT', 'PENDING', 'OPEN')
        ORDER BY created_at DESC
        LIMIT 1
      )
    ", [
      ':did' => $deal['id'],
    ]);

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
      ':prompt_text' => (string)$prompt['markdown'],
      ':prompt_json' => json_encode($prompt['json'], JSON_UNESCAPED_UNICODE),
    ]);

    $clientRoot = trim((string)($releaseInfo['clientRoot'] ?? ''));
    if ($clientRoot !== '') {
      $promptVersionPath = $clientRoot . '/prompt_v' . $nextVersion . '.md';
      $promptMetaPath = $clientRoot . '/prompt_v' . $nextVersion . '_meta.json';
      if (!site24hWriteAtomic($promptVersionPath, (string)$prompt['markdown'])) {
        ($releaseInfo['fileWarnings'] ??= []);
        $releaseInfo['fileWarnings'][] = 'Falha ao salvar arquivo versionado do prompt.';
      }
      if (!site24hWriteAtomic($promptMetaPath, json_encode([
        'version' => $nextVersion,
        'briefId' => $briefId,
        'dealId' => $deal['id'],
        'generatedAt' => date('c'),
        'variantPromptFiles' => [
          'V1' => $clientRoot . '/prompt_v1_draft.md',
          'V2' => $clientRoot . '/prompt_v2_draft.md',
          'V3' => $clientRoot . '/prompt_v3_draft.md',
        ],
        'hardBlockers' => (array)($prompt['json']['approvalRules']['hard_blockers'] ?? []),
      ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) {
        ($releaseInfo['fileWarnings'] ??= []);
        $releaseInfo['fileWarnings'][] = 'Falha ao salvar metadata versionada do prompt.';
      }
    }

    db()->exec("INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by) VALUES(:did,'FLOW_UPDATE',:content,:metadata,'CLIENT_PORTAL')", [
      ':did' => $deal['id'],
      ':content' => 'Briefing enviado pelo cliente e operação movida para Pré-prompt.',
      ':metadata' => json_encode([
        'brief_id' => $briefId,
        'prompt_version' => $nextVersion,
        'release_id' => $releaseInfo['releaseId'] ?? null,
        'release_version' => $releaseInfo['releaseVersion'] ?? null,
      ], JSON_UNESCAPED_UNICODE),
    ]);

    if (!empty($releaseInfo['fileWarnings']) && is_array($releaseInfo['fileWarnings'])) {
      db()->exec("INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by) VALUES(:did,'FLOW_WARNING',:content,:metadata,'SYSTEM')", [
        ':did' => $deal['id'],
        ':content' => 'Provisionamento do briefing concluído com avisos de filesystem.',
        ':metadata' => json_encode([
          'warnings' => array_values($releaseInfo['fileWarnings']),
          'release_id' => $releaseInfo['releaseId'] ?? null,
          'release_version' => $releaseInfo['releaseVersion'] ?? null,
        ], JSON_UNESCAPED_UNICODE),
      ]);
    }
  }

  if ($projectId !== '') {
    db()->exec("
      UPDATE client.projects
      SET updated_at = now()
      WHERE id = CAST(:pid AS uuid)
        AND organization_id = CAST(:oid AS uuid)
    ", [
      ':pid' => $projectId,
      ':oid' => (string)$org['id'],
    ]);
  }

  Response::json([
    'ok' => true,
    'brief_id' => $briefId,
    'project_id' => $projectId !== '' ? $projectId : null,
    'prompt_json' => $prompt['json'],
    'prompt_text' => $prompt['text'],
    'prompt_markdown' => $prompt['markdown'],
    'releaseReused' => $releaseInfo['releaseReused'] ?? false,
    'releaseId' => $releaseInfo['releaseId'] ?? null,
    'releaseVersion' => $releaseInfo['releaseVersion'] ?? null,
    'releaseRoot' => $releaseInfo['releaseRoot'] ?? null,
    'clientRoot' => $releaseInfo['clientRoot'] ?? null,
    'masterPromptPath' => $releaseInfo['masterPromptPath'] ?? null,
    'assetsManifestPath' => $releaseInfo['assetsManifestPath'] ?? null,
    'identityPathRelease' => $releaseInfo['identityPath'] ?? null,
    'identityPathRoot' => $releaseInfo['identityPath'] ?? null,
    'fileWarnings' => $releaseInfo['fileWarnings'] ?? [],
    'variantPaths' => $variantPaths,
  ], 201);
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
  syncReleaseStateByTemplateRevision((string)$template['id'], 'SENT_CLIENT', 'IN_REVIEW');
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

$router->post('/api/portal/approval/current/approve', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);

  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  if ($orgId === '') {
    Response::json(['error' => 'Organização não encontrada.'], 404);
    return;
  }

  $ctx = approvalPendingContextByOrganization($orgId);
  if (!$ctx) {
    Response::json(['error' => 'Nenhuma aprovação pendente encontrada para este cliente.'], 404);
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
  syncReleaseStateByTemplateRevision((string)$ctx['template_revision_id'], 'APPROVED_CLIENT', 'APPROVED_CLIENT');
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
    ':metadata' => json_encode([
      'approval_id' => $ctx['approval_id'],
      'action' => 'approved',
      'approved_at' => date('c'),
      'note' => $note,
      'origin' => 'dashboard',
    ], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json(['ok' => true]);
});

$router->post('/api/portal/approval/current/request-changes', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);

  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  if ($orgId === '') {
    Response::json(['error' => 'Organização não encontrada.'], 404);
    return;
  }

  $ctx = approvalPendingContextByOrganization($orgId);
  if (!$ctx) {
    Response::json(['error' => 'Nenhuma aprovação pendente encontrada para este cliente.'], 404);
    return;
  }

  if (!empty($ctx['expires_at']) && strtotime((string)$ctx['expires_at']) < time()) {
    db()->exec("UPDATE crm.deal_client_approval SET status='EXPIRED', updated_at=now() WHERE id=:id", [':id' => $ctx['approval_id']]);
    Response::json(['error' => 'Link expirado'], 410);
    return;
  }

  $contentType = strtolower((string)(requestHeader($request, 'Content-Type') ?? ''));
  $isMultipart = str_contains($contentType, 'multipart/form-data');
  $payload = is_array($request->body) ? $request->body : [];
  if ($isMultipart && count($payload) === 0 && !empty($_POST)) {
    $payload = $_POST;
  }

  $tipoAjuste = trim((string)($payload['tipo_ajuste'] ?? ''));
  $descricaoAjuste = trim((string)($payload['descricao_ajuste'] ?? $payload['note'] ?? ''));
  $prioridade = trim((string)($payload['prioridade'] ?? 'Média'));
  if ($tipoAjuste === '') {
    $tipoAjuste = 'Outro';
  }
  if (!in_array($prioridade, ['Baixa', 'Média', 'Alta'], true)) {
    $prioridade = 'Média';
  }

  $descricaoLen = textLength($descricaoAjuste);
  if ($descricaoLen < 100) {
    Response::json(['error' => 'Descreva sua solicitação com no mínimo 100 caracteres para garantir clareza.'], 422);
    return;
  }
  if ($descricaoLen > 2000) {
    Response::json(['error' => 'A descrição deve ter no máximo 2000 caracteres.'], 422);
    return;
  }

  $ticketCode = 'AJ' . date('ymdHis') . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
  $attachmentsResult = storeApprovalRequestAttachments($ctx, $ticketCode);
  if (!(bool)($attachmentsResult['ok'] ?? false)) {
    Response::json(['error' => (string)($attachmentsResult['error'] ?? 'Falha ao processar anexos.')], 422);
    return;
  }
  $attachments = (array)($attachmentsResult['files'] ?? []);
  $summary = textSlice($descricaoAjuste, 500);

  db()->exec("UPDATE crm.deal_client_approval SET status='CHANGES_REQUESTED', client_note=:note, acted_at=now(), updated_at=now() WHERE id=:id", [
    ':id' => $ctx['approval_id'],
    ':note' => $summary,
  ]);
  db()->exec("UPDATE crm.deal_template_revision SET status='NEEDS_ADJUSTMENTS', updated_at=now() WHERE id=:id", [
    ':id' => $ctx['template_revision_id'],
  ]);
  syncReleaseStateByTemplateRevision((string)$ctx['template_revision_id'], 'IN_ADJUSTMENT', 'READY');
  moveDealOperationStage((string)$ctx['deal_id'], 'ajustes');

  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(:deal_id,'CLIENT_REQUESTED_CHANGES','Cliente solicitou ajustes no template.',:metadata,'CLIENT_PORTAL')
  ", [
    ':deal_id' => $ctx['deal_id'],
    ':metadata' => json_encode([
      'approval_id' => $ctx['approval_id'],
      'ticket' => '#' . $ticketCode,
      'tipo_ajuste' => $tipoAjuste,
      'descricao' => $descricaoAjuste,
      'prioridade' => $prioridade,
      'anexos' => $attachments,
      'origin' => 'dashboard',
    ], JSON_UNESCAPED_UNICODE),
  ]);

  Response::json([
    'ok' => true,
    'ticket' => '#' . $ticketCode,
    'created_at' => date('c'),
    'sla_hint' => '24h para resposta',
  ]);
});

$router->post('/api/portal/publication/domain/respond', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);

  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  if ($orgId === '') {
    Response::json(['error' => 'Organização não encontrada.'], 404);
    return;
  }

  $requestId = trim((string)($request->input('request_id', '')));
  $action = strtolower(trim((string)($request->input('action', ''))));
  $note = trim((string)($request->input('note', '')));
  $domainRaw = trim((string)($request->input('domain', '')));
  $domain = normalizeDomainInput($domainRaw);

  if ($requestId === '') {
    Response::json(['error' => 'Solicitação inválida.'], 422);
    return;
  }
  if (!in_array($action, ['approve', 'reject'], true)) {
    Response::json(['error' => 'Ação inválida.'], 422);
    return;
  }
  if ($action === 'reject' && $domain === '') {
    Response::json(['error' => 'Informe o domínio sugerido para rejeição.'], 422);
    return;
  }
  if ($domain !== '' && !isValidDomainName($domain)) {
    Response::json(['error' => 'Domínio inválido. Informe no formato exemplo.com.br'], 422);
    return;
  }

  $ctx = db()->one("
    SELECT
      pr.id::text AS request_id,
      pr.deal_id::text AS deal_id,
      pr.status AS request_status,
      pr.subject,
      pr.request_items,
      pr.message,
      d.organization_id::text AS organization_id,
      org.domain AS organization_domain,
      tr.id::text AS template_revision_id,
      tr.source_hash
    FROM crm.deal_prompt_request pr
    JOIN crm.deal d ON d.id = pr.deal_id
    JOIN client.organizations org ON org.id = d.organization_id
    LEFT JOIN LATERAL (
      SELECT id, source_hash
      FROM crm.deal_template_revision
      WHERE deal_id = d.id
      ORDER BY version DESC, created_at DESC
      LIMIT 1
    ) tr ON true
    WHERE pr.id = CAST(:request_id AS uuid)
      AND d.organization_id = CAST(:org_id AS uuid)
    LIMIT 1
  ", [
    ':request_id' => $requestId,
    ':org_id' => $orgId,
  ]);
  if (!$ctx) {
    Response::json(['error' => 'Solicitação não encontrada para sua organização.'], 404);
    return;
  }

  $requestItemsRaw = $ctx['request_items'] ?? [];
  if (is_string($requestItemsRaw)) {
    $requestItemsDecoded = json_decode($requestItemsRaw, true);
    $requestItemsRaw = is_array($requestItemsDecoded) ? $requestItemsDecoded : [];
  }
  $requestItemsText = strtolower(implode(' | ', array_map(static fn($item) => (string)$item, is_array($requestItemsRaw) ? $requestItemsRaw : [])));
  $subjectText = strtolower((string)($ctx['subject'] ?? ''));
  $isPublicationRequest = str_contains($subjectText, 'domínio/publicação')
    || str_contains($subjectText, 'dominio/publicacao')
    || str_contains($requestItemsText, 'domínio para publicação')
    || str_contains($requestItemsText, 'dominio para publicacao');
  if (!$isPublicationRequest) {
    Response::json(['error' => 'A solicitação informada não pertence ao fluxo de publicação.'], 422);
    return;
  }

  $requestStatus = strtoupper((string)($ctx['request_status'] ?? ''));
  if (!in_array($requestStatus, ['SENT', 'PENDING', 'OPEN', 'RECEIVED'], true)) {
    Response::json(['error' => 'A solicitação não está disponível para resposta.'], 409);
    return;
  }

  db()->exec("
    UPDATE crm.deal_prompt_request
    SET status='RECEIVED', updated_at=now()
    WHERE id=CAST(:request_id AS uuid)
  ", [':request_id' => $requestId]);

  $activityType = $action === 'approve'
    ? 'CLIENT_PUBLICATION_DOMAIN_APPROVED'
    : 'CLIENT_PUBLICATION_DOMAIN_REJECTED';
  $metadata = [
    'request_id' => $requestId,
    'action' => $action,
    'approved_domain' => $action === 'approve' ? ($domain !== '' ? $domain : normalizeDomainInput((string)($ctx['organization_domain'] ?? ''))) : null,
    'suggested_domain' => $action === 'reject' ? $domain : null,
    'note' => $note !== '' ? $note : null,
    'responded_at' => date('c'),
    'origin' => 'portal_dashboard',
  ];
  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(CAST(:deal_id AS uuid), :activity_type, :content, CAST(:metadata AS jsonb), 'CLIENT_PORTAL')
  ", [
    ':deal_id' => $ctx['deal_id'],
    ':activity_type' => $activityType,
    ':content' => $action === 'approve'
      ? 'Cliente aprovou domínio para publicação.'
      : 'Cliente rejeitou domínio e enviou sugestão.',
    ':metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE),
  ]);

  if ($action === 'approve') {
    $approvedDomain = $domain !== '' ? $domain : normalizeDomainInput((string)($ctx['organization_domain'] ?? ''));
    if ($approvedDomain !== '' && isValidDomainName($approvedDomain)) {
      db()->exec("
        UPDATE client.organizations
        SET domain=:domain, updated_at=now()
        WHERE id=CAST(:org_id AS uuid)
      ", [
        ':domain' => $approvedDomain,
        ':org_id' => $orgId,
      ]);
      $checkExists = db()->one("
        SELECT id::text AS id
        FROM crm.deal_publish_check
        WHERE deal_id=CAST(:deal_id AS uuid)
          AND COALESCE(target_domain, '') = :domain
        ORDER BY checked_at DESC
        LIMIT 1
      ", [
        ':deal_id' => $ctx['deal_id'],
        ':domain' => $approvedDomain,
      ]);
      if (!$checkExists) {
        db()->exec("
          INSERT INTO crm.deal_publish_check(deal_id, template_revision_id, target_domain, expected_hash, matches, checked_at)
          VALUES(CAST(:deal_id AS uuid), :template_revision_id, :target_domain, :expected_hash, false, now())
        ", [
          ':deal_id' => $ctx['deal_id'],
          ':template_revision_id' => !empty($ctx['template_revision_id']) ? $ctx['template_revision_id'] : null,
          ':target_domain' => $approvedDomain,
          ':expected_hash' => !empty($ctx['source_hash']) ? $ctx['source_hash'] : null,
        ]);
      }
    }
  }

  Response::json([
    'ok' => true,
    'action' => $action,
    'domain' => $domain !== '' ? $domain : null,
    'request_id' => $requestId,
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
  syncReleaseStateByTemplateRevision((string)$ctx['template_revision_id'], 'APPROVED_CLIENT', 'APPROVED_CLIENT');
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
    ':metadata' => json_encode([
      'approval_id' => $ctx['approval_id'],
      'action' => 'approved',
      'approved_at' => date('c'),
      'note' => $note,
    ], JSON_UNESCAPED_UNICODE),
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

  $contentType = strtolower((string)(requestHeader($request, 'Content-Type') ?? ''));
  $isMultipart = str_contains($contentType, 'multipart/form-data');
  $payload = is_array($request->body) ? $request->body : [];
  if ($isMultipart && count($payload) === 0 && !empty($_POST)) {
    $payload = $_POST;
  }

  $tipoAjuste = trim((string)($payload['tipo_ajuste'] ?? ''));
  $descricaoAjuste = trim((string)($payload['descricao_ajuste'] ?? $payload['note'] ?? ''));
  $prioridade = trim((string)($payload['prioridade'] ?? 'Média'));
  if ($tipoAjuste === '') {
    $tipoAjuste = 'Outro';
  }
  if (!in_array($prioridade, ['Baixa', 'Média', 'Alta'], true)) {
    $prioridade = 'Média';
  }

  $descricaoLen = textLength($descricaoAjuste);
  if ($descricaoLen < 100) {
    Response::json(['error' => 'Descreva sua solicitação com no mínimo 100 caracteres para garantir clareza.'], 422);
    return;
  }
  if ($descricaoLen > 2000) {
    Response::json(['error' => 'A descrição deve ter no máximo 2000 caracteres.'], 422);
    return;
  }

  $ticketCode = 'AJ' . date('ymdHis') . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
  $attachmentsResult = storeApprovalRequestAttachments($ctx, $ticketCode);
  if (!(bool)($attachmentsResult['ok'] ?? false)) {
    Response::json(['error' => (string)($attachmentsResult['error'] ?? 'Falha ao processar anexos.')], 422);
    return;
  }
  $attachments = (array)($attachmentsResult['files'] ?? []);
  $summary = textSlice($descricaoAjuste, 500);

  db()->exec("UPDATE crm.deal_client_approval SET status='CHANGES_REQUESTED', client_note=:note, acted_at=now(), updated_at=now() WHERE id=:id", [
    ':id' => $ctx['approval_id'],
    ':note' => $summary,
  ]);
  db()->exec("UPDATE crm.deal_template_revision SET status='NEEDS_ADJUSTMENTS', updated_at=now() WHERE id=:id", [
    ':id' => $ctx['template_revision_id'],
  ]);
  syncReleaseStateByTemplateRevision((string)$ctx['template_revision_id'], 'IN_ADJUSTMENT', 'READY');
  moveDealOperationStage((string)$ctx['deal_id'], 'ajustes');

  db()->exec("
    INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
    VALUES(:deal_id,'CLIENT_REQUESTED_CHANGES','Cliente solicitou ajustes no template.',:metadata,'CLIENT_PORTAL')
  ", [
    ':deal_id' => $ctx['deal_id'],
    ':metadata' => json_encode([
      'approval_id' => $ctx['approval_id'],
      'ticket' => '#' . $ticketCode,
      'tipo_ajuste' => $tipoAjuste,
      'descricao' => $descricaoAjuste,
      'prioridade' => $prioridade,
      'anexos' => $attachments,
    ], JSON_UNESCAPED_UNICODE),
  ]);

  $teamEmail = site24hEnv('TEAM_APPROVAL_EMAIL', 'suporte@koddahub.com.br');
  if ($teamEmail !== '') {
    db()->exec("
      INSERT INTO crm.email_queue(organization_id, email_to, subject, body, status, created_at)
      VALUES(:oid, :email, :subject, :body, 'PENDING', now())
    ", [
      ':oid' => (string)($ctx['organization_id'] ?? ''),
      ':email' => $teamEmail,
      ':subject' => '🔧 Solicitação de ajuste - ' . (string)($ctx['legal_name'] ?? 'Cliente'),
      ':body' => "Cliente solicitou ajustes no template.\n\nTipo: {$tipoAjuste}\nPrioridade: {$prioridade}\nDescrição: {$descricaoAjuste}\nProtocolo: #{$ticketCode}\n\nAcesse o CRM para mais detalhes.",
    ]);
  }
  if (!empty($ctx['billing_email'])) {
    db()->exec("
      INSERT INTO crm.email_queue(organization_id, email_to, subject, body, status, created_at)
      VALUES(:oid, :email, :subject, :body, 'PENDING', now())
    ", [
      ':oid' => (string)($ctx['organization_id'] ?? ''),
      ':email' => (string)$ctx['billing_email'],
      ':subject' => 'Solicitação de ajustes recebida - ' . (string)($ctx['legal_name'] ?? 'Cliente'),
      ':body' => "Recebemos sua solicitação de ajustes.\n\nProtocolo: #{$ticketCode}\nPrazo: até 24h para retorno inicial.",
    ]);
  }

  Response::json([
    'ok' => true,
    'ticket' => '#' . $ticketCode,
    'created_at' => date('c'),
    'sla_hint' => '24h para resposta',
  ]);
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

  if (featureFlagEnabled('FEATURE_TICKET_THREAD_SYNC', false)) {
    $authorName = (string)($_SESSION['client_user']['name'] ?? 'Cliente');
    $authorEmail = (string)($_SESSION['client_user']['email'] ?? '');
    db()->exec("
      INSERT INTO client.ticket_messages(ticket_id, source, author_name, author_email, message, visibility)
      VALUES(CAST(:tid AS uuid), 'CLIENT', :name, :email, :message, 'BOTH')
    ", [
      ':tid' => (string)$ticketId,
      ':name' => $authorName,
      ':email' => $authorEmail,
      ':message' => (string)$d['description'],
    ]);
  }

  Response::json(['ok' => true, 'ticket_id' => $ticketId], 201);
});

$router->get('/api/tickets/{id}/messages', function(Request $request) {
  requireClientAuth();
  if (!featureFlagEnabled('FEATURE_TICKET_THREAD_SYNC', false)) {
    Response::json(['ok' => true, 'messages' => []]);
    return;
  }
  $ticketId = (string)($request->query['id'] ?? '');
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  if ($ticketId === '' || $orgId === '') {
    Response::json(['error' => 'Requisição inválida'], 422);
    return;
  }
  $ticket = db()->one("SELECT id FROM client.tickets WHERE id=CAST(:id AS uuid) AND organization_id=CAST(:oid AS uuid) LIMIT 1", [
    ':id' => $ticketId,
    ':oid' => $orgId,
  ]);
  if (!$ticket) {
    Response::json(['error' => 'Ticket não encontrado'], 404);
    return;
  }
  $messages = db()->all("
    SELECT id::text AS id, source, author_name, author_email, message, visibility, created_at
    FROM client.ticket_messages
    WHERE ticket_id=CAST(:tid AS uuid)
      AND visibility IN ('CLIENT', 'BOTH')
    ORDER BY created_at ASC
  ", [':tid' => $ticketId]);
  Response::json(['ok' => true, 'messages' => $messages]);
});

$router->post('/api/tickets/{id}/messages', function(Request $request) {
  requireClientAuth();
  requireCsrf($request);
  if (!featureFlagEnabled('FEATURE_TICKET_THREAD_SYNC', false)) {
    Response::json(['error' => 'Funcionalidade desabilitada'], 403);
    return;
  }
  $ticketId = (string)($request->query['id'] ?? '');
  $orgId = (string)($_SESSION['client_user']['organization_id'] ?? '');
  $authorName = (string)($_SESSION['client_user']['name'] ?? 'Cliente');
  $authorEmail = (string)($_SESSION['client_user']['email'] ?? '');
  $message = trim((string)$request->input('message', ''));
  if ($ticketId === '' || $orgId === '' || $message === '') {
    Response::json(['error' => 'Dados obrigatórios ausentes'], 422);
    return;
  }
  $ticket = db()->one("SELECT id FROM client.tickets WHERE id=CAST(:id AS uuid) AND organization_id=CAST(:oid AS uuid) LIMIT 1", [
    ':id' => $ticketId,
    ':oid' => $orgId,
  ]);
  if (!$ticket) {
    Response::json(['error' => 'Ticket não encontrado'], 404);
    return;
  }
  $row = db()->one("
    INSERT INTO client.ticket_messages(ticket_id, source, author_name, author_email, message, visibility)
    VALUES(CAST(:tid AS uuid), 'CLIENT', :author_name, :author_email, :message, 'BOTH')
    RETURNING id::text AS id, created_at
  ", [
    ':tid' => $ticketId,
    ':author_name' => $authorName,
    ':author_email' => $authorEmail,
    ':message' => $message,
  ]);
  db()->exec("UPDATE client.tickets SET updated_at=now() WHERE id=CAST(:id AS uuid)", [':id' => $ticketId]);
  Response::json(['ok' => true, 'message_id' => (string)($row['id'] ?? ''), 'created_at' => $row['created_at'] ?? null]);
});

$router->post('/api/webhooks/asaas', function(Request $request) {
  ensureSubscriptionRecurringTables();
  $requestId = requestCorrelationId($request);
  if (!rateLimitAllow('asaas-webhook', 600, 300)) {
    Response::json(['error' => 'Rate limit'], 429);
    return;
  }

  $processor = new \Shared\Support\AsaasWebhookProcessor(db());
  $result = $processor->handle($request, $requestId);
  $status = (int)($result['status'] ?? 200);
  $body = is_array($result['body'] ?? null) ? $result['body'] : ['ok' => false];
  if (!isset($body['request_id']) && $requestId !== '') {
    $body['request_id'] = $requestId;
  }
  Response::json($body, $status);
});

$router->run();
