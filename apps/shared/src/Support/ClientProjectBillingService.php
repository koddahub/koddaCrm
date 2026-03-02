<?php
declare(strict_types=1);

namespace Shared\Support;

use Shared\Infra\AsaasClient;
use Shared\Infra\Database;
use Throwable;

final class ClientProjectBillingService
{
    private Database $db;
    private AsaasClient $asaas;
    private FinancialAuditNotifier $audit;

    public function __construct(Database $db, ?AsaasClient $asaas = null, ?FinancialAuditNotifier $audit = null)
    {
        $this->db = $db;
        $this->asaas = $asaas ?? new AsaasClient();
        $this->audit = $audit ?? new FinancialAuditNotifier(
            $db,
            in_array(strtolower((string)(getenv('FEATURE_FINANCIAL_AUDIT_NOTIFICATIONS') ?: '1')), ['1', 'true', 'yes', 'on'], true)
        );
    }

    public function listProjectsByOrganization(string $organizationId): array
    {
        if ($organizationId === '') {
            return [];
        }

        return $this->db->all(
            "SELECT
                p.id::text AS id,
                p.domain,
                CASE
                  WHEN lower(coalesce(p.domain, '')) ~ '^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$'
                  THEN lower(coalesce(p.domain, ''))
                  ELSE upper(coalesce(p.domain, ''))
                END AS project_label,
                p.project_type,
                p.status,
                p.created_at::text AS created_at,
                p.updated_at::text AS updated_at,
                si.id::text AS subscription_item_id,
                si.status AS subscription_item_status,
                si.price_override::float AS price_override,
                pl.code AS plan_code,
                pl.name AS plan_name,
                pl.monthly_price::float AS monthly_price,
                coalesce(si.price_override, pl.monthly_price)::float AS effective_price,
                d.id::text AS deal_id,
                d.lifecycle_status AS operational_status
             FROM client.projects p
             LEFT JOIN client.subscription_items si ON si.project_id = p.id
             LEFT JOIN client.plans pl ON pl.id = si.plan_id
             LEFT JOIN LATERAL (
                SELECT d1.id, d1.lifecycle_status
                FROM crm.deal d1
                WHERE d1.organization_id = p.organization_id
                  AND upper(coalesce(d1.deal_type, '')) = 'HOSPEDAGEM'
                  AND (
                    coalesce(d1.metadata->>'project_id', '') = p.id::text
                    OR (
                      coalesce(d1.metadata->>'project_domain', '') <> ''
                      AND lower(coalesce(d1.metadata->>'project_domain', '')) = lower(coalesce(p.domain, ''))
                    )
                  )
                ORDER BY d1.updated_at DESC
                LIMIT 1
             ) d ON true
             WHERE p.organization_id = CAST(:oid AS uuid)
             ORDER BY p.created_at ASC",
            [':oid' => $organizationId]
        );
    }

    public function createProjectWithItem(string $organizationId, array $input): array
    {
        $domain = $this->normalizeDomain($input['domain'] ?? null);
        if ($domain === '') {
            $domain = $this->normalizeProjectTag($input['project_tag'] ?? null);
        }
        if ($domain === '') {
            $domain = $this->nextProjectTag($organizationId);
        }
        $projectType = $this->normalizeProjectType($input['project_type'] ?? null);
        $planCode = strtolower(trim((string)($input['plan_code'] ?? '')));
        $projectStatus = strtoupper(trim((string)($input['project_status'] ?? 'PENDING')));
        $itemStatus = strtoupper(trim((string)($input['item_status'] ?? 'ACTIVE')));

        if ($organizationId === '' || $planCode === '') {
            throw new \RuntimeException('Dados obrigatórios ausentes para criar projeto.');
        }

        if (!in_array($projectStatus, ['PENDING', 'ACTIVE', 'PAUSED', 'CANCELED'], true)) {
            $projectStatus = 'PENDING';
        }
        if (!in_array($itemStatus, ['ACTIVE', 'PENDING', 'CANCELED'], true)) {
            $itemStatus = 'ACTIVE';
        }

        $plan = $this->resolvePlanByCode($planCode);
        if (!$plan) {
            throw new \RuntimeException('Plano informado não existe ou está inativo.');
        }

        $pdo = $this->db->pdo();
        try {
            $pdo->beginTransaction();

            $existing = $this->db->one(
                "SELECT id::text AS id
                 FROM client.projects
                 WHERE organization_id = CAST(:oid AS uuid)
                   AND lower(coalesce(domain, '')) = lower(:domain)
                 LIMIT 1",
                [':oid' => $organizationId, ':domain' => $domain]
            );
            if ($existing) {
                throw new \RuntimeException('Já existe projeto com este domínio para a organização.');
            }

            $project = $this->db->one(
                "INSERT INTO client.projects(organization_id, domain, project_type, status, created_at, updated_at)
                 VALUES(CAST(:oid AS uuid), :domain, :ptype, :status, now(), now())
                 RETURNING id::text AS id, domain, project_type, status, created_at::text AS created_at",
                [
                    ':oid' => $organizationId,
                    ':domain' => $domain,
                    ':ptype' => $projectType,
                    ':status' => $projectStatus,
                ]
            );
            if (!$project || empty($project['id'])) {
                throw new \RuntimeException('Falha ao criar projeto.');
            }

            $item = $this->db->one(
                "INSERT INTO client.subscription_items(organization_id, project_id, plan_id, status, created_at, updated_at)
                 VALUES(CAST(:oid AS uuid), CAST(:pid AS uuid), CAST(:plan_id AS uuid), :status, now(), now())
                 RETURNING id::text AS id, status",
                [
                    ':oid' => $organizationId,
                    ':pid' => (string)$project['id'],
                    ':plan_id' => (string)$plan['id'],
                    ':status' => $itemStatus,
                ]
            );
            if (!$item) {
                throw new \RuntimeException('Falha ao criar item interno da assinatura.');
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return $this->loadProjectWithItem((string)$project['id'], $organizationId) ?? [];
    }

    public function changeProjectPlan(string $organizationId, string $projectId, string $planCode): array
    {
        $planCode = strtolower(trim($planCode));
        if ($organizationId === '' || $projectId === '' || $planCode === '') {
            throw new \RuntimeException('Dados obrigatórios ausentes para alterar plano.');
        }

        $project = $this->loadOwnedProject($organizationId, $projectId);
        if (!$project) {
            throw new \RuntimeException('Projeto não pertence à organização autenticada.');
        }
        $plan = $this->resolvePlanByCode($planCode);
        if (!$plan) {
            throw new \RuntimeException('Plano informado não existe ou está inativo.');
        }

        $this->db->exec(
            "UPDATE client.subscription_items
             SET
               plan_id = CAST(:plan_id AS uuid),
               status = 'ACTIVE',
               updated_at = now()
             WHERE project_id = CAST(:project_id AS uuid)
               AND organization_id = CAST(:oid AS uuid)",
            [
                ':plan_id' => (string)$plan['id'],
                ':project_id' => $projectId,
                ':oid' => $organizationId,
            ]
        );

        return $this->loadProjectWithItem($projectId, $organizationId) ?? [];
    }

    public function cancelProjectItem(string $organizationId, string $projectId): array
    {
        if ($organizationId === '' || $projectId === '') {
            throw new \RuntimeException('Dados obrigatórios ausentes para cancelamento do item.');
        }

        $project = $this->loadOwnedProject($organizationId, $projectId);
        if (!$project) {
            throw new \RuntimeException('Projeto não pertence à organização autenticada.');
        }

        $this->db->exec(
            "UPDATE client.subscription_items
             SET status = 'CANCELED', updated_at = now()
             WHERE project_id = CAST(:project_id AS uuid)
               AND organization_id = CAST(:oid AS uuid)",
            [
                ':project_id' => $projectId,
                ':oid' => $organizationId,
            ]
        );

        $this->db->exec(
            "UPDATE client.projects
             SET status = 'CANCELED', updated_at = now()
             WHERE id = CAST(:project_id AS uuid)
               AND organization_id = CAST(:oid AS uuid)",
            [
                ':project_id' => $projectId,
                ':oid' => $organizationId,
            ]
        );

        return $this->loadProjectWithItem($projectId, $organizationId) ?? [];
    }

    public function billingSummaryByOrganization(string $organizationId): array
    {
        $subscription = $this->loadConsolidatedSubscription($organizationId);
        $items = $this->listProjectsByOrganization($organizationId);

        $total = 0.0;
        foreach ($items as $item) {
            $itemStatus = strtoupper(trim((string)($item['subscription_item_status'] ?? '')));
            if ($itemStatus !== 'ACTIVE') {
                continue;
            }
            $total += (float)($item['effective_price'] ?? 0);
        }
        $total = round($total, 2);

        return [
            'subscription' => $subscription,
            'items' => $items,
            'total' => $total,
        ];
    }

    public function recalcConsolidatedSubscriptionValue(string $organizationId, array $context = []): array
    {
        if ($organizationId === '') {
            throw new \RuntimeException('Organização inválida para recálculo.');
        }

        $subscription = $this->loadConsolidatedSubscription($organizationId);
        $total = $this->sumActiveItemsValue($organizationId);
        $total = round($total, 2);

        if ($subscription) {
            $this->db->exec(
                "UPDATE client.subscriptions
                 SET
                   consolidated_value = :total,
                   last_recalc_at = now(),
                   updated_at = now()
                 WHERE id = CAST(:sid AS uuid)",
                [
                    ':total' => $total,
                    ':sid' => (string)$subscription['id'],
                ]
            );
        }

        $requestId = trim((string)($context['request_id'] ?? ''));
        $actionSeed = trim((string)($context['action_seed'] ?? ''));
        $actionId = '';
        if ($requestId !== '' || $actionSeed !== '') {
            $seed = 'RECALC_CONSOLIDATED:' . $organizationId . ':' . ($actionSeed !== '' ? $actionSeed : $requestId);
            $actionId = FinancialAuditNotifier::uuidFromString($seed);
            $this->audit->recordActionRequested([
                'action_id' => $actionId,
                'org_id' => $organizationId,
                'user_id' => (string)($context['user_id'] ?? ''),
                'action_type' => 'RECALC_CONSOLIDATED_VALUE',
                'entity_type' => 'SUBSCRIPTION',
                'entity_id' => (string)($subscription['id'] ?? ''),
                'request_id' => $requestId,
                'correlation_id' => (string)($context['correlation_id'] ?? ''),
                'before_state' => [
                    'previous_consolidated_value' => isset($subscription['consolidated_value']) ? (float)$subscription['consolidated_value'] : null,
                ],
                'payload' => [
                    'new_total' => $total,
                    'reason' => (string)($context['reason'] ?? 'project_items_changed'),
                ],
                'source' => (string)($context['source'] ?? 'PORTAL_API'),
            ], false);
        }

        $asaasResult = [
            'ok' => true,
            'status_code' => 200,
            'error_message_safe' => null,
        ];
        if ($subscription && !empty($subscription['asaas_subscription_id']) && $total > 0) {
            $asaasResult = $this->asaas->updateSubscriptionValue(
                (string)$subscription['asaas_subscription_id'],
                $total,
                ['updatePendingPayments' => false]
            );
            if (!(bool)($asaasResult['ok'] ?? false)) {
                if ($actionId !== '') {
                    $this->audit->recordActionFailed([
                        'action_id' => $actionId,
                        'error_reason' => 'Falha ao atualizar valor consolidado no ASAAS',
                        'payload' => ['asaas' => FinancialAuditNotifier::sanitizePayload($asaasResult)],
                    ], false);
                }
                throw new \RuntimeException((string)($asaasResult['error_message_safe'] ?? 'Falha ao atualizar valor consolidado no Asaas.'));
            }
        }

        if ($actionId !== '') {
            $this->audit->recordActionConfirmed([
                'action_id' => $actionId,
                'after_state' => [
                    'consolidated_value' => $total,
                    'asaas_subscription_id' => (string)($subscription['asaas_subscription_id'] ?? ''),
                ],
                'payload' => [
                    'asaas_status_code' => (int)($asaasResult['status_code'] ?? 200),
                ],
            ], false);
        }

        $updated = $this->loadConsolidatedSubscription($organizationId);
        return [
            'organization_id' => $organizationId,
            'subscription' => $updated,
            'total' => $total,
            'action_id' => $actionId !== '' ? $actionId : null,
        ];
    }

    private function loadOwnedProject(string $organizationId, string $projectId): ?array
    {
        return $this->db->one(
            "SELECT id::text AS id, organization_id::text AS organization_id, domain, project_type, status
             FROM client.projects
             WHERE id = CAST(:pid AS uuid)
               AND organization_id = CAST(:oid AS uuid)
             LIMIT 1",
            [
                ':pid' => $projectId,
                ':oid' => $organizationId,
            ]
        );
    }

    private function resolvePlanByCode(string $planCode): ?array
    {
        return $this->db->one(
            "SELECT id::text AS id, code, name, monthly_price::float AS monthly_price
             FROM client.plans
             WHERE code = :code
               AND is_active = true
             LIMIT 1",
            [':code' => $planCode]
        );
    }

    private function loadProjectWithItem(string $projectId, string $organizationId): ?array
    {
        return $this->db->one(
            "SELECT
                p.id::text AS id,
                p.domain,
                p.project_type,
                p.status,
                p.created_at::text AS created_at,
                si.id::text AS subscription_item_id,
                si.status AS subscription_item_status,
                si.price_override::float AS price_override,
                pl.code AS plan_code,
                pl.name AS plan_name,
                pl.monthly_price::float AS monthly_price,
                coalesce(si.price_override, pl.monthly_price)::float AS effective_price
             FROM client.projects p
             LEFT JOIN client.subscription_items si ON si.project_id = p.id
             LEFT JOIN client.plans pl ON pl.id = si.plan_id
             WHERE p.id = CAST(:pid AS uuid)
               AND p.organization_id = CAST(:oid AS uuid)
             LIMIT 1",
            [
                ':pid' => $projectId,
                ':oid' => $organizationId,
            ]
        );
    }

    private function loadConsolidatedSubscription(string $organizationId): ?array
    {
        if ($organizationId === '') {
            return null;
        }
        return $this->db->one(
            "SELECT
                s.id::text AS id,
                s.organization_id::text AS organization_id,
                s.asaas_customer_id,
                s.asaas_subscription_id,
                s.status,
                s.payment_method,
                s.next_due_date::text AS next_due_date,
                s.consolidated_value::float AS consolidated_value,
                s.last_recalc_at::text AS last_recalc_at,
                s.updated_at::text AS updated_at
             FROM client.subscriptions s
             WHERE s.organization_id = CAST(:oid AS uuid)
             ORDER BY s.created_at DESC
             LIMIT 1",
            [':oid' => $organizationId]
        );
    }

    private function sumActiveItemsValue(string $organizationId): float
    {
        $row = $this->db->one(
            "SELECT
                coalesce(round(sum(coalesce(si.price_override, p.monthly_price))::numeric, 2), 0)::float AS total
             FROM client.subscription_items si
             JOIN client.plans p ON p.id = si.plan_id
             WHERE si.organization_id = CAST(:oid AS uuid)
               AND upper(si.status) = 'ACTIVE'",
            [':oid' => $organizationId]
        );
        return isset($row['total']) ? (float)$row['total'] : 0.0;
    }

    private function normalizeDomain(?string $value): string
    {
        $domain = strtolower(trim((string)$value));
        $domain = preg_replace('#^https?://#i', '', $domain) ?? $domain;
        $domain = preg_replace('#/.*$#', '', $domain) ?? $domain;
        $domain = trim($domain, " \t\n\r\0\x0B.");
        return $domain;
    }

    private function normalizeProjectType(?string $value): string
    {
        $type = strtolower(trim((string)$value));
        if ($type === '') {
            return 'hospedagem';
        }
        if (strlen($type) > 40) {
            $type = substr($type, 0, 40);
        }
        return $type;
    }

    private function normalizeProjectTag(?string $value): string
    {
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

    private function nextProjectTag(string $organizationId): string
    {
        if ($organizationId === '') {
            return 'PRJ-' . strtoupper(substr(md5((string)microtime(true)), 0, 4));
        }

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $suffix = strtoupper(substr(md5($organizationId . '|' . $attempt . '|' . microtime(true)), 0, 4));
            $candidate = 'PRJ-' . $suffix;
            $exists = $this->db->one(
                "SELECT id::text AS id
                 FROM client.projects
                 WHERE organization_id = CAST(:oid AS uuid)
                   AND lower(coalesce(domain, '')) = lower(:domain)
                 LIMIT 1",
                [
                    ':oid' => $organizationId,
                    ':domain' => $candidate,
                ]
            );
            if (!$exists) {
                return $candidate;
            }
        }

        return 'PRJ-' . strtoupper(substr(md5($organizationId . '|' . microtime(true)), 0, 4));
    }
}
