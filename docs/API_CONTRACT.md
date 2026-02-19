# Contratos de API (V1)

## Lead ingestion do site atual para CRM

`POST /api/leads/ingest-site-form`

```json
{
  "name": "Nome",
  "email": "cliente@email.com",
  "phone": "+5541999999999",
  "interest": "Plano de Hospedagem",
  "source": "index_form"
}
```

## Briefing de projeto (Portal)

`POST /api/onboarding/site-brief`

```json
{
  "objective": "...",
  "audience": "...",
  "differentials": "...",
  "services": "...",
  "cta_text": "...",
  "tone_of_voice": "...",
  "color_palette": "...",
  "references": "...",
  "legal_content": "...",
  "integrations": "...",
  "domain_target": "...",
  "extra_requirements": "..."
}
```

Resposta inclui:
- `prompt_json`
- `prompt_text`

## Webhook ASAAS

`POST /api/webhooks/asaas`

Headers:
- `X-Webhook-Token: <ASAAS_WEBHOOK_TOKEN>`

Payload: bruto ASAAS (evento cobrança/assinatura).

