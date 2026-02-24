# Financial Audit Test Pack

## 1) Contract fixtures (ASAAS webhook)
- `tests/fixtures/asaas-webhooks/payment_received.json`
- `tests/fixtures/asaas-webhooks/payment_received_duplicate.json`
- `tests/fixtures/asaas-webhooks/subscription_updated_out_of_order.json`
- `tests/fixtures/asaas-webhooks/invalid_token_event.json`

## 2) Integration smoke (portal finance endpoints)
Prerequisite: user authenticated with valid session cookie + CSRF token.

1. Change plan:
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/change-plan" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-change-plan-001" \
  -d '{"plan_code":"pro"}'
```
Expected:
- HTTP 200 with `action_id`
- row in `audit.financial_actions` (`action_type=CHANGE_PLAN`, `status=REQUESTED`)
- one row in `crm.email_queue` (subject contains action_id)
- one row in `crm.deal_activity` (`activity_type=FINANCIAL_REQUESTED`)

2. Retry payment:
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/subscriptions/<SID>/retry" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-retry-001" \
  -d '{}'
```
Expected:
- HTTP 200 with `payment_redirect_url`
- `audit.financial_actions` row with `action_type=RETRY_PAYMENT`
- status moves to `CONFIRMED`

3. Card update disabled (audit still required):
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/billing/card/update" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF>" \
  -H "Cookie: PHPSESSID=<SESSION>" \
  -H "X-Request-Id: qa-card-001" \
  -d '{}'
```
Expected:
- HTTP 410
- `audit.financial_actions` row with `action_type=UPDATE_CARD`, `status=FAILED`

## 3) Webhook contract checks
1. valid token + payment_received fixture => processed and idempotent persistence
2. duplicate same `event.id` => `idempotent:true`
3. invalid token fixture => HTTP 401

Example:
```bash
curl -i -X POST "https://clientes.koddahub.com.br/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: <ASAAS_WEBHOOK_TOKEN>" \
  --data @tests/fixtures/asaas-webhooks/payment_received.json
```

## 4) SQL assertions
```sql
-- latest audit rows
SELECT action_id, action_type, status, notification_email_status, notification_crm_status, created_at
FROM audit.financial_actions
ORDER BY created_at DESC
LIMIT 20;

-- proof email queued
SELECT id, email_to, subject, status, created_at
FROM crm.email_queue
WHERE subject ILIKE '%action_id=%'
ORDER BY created_at DESC
LIMIT 20;

-- CRM activity proof
SELECT id, deal_id, activity_type, content, created_at
FROM crm.deal_activity
WHERE activity_type LIKE 'FINANCIAL_%'
ORDER BY created_at DESC
LIMIT 20;
```

## 5) Security checks
- `/api/billing/subscriptions/{id}/retry` without authenticated session => must return 302/401/403.
- retry/change-plan with subscription from another organization => HTTP 403.

## 6) Worker reprocess checks
Set one audit row to failed, then run worker loop and validate retry:
```sql
UPDATE audit.financial_actions
SET notification_email_status='FAILED', notification_crm_status='FAILED'
WHERE action_id = '<ACTION_ID>'::uuid;
```
Expected:
- worker logs `financial_notification_retry`
- statuses move to `SENT` or remain `FAILED` with `error_reason` updated.
