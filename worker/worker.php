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

function ensureDealSuppressionTable(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    db()->exec("
        CREATE TABLE IF NOT EXISTS crm.deal_suppression (
            organization_id uuid NOT NULL,
            deal_type varchar(40) NOT NULL,
            subscription_id uuid NULL,
            reason text NULL,
            created_by varchar(120) NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (organization_id, deal_type)
        )
    ");
    db()->exec("
        CREATE INDEX IF NOT EXISTS deal_suppression_subscription_idx
          ON crm.deal_suppression(subscription_id)
    ");
    $ready = true;
}

function isSuppressedDeal(string $organizationId, string $dealType): bool
{
    $row = db()->one("
        SELECT organization_id
        FROM crm.deal_suppression
        WHERE organization_id = :oid
          AND deal_type = :dtype
        LIMIT 1
    ", [
        ':oid' => $organizationId,
        ':dtype' => $dealType,
    ]);
    return (bool)$row;
}

function ensureClientBillingTables(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    db()->exec("
        CREATE TABLE IF NOT EXISTS crm.client_billing_classification (
            deal_id uuid PRIMARY KEY,
            organization_id uuid NOT NULL,
            class_status varchar(20) NOT NULL CHECK (class_status IN ('ATIVO','ATRASADO','INATIVO')),
            days_late int NOT NULL DEFAULT 0,
            reference_due_date date NULL,
            last_payment_status varchar(40) NULL,
            last_payment_id uuid NULL,
            ticket_id uuid NULL,
            ticket_created_at timestamptz NULL,
            ghosted_at timestamptz NULL,
            ghost_reason text NULL,
            last_transition_at timestamptz NOT NULL DEFAULT now(),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    ");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_client_billing_class_status ON crm.client_billing_classification(class_status)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_client_billing_org ON crm.client_billing_classification(organization_id)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_client_billing_ghosted ON crm.client_billing_classification(ghosted_at)");

    db()->exec("
        CREATE TABLE IF NOT EXISTS crm.holiday_calendar (
            holiday_date date PRIMARY KEY,
            name varchar(180) NOT NULL,
            scope varchar(20) NOT NULL DEFAULT 'NACIONAL',
            created_at timestamptz NOT NULL DEFAULT now()
        )
    ");

    $ready = true;
}

function ensureSite24hOperationTables(): void
{
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
    db()->exec("CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order ON crm.deal_operation_substep(deal_id, stage_code, substep_order)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status ON crm.deal_operation_substep(deal_id, stage_code, status)");

    $ready = true;
}

function ensureSiteReleaseTables(): void
{
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

function runSiteReleaseConsistencyCheck(string $logFile): void
{
    ensureSiteReleaseTables();
    $rows = db()->all("
        SELECT
            r.id AS release_id,
            r.deal_id,
            r.version,
            r.project_root,
            r.assets_path,
            v.id AS variant_id,
            v.variant_code,
            v.folder_path,
            v.entry_file
        FROM crm.deal_site_release r
        LEFT JOIN crm.deal_site_variant v ON v.release_id = r.id
        ORDER BY r.updated_at DESC
        LIMIT 4000
    ");

    $checked = 0;
    $issues = 0;
    foreach ($rows as $row) {
        $checked++;
        $dealId = (string)($row['deal_id'] ?? '');
        if ($dealId === '') {
            continue;
        }

        $releaseRoot = trim((string)($row['project_root'] ?? ''));
        $assetsPath = trim((string)($row['assets_path'] ?? ''));
        $variantPath = trim((string)($row['folder_path'] ?? ''));
        $entryFile = trim((string)($row['entry_file'] ?? 'index.html'));
        $variantCode = trim((string)($row['variant_code'] ?? ''));

        $problem = null;
        if ($releaseRoot === '' || !is_dir($releaseRoot)) {
            $problem = 'release_root_missing';
        } elseif ($assetsPath === '' || !is_dir($assetsPath)) {
            $problem = 'assets_path_missing';
        } elseif ($variantCode !== '') {
            if ($variantPath === '' || !is_dir($variantPath)) {
                $problem = 'variant_folder_missing';
            } else {
                $entryPath = rtrim($variantPath, '/') . '/' . ltrim($entryFile !== '' ? $entryFile : 'index.html', '/');
                if (!is_file($entryPath)) {
                    $problem = 'variant_entry_missing';
                }
            }
        }

        if ($problem === null) {
            continue;
        }

        $issues++;
        $content = sprintf(
            'Inconsistencia de release detectada (%s) em release v%s%s.',
            $problem,
            (string)($row['version'] ?? '?'),
            $variantCode !== '' ? ' variante ' . $variantCode : ''
        );

        $already = db()->one("
            SELECT id
            FROM crm.deal_activity
            WHERE deal_id=:did
              AND activity_type='SITE_RELEASE_INCONSISTENT'
              AND created_at > now() - interval '6 hour'
              AND content=:content
            LIMIT 1
        ", [
            ':did' => $dealId,
            ':content' => $content,
        ]);

        if (!$already) {
            db()->exec("
                INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
                VALUES(:did, 'SITE_RELEASE_INCONSISTENT', :content, :meta::jsonb, 'WORKER')
            ", [
                ':did' => $dealId,
                ':content' => $content,
                ':meta' => json_encode([
                    'release_id' => $row['release_id'] ?? null,
                    'variant_id' => $row['variant_id'] ?? null,
                    'problem' => $problem,
                    'release_root' => $releaseRoot,
                    'assets_path' => $assetsPath,
                    'variant_path' => $variantPath,
                    'entry_file' => $entryFile,
                ], JSON_UNESCAPED_UNICODE),
            ]);
        }

        file_put_contents(
            $logFile,
            '[' . date('c') . '] site_release_inconsistency -> deal_id=' . $dealId . ' release=' . ($row['version'] ?? '?') . ' variant=' . ($variantCode ?: '-') . ' problem=' . $problem . PHP_EOL,
            FILE_APPEND
        );
    }

    file_put_contents(
        $logFile,
        '[' . date('c') . '] site_release_consistency -> checked=' . $checked . ' issues=' . $issues . PHP_EOL,
        FILE_APPEND
    );
}

function runBillingReconciliationStrict(string $logFile, int $limit = 80): void
{
    if (!in_array(strtolower(envString('FEATURE_BILLING_RECONCILIATION_STRICT', '0')), ['1', 'true', 'yes', 'on'], true)) {
        return;
    }

    $apiKey = envString('ASAAS_API_KEY', '');
    if ($apiKey === '') {
        file_put_contents($logFile, '[' . date('c') . '] billing_reconcile_strict_skip -> missing_asaas_api_key' . PHP_EOL, FILE_APPEND);
        return;
    }

    $rows = db()->all("
        SELECT id::text AS id, asaas_subscription_id, status
        FROM client.subscriptions
        WHERE coalesce(asaas_subscription_id,'') <> ''
        ORDER BY updated_at DESC
        LIMIT :lim
    ", [':lim' => max(10, $limit)]);

    $asaas = new \Shared\Infra\AsaasClient();
    $updated = 0;
    foreach ($rows as $row) {
        $sid = trim((string)($row['asaas_subscription_id'] ?? ''));
        if ($sid === '') {
            continue;
        }
        $resp = $asaas->getPaymentsBySubscription($sid, 1);
        if (!$asaas->isSuccess($resp)) {
            continue;
        }
        $payment = $resp['data'][0] ?? null;
        if (!is_array($payment)) {
            continue;
        }
        $gatewayStatus = strtoupper((string)($payment['status'] ?? ''));
        $localStatus = strtoupper((string)($row['status'] ?? ''));
        $targetStatus = $localStatus;
        if (in_array($gatewayStatus, ['RECEIVED', 'CONFIRMED'], true)) {
            $targetStatus = 'ACTIVE';
        } elseif (in_array($gatewayStatus, ['OVERDUE', 'FAILED'], true)) {
            $targetStatus = 'OVERDUE';
        }
        if ($targetStatus !== $localStatus) {
            db()->exec("UPDATE client.subscriptions SET status=:status, updated_at=now() WHERE id=CAST(:id AS uuid)", [
                ':status' => $targetStatus,
                ':id' => (string)$row['id'],
            ]);
            $updated++;
        }
    }

    file_put_contents(
        $logFile,
        '[' . date('c') . '] billing_reconcile_strict -> scanned=' . count($rows) . ' updated=' . $updated . PHP_EOL,
        FILE_APPEND
    );
}

function cleanupPasswordResetTokens(string $logFile): void
{
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
    $deleted = db()->one("
      WITH d AS (
        DELETE FROM client.password_resets
        WHERE expires_at < now()
           OR (used_at IS NOT NULL AND used_at < now() - interval '7 day')
        RETURNING 1
      )
      SELECT count(*)::int AS total FROM d
    ");
    $count = (int)($deleted['total'] ?? 0);
    file_put_contents(
        $logFile,
        '[' . date('c') . '] password_reset_cleanup -> removed=' . $count . PHP_EOL,
        FILE_APPEND
    );
}

function easterDate(int $year): DateTimeImmutable
{
    $a = $year % 19;
    $b = intdiv($year, 100);
    $c = $year % 100;
    $d = intdiv($b, 4);
    $e = $b % 4;
    $f = intdiv($b + 8, 25);
    $g = intdiv($b - $f + 1, 3);
    $h = (19 * $a + $b - $d - $g + 15) % 30;
    $i = intdiv($c, 4);
    $k = $c % 4;
    $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
    $m = intdiv($a + 11 * $h + 22 * $l, 451);
    $month = intdiv($h + $l - 7 * $m + 114, 31);
    $day = (($h + $l - 7 * $m + 114) % 31) + 1;
    return new DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day));
}

function addDays(DateTimeImmutable $date, int $days): DateTimeImmutable
{
    return $date->modify(($days >= 0 ? '+' : '') . $days . ' day');
}

function seedNationalHolidays(int $fromYear = 2026, int $toYear = 2030): void
{
    for ($year = $fromYear; $year <= $toYear; $year++) {
        $easter = easterDate($year);
        $carnivalMonday = addDays($easter, -48)->format('Y-m-d');
        $carnivalTuesday = addDays($easter, -47)->format('Y-m-d');
        $goodFriday = addDays($easter, -2)->format('Y-m-d');
        $corpusChristi = addDays($easter, 60)->format('Y-m-d');

        $fixed = [
            ['date' => sprintf('%04d-01-01', $year), 'name' => 'Confraternização Universal'],
            ['date' => $carnivalMonday, 'name' => 'Carnaval (segunda-feira)'],
            ['date' => $carnivalTuesday, 'name' => 'Carnaval (terça-feira)'],
            ['date' => $goodFriday, 'name' => 'Sexta-feira Santa'],
            ['date' => sprintf('%04d-04-21', $year), 'name' => 'Tiradentes'],
            ['date' => sprintf('%04d-05-01', $year), 'name' => 'Dia do Trabalho'],
            ['date' => $corpusChristi, 'name' => 'Corpus Christi'],
            ['date' => sprintf('%04d-09-07', $year), 'name' => 'Independência do Brasil'],
            ['date' => sprintf('%04d-10-12', $year), 'name' => 'Nossa Senhora Aparecida'],
            ['date' => sprintf('%04d-11-02', $year), 'name' => 'Finados'],
            ['date' => sprintf('%04d-11-15', $year), 'name' => 'Proclamação da República'],
            ['date' => sprintf('%04d-11-20', $year), 'name' => 'Dia da Consciência Negra'],
            ['date' => sprintf('%04d-12-25', $year), 'name' => 'Natal'],
        ];

        foreach ($fixed as $holiday) {
            db()->exec("
                INSERT INTO crm.holiday_calendar(holiday_date, name, scope)
                VALUES(:d::date, :n, 'NACIONAL')
                ON CONFLICT (holiday_date) DO NOTHING
            ", [
                ':d' => $holiday['date'],
                ':n' => $holiday['name'],
            ]);
        }
    }
}

function loadHolidaySet(): array
{
    $rows = db()->all("SELECT holiday_date::text AS d FROM crm.holiday_calendar WHERE scope='NACIONAL'");
    $set = [];
    foreach ($rows as $row) {
        $set[(string)$row['d']] = true;
    }
    return $set;
}

function addBusinessDays(DateTimeImmutable $start, int $days, array $holidaySet): DateTimeImmutable
{
    $cursor = $start;
    $added = 0;
    while ($added < $days) {
        $cursor = $cursor->modify('+1 day');
        $dow = (int)$cursor->format('N');
        $dateKey = $cursor->format('Y-m-d');
        if ($dow >= 6) {
            continue;
        }
        if (isset($holidaySet[$dateKey])) {
            continue;
        }
        $added++;
    }
    return $cursor;
}

function paidStatuses(): array
{
    return ['CONFIRMED', 'RECEIVED', 'PAID', 'RECEIVED_IN_CASH', 'SETTLED'];
}

function calculateDaysLate(?string $dueDate): int
{
    if (!$dueDate) {
        return 0;
    }
    $today = new DateTimeImmutable('today');
    $due = DateTimeImmutable::createFromFormat('Y-m-d', substr($dueDate, 0, 10)) ?: new DateTimeImmutable($dueDate);
    $diffSeconds = $today->getTimestamp() - $due->setTime(0, 0)->getTimestamp();
    if ($diffSeconds <= 0) {
        return 0;
    }
    return (int)floor($diffSeconds / 86400);
}

function resolveClientClass(string $subscriptionStatus, int $daysLate): string
{
    $status = strtoupper(trim($subscriptionStatus));
    if (in_array($status, ['CANCELED', 'CANCELLED', 'SUSPENDED'], true)) {
        return 'INATIVO';
    }
    if ($daysLate > 15) {
        return 'INATIVO';
    }
    if ($daysLate >= 3) {
        return 'ATRASADO';
    }
    return 'ATIVO';
}

function ensureInativoTicket(string $dealId, string $organizationId, string $legalName, int $daysLate, array $holidaySet): string
{
    $existing = db()->one("
        SELECT id
        FROM client.tickets
        WHERE organization_id=:oid
          AND ticket_type='INADIMPLENCIA_DESATIVACAO'
          AND status IN ('OPEN','NEW','PENDING')
        ORDER BY created_at DESC
        LIMIT 1
    ", [':oid' => $organizationId]);

    $ticketId = $existing ? (string)$existing['id'] : '';
    if ($ticketId === '') {
        $inserted = db()->one("
            INSERT INTO client.tickets(
                organization_id, ticket_type, priority, subject, description, status
            )
            VALUES(
                :oid, 'INADIMPLENCIA_DESATIVACAO', 'ALTA', :subject, :description, 'OPEN'
            )
            RETURNING id
        ", [
            ':oid' => $organizationId,
            ':subject' => 'Desativação programada por inadimplência',
            ':description' => sprintf(
                'Cliente %s está com %d dias de atraso. Avaliar desativação do site em até 5 dias úteis.',
                $legalName !== '' ? $legalName : $organizationId,
                $daysLate
            ),
        ]);
        $ticketId = (string)($inserted['id'] ?? '');
    }

    $queue = db()->one("SELECT id FROM crm.ticket_queue WHERE ticket_id=:tid LIMIT 1", [':tid' => $ticketId]);
    if (!$queue) {
        $deadline = addBusinessDays(new DateTimeImmutable('now'), 5, $holidaySet)->format('Y-m-d H:i:s');
        db()->exec("
            INSERT INTO crm.ticket_queue(ticket_id, queue_name, sla_deadline, status)
            VALUES(:tid, 'DESATIVACAO_SITE', :sla, 'NEW')
        ", [
            ':tid' => $ticketId,
            ':sla' => $deadline,
        ]);
    }

    db()->exec("
        INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
        VALUES(:did, 'INADIMPLENCIA_INATIVO', :content, :meta::jsonb, 'WORKER')
    ", [
        ':did' => $dealId,
        ':content' => 'Cliente entrou em INATIVO por inadimplência. Ticket de desativação criado/atualizado.',
        ':meta' => json_encode(['ticket_id' => $ticketId, 'days_late' => $daysLate], JSON_UNESCAPED_UNICODE),
    ]);

    return $ticketId;
}

function syncClientBillingClassification(string $logFile): void
{
    ensureClientBillingTables();
    seedNationalHolidays();
    $holidaySet = loadHolidaySet();

    $deals = db()->all("
        SELECT
            d.id AS deal_id,
            d.organization_id,
            d.subscription_id,
            coalesce(d.contact_name, d.title, '') AS contact_name
        FROM crm.deal d
        LEFT JOIN crm.pipeline_stage ps ON ps.id = d.stage_id
        WHERE d.deal_type='HOSPEDAGEM'
          AND (
            d.lifecycle_status='CLIENT'
            OR ps.code IN ('fechado_ganho','assinatura_ativa_ganho')
            OR (d.is_closed = true AND coalesce(ps.code,'') NOT IN ('perdido','perdido_abandonado'))
          )
        ORDER BY d.updated_at DESC
        LIMIT 2000
    ");

    $paid = paidStatuses();
    $paidSql = "'" . implode("','", array_map(static fn($s) => strtoupper($s), $paid)) . "'";
    $updated = 0;
    $transitioned = 0;

    foreach ($deals as $deal) {
        $dealId = (string)$deal['deal_id'];
        $organizationId = (string)$deal['organization_id'];
        if ($organizationId === '') {
            continue;
        }

        $subscription = db()->one("
            SELECT id, status, next_due_date
            FROM client.subscriptions
            WHERE organization_id=:oid
            ORDER BY created_at DESC
            LIMIT 1
        ", [':oid' => $organizationId]);

        $subscriptionId = (string)($subscription['id'] ?? $deal['subscription_id'] ?? '');
        $subscriptionStatus = strtoupper((string)($subscription['status'] ?? 'PENDING'));
        $nextDueDate = (string)($subscription['next_due_date'] ?? '');

        $refPayment = null;
        if ($subscriptionId !== '') {
            $refPayment = db()->one("
                SELECT id, status, due_date
                FROM client.payments
                WHERE subscription_id=:sid
                  AND due_date <= CURRENT_DATE
                  AND upper(status) NOT IN ({$paidSql})
                ORDER BY due_date DESC, created_at DESC
                LIMIT 1
            ", [':sid' => $subscriptionId]);

            if (!$refPayment) {
                $refPayment = db()->one("
                    SELECT id, status, due_date
                    FROM client.payments
                    WHERE subscription_id=:sid
                    ORDER BY coalesce(paid_at, due_date::timestamp, created_at) DESC
                    LIMIT 1
                ", [':sid' => $subscriptionId]);
            }
        }

        $referenceDue = (string)($refPayment['due_date'] ?? '');
        if ($referenceDue === '' && $nextDueDate !== '' && $nextDueDate <= date('Y-m-d')) {
            $referenceDue = $nextDueDate;
        }
        $daysLate = calculateDaysLate($referenceDue);
        $classStatus = resolveClientClass($subscriptionStatus, $daysLate);
        $lastPaymentStatus = strtoupper((string)($refPayment['status'] ?? $subscriptionStatus));
        $lastPaymentId = (string)($refPayment['id'] ?? '');

        $existing = db()->one("
            SELECT class_status, ghosted_at, ticket_id
            FROM crm.client_billing_classification
            WHERE deal_id=:did
            LIMIT 1
        ", [':did' => $dealId]);

        $prevClass = $existing ? (string)$existing['class_status'] : '';
        $ghostedAt = $existing ? (string)($existing['ghosted_at'] ?? '') : '';
        $ticketId = $existing ? (string)($existing['ticket_id'] ?? '') : '';
        $classChanged = ($prevClass !== '' && $prevClass !== $classStatus);

        if ($classStatus === 'INATIVO' && ($prevClass !== 'INATIVO' || $ticketId === '')) {
            $ticketId = ensureInativoTicket($dealId, $organizationId, (string)$deal['contact_name'], $daysLate, $holidaySet);
        }

        if (!$existing) {
            db()->exec("
                INSERT INTO crm.client_billing_classification(
                    deal_id, organization_id, class_status, days_late, reference_due_date,
                    last_payment_status, last_payment_id, ticket_id, ticket_created_at,
                    ghosted_at, ghost_reason, last_transition_at, created_at, updated_at
                )
                VALUES(
                    :did, :oid, :class_status, :days_late, :reference_due_date,
                    :last_payment_status, :last_payment_id, :ticket_id, :ticket_created_at,
                    NULL, NULL, now(), now(), now()
                )
            ", [
                ':did' => $dealId,
                ':oid' => $organizationId,
                ':class_status' => $classStatus,
                ':days_late' => $daysLate,
                ':reference_due_date' => $referenceDue !== '' ? $referenceDue : null,
                ':last_payment_status' => $lastPaymentStatus !== '' ? $lastPaymentStatus : null,
                ':last_payment_id' => $lastPaymentId !== '' ? $lastPaymentId : null,
                ':ticket_id' => $ticketId !== '' ? $ticketId : null,
                ':ticket_created_at' => $ticketId !== '' ? date('Y-m-d H:i:s') : null,
            ]);
            db()->exec("
                INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
                VALUES(:did, 'CLIENT_CLASSIFICATION', :content, :meta::jsonb, 'WORKER')
            ", [
                ':did' => $dealId,
                ':content' => 'Classificação financeira inicial: ' . $classStatus,
                ':meta' => json_encode(['class_status' => $classStatus, 'days_late' => $daysLate], JSON_UNESCAPED_UNICODE),
            ]);
            $updated++;
            continue;
        }

        $clearGhost = ($ghostedAt !== '' && $classStatus !== 'INATIVO');
        db()->exec("
            UPDATE crm.client_billing_classification
            SET
                class_status=:class_status,
                days_late=:days_late,
                reference_due_date=:reference_due_date,
                last_payment_status=:last_payment_status,
                last_payment_id=:last_payment_id,
                ticket_id=:ticket_id::uuid,
                ticket_created_at=CASE WHEN :ticket_id::uuid IS NOT NULL AND ticket_created_at IS NULL THEN now() ELSE ticket_created_at END,
                ghosted_at=CASE WHEN :clear_ghost::boolean THEN NULL ELSE ghosted_at END,
                ghost_reason=CASE WHEN :clear_ghost::boolean THEN NULL ELSE ghost_reason END,
                last_transition_at=CASE WHEN :changed::boolean THEN now() ELSE last_transition_at END,
                updated_at=now()
            WHERE deal_id=:did
        ", [
            ':class_status' => $classStatus,
            ':days_late' => $daysLate,
            ':reference_due_date' => $referenceDue !== '' ? $referenceDue : null,
            ':last_payment_status' => $lastPaymentStatus !== '' ? $lastPaymentStatus : null,
            ':last_payment_id' => $lastPaymentId !== '' ? $lastPaymentId : null,
            ':ticket_id' => $ticketId !== '' ? $ticketId : null,
            ':clear_ghost' => $clearGhost ? 'true' : 'false',
            ':changed' => $classChanged ? 'true' : 'false',
            ':did' => $dealId,
        ]);

        if ($classChanged || $clearGhost) {
            db()->exec("
                INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
                VALUES(:did, 'CLIENT_CLASSIFICATION', :content, :meta::jsonb, 'WORKER')
            ", [
                ':did' => $dealId,
                ':content' => sprintf(
                    'Classificação financeira alterada de %s para %s.',
                    $prevClass !== '' ? $prevClass : 'N/D',
                    $classStatus
                ),
                ':meta' => json_encode([
                    'from' => $prevClass,
                    'to' => $classStatus,
                    'days_late' => $daysLate,
                    'ghost_cleared' => $clearGhost,
                ], JSON_UNESCAPED_UNICODE),
            ]);
            $transitioned++;
        }

        $updated++;
    }

    file_put_contents(
        $logFile,
        '[' . date('c') . '] billing_classification_sync -> updated=' . $updated . ' transitioned=' . $transitioned . PHP_EOL,
        FILE_APPEND
    );
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

function encodeMimeHeader(string $value): string
{
    return preg_match('/^[\x20-\x7E]+$/', $value) ? $value : '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function normalizeMailBody(string $body): string
{
    return preg_replace("/(?<!\r)\n/", "\r\n", (string)$body) ?? (string)$body;
}

function containsHtmlBody(string $body): bool
{
    return preg_match('/<[^>]+>/', $body) === 1;
}

function unpackMimePayload(string $body): array
{
    $prefix = 'KH_MIME_V1:';
    if (!str_starts_with($body, $prefix)) {
        return [
            'html' => $body,
            'text' => null,
        ];
    }

    $raw = substr($body, strlen($prefix));
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [
            'html' => $body,
            'text' => null,
        ];
    }

    $html = isset($decoded['html']) ? (string)$decoded['html'] : '';
    $text = isset($decoded['text']) ? trim((string)$decoded['text']) : '';
    return [
        'html' => $html,
        'text' => $text !== '' ? $text : null,
    ];
}

function sanitizeEmailHtml(string $html): string
{
    $sanitized = $html;
    // Remove bloco de toggle/collapse que alguns templates antigos inseriam.
    $sanitized = preg_replace('/<div\b[^>]*class=["\'][^"\']*\bajT\b[^"\']*["\'][^>]*>\s*<\/div>/i', '', $sanitized) ?? $sanitized;
    return $sanitized;
}

function htmlToPlainText(string $html): string
{
    $text = preg_replace('/<style\b[^>]*>.*?<\/style>/is', ' ', $html) ?? $html;
    $text = preg_replace('/<script\b[^>]*>.*?<\/script>/is', ' ', $text) ?? $text;
    $text = preg_replace('/<head\b[^>]*>.*?<\/head>/is', ' ', $text) ?? $text;
    $text = preg_replace('/<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/is', '$2 ($1)', $text) ?? $text;
    $text = preg_replace('/<(br|\/p|\/div|\/li)>/i', "\n", $text) ?? $text;
    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;
    $text = preg_replace("/[ \t]{2,}/", ' ', $text) ?? $text;
    return trim((string)$text);
}

function dotStuffSmtpData(string $data): string
{
    return preg_replace('/(?m)^\./', '..', $data) ?? $data;
}

function attachmentMimeType(string $path): string
{
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo !== false) {
            $mime = finfo_file($finfo, $path);
            finfo_close($finfo);
            if (is_string($mime) && $mime !== '') {
                return $mime;
            }
        }
    }
    return 'application/octet-stream';
}

function buildMimeMessage(string $fromEmail, string $fromName, string $toEmail, string $subject, string $body, array $attachmentPaths = []): string
{
    $payload = unpackMimePayload($body);
    $htmlCandidate = sanitizeEmailHtml((string)($payload['html'] ?? $body));
    $textCandidate = isset($payload['text']) ? (string)$payload['text'] : null;

    $hasHtml = containsHtmlBody($htmlCandidate);
    $plainBody = ($textCandidate !== null && trim($textCandidate) !== '')
        ? $textCandidate
        : ($hasHtml ? htmlToPlainText($htmlCandidate) : $htmlCandidate);
    $htmlBody = $hasHtml ? $htmlCandidate : nl2br(htmlspecialchars($htmlCandidate, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
    $plainBody = normalizeMailBody($plainBody);
    $htmlBody = normalizeMailBody($htmlBody);

    $fromDomain = strstr($fromEmail, '@');
    $fromDomain = $fromDomain !== false ? ltrim($fromDomain, '@') : 'koddahub.com.br';
    $messageId = '<' . bin2hex(random_bytes(16)) . '@' . preg_replace('/[^a-z0-9\.\-]/i', '', $fromDomain) . '>';
    $replyTo = envString('MAIL_REPLY_TO', $fromEmail);

    $headers = [
        'Date: ' . gmdate('D, d M Y H:i:s O'),
        'Message-ID: ' . $messageId,
        'From: ' . ($fromName !== '' ? '"' . str_replace('"', '\"', encodeMimeHeader($fromName)) . '" ' : '') . '<' . $fromEmail . '>',
        'To: <' . $toEmail . '>',
        'Reply-To: <' . $replyTo . '>',
        'MIME-Version: 1.0',
        'Subject: ' . encodeMimeHeader($subject),
    ];

    if (count($attachmentPaths) === 0) {
        if ($hasHtml) {
            $altBoundary = 'koddahub_alt_' . bin2hex(random_bytes(8));
            $headers[] = 'Content-Type: multipart/alternative; boundary="' . $altBoundary . '"';
            $parts = [
                '--' . $altBoundary,
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: quoted-printable',
                '',
                quoted_printable_encode($plainBody),
                '--' . $altBoundary,
                'Content-Type: text/html; charset=UTF-8',
                'Content-Transfer-Encoding: quoted-printable',
                '',
                quoted_printable_encode($htmlBody),
                '--' . $altBoundary . '--',
                '',
            ];
            return dotStuffSmtpData(implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts));
        }

        $headers[] = 'Content-Type: text/plain; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: quoted-printable';
        return dotStuffSmtpData(implode("\r\n", $headers) . "\r\n\r\n" . quoted_printable_encode($plainBody) . "\r\n");
    }

    $mixedBoundary = 'koddahub_mix_' . bin2hex(random_bytes(8));
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $mixedBoundary . '"';

    $parts = [];
    if ($hasHtml) {
        $altBoundary = 'koddahub_alt_' . bin2hex(random_bytes(8));
        $parts[] = '--' . $mixedBoundary;
        $parts[] = 'Content-Type: multipart/alternative; boundary="' . $altBoundary . '"';
        $parts[] = '';
        $parts[] = '--' . $altBoundary;
        $parts[] = 'Content-Type: text/plain; charset=UTF-8';
        $parts[] = 'Content-Transfer-Encoding: quoted-printable';
        $parts[] = '';
        $parts[] = quoted_printable_encode($plainBody);
        $parts[] = '--' . $altBoundary;
        $parts[] = 'Content-Type: text/html; charset=UTF-8';
        $parts[] = 'Content-Transfer-Encoding: quoted-printable';
        $parts[] = '';
        $parts[] = quoted_printable_encode($htmlBody);
        $parts[] = '--' . $altBoundary . '--';
    } else {
        $parts[] = '--' . $mixedBoundary;
        $parts[] = 'Content-Type: text/plain; charset=UTF-8';
        $parts[] = 'Content-Transfer-Encoding: quoted-printable';
        $parts[] = '';
        $parts[] = quoted_printable_encode($plainBody);
    }

    foreach ($attachmentPaths as $path) {
        if (!is_file($path)) {
            continue;
        }
        $filename = basename($path);
        $parts[] = '--' . $mixedBoundary;
        $parts[] = 'Content-Type: ' . attachmentMimeType($path) . '; name="' . $filename . '"';
        $parts[] = 'Content-Transfer-Encoding: base64';
        $parts[] = 'Content-Disposition: attachment; filename="' . $filename . '"';
        $parts[] = '';
        $parts[] = chunk_split(base64_encode((string)file_get_contents($path)));
    }

    $parts[] = '--' . $mixedBoundary . '--';
    $parts[] = '';
    return dotStuffSmtpData(implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts));
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

function smtpCommand($socket, string $command, int|array $expectCode): string
{
    fwrite($socket, $command . "\r\n");
    $response = smtpRead($socket);
    $code = (int)substr($response, 0, 3);
    $expectCodes = is_array($expectCode) ? $expectCode : [$expectCode];
    if (!in_array($code, $expectCodes, true)) {
        throw new RuntimeException('SMTP command failed [' . $command . '] response=' . trim($response));
    }
    return $response;
}

function sendEmailSmtp(string $toEmail, string $subject, string $body, array $attachmentPaths = []): string
{
    $host = envString('SMTP_HOST', '');
    $port = (int)(envString('SMTP_PORT', '587'));
    $user = envString('SMTP_USER', '');
    $pass = envString('SMTP_PASS', '');
    $encryption = strtolower(envString('SMTP_ENCRYPTION', 'tls'));
    $heloDomain = envString('SMTP_HELO', $host !== '' ? $host : 'mail.koddahub.com.br');
    $allowSelfSigned = in_array(strtolower(envString('SMTP_ALLOW_SELF_SIGNED', 'false')), ['1', 'true', 'yes'], true);
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
                'verify_peer' => !$allowSelfSigned,
                'verify_peer_name' => !$allowSelfSigned,
                'allow_self_signed' => $allowSelfSigned,
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

    smtpCommand($socket, 'EHLO ' . $heloDomain, 250);

    if ($encryption === 'tls') {
        smtpCommand($socket, 'STARTTLS', 220);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($socket);
            throw new RuntimeException('Falha ao habilitar STARTTLS.');
        }
        smtpCommand($socket, 'EHLO ' . $heloDomain, 250);
    }

    if ($user !== '' && $pass !== '') {
        smtpCommand($socket, 'AUTH LOGIN', 334);
        smtpCommand($socket, base64_encode($user), 334);
        smtpCommand($socket, base64_encode($pass), 235);
    }

    smtpCommand($socket, 'MAIL FROM:<' . $fromEmail . '>', [250, 251]);
    smtpCommand($socket, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
    smtpCommand($socket, 'DATA', 354);
    fwrite($socket, buildMimeMessage($fromEmail, $fromName, $toEmail, $subject, $body, $attachmentPaths) . "\r\n.\r\n");
    $dataResponse = smtpRead($socket);
    if ((int)substr($dataResponse, 0, 3) !== 250) {
        fclose($socket);
        throw new RuntimeException('Falha ao enviar DATA SMTP: ' . trim($dataResponse));
    }
    smtpCommand($socket, 'QUIT', 221);
    fclose($socket);
    return trim($dataResponse);
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

    $alreadyNotified = db()->one("
        SELECT id
        FROM crm.deal_activity
        WHERE deal_id = :did
          AND activity_type = 'PUBLICATION_NOTIFIED'
        LIMIT 1
    ", [':did' => $dealId]);
    if ($alreadyNotified) {
        return;
    }

    $ctx = db()->one("
        SELECT
            d.organization_id,
            d.title,
            o.billing_email,
            o.domain
        FROM crm.deal d
        LEFT JOIN client.organizations o ON o.id = d.organization_id
        WHERE d.id = :did
        LIMIT 1
    ", [':did' => $dealId]);

    if (!$ctx) {
        return;
    }

    $domain = trim((string)($ctx['domain'] ?? ''));
    $domainUrl = $domain !== '' ? (preg_match('/^https?:\/\//i', $domain) ? $domain : 'https://' . $domain) : '';
    $clientEmail = trim((string)($ctx['billing_email'] ?? ''));
    $internalEmail = trim(envString('INTERNAL_NOTIFY_EMAIL', envString('MAIL_TEST_COPY_TO', '')));
    $subject = '[KoddaHub] Site publicado com sucesso';
    $body = "Olá!\n\nSeu site foi publicado com sucesso.\n" .
        ($domainUrl !== '' ? ("Acesse aqui: {$domainUrl}\n") : '') .
        "\nPróximos passos:\n- Acompanhar performance\n- Solicitar ajustes finos se necessário\n\nEquipe KoddaHub.";

    if ($clientEmail !== '') {
        db()->exec("
            INSERT INTO crm.email_queue (organization_id, email_to, subject, body, status)
            VALUES (:oid, :email, :subject, :body, 'PENDING')
        ", [
            ':oid' => $ctx['organization_id'] ?: null,
            ':email' => $clientEmail,
            ':subject' => $subject,
            ':body' => $body,
        ]);
    }

    if ($internalEmail !== '') {
        db()->exec("
            INSERT INTO crm.email_queue (organization_id, email_to, subject, body, status)
            VALUES (:oid, :email, :subject, :body, 'PENDING')
        ", [
            ':oid' => $ctx['organization_id'] ?: null,
            ':email' => $internalEmail,
            ':subject' => '[Interno] Publicação concluída - ' . ($ctx['title'] ?: $dealId),
            ':body' => "Publicação concluída para o deal {$dealId}.\n" .
              ($domainUrl !== '' ? ("Domínio: {$domainUrl}\n") : "Domínio não informado.\n"),
        ]);
    }

    db()->exec("
        INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
        VALUES(:did, 'PUBLICATION_NOTIFIED', 'Notificações de publicação enfileiradas para cliente e interno.', :meta, 'WORKER')
    ", [
        ':did' => $dealId,
        ':meta' => json_encode([
            'client_email' => $clientEmail !== '' ? $clientEmail : null,
            'internal_email' => $internalEmail !== '' ? $internalEmail : null,
            'domain' => $domainUrl !== '' ? $domainUrl : null,
        ], JSON_UNESCAPED_UNICODE),
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
    ensureDealSuppressionTable();
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
        if (isSuppressedDeal($organizationId, 'HOSPEDAGEM')) {
            continue;
        }
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
    ensureSite24hOperationTables();
    $rowsPublicacao = db()->all("
        SELECT d.id AS deal_id
        FROM crm.deal d
        JOIN crm.deal_operation op
          ON op.deal_id = d.id
         AND op.status = 'ACTIVE'
         AND op.stage_code = 'publicacao'
        WHERE d.deal_type = 'HOSPEDAGEM'
          AND d.lifecycle_status = 'CLIENT'
        LIMIT 300
    ");
    $substeps = [
        ['code' => 'dominio_decisao', 'name' => 'Domínio já existe / precisa contratar', 'order' => 1],
        ['code' => 'dominio_registro', 'name' => 'Registro/transferência de domínio', 'order' => 2],
        ['code' => 'dns_config', 'name' => 'Configuração de DNS e apontamentos', 'order' => 3],
        ['code' => 'hostgator_account', 'name' => 'Cadastro/ajuste na Hostgator', 'order' => 4],
        ['code' => 'deploy_ssl', 'name' => 'Deploy + SSL + validação técnica', 'order' => 5],
        ['code' => 'go_live_monitor', 'name' => 'Monitoramento de entrada no ar', 'order' => 6],
    ];
    foreach ($rowsPublicacao as $dealRow) {
        $dealId = (string)$dealRow['deal_id'];
        foreach ($substeps as $substep) {
            db()->exec("
                INSERT INTO crm.deal_operation_substep (
                  deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
                )
                VALUES(
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
          AND EXISTS (
            SELECT 1
            FROM crm.deal_operation_substep s
            WHERE s.deal_id = d.id
              AND s.stage_code = 'publicacao'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM crm.deal_operation_substep s
            WHERE s.deal_id = d.id
              AND s.stage_code = 'publicacao'
              AND s.is_required = true
              AND s.status NOT IN ('COMPLETED', 'SKIPPED')
          )
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

function processScheduledSubscriptionChanges(string $logFile): void
{
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

    $rows = db()->all("
        SELECT
          sc.id::text AS id,
          sc.action_id::text AS action_id,
          sc.subscription_id::text AS subscription_id,
          sc.asaas_subscription_id,
          sc.target_plan_id::text AS target_plan_id,
          sc.target_value,
          p.monthly_price AS target_plan_monthly_price
        FROM client.subscription_change_schedule sc
        LEFT JOIN client.plans p ON p.id = sc.target_plan_id
        WHERE sc.status = 'SCHEDULED'
          AND sc.effective_at <= now()
        ORDER BY sc.effective_at ASC
        LIMIT 30
    ");
    if (count($rows) === 0) {
        return;
    }

    $asaas = new \Shared\Infra\AsaasClient();
    $auditNotifier = new \Shared\Support\FinancialAuditNotifier(
        db(),
        in_array(strtolower(envString('FEATURE_FINANCIAL_AUDIT_NOTIFICATIONS', '1')), ['1', 'true', 'yes', 'on'], true)
    );

    foreach ($rows as $row) {
        $scheduleId = (string)($row['id'] ?? '');
        $actionId = (string)($row['action_id'] ?? '');
        $subscriptionId = (string)($row['subscription_id'] ?? '');
        $asaasSubscriptionId = (string)($row['asaas_subscription_id'] ?? '');
        $targetPlanId = (string)($row['target_plan_id'] ?? '');
        $targetValue = round((float)($row['target_value'] ?? 0), 2);
        $targetPlanMonthlyPrice = isset($row['target_plan_monthly_price']) ? round((float)$row['target_plan_monthly_price'], 2) : null;

        if ($asaasSubscriptionId === '' || $subscriptionId === '' || $targetValue <= 0) {
            db()->exec("
                UPDATE client.subscription_change_schedule
                SET status='FAILED', failure_reason=:reason, failed_at=now(), updated_at=now()
                WHERE id=CAST(:id AS uuid)
            ", [
                ':reason' => 'Dados inválidos para aplicar mudança agendada',
                ':id' => $scheduleId,
            ]);
            if ($actionId !== '') {
                $auditNotifier->recordActionFailed([
                    'action_id' => $actionId,
                    'error_reason' => 'Mudança agendada inválida',
                    'payload' => ['schedule_id' => $scheduleId],
                ]);
            }
            continue;
        }

        $provider = $asaas->updateSubscriptionValue(
            $asaasSubscriptionId,
            $targetValue,
            [
                'updatePendingPayments' => true,
                'description' => 'Aplicação automática de mudança agendada no próximo ciclo',
            ]
        );
        if (!(bool)($provider['ok'] ?? false)) {
            db()->exec("
                UPDATE client.subscription_change_schedule
                SET status='FAILED', failure_reason=:reason, failed_at=now(), updated_at=now()
                WHERE id=CAST(:id AS uuid)
            ", [
                ':reason' => (string)($provider['error_message_safe'] ?? 'Falha ao atualizar no ASAAS'),
                ':id' => $scheduleId,
            ]);
            if ($actionId !== '') {
                $auditNotifier->recordActionFailed([
                    'action_id' => $actionId,
                    'error_reason' => 'Falha ao aplicar mudança agendada no ASAAS',
                    'payload' => ['schedule_id' => $scheduleId, 'asaas_response' => \Shared\Support\FinancialAuditNotifier::sanitizePayload($provider)],
                ]);
            }
            file_put_contents(
                $logFile,
                '[' . date('c') . '] scheduled_change_failed -> schedule_id=' . $scheduleId . ' sub=' . $asaasSubscriptionId . PHP_EOL,
                FILE_APPEND
            );
            continue;
        }

        $priceOverride = $targetValue;
        if ($targetPlanMonthlyPrice !== null && abs($targetValue - $targetPlanMonthlyPrice) < 0.01) {
            $priceOverride = null;
        }

        db()->exec("
            UPDATE client.subscriptions
            SET
              plan_id = CASE WHEN :target_plan_id <> '' THEN CAST(:target_plan_id AS uuid) ELSE plan_id END,
              price_override = :price_override,
              updated_at = now()
            WHERE id = CAST(:subscription_id AS uuid)
        ", [
            ':target_plan_id' => $targetPlanId,
            ':price_override' => $priceOverride,
            ':subscription_id' => $subscriptionId,
        ]);

        db()->exec("
            UPDATE client.subscription_change_schedule
            SET status='APPLIED', applied_at=now(), updated_at=now()
            WHERE id=CAST(:id AS uuid)
        ", [':id' => $scheduleId]);

        if ($actionId !== '') {
            $auditNotifier->recordActionConfirmed([
                'action_id' => $actionId,
                'after_state' => [
                    'subscription_id' => $asaasSubscriptionId,
                    'effective_value' => $targetValue,
                    'scheduled_change_applied' => true,
                ],
                'payload' => ['schedule_id' => $scheduleId],
            ]);
        }

        file_put_contents(
            $logFile,
            '[' . date('c') . '] scheduled_change_applied -> schedule_id=' . $scheduleId . ' sub=' . $asaasSubscriptionId . ' value=' . $targetValue . PHP_EOL,
            FILE_APPEND
        );
    }
}

function cancelExpiredUnpaidPayments(string $logFile, int $limit = 60): void
{
    $apiKey = trim((string)(getenv('ASAAS_API_KEY') ?: ''));
    if ($apiKey === '') {
        return;
    }

    $pixGraceHours = max(1, (int)(getenv('BILLING_PIX_CANCEL_GRACE_HOURS') ?: 48));
    $boletoGraceHours = max(1, (int)(getenv('BILLING_BOLETO_CANCEL_GRACE_HOURS') ?: 72));

    $rows = db()->all("
        SELECT
            p.subscription_id::text AS subscription_id,
            p.asaas_payment_id,
            upper(coalesce(p.billing_type,'')) AS billing_type,
            p.status,
            p.due_date::text AS due_date,
            p.created_at::text AS created_at
        FROM client.payments p
        WHERE upper(coalesce(p.billing_type,'')) IN ('PIX','BOLETO')
          AND upper(coalesce(p.status,'')) IN ('PENDING','OVERDUE')
        ORDER BY p.created_at ASC
        LIMIT " . (int)$limit
    );
    if (!$rows) {
        return;
    }

    $asaas = new \Shared\Infra\AsaasClient();
    $cancelled = 0;
    $skipped = 0;
    $failed = 0;
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));

    foreach ($rows as $row) {
        $paymentId = trim((string)($row['asaas_payment_id'] ?? ''));
        $billingType = strtoupper(trim((string)($row['billing_type'] ?? '')));
        if ($paymentId === '' || !in_array($billingType, ['PIX', 'BOLETO'], true)) {
            $skipped++;
            continue;
        }

        $referenceRaw = trim((string)($row['due_date'] ?? ''));
        if ($referenceRaw === '') {
            $referenceRaw = trim((string)($row['created_at'] ?? ''));
        }
        if ($referenceRaw === '') {
            $skipped++;
            continue;
        }

        try {
            $referenceAt = new DateTimeImmutable($referenceRaw, new DateTimeZone('UTC'));
        } catch (Throwable) {
            $skipped++;
            continue;
        }

        $graceHours = $billingType === 'PIX' ? $pixGraceHours : $boletoGraceHours;
        $deadlineAt = $referenceAt->modify('+' . $graceHours . ' hours');
        if ($now < $deadlineAt) {
            $skipped++;
            continue;
        }

        $provider = $asaas->cancelPayment($paymentId);
        if (!(bool)($provider['ok'] ?? false)) {
            $statusCode = (int)($provider['status_code'] ?? 0);
            if (!in_array($statusCode, [404, 422], true)) {
                $failed++;
                continue;
            }
        }

        db()->exec("
            UPDATE client.payments
            SET
              status = 'CANCELED',
              raw_payload = coalesce(raw_payload, '{}'::jsonb) || :meta::jsonb
            WHERE asaas_payment_id = :payment_id
        ", [
            ':payment_id' => $paymentId,
            ':meta' => json_encode([
                'auto_cancelled' => true,
                'auto_cancelled_reason' => 'UNPAID_TIMEOUT',
                'auto_cancelled_at' => date(DATE_ATOM),
                'grace_hours' => $graceHours,
                'billing_type' => $billingType,
            ], JSON_UNESCAPED_UNICODE),
        ]);

        $cancelled++;
    }

    if ($cancelled > 0 || $failed > 0) {
        file_put_contents(
            $logFile,
            '[' . date('c') . '] cancel_expired_unpaid -> scanned=' . count($rows)
              . ' cancelled=' . $cancelled
              . ' skipped=' . $skipped
              . ' failed=' . $failed
              . ' pix_grace_h=' . $pixGraceHours
              . ' boleto_grace_h=' . $boletoGraceHours
              . PHP_EOL,
            FILE_APPEND
        );
    }
}

while (true) {
    try {
        static $lastBackfillRun = 0;
        static $lastReconcileRun = 0;
        static $lastBillingClassRun = 0;
        static $lastSubscriptionScheduleRun = 0;
        static $lastUnpaidCancelRun = 0;
        static $lastPasswordResetCleanupRun = 0;
        static $lastSiteReleaseCheckRun = 0;
        $nowTs = time();
        $backfillInterval = (int)(envString('CRM_BACKFILL_INTERVAL_SECONDS', '1800'));
        $reconcileInterval = (int)(envString('CRM_RECONCILE_INTERVAL_SECONDS', '300'));
        $billingClassInterval = (int)(envString('CRM_BILLING_CLASS_INTERVAL_SECONDS', '600'));
        $subscriptionScheduleInterval = (int)(envString('CRM_SUBSCRIPTION_SCHEDULE_INTERVAL_SECONDS', '90'));
        $unpaidCancelInterval = (int)(envString('CRM_UNPAID_CANCEL_INTERVAL_SECONDS', '180'));
        $passwordResetCleanupInterval = 86400;
        $siteReleaseCheckInterval = (int)(envString('CRM_SITE_RELEASE_CHECK_INTERVAL_SECONDS', '600'));

        if ($lastBackfillRun === 0 || ($nowTs - $lastBackfillRun) >= max(60, $backfillInterval)) {
            backfillDealsFromClientOrganizations($logFile);
            $lastBackfillRun = $nowTs;
        }

        if ($lastReconcileRun === 0 || ($nowTs - $lastReconcileRun) >= max(60, $reconcileInterval)) {
            runCrmReconcileViaApi($logFile);
            $lastReconcileRun = $nowTs;
        }

        if ($lastBillingClassRun === 0 || ($nowTs - $lastBillingClassRun) >= max(60, $billingClassInterval)) {
            syncClientBillingClassification($logFile);
            $lastBillingClassRun = $nowTs;
        }

        if ($lastSubscriptionScheduleRun === 0 || ($nowTs - $lastSubscriptionScheduleRun) >= max(30, $subscriptionScheduleInterval)) {
            processScheduledSubscriptionChanges($logFile);
            $lastSubscriptionScheduleRun = $nowTs;
        }

        if ($lastUnpaidCancelRun === 0 || ($nowTs - $lastUnpaidCancelRun) >= max(60, $unpaidCancelInterval)) {
            cancelExpiredUnpaidPayments($logFile);
            $lastUnpaidCancelRun = $nowTs;
        }

        if ($lastPasswordResetCleanupRun === 0 || ($nowTs - $lastPasswordResetCleanupRun) >= $passwordResetCleanupInterval) {
            cleanupPasswordResetTokens($logFile);
            $lastPasswordResetCleanupRun = $nowTs;
        }

        if ($lastSiteReleaseCheckRun === 0 || ($nowTs - $lastSiteReleaseCheckRun) >= max(120, $siteReleaseCheckInterval)) {
            runSiteReleaseConsistencyCheck($logFile);
            $lastSiteReleaseCheckRun = $nowTs;
        }

        queueDailyBriefingReminders($logFile);
        expireClientApprovalTokens($logFile);
        runPublicationStrictCheck($logFile, $publishConsecutiveChecks, $publishIntervalMinutes, $publicationChecksWindow);
        runBillingReconciliationStrict($logFile);

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
                    $primaryResponse = sendEmailSmtp($targetEmail, (string)$mail['subject'], (string)$mail['body'], $attachmentPaths);
                    $copyResponse = null;
                    if ($testCopyTo !== '' && strcasecmp($testCopyTo, $targetEmail) !== 0) {
                        $copyResponse = sendEmailSmtp($testCopyTo, '[COPIA TESTE] ' . (string)$mail['subject'], (string)$mail['body'], $attachmentPaths);
                    }

                    db()->exec("UPDATE crm.email_queue SET status='SENT', processed_at=now() WHERE id=:id", [':id' => $mail['id']]);
                    file_put_contents(
                        $logFile,
                        '[' . date('c') . '] email_enviado_smtp -> ' . $targetEmail
                          . ' | ' . $mail['subject']
                          . ' | resp=' . $primaryResponse
                          . ' | copy=' . ($testCopyTo ?: 'none')
                          . ($copyResponse !== null ? ' | copy_resp=' . $copyResponse : '')
                          . PHP_EOL,
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

        $auditNotifier = new \Shared\Support\FinancialAuditNotifier(
            db(),
            in_array(strtolower(envString('FEATURE_FINANCIAL_AUDIT_NOTIFICATIONS', '1')), ['1', 'true', 'yes', 'on'], true)
        );
        $retriedNotifications = $auditNotifier->retryFailedNotifications(20);
        if ($retriedNotifications > 0) {
            file_put_contents(
                $logFile,
                '[' . date('c') . '] financial_notification_retry -> processed=' . $retriedNotifications . PHP_EOL,
                FILE_APPEND
            );
        }

        file_put_contents($logFile, '[' . date('c') . '] worker_loop_ok' . PHP_EOL, FILE_APPEND);
    } catch (Throwable $e) {
        file_put_contents($logFile, '[' . date('c') . '] worker_error: ' . $e->getMessage() . PHP_EOL, FILE_APPEND);
    }

    sleep(12);
}
