<?php
declare(strict_types=1);

namespace Shared\Support;

use DateTimeImmutable;
use Shared\Infra\AsaasClient;
use Shared\Infra\Database;
use Throwable;

final class AsaasWebhookProcessor
{
    private Database $db;
    private AsaasClient $asaas;
    private FinancialAuditNotifier $audit;
    private string $expectedToken;

    public function __construct(Database $db, ?AsaasClient $asaas = null, ?FinancialAuditNotifier $audit = null, ?string $expectedToken = null)
    {
        $this->db = $db;
        $this->asaas = $asaas ?? new AsaasClient();
        $this->audit = $audit ?? new FinancialAuditNotifier(
            $db,
            in_array(strtolower((string)(getenv('FEATURE_FINANCIAL_AUDIT_NOTIFICATIONS') ?: '1')), ['1', 'true', 'yes', 'on'], true)
        );
        $this->expectedToken = trim((string)($expectedToken ?? (getenv('ASAAS_WEBHOOK_TOKEN') ?: '')));
    }

    public function handle(Request $request, string $requestId = ''): array
    {
        $token = $this->extractToken($request);
        if ($this->expectedToken !== '' && !hash_equals($this->expectedToken, $token)) {
            return ['status' => 401, 'body' => ['error' => 'Unauthorized webhook']];
        }

        $event = is_array($request->body) ? $request->body : [];
        $eventId = trim((string)($event['id'] ?? ''));
        if ($eventId === '') {
            $eventId = sha1((string)json_encode($event, JSON_UNESCAPED_UNICODE));
        }
        $eventType = strtoupper(trim((string)($event['event'] ?? 'UNKNOWN')));
        $eventTime = $this->parseEventTime((string)($event['dateCreated'] ?? ''));

        $pdo = $this->db->pdo();
        try {
            $pdo->beginTransaction();

            $inserted = $this->db->exec(
                "INSERT INTO client.webhook_events(provider,event_id,event_type,payload,processed,created_at)
                 VALUES('asaas', :event_id, :event_type, CAST(:payload AS jsonb), false, now())
                 ON CONFLICT(provider,event_id) DO NOTHING",
                [
                    ':event_id' => $eventId,
                    ':event_type' => $eventType,
                    ':payload' => json_encode($this->sanitizeEventPayload($event), JSON_UNESCAPED_UNICODE),
                ]
            );

            if ($inserted === 0) {
                $pdo->commit();
                return [
                    'status' => 200,
                    'body' => [
                        'ok' => true,
                        'event_id' => $eventId,
                        'processed' => true,
                        'idempotent' => true,
                    ],
                ];
            }

            $result = [
                'ok' => true,
                'event_id' => $eventId,
                'processed' => true,
                'idempotent' => false,
            ];

            if (str_starts_with($eventType, 'PAYMENT_')) {
                $result = array_merge($result, $this->processPaymentEvent($event, $eventType, $eventTime, $requestId, $eventId));
            } elseif (str_starts_with($eventType, 'SUBSCRIPTION_')) {
                $result = array_merge($result, $this->processSubscriptionEvent($event, $eventType, $eventTime, $requestId, $eventId));
            } elseif ($eventType === 'CUSTOMER_BILLING_INFO_UPDATED') {
                $result = array_merge($result, $this->processCustomerBillingInfoEvent($event, $eventTime, $eventId));
            }

            if (!empty($result['queued'])) {
                $pdo->commit();
                return ['status' => 200, 'body' => $result];
            }

            $this->db->exec(
                "UPDATE client.webhook_events
                 SET processed=true
                 WHERE provider='asaas' AND event_id=:event_id",
                [':event_id' => $eventId]
            );

            $pdo->commit();
            return ['status' => 200, 'body' => $result];
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[asaas_webhook_processor] request_id=' . $requestId . ' event_id=' . $eventId . ' err=' . $e->getMessage());
            return [
                'status' => 500,
                'body' => [
                    'error' => 'Erro ao processar webhook',
                    'request_id' => $requestId,
                    'event_id' => $eventId,
                ],
            ];
        }
    }

    private function processPaymentEvent(array $event, string $eventType, ?DateTimeImmutable $eventTime, string $requestId, string $eventId): array
    {
        $payment = is_array($event['payment'] ?? null) ? $event['payment'] : [];
        $paymentId = trim((string)($payment['id'] ?? ''));
        $subscriptionCode = trim((string)($payment['subscription'] ?? ''));
        $customerCode = trim((string)($payment['customer'] ?? ''));

        $subscription = $this->resolveSubscription($subscriptionCode, $customerCode);
        if (!$subscription) {
            return [
                'processed' => false,
                'queued' => true,
                'reason' => 'SUBSCRIPTION_NOT_FOUND',
            ];
        }

        $status = strtoupper(trim((string)($payment['status'] ?? ($eventType === 'PAYMENT_RECEIVED' ? 'RECEIVED' : 'PENDING'))));
        $billingType = strtoupper(trim((string)($payment['billingType'] ?? '')));
        $amount = isset($payment['value']) && is_numeric($payment['value']) ? (float)$payment['value'] : 0.0;
        $dueDate = $this->normalizeDateOnly((string)($payment['dueDate'] ?? ''));
        $paidAt = $this->normalizeDateTime((string)($payment['paymentDate'] ?? $payment['confirmedDate'] ?? $payment['receivedDate'] ?? ''));
        $paymentIdSafe = $paymentId !== '' ? $paymentId : ('evt_' . substr($eventId, 0, 24));

        $updateParams = [
            ':payment_id' => $paymentIdSafe,
            ':status' => $status,
            ':billing_type' => $billingType !== '' ? $billingType : null,
            ':due_date' => $dueDate,
            ':paid_at' => $paidAt,
            ':raw_payload' => json_encode($this->sanitizeEventPayload($event), JSON_UNESCAPED_UNICODE),
        ];
        $insertParams = $updateParams + [
            ':subscription_id' => (string)$subscription['id'],
            ':amount' => $amount,
        ];

        $updated = $this->db->exec(
            "UPDATE client.payments
             SET status=:status,
                 billing_type=:billing_type,
                 due_date=COALESCE(:due_date, due_date),
                 paid_at=COALESCE(:paid_at, paid_at),
                 raw_payload=CAST(:raw_payload AS jsonb)
             WHERE asaas_payment_id=:payment_id",
            $updateParams
        );

        if ($updated === 0) {
            try {
                $this->db->exec(
                    "INSERT INTO client.payments(subscription_id, asaas_payment_id, amount, status, billing_type, due_date, paid_at, raw_payload)
                     VALUES(CAST(:subscription_id AS uuid), :payment_id, :amount, :status, :billing_type, :due_date, :paid_at, CAST(:raw_payload AS jsonb))",
                    $insertParams
                );
            } catch (Throwable) {
                // corrida de concorrência: garante estado final por update idempotente
                $this->db->exec(
                    "UPDATE client.payments
                     SET status=:status,
                         billing_type=:billing_type,
                         due_date=COALESCE(:due_date, due_date),
                         paid_at=COALESCE(:paid_at, paid_at),
                         raw_payload=CAST(:raw_payload AS jsonb)
                     WHERE asaas_payment_id=:payment_id",
                    $updateParams
                );
            }
        }

        if (in_array($eventType, ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'], true)) {
            $this->db->exec(
                "UPDATE client.subscriptions
                 SET status='ACTIVE', updated_at=now()
                 WHERE id=CAST(:id AS uuid)",
                [':id' => (string)$subscription['id']]
            );

            $pendingRetry = $this->db->one(
                "SELECT action_id::text AS action_id
                 FROM audit.financial_actions
                 WHERE action_type='RETRY_PAYMENT'
                   AND status='REQUESTED'
                   AND coalesce(payload->>'asaas_subscription_id','') = :sid
                 ORDER BY created_at DESC
                 LIMIT 1",
                [':sid' => (string)($subscription['asaas_subscription_id'] ?? '')]
            );
            if ($pendingRetry) {
                $this->audit->recordActionConfirmed([
                    'action_id' => (string)$pendingRetry['action_id'],
                    'after_state' => ['payment_id' => $paymentIdSafe, 'status' => 'RECEIVED'],
                    'payload' => ['webhook_event_id' => $eventId, 'webhook_type' => $eventType],
                ]);
            }
        }

        $this->updateSubscriptionEventClock((string)$subscription['id'], $eventTime);

        if ($billingType === 'CREDIT_CARD') {
            $card = $this->extractCardFromPaymentPayload($payment);
            if (($card['last4'] === null || $card['brand'] === null || $card['token'] === null) && $paymentId !== '') {
                $billingInfo = $this->asaas->getPaymentBillingInfo($paymentId);
                if (($billingInfo['ok'] ?? false) && is_array($billingInfo['data'] ?? null)) {
                    $fromProvider = $this->extractCardFromBillingInfo($billingInfo['data']);
                    if ($card['last4'] === null) {
                        $card['last4'] = $fromProvider['last4'];
                    }
                    if ($card['brand'] === null) {
                        $card['brand'] = $fromProvider['brand'];
                    }
                    if ($card['token'] === null) {
                        $card['token'] = $fromProvider['token'];
                    }
                }
            }

            $hasAnyCardData = $card['last4'] !== null || $card['brand'] !== null || $card['token'] !== null;
            if ($hasAnyCardData) {
                $this->db->exec(
                    "INSERT INTO client.billing_profiles(subscription_id, card_last4, card_brand, card_token, card_token_updated_at, is_validated, created_at)
                     VALUES(CAST(:subscription_id AS uuid), :card_last4, :card_brand, :card_token, now(), true, now())
                     ON CONFLICT(subscription_id)
                     DO UPDATE SET
                       card_last4 = COALESCE(EXCLUDED.card_last4, client.billing_profiles.card_last4),
                       card_brand = COALESCE(EXCLUDED.card_brand, client.billing_profiles.card_brand),
                       card_token = COALESCE(EXCLUDED.card_token, client.billing_profiles.card_token),
                       card_token_updated_at = CASE
                         WHEN EXCLUDED.card_last4 IS NOT NULL OR EXCLUDED.card_brand IS NOT NULL OR EXCLUDED.card_token IS NOT NULL
                         THEN now()
                         ELSE client.billing_profiles.card_token_updated_at
                       END,
                       is_validated = CASE
                         WHEN EXCLUDED.card_last4 IS NOT NULL OR EXCLUDED.card_brand IS NOT NULL OR EXCLUDED.card_token IS NOT NULL
                         THEN true
                         ELSE client.billing_profiles.is_validated
                       END",
                    [
                        ':subscription_id' => (string)$subscription['id'],
                        ':card_last4' => $card['last4'],
                        ':card_brand' => $card['brand'],
                        ':card_token' => $card['token'],
                    ]
                );

                $this->db->exec(
                    "UPDATE client.subscriptions
                     SET billing_profile_updated_at=now(), updated_at=now()
                     WHERE id=CAST(:id AS uuid)",
                    [':id' => (string)$subscription['id']]
                );
            }
        }

        return [];
    }

    private function processSubscriptionEvent(array $event, string $eventType, ?DateTimeImmutable $eventTime, string $requestId, string $eventId): array
    {
        $subscription = is_array($event['subscription'] ?? null) ? $event['subscription'] : [];
        $subscriptionCode = trim((string)($subscription['id'] ?? ''));
        $customerCode = trim((string)($subscription['customer'] ?? ''));

        $localSubscription = $this->resolveSubscription($subscriptionCode, $customerCode);
        if (!$localSubscription) {
            return [
                'processed' => false,
                'queued' => true,
                'reason' => 'SUBSCRIPTION_NOT_FOUND',
            ];
        }

        if ($eventTime !== null && !empty($localSubscription['last_asaas_event_at'])) {
            $last = strtotime((string)$localSubscription['last_asaas_event_at']);
            $current = strtotime($eventTime->format(DATE_ATOM));
            if ($last !== false && $current !== false && $current < $last) {
                return ['out_of_order' => true];
            }
        }

        $newStatus = strtoupper(trim((string)($subscription['status'] ?? '')));
        $billingType = strtoupper(trim((string)($subscription['billingType'] ?? '')));
        $nextDueDate = $this->normalizeDateOnly((string)($subscription['nextDueDate'] ?? ''));

        $this->db->exec(
            "UPDATE client.subscriptions
             SET
               status = CASE WHEN :status <> '' THEN :status ELSE status END,
               payment_method = CASE WHEN :billing_type <> '' THEN :billing_type ELSE payment_method END,
               next_due_date = COALESCE(:next_due_date, next_due_date),
               asaas_customer_id = CASE WHEN :customer_id <> '' THEN :customer_id ELSE asaas_customer_id END,
               asaas_subscription_id = CASE WHEN asaas_subscription_id IS NULL OR asaas_subscription_id = '' THEN :subscription_id ELSE asaas_subscription_id END,
               last_asaas_event_at = COALESCE(:event_time, last_asaas_event_at),
               updated_at = now()
             WHERE id = CAST(:id AS uuid)",
            [
                ':status' => $newStatus,
                ':billing_type' => $billingType,
                ':next_due_date' => $nextDueDate,
                ':customer_id' => $customerCode,
                ':subscription_id' => $subscriptionCode,
                ':event_time' => $eventTime ? $eventTime->format(DATE_ATOM) : null,
                ':id' => (string)$localSubscription['id'],
            ]
        );

        if ($newStatus === 'CANCELED' || $eventType === 'SUBSCRIPTION_CANCELED') {
            $pendingCancel = $this->db->one(
                "SELECT action_id::text AS action_id
                 FROM audit.financial_actions
                 WHERE action_type='CANCEL_SUBSCRIPTION'
                   AND status='REQUESTED'
                   AND coalesce(payload->>'asaas_subscription_id','') = :sid
                 ORDER BY created_at DESC
                 LIMIT 1",
                [':sid' => (string)($localSubscription['asaas_subscription_id'] ?? $subscriptionCode)]
            );
            if ($pendingCancel) {
                $this->audit->recordActionConfirmed([
                    'action_id' => (string)$pendingCancel['action_id'],
                    'after_state' => ['subscription_status' => 'CANCELED'],
                    'payload' => ['webhook_event_id' => $eventId, 'webhook_type' => $eventType],
                ]);
            }
        }

        if (in_array($eventType, ['SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CREATED'], true)) {
            $this->confirmPendingPlanAndValueActions((string)($localSubscription['asaas_subscription_id'] ?? $subscriptionCode), $eventType, $eventId);
        }

        return [];
    }

    private function processCustomerBillingInfoEvent(array $event, ?DateTimeImmutable $eventTime, string $eventId): array
    {
        $customerPayload = $event['customer'] ?? null;
        $customerId = '';
        if (is_array($customerPayload)) {
            $customerId = trim((string)($customerPayload['id'] ?? ''));
        } elseif (is_string($customerPayload)) {
            $customerId = trim($customerPayload);
        }

        if ($customerId === '') {
            return [];
        }

        $updatedAt = $eventTime ? $eventTime->format(DATE_ATOM) : (new DateTimeImmutable('now'))->format(DATE_ATOM);
        $this->db->exec(
            "UPDATE client.subscriptions
             SET billing_profile_updated_at=CAST(:updated_at AS timestamptz),
                 updated_at=now(),
                 last_asaas_event_at = GREATEST(COALESCE(last_asaas_event_at, CAST(:updated_at AS timestamptz)), CAST(:updated_at AS timestamptz))
             WHERE asaas_customer_id=:customer_id",
            [
                ':updated_at' => $updatedAt,
                ':customer_id' => $customerId,
            ]
        );

        $pending = $this->db->one(
            "SELECT action_id::text AS action_id
             FROM audit.financial_actions
             WHERE action_type='CARD_UPDATE_REQUESTED'
               AND status='REQUESTED'
               AND (
                 coalesce(payload->>'asaas_customer_id','') = :customer_id
                 OR coalesce(entity_id,'') IN (
                   SELECT asaas_subscription_id
                   FROM client.subscriptions
                   WHERE asaas_customer_id = :customer_id
                 )
               )
             ORDER BY created_at DESC
             LIMIT 1",
            [':customer_id' => $customerId]
        );

        if ($pending) {
            $this->audit->recordActionConfirmed([
                'action_id' => (string)$pending['action_id'],
                'after_state' => ['billing_profile_updated_at' => $updatedAt],
                'payload' => ['webhook_event_id' => $eventId, 'event_type' => 'CUSTOMER_BILLING_INFO_UPDATED'],
            ]);
        }

        return [];
    }

    private function confirmPendingPlanAndValueActions(string $subscriptionCode, string $eventType, string $eventId): void
    {
        $pendingPlan = $this->db->one(
            "SELECT action_id::text AS action_id, payload
             FROM audit.financial_actions
             WHERE action_type='CHANGE_PLAN'
               AND status='REQUESTED'
               AND coalesce(payload->>'asaas_subscription_id','') = :sid
               AND coalesce(payload->>'mode','') <> 'SCHEDULE_NEXT_DUE'
             ORDER BY created_at DESC
             LIMIT 1",
            [':sid' => $subscriptionCode]
        );

        if ($pendingPlan) {
            $payload = $this->decodeJsonField($pendingPlan['payload'] ?? null);
            $requestedPlan = trim((string)($payload['requested_plan_code'] ?? ''));
            $requestedValue = isset($payload['requested_price']) && is_numeric($payload['requested_price'])
                ? round((float)$payload['requested_price'], 2)
                : null;

            if ($requestedPlan !== '') {
                $plan = $this->db->one("SELECT id, monthly_price FROM client.plans WHERE code=:code LIMIT 1", [':code' => $requestedPlan]);
                if ($plan) {
                    $this->db->exec(
                        "UPDATE client.subscriptions
                         SET plan_id=CAST(:plan_id AS uuid),
                             price_override=:price_override,
                             updated_at=now()
                         WHERE asaas_subscription_id=:sid",
                        [
                            ':plan_id' => (string)$plan['id'],
                            ':price_override' => ($requestedValue !== null && abs($requestedValue - (float)$plan['monthly_price']) >= 0.01) ? $requestedValue : null,
                            ':sid' => $subscriptionCode,
                        ]
                    );
                }
            }

            $this->audit->recordActionConfirmed([
                'action_id' => (string)$pendingPlan['action_id'],
                'after_state' => ['subscription_id' => $subscriptionCode, 'event_type' => $eventType],
                'payload' => ['webhook_event_id' => $eventId],
            ]);
        }

        $pendingValue = $this->db->one(
            "SELECT action_id::text AS action_id, payload
             FROM audit.financial_actions
             WHERE action_type='UPDATE_SUBSCRIPTION_VALUE'
               AND status='REQUESTED'
               AND coalesce(payload->>'asaas_subscription_id','') = :sid
               AND coalesce(payload->>'mode','') <> 'SCHEDULE_NEXT_DUE'
             ORDER BY created_at DESC
             LIMIT 1",
            [':sid' => $subscriptionCode]
        );

        if ($pendingValue) {
            $payload = $this->decodeJsonField($pendingValue['payload'] ?? null);
            $requestedValue = isset($payload['requested_value']) && is_numeric($payload['requested_value'])
                ? round((float)$payload['requested_value'], 2)
                : null;
            if ($requestedValue !== null) {
                $this->db->exec(
                    "UPDATE client.subscriptions
                     SET price_override=:price_override, updated_at=now()
                     WHERE asaas_subscription_id=:sid",
                    [':price_override' => $requestedValue, ':sid' => $subscriptionCode]
                );
            }

            $this->audit->recordActionConfirmed([
                'action_id' => (string)$pendingValue['action_id'],
                'after_state' => ['subscription_id' => $subscriptionCode, 'event_type' => $eventType],
                'payload' => ['webhook_event_id' => $eventId],
            ]);
        }
    }

    private function resolveSubscription(string $subscriptionCode, string $customerCode): ?array
    {
        if ($subscriptionCode !== '') {
            $row = $this->db->one(
                "SELECT id::text AS id, asaas_subscription_id, asaas_customer_id, last_asaas_event_at
                 FROM client.subscriptions
                 WHERE asaas_subscription_id=:sid
                 ORDER BY created_at DESC
                 LIMIT 1",
                [':sid' => $subscriptionCode]
            );
            if ($row) {
                return $row;
            }
        }

        if ($customerCode !== '') {
            $row = $this->db->one(
                "SELECT id::text AS id, asaas_subscription_id, asaas_customer_id, last_asaas_event_at
                 FROM client.subscriptions
                 WHERE asaas_customer_id=:cid
                 ORDER BY created_at DESC
                 LIMIT 1",
                [':cid' => $customerCode]
            );
            if ($row) {
                if ($subscriptionCode !== '' && trim((string)($row['asaas_subscription_id'] ?? '')) === '') {
                    $this->db->exec(
                        "UPDATE client.subscriptions SET asaas_subscription_id=:sid, updated_at=now() WHERE id=CAST(:id AS uuid)",
                        [':sid' => $subscriptionCode, ':id' => (string)$row['id']]
                    );
                    $row['asaas_subscription_id'] = $subscriptionCode;
                }
                return $row;
            }
        }

        return null;
    }

    private function updateSubscriptionEventClock(string $subscriptionId, ?DateTimeImmutable $eventTime): void
    {
        if ($eventTime === null) {
            return;
        }

        $iso = $eventTime->format(DATE_ATOM);
        $this->db->exec(
            "UPDATE client.subscriptions
             SET last_asaas_event_at = GREATEST(COALESCE(last_asaas_event_at, CAST(:event_time AS timestamptz)), CAST(:event_time AS timestamptz)),
                 updated_at=now()
             WHERE id=CAST(:id AS uuid)",
            [':event_time' => $iso, ':id' => $subscriptionId]
        );
    }

    private function extractCardFromPaymentPayload(array $payment): array
    {
        $card = is_array($payment['creditCard'] ?? null) ? $payment['creditCard'] : [];
        $number = (string)($card['creditCardNumber'] ?? $card['number'] ?? '');
        $brand = trim((string)($card['creditCardBrand'] ?? $card['brand'] ?? ''));
        $token = trim((string)($card['creditCardToken'] ?? $card['token'] ?? ''));

        return [
            'last4' => $this->last4($number),
            'brand' => $brand !== '' ? $brand : null,
            'token' => $token !== '' ? $token : null,
        ];
    }

    private function extractCardFromBillingInfo(array $billingInfo): array
    {
        $cardNode = is_array($billingInfo['creditCard'] ?? null) ? $billingInfo['creditCard'] : $billingInfo;
        $number = (string)($cardNode['creditCardNumber'] ?? $cardNode['number'] ?? '');
        $brand = trim((string)($cardNode['creditCardBrand'] ?? $cardNode['brand'] ?? ''));
        $token = trim((string)($cardNode['creditCardToken'] ?? $cardNode['token'] ?? ''));

        return [
            'last4' => $this->last4($number),
            'brand' => $brand !== '' ? $brand : null,
            'token' => $token !== '' ? $token : null,
        ];
    }

    private function last4(string $number): ?string
    {
        $digits = preg_replace('/\D+/', '', $number);
        if (!is_string($digits) || strlen($digits) < 4) {
            return null;
        }
        return substr($digits, -4);
    }

    private function normalizeDateOnly(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        try {
            return (new DateTimeImmutable($value))->format('Y-m-d');
        } catch (Throwable) {
            return null;
        }
    }

    private function normalizeDateTime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        try {
            return (new DateTimeImmutable($value))->format('Y-m-d H:i:s');
        } catch (Throwable) {
            return null;
        }
    }

    private function parseEventTime(string $dateCreated): ?DateTimeImmutable
    {
        $dateCreated = trim($dateCreated);
        if ($dateCreated === '') {
            return null;
        }

        $formats = [
            DATE_ATOM,
            'Y-m-d\TH:i:s.uP',
            'Y-m-d H:i:s',
            'Y-m-d H:i:sP',
            'Y-m-d\TH:i:s',
        ];
        foreach ($formats as $format) {
            $date = DateTimeImmutable::createFromFormat($format, $dateCreated);
            if ($date instanceof DateTimeImmutable) {
                return $date;
            }
        }

        try {
            return new DateTimeImmutable($dateCreated);
        } catch (Throwable) {
            return null;
        }
    }

    private function sanitizeEventPayload(array $event): array
    {
        $walk = function ($value, $key = null) use (&$walk) {
            if (is_array($value)) {
                $result = [];
                foreach ($value as $k => $v) {
                    $result[$k] = $walk($v, (string)$k);
                }
                return $result;
            }

            $lowerKey = strtolower((string)$key);
            if (in_array($lowerKey, ['cvv', 'securitycode', 'creditcardcvv'], true)) {
                return '[REDACTED]';
            }
            if (in_array($lowerKey, ['creditcardnumber', 'cardnumber', 'number'], true) && is_string($value)) {
                $last4 = $this->last4($value);
                return $last4 !== null ? ('****' . $last4) : '[REDACTED]';
            }

            return $value;
        };

        return $walk($event);
    }

    private function extractToken(Request $request): string
    {
        $headers = is_array($request->headers) ? $request->headers : [];
        $token = $this->findHeader($headers, 'asaas-access-token');
        if ($token !== null && trim($token) !== '') {
            return trim($token);
        }

        $token = $this->findHeader($headers, 'X-Webhook-Token');
        if ($token !== null && trim($token) !== '') {
            return trim($token);
        }

        return '';
    }

    private function findHeader(array $headers, string $name): ?string
    {
        foreach ($headers as $key => $value) {
            if (strtolower((string)$key) !== strtolower($name)) {
                continue;
            }
            if (is_array($value)) {
                return isset($value[0]) ? (string)$value[0] : null;
            }
            return is_scalar($value) ? (string)$value : null;
        }
        return null;
    }

    private function decodeJsonField(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return [];
    }
}
