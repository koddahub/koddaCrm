<?php
declare(strict_types=1);

require_once __DIR__ . '/../apps/shared/src/bootstrap.php';

$logFile = __DIR__ . '/../storage/logs/worker.log';
$publishConsecutiveChecks = (int)(getenv('PUBLICATION_STRICT_CONSECUTIVE') ?: 2);
$publishIntervalMinutes = (int)(getenv('PUBLICATION_STRICT_INTERVAL_MINUTES') ?: 10);
$publicationChecksWindow = max(2, $publishConsecutiveChecks);

function envString(string $key, string $default = ''): string
{
    $value = getenv($key);
    if ($value === false) {
        return $default;
    }
    return trim((string)$value);
}

function decodeAttachmentList(mixed $raw): array
{
    if (is_array($raw)) {
        return $raw;
    }
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
    return [];
}

function resolveAttachmentAbsolute(string $storedPath): ?string
{
    $storageRoot = rtrim(envString('STORAGE_ROOT', '/storage'), '/');
    $normalized = str_replace('\\', '/', trim($storedPath));
    if ($normalized === '') {
        return null;
    }

    if (str_starts_with($normalized, $storageRoot . '/')) {
        return is_file($normalized) ? $normalized : null;
    }

    if (str_starts_with($normalized, '/uploads/')) {
        $candidate = $storageRoot . $normalized;
        return is_file($candidate) ? $candidate : null;
    }

    if (str_starts_with($normalized, 'uploads/')) {
        $candidate = $storageRoot . '/' . $normalized;
        return is_file($candidate) ? $candidate : null;
    }

    if (str_starts_with($normalized, '/')) {
        return is_file($normalized) ? $normalized : null;
    }

    $candidate = $storageRoot . '/uploads/' . ltrim($normalized, '/');
    return is_file($candidate) ? $candidate : null;
}

function buildMimeMessage(string $fromEmail, string $fromName, string $toEmail, string $subject, string $body, array $attachmentPaths = []): string
{
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $boundary = 'koddahub_' . bin2hex(random_bytes(8));
    $headers = [
        'From: ' . ($fromName !== '' ? '"' . addslashes($fromName) . '" ' : '') . '<' . $fromEmail . '>',
        'To: <' . $toEmail . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
    ];

    $parts = [];
    $parts[] = '--' . $boundary;
    $parts[] = 'Content-Type: text/plain; charset=UTF-8';
    $parts[] = 'Content-Transfer-Encoding: 8bit';
    $parts[] = '';
    $parts[] = $body;

    foreach ($attachmentPaths as $path) {
        if (!is_file($path)) {
            continue;
        }
        $filename = basename($path);
        $content = chunk_split(base64_encode((string)file_get_contents($path)));
        $parts[] = '--' . $boundary;
        $parts[] = 'Content-Type: application/octet-stream; name="' . $filename . '"';
        $parts[] = 'Content-Transfer-Encoding: base64';
        $parts[] = 'Content-Disposition: attachment; filename="' . $filename . '"';
        $parts[] = '';
        $parts[] = $content;
    }

    $parts[] = '--' . $boundary . '--';
    $parts[] = '';

    $data = 'Subject: ' . $encodedSubject . "\r\n" . implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts);
    return preg_replace("/(?<!\r)\n/", "\r\n", $data) ?? $data;
}

function smtpRead($socket): string
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (preg_match('/^\d{3}\s/', $line)) {
            break;
        }
    }
    return $response;
}

function smtpCommand($socket, string $command, int $expectCode): string
{
    fwrite($socket, $command . "\r\n");
    $response = smtpRead($socket);
    $code = (int)substr($response, 0, 3);
    if ($code !== $expectCode) {
        throw new RuntimeException('SMTP command failed [' . $command . '] response=' . trim($response));
    }
    return $response;
}

function sendEmailSmtp(string $toEmail, string $subject, string $body, array $attachmentPaths = []): void
{
    $host = envString('SMTP_HOST', '');
    $port = (int)(envString('SMTP_PORT', '587'));
    $user = envString('SMTP_USER', '');
    $pass = envString('SMTP_PASS', '');
    $encryption = strtolower(envString('SMTP_ENCRYPTION', 'tls'));
    $fromEmail = envString('MAIL_FROM', 'no-reply@clientes.koddahub.com.br');
    $fromName = envString('MAIL_FROM_NAME', 'KoddaHub');

    if ($host === '' || $port <= 0) {
        throw new RuntimeException('SMTP_HOST/SMTP_PORT não configurados.');
    }

    $transport = $encryption === 'ssl' ? 'ssl://' : 'tcp://';
    $socket = @stream_socket_client(
        $transport . $host . ':' . $port,
        $errno,
        $errstr,
        15,
        STREAM_CLIENT_CONNECT,
        stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true,
            ],
        ])
    );
    if (!$socket) {
        throw new RuntimeException('Falha conexão SMTP: ' . $errstr . ' (' . $errno . ')');
    }

    stream_set_timeout($socket, 20);
    $greeting = smtpRead($socket);
    if ((int)substr($greeting, 0, 3) !== 220) {
        fclose($socket);
        throw new RuntimeException('SMTP greeting inválido: ' . trim($greeting));
    }

    smtpCommand($socket, 'EHLO clientes.koddahub.com.br', 250);

    if ($encryption === 'tls') {
        smtpCommand($socket, 'STARTTLS', 220);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($socket);
            throw new RuntimeException('Falha ao habilitar STARTTLS.');
        }
        smtpCommand($socket, 'EHLO clientes.koddahub.com.br', 250);
    }

    if ($user !== '' && $pass !== '') {
        smtpCommand($socket, 'AUTH LOGIN', 334);
        smtpCommand($socket, base64_encode($user), 334);
        smtpCommand($socket, base64_encode($pass), 235);
    }

    smtpCommand($socket, 'MAIL FROM:<' . $fromEmail . '>', 250);
    smtpCommand($socket, 'RCPT TO:<' . $toEmail . '>', 250);
    smtpCommand($socket, 'DATA', 354);
    fwrite($socket, buildMimeMessage($fromEmail, $fromName, $toEmail, $subject, $body, $attachmentPaths) . "\r\n.\r\n");
    $dataResponse = smtpRead($socket);
    if ((int)substr($dataResponse, 0, 3) !== 250) {
        fclose($socket);
        throw new RuntimeException('Falha ao enviar DATA SMTP: ' . trim($dataResponse));
    }
    smtpCommand($socket, 'QUIT', 221);
    fclose($socket);
}

function queueDailyBriefingReminders(string $logFile): void
{
    $rows = db()->all("
        SELECT DISTINCT ON (o.id)
            o.id AS organization_id,
            o.legal_name,
            o.billing_email,
            o.whatsapp
        FROM client.organizations o
        JOIN client.subscriptions s ON s.organization_id = o.id
        WHERE s.status = 'ACTIVE'
          AND o.billing_email IS NOT NULL
          AND o.billing_email <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM client.project_briefs pb
              WHERE pb.organization_id = o.id
          )
        ORDER BY o.id, s.updated_at DESC
    ");

    foreach ($rows as $row) {
        $organizationId = (string)$row['organization_id'];
        $subject = '[Lembrete Diário] Complete o briefing do seu site';
        $alreadyQueuedToday = db()->one("
            SELECT id
            FROM crm.email_queue
            WHERE organization_id = :oid
              AND subject = :subject
              AND created_at::date = CURRENT_DATE
            LIMIT 1
        ", [
            ':oid' => $organizationId,
            ':subject' => $subject,
        ]);

        if (!$alreadyQueuedToday) {
            $body = sprintf(
                "Olá, %s!\n\nSeu briefing ainda está pendente. Para seguirmos com o fluxo Site 24h, acesse o portal e finalize o briefing hoje.\n\nAssim que ele for enviado, avançamos automaticamente para a etapa Pré-prompt.\n\nEquipe KoddaHub.",
                (string)$row['legal_name']
            );

            db()->exec("
                INSERT INTO crm.email_queue (organization_id, email_to, subject, body, status)
                VALUES (:oid, :email, :subject, :body, 'PENDING')
            ", [
                ':oid' => $organizationId,
                ':email' => (string)$row['billing_email'],
                ':subject' => $subject,
                ':body' => $body,
            ]);

            file_put_contents(
                $logFile,
                '[' . date('c') . '] briefing_reminder_email_queue -> org=' . $organizationId . ' email=' . $row['billing_email'] . PHP_EOL,
                FILE_APPEND
            );
        }

        if (!empty($row['whatsapp'])) {
            $waQueued = db()->one("
                SELECT id
                FROM crm.manual_whatsapp_queue
                WHERE organization_id = :oid
                  AND template_key = 'BRIEFING_REMINDER_DAILY'
                  AND created_at::date = CURRENT_DATE
                LIMIT 1
            ", [':oid' => $organizationId]);

            if (!$waQueued) {
                db()->exec("
                    INSERT INTO crm.manual_whatsapp_queue (organization_id, phone, template_key, context, status)
                    VALUES (:oid, :phone, 'BRIEFING_REMINDER_DAILY', :context, 'PENDING')
                ", [
                    ':oid' => $organizationId,
                    ':phone' => (string)$row['whatsapp'],
                    ':context' => json_encode([
                        'organization_id' => $organizationId,
                        'legal_name' => (string)$row['legal_name'],
                    ], JSON_UNESCAPED_UNICODE),
                ]);
            }
        }
    }
}

function normalizeHtmlForHash(string $html): string
{
    $clean = preg_replace('/<!--[\s\S]*?-->/', '', $html) ?? '';
    $clean = preg_replace('/<script[^>]*>[\s\S]*?<\/script>/i', '', $clean) ?? $clean;
    $clean = preg_replace('/\s+/', ' ', $clean) ?? $clean;
    return trim((string)$clean);
}

function fetchLiveHtml(string $domain): array
{
    $domain = trim($domain);
    if ($domain === '') {
        return ['status' => null, 'html' => null];
    }

    $url = preg_match('/^https?:\/\//i', $domain) ? $domain : 'https://' . $domain;
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 12,
            'ignore_errors' => true,
            'header' => "User-Agent: KoddaHubWorker/1.0\r\n",
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ]);

    $html = @file_get_contents($url, false, $context);
    $status = null;

    if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', (string)$http_response_header[0], $m)) {
        $status = (int)$m[1];
    }

    return [
        'status' => $status,
        'html' => $html !== false ? (string)$html : null,
    ];
}

function moveDealOperationToPublished(string $dealId): void
{
    $active = db()->one("
        SELECT id, stage_code
        FROM crm.deal_operation
        WHERE deal_id = :did AND status = 'ACTIVE'
        ORDER BY stage_order DESC, started_at DESC
        LIMIT 1
    ", [':did' => $dealId]);

    if ($active && (string)$active['stage_code'] === 'publicado') {
        return;
    }

    if ($active) {
        db()->exec("
            UPDATE crm.deal_operation
            SET status='COMPLETED', completed_at=now(), updated_at=now()
            WHERE id=:id
        ", [':id' => $active['id']]);
    }

    db()->exec("
        INSERT INTO crm.deal_operation(deal_id, operation_type, stage_code, stage_name, stage_order, status, started_at, updated_at)
        VALUES(:did, 'HOSPEDAGEM', 'publicado', 'Publicado', 7, 'ACTIVE', now(), now())
    ", [':did' => $dealId]);

    db()->exec("
        INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
        VALUES(:did, 'PUBLICATION_MATCHED', 'Publicação validada automaticamente por hash estrito.', :meta, 'WORKER')
    ", [
        ':did' => $dealId,
        ':meta' => json_encode(['strict_check' => true], JSON_UNESCAPED_UNICODE),
    ]);
}

function ensureInitialOperationForClientDeal(string $dealId, string $dealType): void
{
    $active = db()->one("
        SELECT id
        FROM crm.deal_operation
        WHERE deal_id=:did AND operation_type=:otype AND status='ACTIVE'
        ORDER BY stage_order DESC, started_at DESC
        LIMIT 1
    ", [
        ':did' => $dealId,
        ':otype' => $dealType,
    ]);

    if ($active) {
        return;
    }

    if ($dealType === 'HOSPEDAGEM') {
        db()->exec("
            INSERT INTO crm.deal_operation(deal_id, operation_type, stage_code, stage_name, stage_order, status, started_at, updated_at)
            VALUES(:did, 'HOSPEDAGEM', 'briefing_pendente', 'Briefing pendente', 1, 'ACTIVE', now(), now())
        ", [':did' => $dealId]);
        return;
    }

    db()->exec("
        INSERT INTO crm.deal_operation(deal_id, operation_type, stage_code, stage_name, stage_order, status, started_at, updated_at)
        VALUES(:did, 'PROJETO_AVULSO', 'kickoff', 'Kickoff', 1, 'ACTIVE', now(), now())
    ", [':did' => $dealId]);
}

function resolveHospedagemPipeline(): ?array
{
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
    foreach ($stages as $s) {
        $map[(string)$s['code']] = $s;
    }

    return [
        'id' => (string)$pipeline['id'],
        'stages' => $map,
    ];
}

function deriveHospedagemStageAndLifecycle(?string $subscriptionStatus): array
{
    $status = strtoupper(trim((string)$subscriptionStatus));
    if ($status === 'ACTIVE') {
        return ['stageCode' => 'fechado_ganho', 'lifecycle' => 'CLIENT', 'closed' => true];
    }
    if (in_array($status, ['PENDING', 'TRIALING', 'INCOMPLETE', 'PAST_DUE'], true)) {
        return ['stageCode' => 'pagamento_pendente', 'lifecycle' => 'OPEN', 'closed' => false];
    }
    if (in_array($status, ['CANCELED', 'SUSPENDED', 'CANCELLED'], true)) {
        return ['stageCode' => 'perdido', 'lifecycle' => 'LOST', 'closed' => true];
    }
    return ['stageCode' => 'cadastro_iniciado', 'lifecycle' => 'OPEN', 'closed' => false];
}

function backfillDealsFromClientOrganizations(string $logFile): void
{
    $pipeline = resolveHospedagemPipeline();
    if (!$pipeline) {
        file_put_contents($logFile, '[' . date('c') . '] backfill_skip -> pipeline_hospedagem_not_found' . PHP_EOL, FILE_APPEND);
        return;
    }

    $orgs = db()->all("
        SELECT
            o.id AS organization_id,
            o.legal_name,
            o.billing_email,
            o.whatsapp,
            s.id AS subscription_id,
            s.status AS subscription_status,
            p.code AS plan_code,
            p.monthly_price
        FROM client.organizations o
        LEFT JOIN LATERAL (
            SELECT s1.*
            FROM client.subscriptions s1
            WHERE s1.organization_id = o.id
            ORDER BY s1.created_at DESC
            LIMIT 1
        ) s ON true
        LEFT JOIN client.plans p ON p.id = s.plan_id
        ORDER BY o.created_at ASC
    ");

    $created = 0;
    $updated = 0;
    $opEnsured = 0;

    foreach ($orgs as $org) {
        $organizationId = (string)$org['organization_id'];
        $derivation = deriveHospedagemStageAndLifecycle((string)($org['subscription_status'] ?? ''));
        $stageCode = $derivation['stageCode'];
        $stage = $pipeline['stages'][$stageCode] ?? null;
        if (!$stage) {
            continue;
        }

        $lifecycle = (string)$derivation['lifecycle'];
        $closed = (bool)$derivation['closed'];
        $valueCents = isset($org['monthly_price']) ? (int)round((float)$org['monthly_price'] * 100) : null;
        $title = (string)($org['legal_name'] ?: ('Organização ' . substr($organizationId, 0, 8)));
        $planCode = !empty($org['plan_code']) ? strtolower((string)$org['plan_code']) : null;

        $existing = db()->one("
            SELECT id, stage_id, lifecycle_status
            FROM crm.deal
            WHERE pipeline_id=:pid
              AND organization_id=:oid
            ORDER BY updated_at DESC
            LIMIT 1
        ", [
            ':pid' => $pipeline['id'],
            ':oid' => $organizationId,
        ]);

        if (!$existing) {
            $position = db()->one("
                SELECT COUNT(*)::int AS c
                FROM crm.deal
                WHERE pipeline_id=:pid AND stage_id=:sid AND lifecycle_status <> 'CLIENT'
            ", [':pid' => $pipeline['id'], ':sid' => $stage['id']]);
            $positionIndex = (int)($position['c'] ?? 0);

            $new = db()->one("
                INSERT INTO crm.deal(
                    pipeline_id, stage_id, organization_id, subscription_id, title, contact_name, contact_email, contact_phone,
                    deal_type, category, intent, origin, plan_code, product_code, value_cents, position_index,
                    lifecycle_status, is_closed, closed_at, metadata, created_at, updated_at
                )
                VALUES(
                    :pipeline_id, :stage_id, :organization_id, :subscription_id, :title, :contact_name, :contact_email, :contact_phone,
                    'HOSPEDAGEM', 'RECORRENTE', :intent, :origin, :plan_code, NULL, :value_cents, :position_index,
                    :lifecycle_status, :is_closed, :closed_at, :metadata::jsonb, now(), now()
                )
                RETURNING id
            ", [
                ':pipeline_id' => $pipeline['id'],
                ':stage_id' => $stage['id'],
                ':organization_id' => $organizationId,
                ':subscription_id' => $org['subscription_id'] ?: null,
                ':title' => $title,
                ':contact_name' => $title,
                ':contact_email' => $org['billing_email'] ?: null,
                ':contact_phone' => $org['whatsapp'] ?: null,
                ':intent' => $planCode ? ('hospedagem_' . $planCode) : 'hospedagem_basico',
                ':origin' => $org['subscription_id'] ? 'SIGNUP_FLOW' : 'MANUAL',
                ':plan_code' => $planCode,
                ':value_cents' => $valueCents,
                ':position_index' => $positionIndex,
                ':lifecycle_status' => $lifecycle,
                ':is_closed' => $closed ? 'true' : 'false',
                ':closed_at' => $closed ? date('Y-m-d H:i:s') : null,
                ':metadata' => json_encode(['source' => 'worker_backfill_orgs'], JSON_UNESCAPED_UNICODE),
            ]);

            if ($new && !empty($new['id'])) {
                db()->exec("
                    INSERT INTO crm.deal_stage_history(deal_id, from_stage_id, to_stage_id, changed_by, reason, created_at)
                    VALUES(:deal_id, NULL, :to_stage_id, 'SYSTEM', 'Backfill inicial de cliente/subscrição', now())
                ", [
                    ':deal_id' => $new['id'],
                    ':to_stage_id' => $stage['id'],
                ]);
                if ($lifecycle === 'CLIENT') {
                    ensureInitialOperationForClientDeal((string)$new['id'], 'HOSPEDAGEM');
                    $opEnsured += 1;
                }
                $created += 1;
            }
            continue;
        }

        $stageChanged = (string)$existing['stage_id'] !== (string)$stage['id'];
        $lifecycleChanged = (string)$existing['lifecycle_status'] !== $lifecycle;
        if ($stageChanged || $lifecycleChanged) {
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
                ':subscription_id' => $org['subscription_id'] ?: null,
                ':title' => $title,
                ':contact_name' => $title,
                ':contact_email' => $org['billing_email'] ?: null,
                ':contact_phone' => $org['whatsapp'] ?: null,
                ':plan_code' => $planCode,
                ':value_cents' => $valueCents,
                ':lifecycle_status' => $lifecycle,
                ':is_closed' => $closed ? 'true' : 'false',
                ':closed_at' => $closed ? date('Y-m-d H:i:s') : null,
            ]);

            if ($stageChanged) {
                db()->exec("
                    INSERT INTO crm.deal_stage_history(deal_id, from_stage_id, to_stage_id, changed_by, reason, created_at)
                    VALUES(:deal_id, :from_stage_id, :to_stage_id, 'SYSTEM', 'Backfill/update de assinatura', now())
                ", [
                    ':deal_id' => $existing['id'],
                    ':from_stage_id' => $existing['stage_id'],
                    ':to_stage_id' => $stage['id'],
                ]);
            }
            $updated += 1;
        }

        if ($lifecycle === 'CLIENT') {
            ensureInitialOperationForClientDeal((string)$existing['id'], 'HOSPEDAGEM');
            $opEnsured += 1;
        }
    }

    file_put_contents(
        $logFile,
        '[' . date('c') . '] backfill_orgs_to_deals -> created=' . $created . ' updated=' . $updated . ' ops=' . $opEnsured . PHP_EOL,
        FILE_APPEND
    );
}

function runCrmReconcileViaApi(string $logFile): void
{
    $url = envString('CRM_RECONCILE_URL', 'http://ac_crm_next:3000/api/automation/reconcile');
    $token = envString('CRM_ADMIN_SESSION_TOKEN', 'koddahub-crm-v2-session');
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'timeout' => 20,
            'ignore_errors' => true,
            'header' => implode("\r\n", [
                'Content-Type: application/json',
                'Cookie: crm_admin_session=' . $token,
            ]),
            'content' => '{}',
        ],
    ]);

    $response = @file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    $httpStatus = 0;
    if (preg_match('/\s(\d{3})\s/', (string)$statusLine, $m)) {
        $httpStatus = (int)$m[1];
    }

    if ($response === false || $httpStatus < 200 || $httpStatus >= 300) {
        file_put_contents(
            $logFile,
            '[' . date('c') . '] reconcile_failed -> status=' . $httpStatus . ' url=' . $url . PHP_EOL,
            FILE_APPEND
        );
        return;
    }

    $decoded = json_decode((string)$response, true);
    $summary = is_array($decoded) ? ($decoded['summary'] ?? 'ok') : 'ok';
    file_put_contents(
        $logFile,
        '[' . date('c') . '] reconcile_ok -> ' . $summary . PHP_EOL,
        FILE_APPEND
    );
}

function expireClientApprovalTokens(string $logFile): void
{
    $rows = db()->all("
        SELECT id, deal_id
        FROM crm.deal_client_approval
        WHERE status = 'PENDING'
          AND expires_at < now()
        ORDER BY expires_at ASC
        LIMIT 200
    ");

    foreach ($rows as $row) {
        db()->exec("
            UPDATE crm.deal_client_approval
            SET status='EXPIRED', updated_at=now()
            WHERE id=:id
        ", [':id' => $row['id']]);

        db()->exec("
            INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
            VALUES(:deal_id, 'CLIENT_APPROVAL_EXPIRED', 'Token de aprovação expirado automaticamente.', :meta, 'WORKER')
        ", [
            ':deal_id' => $row['deal_id'],
            ':meta' => json_encode(['approval_id' => $row['id']], JSON_UNESCAPED_UNICODE),
        ]);

        file_put_contents(
            $logFile,
            '[' . date('c') . '] approval_token_expired -> deal_id=' . $row['deal_id'] . ' approval_id=' . $row['id'] . PHP_EOL,
            FILE_APPEND
        );
    }
}

function runPublicationStrictCheck(string $logFile, int $publishConsecutiveChecks, int $publishIntervalMinutes, int $publicationChecksWindow): void
{
    $candidates = db()->all("
        SELECT
            d.id AS deal_id,
            d.organization_id,
            o.domain AS target_domain,
            tr.id AS template_revision_id,
            tr.source_hash AS expected_hash,
            tr.entry_file,
            tr.preview_url,
            tr.updated_at AS template_updated_at
        FROM crm.deal d
        JOIN crm.deal_operation op
          ON op.deal_id = d.id
         AND op.status = 'ACTIVE'
         AND op.stage_code = 'publicacao'
        JOIN LATERAL (
            SELECT a.template_revision_id
            FROM crm.deal_client_approval a
            WHERE a.deal_id = d.id
              AND a.status = 'APPROVED'
            ORDER BY COALESCE(a.acted_at, a.created_at) DESC
            LIMIT 1
        ) ap ON true
        JOIN crm.deal_template_revision tr ON tr.id = ap.template_revision_id
        LEFT JOIN client.organizations o ON o.id = d.organization_id
        WHERE d.deal_type = 'HOSPEDAGEM'
          AND d.lifecycle_status = 'CLIENT'
        LIMIT 200
    ");

    foreach ($candidates as $row) {
        $dealId = (string)$row['deal_id'];
        $templateRevisionId = (string)$row['template_revision_id'];
        $targetDomain = (string)($row['target_domain'] ?? '');
        $expectedHash = (string)($row['expected_hash'] ?? '');

        $lastCheck = db()->one("
            SELECT checked_at
            FROM crm.deal_publish_check
            WHERE deal_id=:did AND template_revision_id=:tid
            ORDER BY checked_at DESC
            LIMIT 1
        ", [':did' => $dealId, ':tid' => $templateRevisionId]);

        if ($lastCheck && !empty($lastCheck['checked_at'])) {
            $secondsSinceLast = time() - strtotime((string)$lastCheck['checked_at']);
            if ($secondsSinceLast < ($publishIntervalMinutes * 60)) {
                continue;
            }
        }

        $httpStatus = null;
        $liveHash = null;
        $matches = false;

        if ($targetDomain !== '' && $expectedHash !== '') {
            $fetched = fetchLiveHtml($targetDomain);
            $httpStatus = $fetched['status'];
            if (!empty($fetched['html'])) {
                $normalized = normalizeHtmlForHash((string)$fetched['html']);
                $liveHash = hash('sha256', $normalized);
                $matches = ($httpStatus === 200 && hash_equals($expectedHash, $liveHash));
            }
        }

        db()->exec("
            INSERT INTO crm.deal_publish_check(
                deal_id,
                template_revision_id,
                target_domain,
                expected_hash,
                last_live_hash,
                last_http_status,
                matches,
                checked_at
            )
            VALUES(
                :deal_id,
                :template_revision_id,
                :target_domain,
                :expected_hash,
                :last_live_hash,
                :last_http_status,
                :matches,
                now()
            )
        ", [
            ':deal_id' => $dealId,
            ':template_revision_id' => $templateRevisionId,
            ':target_domain' => $targetDomain !== '' ? $targetDomain : null,
            ':expected_hash' => $expectedHash !== '' ? $expectedHash : null,
            ':last_live_hash' => $liveHash,
            ':last_http_status' => $httpStatus,
            ':matches' => $matches ? true : false,
        ]);

        file_put_contents(
            $logFile,
            '[' . date('c') . '] publication_check -> deal_id=' . $dealId . ' http=' . ($httpStatus ?? 'null') . ' match=' . ($matches ? '1' : '0') . PHP_EOL,
            FILE_APPEND
        );

        if (!$matches) {
            continue;
        }

        $recentChecks = db()->all("
            SELECT matches, last_http_status
            FROM crm.deal_publish_check
            WHERE deal_id=:did AND template_revision_id=:tid
            ORDER BY checked_at DESC
            LIMIT {$publicationChecksWindow}
        ", [':did' => $dealId, ':tid' => $templateRevisionId]);

        if (count($recentChecks) < $publishConsecutiveChecks) {
            continue;
        }

        $consecutiveOk = true;
        for ($i = 0; $i < $publishConsecutiveChecks; $i++) {
            if (empty($recentChecks[$i]) || !$recentChecks[$i]['matches'] || (int)$recentChecks[$i]['last_http_status'] !== 200) {
                $consecutiveOk = false;
                break;
            }
        }

        if ($consecutiveOk) {
            moveDealOperationToPublished($dealId);
            file_put_contents(
                $logFile,
                '[' . date('c') . '] publication_promoted -> deal_id=' . $dealId . PHP_EOL,
                FILE_APPEND
            );
        }
    }
}

while (true) {
    try {
        static $lastBackfillRun = 0;
        static $lastReconcileRun = 0;
        $nowTs = time();
        $backfillInterval = (int)(envString('CRM_BACKFILL_INTERVAL_SECONDS', '1800'));
        $reconcileInterval = (int)(envString('CRM_RECONCILE_INTERVAL_SECONDS', '300'));

        if ($lastBackfillRun === 0 || ($nowTs - $lastBackfillRun) >= max(60, $backfillInterval)) {
            backfillDealsFromClientOrganizations($logFile);
            $lastBackfillRun = $nowTs;
        }

        if ($lastReconcileRun === 0 || ($nowTs - $lastReconcileRun) >= max(60, $reconcileInterval)) {
            runCrmReconcileViaApi($logFile);
            $lastReconcileRun = $nowTs;
        }

        queueDailyBriefingReminders($logFile);
        expireClientApprovalTokens($logFile);
        runPublicationStrictCheck($logFile, $publishConsecutiveChecks, $publishIntervalMinutes, $publicationChecksWindow);

        $emails = db()->all("SELECT id, email_to, subject, body, attachments FROM crm.email_queue WHERE status='PENDING' ORDER BY created_at ASC LIMIT 20");
        foreach ($emails as $mail) {
            $attachmentPaths = [];
            $attachments = decodeAttachmentList($mail['attachments'] ?? null);
            foreach ($attachments as $att) {
                if (!is_array($att) || empty($att['path'])) {
                    continue;
                }
                $resolved = resolveAttachmentAbsolute((string)$att['path']);
                if ($resolved !== null) {
                    $attachmentPaths[] = $resolved;
                }
            }

            $mailMode = strtolower(envString('MAIL_MODE', 'simulate'));
            $testCopyTo = envString('MAIL_TEST_COPY_TO', 'arielrluz@gmail.com');
            $targetEmail = trim((string)($mail['email_to'] ?? ''));

            if ($targetEmail === '') {
                db()->exec("UPDATE crm.email_queue SET status='FAILED', processed_at=now() WHERE id=:id", [':id' => $mail['id']]);
                continue;
            }

            try {
                if ($mailMode === 'smtp') {
                    sendEmailSmtp($targetEmail, (string)$mail['subject'], (string)$mail['body'], $attachmentPaths);
                    if ($testCopyTo !== '' && strcasecmp($testCopyTo, $targetEmail) !== 0) {
                        sendEmailSmtp($testCopyTo, '[COPIA TESTE] ' . (string)$mail['subject'], (string)$mail['body'], $attachmentPaths);
                    }

                    db()->exec("UPDATE crm.email_queue SET status='SENT', processed_at=now() WHERE id=:id", [':id' => $mail['id']]);
                    file_put_contents(
                        $logFile,
                        '[' . date('c') . '] email_enviado_smtp -> ' . $targetEmail . ' | ' . $mail['subject'] . ' | copy=' . ($testCopyTo ?: 'none') . PHP_EOL,
                        FILE_APPEND
                    );
                } else {
                    file_put_contents(
                        $logFile,
                        '[' . date('c') . '] email_simulado -> ' . $targetEmail . ' | ' . $mail['subject'] . PHP_EOL,
                        FILE_APPEND
                    );
                    db()->exec("UPDATE crm.email_queue SET status='SENT_SIMULATED', processed_at=now() WHERE id=:id", [':id' => $mail['id']]);
                }
            } catch (Throwable $mailErr) {
                db()->exec("UPDATE crm.email_queue SET status='FAILED', processed_at=now() WHERE id=:id", [':id' => $mail['id']]);
                file_put_contents(
                    $logFile,
                    '[' . date('c') . '] email_failed -> ' . $targetEmail . ' | ' . $mail['subject'] . ' | err=' . $mailErr->getMessage() . PHP_EOL,
                    FILE_APPEND
                );
            }
        }

        $events = db()->all("SELECT id, provider, event_type FROM client.webhook_events WHERE processed=false ORDER BY created_at ASC LIMIT 30");
        foreach ($events as $ev) {
            db()->exec("UPDATE client.webhook_events SET processed=true WHERE id=:id", [':id' => $ev['id']]);
            file_put_contents($logFile, '[' . date('c') . '] webhook_processado -> ' . $ev['provider'] . ':' . $ev['event_type'] . PHP_EOL, FILE_APPEND);
        }

        file_put_contents($logFile, '[' . date('c') . '] worker_loop_ok' . PHP_EOL, FILE_APPEND);
    } catch (Throwable $e) {
        file_put_contents($logFile, '[' . date('c') . '] worker_error: ' . $e->getMessage() . PHP_EOL, FILE_APPEND);
    }

    sleep(12);
}
