<?php
declare(strict_types=1);

namespace Shared\Support;

use DateTimeImmutable;
use Shared\Infra\AsaasClient;
use Shared\Infra\Database;
use Throwable;

final class BillingSnapshotService
{
    private Database $db;
    private AsaasClient $asaas;

    public function __construct(Database $db, ?AsaasClient $asaas = null)
    {
        $this->db = $db;
        $this->asaas = $asaas ?? new AsaasClient();
    }

    public function snapshot(string $orgId, bool $reconcile = false): array
    {
        $subscription = $this->db->one(
            "SELECT
                s.id::text as id,
                s.status,
                s.payment_method,
                s.asaas_customer_id,
                s.asaas_subscription_id,
                s.next_due_date::text as next_due_date,
                s.grace_until::text as grace_until,
                s.billing_profile_updated_at::text as billing_profile_updated_at,
                s.last_asaas_event_at::text as last_asaas_event_at,
                p.code as plan_code,
                p.name as plan_name,
                p.monthly_price::float as monthly_price
             FROM client.subscriptions s
             JOIN client.plans p ON p.id = s.plan_id
             WHERE s.organization_id = CAST(:org_id AS uuid)
             ORDER BY s.created_at DESC
             LIMIT 1",
            [':org_id' => $orgId]
        );

        if (!$subscription) {
            return [
                'ok' => true,
                'subscription' => null,
                'billing_profile' => null,
                'payments' => [],
                'server_time' => (new DateTimeImmutable('now'))->format(DATE_ATOM),
            ];
        }

        $sid = (string)($subscription['id'] ?? '');
        $billingProfile = $this->loadBillingProfile($sid);

        if ($reconcile) {
            $this->reconcileBillingProfile($subscription, $billingProfile);
            $billingProfile = $this->loadBillingProfile($sid);
        }

        $payments = $this->db->all(
            "SELECT
                asaas_payment_id,
                amount,
                status,
                billing_type,
                due_date::text as due_date,
                paid_at::text as paid_at,
                created_at::text as created_at
             FROM client.payments
             WHERE subscription_id = CAST(:sid AS uuid)
             ORDER BY due_date DESC NULLS LAST, created_at DESC
             LIMIT 10",
            [':sid' => $sid]
        );

        $subscription = $this->withDelinquencyFields($subscription);

        return [
            'ok' => true,
            'subscription' => $subscription,
            'billing_profile' => $billingProfile,
            'payments' => $payments,
            'server_time' => (new DateTimeImmutable('now'))->format(DATE_ATOM),
        ];
    }

    private function loadBillingProfile(string $subscriptionId): ?array
    {
        if ($subscriptionId === '') {
            return null;
        }

        $billingProfile = $this->db->one(
            "SELECT
                card_last4,
                card_brand,
                exp_month,
                exp_year,
                card_token,
                card_token_updated_at::text as card_token_updated_at,
                is_validated
             FROM client.billing_profiles
             WHERE subscription_id = CAST(:sid AS uuid)
             LIMIT 1",
            [':sid' => $subscriptionId]
        );

        if (!$billingProfile) {
            return null;
        }

        $token = trim((string)($billingProfile['card_token'] ?? ''));
        unset($billingProfile['card_token']);
        $billingProfile['card_token_present'] = $token !== '';

        return $billingProfile;
    }

    private function withDelinquencyFields(array $subscription): array
    {
        $today = new DateTimeImmutable('today');
        $nextDue = $this->parseDateOnly((string)($subscription['next_due_date'] ?? ''));
        $graceUntil = $this->parseDateOnly((string)($subscription['grace_until'] ?? ''));

        $overdueDays = 0;
        if ($nextDue instanceof DateTimeImmutable && $today > $nextDue) {
            $overdueDays = (int)$nextDue->diff($today)->days;
        }

        $isOverdue = false;
        if ($nextDue instanceof DateTimeImmutable && $today > $nextDue) {
            $isOverdue = $graceUntil instanceof DateTimeImmutable ? ($today > $graceUntil) : true;
        }

        $subscription['is_overdue'] = $isOverdue;
        $subscription['overdue_days'] = max(0, $overdueDays);

        return $subscription;
    }

    private function reconcileBillingProfile(array $subscription, ?array $billingProfile): void
    {
        $subscriptionId = trim((string)($subscription['id'] ?? ''));
        $asaasSubscriptionId = trim((string)($subscription['asaas_subscription_id'] ?? ''));
        $apiKey = trim((string)(getenv('ASAAS_API_KEY') ?: ''));
        $currentLast4 = trim((string)($billingProfile['card_last4'] ?? ''));

        if ($subscriptionId === '' || $asaasSubscriptionId === '' || $apiKey === '') {
            return;
        }
        if ($billingProfile !== null && $currentLast4 !== '') {
            return;
        }

        try {
            $paymentsRaw = $this->asaas->listPaymentsOfSubscription($asaasSubscriptionId, 5, 0);
            $payments = is_array($paymentsRaw['data'] ?? null) ? $paymentsRaw['data'] : [];
            if ($payments === []) {
                return;
            }

            $selectedPayment = null;
            foreach ($payments as $payment) {
                if (!is_array($payment)) {
                    continue;
                }
                $billingType = strtoupper(trim((string)($payment['billingType'] ?? '')));
                if ($billingType === 'CREDIT_CARD') {
                    $selectedPayment = $payment;
                    break;
                }
            }
            if ($selectedPayment === null) {
                $first = $payments[0] ?? null;
                $selectedPayment = is_array($first) ? $first : null;
            }
            if ($selectedPayment === null) {
                return;
            }

            $paymentId = trim((string)($selectedPayment['id'] ?? ''));
            if ($paymentId === '') {
                return;
            }

            $billingInfoResult = $this->asaas->getPaymentBillingInfo($paymentId);
            if (!(bool)($billingInfoResult['ok'] ?? false)) {
                return;
            }

            $billingData = is_array($billingInfoResult['data'] ?? null) ? $billingInfoResult['data'] : [];
            $cardNode = is_array($billingData['creditCard'] ?? null) ? $billingData['creditCard'] : $billingData;

            $rawNumber = (string)($cardNode['creditCardNumber'] ?? $cardNode['number'] ?? '');
            $last4 = $this->last4($rawNumber);
            $brand = trim((string)($cardNode['creditCardBrand'] ?? $cardNode['brand'] ?? ''));
            $token = trim((string)($cardNode['creditCardToken'] ?? $cardNode['token'] ?? ''));
            $expMonth = $this->toIntOrNull($cardNode['expiryMonth'] ?? $cardNode['expMonth'] ?? $cardNode['expirationMonth'] ?? null);
            $expYear = $this->toIntOrNull($cardNode['expiryYear'] ?? $cardNode['expYear'] ?? $cardNode['expirationYear'] ?? null);

            $brand = $brand !== '' ? $brand : null;
            $token = $token !== '' ? $token : null;
            if ($last4 === null && $brand === null && $token === null) {
                return;
            }

            $this->db->exec(
                "INSERT INTO client.billing_profiles(subscription_id, card_last4, card_brand, exp_month, exp_year, card_token, card_token_updated_at, is_validated, created_at)
                 VALUES(CAST(:sid AS uuid), :card_last4, :card_brand, :exp_month, :exp_year, :card_token, now(), true, now())
                 ON CONFLICT (subscription_id) DO UPDATE SET
                   card_last4 = COALESCE(EXCLUDED.card_last4, client.billing_profiles.card_last4),
                   card_brand = COALESCE(EXCLUDED.card_brand, client.billing_profiles.card_brand),
                   exp_month = COALESCE(EXCLUDED.exp_month, client.billing_profiles.exp_month),
                   exp_year = COALESCE(EXCLUDED.exp_year, client.billing_profiles.exp_year),
                   card_token = COALESCE(EXCLUDED.card_token, client.billing_profiles.card_token),
                   card_token_updated_at = CASE
                     WHEN EXCLUDED.card_last4 IS NOT NULL OR EXCLUDED.card_brand IS NOT NULL OR EXCLUDED.card_token IS NOT NULL
                     THEN now() ELSE client.billing_profiles.card_token_updated_at END,
                   is_validated = client.billing_profiles.is_validated OR EXCLUDED.is_validated",
                [
                    ':sid' => $subscriptionId,
                    ':card_last4' => $last4,
                    ':card_brand' => $brand,
                    ':exp_month' => $expMonth,
                    ':exp_year' => $expYear,
                    ':card_token' => $token,
                ]
            );

            $this->db->exec(
                "UPDATE client.subscriptions
                 SET billing_profile_updated_at=now(), updated_at=now()
                 WHERE id=CAST(:sid as uuid)",
                [':sid' => $subscriptionId]
            );
        } catch (Throwable) {
            // Reconcile best-effort: silent failure to keep endpoint resilient.
        }
    }

    private function parseDateOnly(string $value): ?DateTimeImmutable
    {
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

    private function last4(string $value): ?string
    {
        $digits = preg_replace('/\D+/', '', $value);
        if (!is_string($digits) || strlen($digits) < 4) {
            return null;
        }
        return substr($digits, -4);
    }

    private function toIntOrNull(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric((string)$value)) {
            return null;
        }
        return (int)$value;
    }
}
