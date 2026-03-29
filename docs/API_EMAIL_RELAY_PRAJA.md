# API Email Relay (Praja -> KoddaCRM)

## Objetivo
Permitir envio de e-mails transacionais pelo CRM sem mover a regra de negócio de autenticação/reset do Praja.

## Responsabilidade entre sistemas
- Praja Backend: autenticação, geração de token/reset e regras de negócio.
- CRM: envio real do e-mail em todos os fluxos.
- O Praja nunca envia e-mail diretamente ao provedor; sempre delega ao endpoint relay do CRM.

## Endpoints

### 1) Resolver template
- `GET /api/email/templates/resolve?slug=welcome_email`
- Query opcional:
  - `product` (ex: `Praja`)
  - `site` (ex: `praja.koddahub.com.br`)

#### Resposta de sucesso
```json
{
  "ok": true,
  "template": {
    "subject": "string",
    "html": "string",
    "variables": ["string"]
  }
}
```

### 2) Dispatch (relay)
- `POST /api/email/dispatch`
- Headers:
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `x-api-key` (quando `CRM_S2S_API_KEY` estiver configurado)
  - `Authorization: Bearer ...` (quando `CRM_S2S_BEARER_TOKEN` estiver configurado)

#### Body
```json
{
  "product": "Praja",
  "site": "praja.koddahub.com.br",
  "slug": "welcome_email",
  "to": "usuario@dominio.com",
  "subject": "Bem-vindo",
  "html": "<p>...</p>",
  "text": "....",
  "trackToInbox": true,
  "metadata": {
    "origin": "praja_backend_transactional_email",
    "template_slug": "welcome_email",
    "flow": "signup"
  }
}
```

#### Resposta de sucesso
Status `201`
```json
{
  "ok": true,
  "success": true,
  "message": "Email enfileirado para envio"
}
```

#### Resposta de erro
Status `4xx/5xx`
```json
{
  "ok": false,
  "success": false,
  "message": "motivo"
}
```

## Segurança
- Autenticação S2S por `x-api-key` e/ou `Bearer`.
- Variáveis:
  - `CRM_S2S_AUTH_REQUIRED`
  - `CRM_S2S_API_KEY`
  - `CRM_S2S_BEARER_TOKEN`
- `CRM_INTEGRATION_TOKEN` pode ser usado como fallback de compatibilidade.
- Se houver Cloudflare Access na frente do CRM, liberar os endpoints com Service Token para evitar `302`/HTML em chamadas backend-to-backend.

## Observabilidade
- O relay grava log em `saas.email_log` sem payload sensível bruto.
- Campos relevantes:
  - `product`, `site`, `slug` (em `request_payload_json/response_payload_json`)
  - `status`, `provider`, `error_message`
- O worker atualiza status final (`SENT`, `SENT_SIMULATED`, `FAILED`) pelo `provider_message_id`.

## Comportamento de remetente/provider
- O CRM resolve remetente por `product/site` em `saas.email_account`.
- O worker usa `from_email`, `from_name` e `reply_to` recebidos no payload MIME (`KH_MIME_V1`) com fallback para env global.
