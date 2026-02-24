# Financial Audit & Recurrence Test Pack

## 1) Fixtures ASAAS (contract/webhook)
- `tests/fixtures/asaas-webhooks/payment_received.json`
- `tests/fixtures/asaas-webhooks/payment_received_duplicate.json`
- `tests/fixtures/asaas-webhooks/subscription_updated_upgrade_confirmed.json`
- `tests/fixtures/asaas-webhooks/subscription_updated_out_of_order.json`
- `tests/fixtures/asaas-webhooks/subscription_canceled.json`
- `tests/fixtures/asaas-webhooks/billing_info_updated.json`
- `tests/fixtures/asaas-webhooks/invalid_token_event.json`

## 2) Preconditions
- Usuário autenticado no portal (cookie `PHPSESSID` válido).
- Token CSRF capturado do HTML (`data-csrf-token`).
- Subscription de teste existente (`<SID>`).
- Organização de teste (`<ORG_ID>`) com deal associado no CRM.

## 3) API scenarios (finance)

### FIN-001 Change plan (upgrade immediate + prorata)
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/change-plan" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-change-plan-upgrade-001" \
  -d '{"plan_code":"pro"}'
```
Expected:
- HTTP 200, `action_id` and `request_id`.
- `direction=UPGRADE`.
- `prorata_amount >= 0`.
- `audit.financial_actions` row `action_type=CHANGE_PLAN`, `status=REQUESTED`.
- email/CRM proof `FINANCIAL_REQUESTED`.

### FIN-002 Change plan (downgrade scheduled)
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/change-plan" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-change-plan-downgrade-001" \
  -d '{"plan_code":"basic"}'
```
Expected:
- HTTP 200, `scheduled=true`, `effective_at`.
- Row em `client.subscription_change_schedule` com `status='SCHEDULED'`.
- `audit.financial_actions` (`CHANGE_PLAN`) em `REQUESTED`.

### FIN-003 Update custom value (increase immediate)
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/update-value" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-value-upgrade-001" \
  -d '{"new_value":"329.90"}'
```
Expected:
- HTTP 200, `direction=UPGRADE`.
- `audit.financial_actions` (`UPDATE_SUBSCRIPTION_VALUE`) criado.

### FIN-004 Update custom value (decrease scheduled)
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/update-value" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-value-downgrade-001" \
  -d '{"new_value":"199.90"}'
```
Expected:
- HTTP 200, `scheduled=true`.
- `client.subscription_change_schedule` com `change_type='VALUE_DECREASE'`.

### FIN-005 Card update flow (NO CHARGE)
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/card/update" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-card-update-001" \
  -d '{"asaas_subscription_id":"<SID>"}'
```
Expected:
- HTTP 200 com `card_update_url`, `provider_flow`, `action_id`, `request_id`.
- `action_type='CARD_UPDATE_REQUESTED'` em audit.
- **Nenhuma nova linha em `client.payments`** causada por este endpoint.

### FIN-006 Retry payment (charge link only)
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/retry" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-retry-001" \
  -d '{}'
```
Expected:
- HTTP 200 com `payment_redirect_url`.
- action `RETRY_PAYMENT` (REQUESTED/CONFIRMED).

### FIN-007 Cancel subscription
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/cancel" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-cancel-001" \
  -d '{"mode":"END_OF_CYCLE"}'
```
Expected:
- HTTP 200, `action_id`.
- audit `CANCEL_SUBSCRIPTION` status `REQUESTED`.

## 4) Webhook scenarios

### FIN-101 Payment received
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: <ASAAS_WEBHOOK_TOKEN>" \
  --data @tests/fixtures/asaas-webhooks/payment_received.json
```
Expected:
- `ok=true`.
- Subscription fica `ACTIVE`.
- Payment upsert sem duplicidade (`asaas_payment_id` único).

### FIN-102 Duplicate webhook idempotency
Repetir mesmo payload `payment_received_duplicate.json` 10x.
Expected:
- primeira: processa.
- seguintes: `idempotent=true`.
- sem duplicar `client.payments`.

### FIN-103 Out-of-order event
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: <ASAAS_WEBHOOK_TOKEN>" \
  --data @tests/fixtures/asaas-webhooks/subscription_updated_out_of_order.json
```
Expected:
- `out_of_order=true` quando `last_asaas_event_at` já for maior.
- sem regressão de status/plano.

### FIN-104 Card update confirmation
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: <ASAAS_WEBHOOK_TOKEN>" \
  --data @tests/fixtures/asaas-webhooks/billing_info_updated.json
```
Expected:
- `billing_profile_updated_at` atualizado em `client.subscriptions`.
- `CARD_UPDATE_REQUESTED` pendente vira `CONFIRMED`.

### FIN-105 Subscription canceled confirmation
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: <ASAAS_WEBHOOK_TOKEN>" \
  --data @tests/fixtures/asaas-webhooks/subscription_canceled.json
```
Expected:
- assinatura `CANCELED`.
- ação `CANCEL_SUBSCRIPTION` pendente confirmada.

## 5) SQL assertions
```sql
-- audit trail financeiro
SELECT action_id, action_type, status, request_id, notification_email_status, notification_crm_status, created_at
FROM audit.financial_actions
ORDER BY created_at DESC
LIMIT 50;

-- card update não deve criar payment por si só
SELECT id, subscription_id, asaas_payment_id, amount, status, created_at
FROM client.payments
WHERE created_at > now() - interval '15 minutes'
ORDER BY created_at DESC;

-- mudanças agendadas (downgrade/value decrease)
SELECT id, action_id, asaas_subscription_id, change_type, target_value, effective_at, status, applied_at, failed_at
FROM client.subscription_change_schedule
ORDER BY created_at DESC
LIMIT 30;

-- prova documental por e-mail
SELECT id, email_to, subject, status, created_at
FROM crm.email_queue
WHERE subject ILIKE '%action_id=%'
ORDER BY created_at DESC
LIMIT 30;

-- prova documental no CRM
SELECT id, deal_id, activity_type, content, created_at
FROM crm.deal_activity
WHERE activity_type LIKE 'FINANCIAL_%'
ORDER BY created_at DESC
LIMIT 30;
```

## 6) Security checks
- Sem sessão (`Cookie` ausente) em `/change-plan`, `/retry`, `/card/update`, `/cancel` => 302/401/403.
- CSRF inválido => 419.
- Ownership inválido (SID de outra org) => 403.

## 7) Worker checks
### FIN-201 Retry notifications
```sql
UPDATE audit.financial_actions
SET notification_email_status='FAILED', notification_crm_status='FAILED'
WHERE action_id = '<ACTION_ID>'::uuid;
```
Expected:
- worker registra `financial_notification_retry`.
- status volta para `SENT` ou permanece `FAILED` com `error_reason`.

### FIN-202 Scheduled change apply
Criar/ajustar `client.subscription_change_schedule` com `effective_at <= now()` e `status='SCHEDULED'`.
Expected:
- worker aplica update no ASAAS.
- row vira `APPLIED` (ou `FAILED` com motivo).
- `audit.financial_actions` da ação vinculada é confirmada/falhada.
