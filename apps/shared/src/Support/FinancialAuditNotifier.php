<?php
declare(strict_types=1);

namespace Shared\Support;

use Shared\Infra\Database;
use Throwable;

final class FinancialAuditNotifier
{
    private Database $db;
    private bool $notificationsEnabled;

    public function __construct(Database $db, bool $notificationsEnabled = true)
    {
        $this->db = $db;
        $this->notificationsEnabled = $notificationsEnabled;
        $this->ensureInfra();
    }

    public static function uuidv4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12)
        );
    }

    public static function uuidFromString(string $value): string
    {
        $hash = md5($value);
        return sprintf(
            '%s-%s-4%s-%s%s-%s',
            substr($hash, 0, 8),
            substr($hash, 8, 4),
            substr($hash, 13, 3),
            dechex((hexdec(substr($hash, 16, 1)) & 0x3) | 0x8),
            substr($hash, 17, 3),
            substr($hash, 20, 12)
        );
    }

    public static function sanitizePayload(mixed $value): mixed
    {
        $sensitive = [
            'card',
            'creditcard',
            'cvv',
            'token',
            'password',
            'authorization',
            'access_token',
            'asaas_api_key',
            'secret',
        ];
        if (is_array($value)) {
            $sanitized = [];
            foreach ($value as $k => $v) {
                $key = strtolower((string)$k);
                $mask = false;
                foreach ($sensitive as $needle) {
                    if (str_contains($key, $needle)) {
                        $mask = true;
                        break;
                    }
                }
                if ($mask) {
                    $sanitized[$k] = '[REDACTED]';
                    continue;
                }
                $sanitized[$k] = self::sanitizePayload($v);
            }
            return $sanitized;
        }
        if (is_object($value)) {
            return self::sanitizePayload((array)$value);
        }
        if (is_string($value) && strlen($value) > 2000) {
            return substr($value, 0, 2000) . '...';
        }
        return $value;
    }

    public function recordActionRequested(array $input, bool $notify = true): array
    {
        $actionId = trim((string)($input['action_id'] ?? ''));
        if ($actionId === '') {
            $actionId = self::uuidv4();
        }

        $payload = self::sanitizePayload($input['payload'] ?? null);
        $beforeState = self::sanitizePayload($input['before_state'] ?? null);
        $afterState = self::sanitizePayload($input['after_state'] ?? null);

        $this->db->exec(
            "
            INSERT INTO audit.financial_actions(
                action_id, org_id, user_id, deal_id, action_type, entity_type, entity_id,
                request_id, correlation_id, before_state, after_state, payload, status,
                notification_email_status, notification_crm_status, source, created_at, updated_at
            )
            VALUES(
                CAST(:action_id AS uuid),
                CASE WHEN :org_id <> '' THEN CAST(:org_id AS uuid) ELSE NULL END,
                CASE WHEN :user_id <> '' THEN CAST(:user_id AS uuid) ELSE NULL END,
                CASE WHEN :deal_id <> '' THEN CAST(:deal_id AS uuid) ELSE NULL END,
                :action_type, :entity_type, :entity_id,
                :request_id, :correlation_id, CAST(:before_state AS jsonb), CAST(:after_state AS jsonb), CAST(:payload AS jsonb), 'REQUESTED',
                'PENDING', 'PENDING', :source, now(), now()
            )
            ON CONFLICT (action_id)
            DO UPDATE SET
                before_state = COALESCE(audit.financial_actions.before_state, EXCLUDED.before_state),
                after_state = COALESCE(EXCLUDED.after_state, audit.financial_actions.after_state),
                payload = COALESCE(EXCLUDED.payload, audit.financial_actions.payload),
                updated_at = now()
            ",
            [
                ':action_id' => $actionId,
                ':org_id' => (string)($input['org_id'] ?? ''),
                ':user_id' => (string)($input['user_id'] ?? ''),
                ':deal_id' => (string)($input['deal_id'] ?? ''),
                ':action_type' => (string)($input['action_type'] ?? 'UNKNOWN_ACTION'),
                ':entity_type' => (string)($input['entity_type'] ?? 'UNKNOWN'),
                ':entity_id' => (string)($input['entity_id'] ?? ''),
                ':request_id' => (string)($input['request_id'] ?? ''),
                ':correlation_id' => (string)($input['correlation_id'] ?? ''),
                ':before_state' => json_encode($beforeState, JSON_UNESCAPED_UNICODE),
                ':after_state' => json_encode($afterState, JSON_UNESCAPED_UNICODE),
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                ':source' => (string)($input['source'] ?? 'PORTAL_API'),
            ]
        );

        if ($notify) {
            $this->notify($actionId, 'REQUESTED');
        }

        return $this->loadAction($actionId) ?? ['action_id' => $actionId];
    }

    public function recordActionConfirmed(array $input, bool $notify = true): ?array
    {
        $actionId = trim((string)($input['action_id'] ?? ''));
        if ($actionId === '') {
            return null;
        }

        $afterState = self::sanitizePayload($input['after_state'] ?? null);
        $payload = self::sanitizePayload($input['payload'] ?? null);

        $this->db->exec(
            "
            UPDATE audit.financial_actions
            SET
                status='CONFIRMED',
                after_state=COALESCE(CAST(:after_state AS jsonb), after_state),
                payload=COALESCE(CAST(:payload AS jsonb), payload),
                error_reason=NULL,
                confirmed_at=now(),
                updated_at=now()
            WHERE action_id=CAST(:action_id AS uuid)
            ",
            [
                ':action_id' => $actionId,
                ':after_state' => json_encode($afterState, JSON_UNESCAPED_UNICODE),
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            ]
        );

        if ($notify) {
            $this->notify($actionId, 'CONFIRMED');
        }

        return $this->loadAction($actionId);
    }

    public function recordActionFailed(array $input, bool $notify = true): ?array
    {
        $actionId = trim((string)($input['action_id'] ?? ''));
        if ($actionId === '') {
            return null;
        }

        $reason = trim((string)($input['error_reason'] ?? 'Falha não detalhada'));
        $payload = self::sanitizePayload($input['payload'] ?? null);

        $this->db->exec(
            "
            UPDATE audit.financial_actions
            SET
                status='FAILED',
                error_reason=:reason,
                payload=COALESCE(CAST(:payload AS jsonb), payload),
                failed_at=now(),
                updated_at=now()
            WHERE action_id=CAST(:action_id AS uuid)
            ",
            [
                ':action_id' => $actionId,
                ':reason' => $reason,
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            ]
        );

        if ($notify) {
            $this->notify($actionId, 'FAILED');
        }

        return $this->loadAction($actionId);
    }

    public function notify(string $actionId, string $phase): void
    {
        $action = $this->loadAction($actionId);
        if (!$action) {
            return;
        }

        $phase = strtoupper(trim($phase));
        if (!$this->notificationsEnabled) {
            $this->markNotificationSkipped((string)$action['action_id'], $phase);
            return;
        }

        try {
            $this->notifyEmail($action, $phase);
        } catch (Throwable $e) {
            $this->db->exec(
                "UPDATE audit.financial_actions SET notification_email_status='FAILED', error_reason=coalesce(error_reason,'') || :msg, updated_at=now() WHERE action_id=CAST(:action_id AS uuid)",
                [
                    ':action_id' => (string)$action['action_id'],
                    ':msg' => ' | email:' . substr($e->getMessage(), 0, 300),
                ]
            );
        }

        try {
            $this->notifyCrm($action, $phase);
        } catch (Throwable $e) {
            $this->db->exec(
                "UPDATE audit.financial_actions SET notification_crm_status='FAILED', error_reason=coalesce(error_reason,'') || :msg, updated_at=now() WHERE action_id=CAST(:action_id AS uuid)",
                [
                    ':action_id' => (string)$action['action_id'],
                    ':msg' => ' | crm:' . substr($e->getMessage(), 0, 300),
                ]
            );
        }
    }

    public function retryFailedNotifications(int $limit = 25): int
    {
        $rows = $this->db->all(
            "
            SELECT action_id::text AS action_id, status
            FROM audit.financial_actions
            WHERE notification_email_status='FAILED' OR notification_crm_status='FAILED'
            ORDER BY updated_at ASC
            LIMIT :lim
            ",
            [':lim' => max(1, $limit)]
        );

        $processed = 0;
        foreach ($rows as $row) {
            $phase = strtoupper((string)($row['status'] ?? 'REQUESTED'));
            if (!in_array($phase, ['REQUESTED', 'CONFIRMED', 'FAILED'], true)) {
                $phase = 'REQUESTED';
            }
            $this->notify((string)$row['action_id'], $phase);
            $processed++;
        }
        return $processed;
    }

    private function notifyEmail(array $action, string $phase): void
    {
        if ($this->alreadyNotifiedEmail($action, $phase)) {
            return;
        }

        $mailTo = trim((string)(getenv('MAIL_TO_FINANCE') ?: 'clientes@koddahub.com.br'));
        $orgId = (string)($action['org_id'] ?? '');
        $subject = sprintf('[%s] %s | action_id=%s', $phase, (string)$action['action_type'], (string)$action['action_id']);

        $localTz = (string)(getenv('APP_TIMEZONE') ?: date_default_timezone_get() ?: 'UTC');
        $utcNow = gmdate('Y-m-d\TH:i:s\Z');
        $localNow = (new \DateTimeImmutable('now', new \DateTimeZone($localTz)))->format('Y-m-d H:i:s T');

        $payloadText = json_encode($action['payload'] ?? null, JSON_UNESCAPED_UNICODE);
        if ($payloadText === false) {
            $payloadText = '{}';
        }

        $body = "Prova documental de alteração financeira\n"
          . "action_id: {$action['action_id']}\n"
          . "audit_id: {$action['id']}\n"
          . "request_id: " . (string)($action['request_id'] ?? '') . "\n"
          . "correlation_id: " . (string)($action['correlation_id'] ?? '') . "\n"
          . "phase: {$phase}\n"
          . "result: " . (string)($action['status'] ?? 'REQUESTED') . "\n"
          . "org_id: {$orgId}\n"
          . "user_id: " . (string)($action['user_id'] ?? '') . "\n"
          . "deal_id: " . (string)($action['deal_id'] ?? '') . "\n"
          . "action_type: " . (string)($action['action_type'] ?? '') . "\n"
          . "entity_type: " . (string)($action['entity_type'] ?? '') . "\n"
          . "entity_id: " . (string)($action['entity_id'] ?? '') . "\n"
          . "created_at_utc: {$utcNow}\n"
          . "created_at_local: {$localNow}\n"
          . "before_state: " . json_encode($action['before_state'] ?? null, JSON_UNESCAPED_UNICODE) . "\n"
          . "after_state: " . json_encode($action['after_state'] ?? null, JSON_UNESCAPED_UNICODE) . "\n"
          . "payload: {$payloadText}\n"
          . "error_reason: " . (string)($action['error_reason'] ?? '') . "\n";

        $this->db->exec(
            "
            INSERT INTO crm.email_queue(organization_id, email_to, subject, body, status, created_at)
            VALUES(CASE WHEN :oid <> '' THEN CAST(:oid AS uuid) ELSE NULL END, :to, :subject, :body, 'PENDING', now())
            ",
            [
                ':oid' => $orgId,
                ':to' => $mailTo,
                ':subject' => $subject,
                ':body' => $body,
            ]
        );

        $this->markEmailNotified((string)$action['action_id'], $phase, 'SENT');
    }

    private function notifyCrm(array $action, string $phase): void
    {
        if ($this->alreadyNotifiedCrm($action, $phase)) {
            return;
        }

        $dealId = trim((string)($action['deal_id'] ?? ''));
        $orgId = trim((string)($action['org_id'] ?? ''));
        if ($dealId === '' && $orgId !== '') {
            $deal = $this->db->one(
                "
                SELECT id::text AS id
                FROM crm.deal
                WHERE organization_id = CAST(:oid AS uuid)
                ORDER BY updated_at DESC
                LIMIT 1
                ",
                [':oid' => $orgId]
            );
            $dealId = (string)($deal['id'] ?? '');
        }

        if ($dealId === '') {
            $this->markCrmNotified((string)$action['action_id'], $phase, 'FAILED');
            return;
        }

        $content = sprintf(
            '[%s] %s | action_id=%s | request_id=%s | status=%s',
            $phase,
            (string)$action['action_type'],
            (string)$action['action_id'],
            (string)($action['request_id'] ?? ''),
            (string)($action['status'] ?? 'REQUESTED')
        );

        $meta = [
            'audit_id' => (string)($action['id'] ?? ''),
            'action_id' => (string)($action['action_id'] ?? ''),
            'action_type' => (string)($action['action_type'] ?? ''),
            'phase' => $phase,
            'org_id' => $orgId !== '' ? $orgId : null,
            'entity_type' => (string)($action['entity_type'] ?? ''),
            'entity_id' => (string)($action['entity_id'] ?? ''),
            'request_id' => (string)($action['request_id'] ?? ''),
            'correlation_id' => (string)($action['correlation_id'] ?? ''),
        ];

        $this->db->exec(
            "
            INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
            VALUES(CAST(:deal_id AS uuid), :activity_type, :content, CAST(:metadata AS jsonb), 'SYSTEM_AUDIT')
            ",
            [
                ':deal_id' => $dealId,
                ':activity_type' => 'FINANCIAL_' . $phase,
                ':content' => $content,
                ':metadata' => json_encode($meta, JSON_UNESCAPED_UNICODE),
            ]
        );

        $this->markCrmNotified((string)$action['action_id'], $phase, 'SENT');
    }

    private function loadAction(string $actionId): ?array
    {
        $row = $this->db->one(
            "
            SELECT
                id::text AS id,
                action_id::text AS action_id,
                coalesce(org_id::text, '') AS org_id,
                coalesce(user_id::text, '') AS user_id,
                coalesce(deal_id::text, '') AS deal_id,
                action_type,
                entity_type,
                coalesce(entity_id, '') AS entity_id,
                request_id,
                coalesce(correlation_id, '') AS correlation_id,
                before_state,
                after_state,
                payload,
                status,
                notification_email_status,
                notification_crm_status,
                email_requested_sent_at,
                email_confirmed_sent_at,
                email_failed_sent_at,
                crm_requested_sent_at,
                crm_confirmed_sent_at,
                crm_failed_sent_at,
                error_reason,
                created_at
            FROM audit.financial_actions
            WHERE action_id=CAST(:action_id AS uuid)
            LIMIT 1
            ",
            [':action_id' => $actionId]
        );

        if (!$row) {
            return null;
        }
        foreach (['before_state', 'after_state', 'payload'] as $key) {
            if (is_string($row[$key] ?? null)) {
                $decoded = json_decode((string)$row[$key], true);
                if (is_array($decoded)) {
                    $row[$key] = $decoded;
                }
            }
        }
        return $row ?: null;
    }

    private function alreadyNotifiedEmail(array $action, string $phase): bool
    {
        return match ($phase) {
            'REQUESTED' => !empty($action['email_requested_sent_at']),
            'CONFIRMED' => !empty($action['email_confirmed_sent_at']),
            'FAILED' => !empty($action['email_failed_sent_at']),
            default => false,
        };
    }

    private function alreadyNotifiedCrm(array $action, string $phase): bool
    {
        return match ($phase) {
            'REQUESTED' => !empty($action['crm_requested_sent_at']),
            'CONFIRMED' => !empty($action['crm_confirmed_sent_at']),
            'FAILED' => !empty($action['crm_failed_sent_at']),
            default => false,
        };
    }

    private function markEmailNotified(string $actionId, string $phase, string $status): void
    {
        $column = match ($phase) {
            'REQUESTED' => 'email_requested_sent_at',
            'CONFIRMED' => 'email_confirmed_sent_at',
            'FAILED' => 'email_failed_sent_at',
            default => null,
        };
        if ($column === null) {
            return;
        }
        $this->db->exec(
            "UPDATE audit.financial_actions SET notification_email_status=:status, {$column}=coalesce({$column}, now()), updated_at=now() WHERE action_id=CAST(:action_id AS uuid)",
            [
                ':action_id' => $actionId,
                ':status' => $status,
            ]
        );
    }

    private function markCrmNotified(string $actionId, string $phase, string $status): void
    {
        $column = match ($phase) {
            'REQUESTED' => 'crm_requested_sent_at',
            'CONFIRMED' => 'crm_confirmed_sent_at',
            'FAILED' => 'crm_failed_sent_at',
            default => null,
        };
        if ($column === null) {
            return;
        }
        $this->db->exec(
            "UPDATE audit.financial_actions SET notification_crm_status=:status, {$column}=coalesce({$column}, now()), updated_at=now() WHERE action_id=CAST(:action_id AS uuid)",
            [
                ':action_id' => $actionId,
                ':status' => $status,
            ]
        );
    }

    private function markNotificationSkipped(string $actionId, string $phase): void
    {
        if ($phase === 'REQUESTED') {
            $this->db->exec(
                "UPDATE audit.financial_actions SET notification_email_status='SKIPPED', notification_crm_status='SKIPPED', updated_at=now() WHERE action_id=CAST(:action_id AS uuid)",
                [':action_id' => $actionId]
            );
            return;
        }
        $this->db->exec(
            "UPDATE audit.financial_actions SET updated_at=now() WHERE action_id=CAST(:action_id AS uuid)",
            [':action_id' => $actionId]
        );
    }

    private function ensureInfra(): void
    {
        static $ready = false;
        if ($ready) {
            return;
        }

        $this->db->exec('CREATE SCHEMA IF NOT EXISTS audit');
        $this->db->exec(
            "
            CREATE TABLE IF NOT EXISTS audit.financial_actions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                action_id UUID NOT NULL UNIQUE,
                org_id UUID,
                user_id UUID,
                deal_id UUID,
                action_type VARCHAR(80) NOT NULL,
                entity_type VARCHAR(40) NOT NULL,
                entity_id VARCHAR(120),
                request_id VARCHAR(120) NOT NULL,
                correlation_id VARCHAR(120),
                before_state JSONB,
                after_state JSONB,
                payload JSONB,
                status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
                notification_email_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                notification_crm_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                email_requested_sent_at TIMESTAMPTZ,
                email_confirmed_sent_at TIMESTAMPTZ,
                email_failed_sent_at TIMESTAMPTZ,
                crm_requested_sent_at TIMESTAMPTZ,
                crm_confirmed_sent_at TIMESTAMPTZ,
                crm_failed_sent_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                confirmed_at TIMESTAMPTZ,
                failed_at TIMESTAMPTZ,
                error_reason TEXT,
                source VARCHAR(40)
            )
            "
        );
        $this->db->exec('CREATE INDEX IF NOT EXISTS idx_fin_actions_org_created ON audit.financial_actions(org_id, created_at DESC)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS idx_fin_actions_status_created ON audit.financial_actions(status, created_at DESC)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS idx_fin_actions_type_created ON audit.financial_actions(action_type, created_at DESC)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS idx_fin_actions_request_id ON audit.financial_actions(request_id)');

        $ready = true;
    }
}
