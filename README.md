# Projeto Área Cliente KoddaHub (Portal PHP + CRM Next.js)

Estrutura local para:
- Portal do cliente (PHP) em `8081`
- CRM V2 (Next.js + Prisma) em `8082`
- Cobrança recorrente via ASAAS (PIX + cartão)
- Banco compartilhado com schemas separados (`client`, `crm`, `audit`)

## Subida local

```bash
cd /home/server/projects/projeto-area-cliente
cp .env.example .env
./scripts/up.sh
# ou manual: CLIENT_PORT=8081 CRM_PORT=8082 docker compose up -d --build
```

Acessos:
- Portal cliente: `http://192.168.25.3:8081/signup?plan=basic`
- CRM V2: `http://192.168.25.3:8082/login`

Login padrão CRM V2:
- E-mail: `admin@koddahub.local`
- Senha: `admin123`

## Fluxo implementado (V1 local)

1. Cliente entra em `/signup?plan=basic|profissional|pro`
2. Cadastro PF/PJ + método de pagamento (PIX/cartão)
3. API cria customer e assinatura ASAAS (modo real com token / mock sem token)
4. Redireciona para `/checkout`
5. Em confirmação de pagamento (webhook), assinatura ativa e cria fila de WhatsApp manual
6. Cliente preenche briefing em `/onboarding/site-brief`
7. Sistema gera `prompt_json + prompt_text` para criação do site institucional de 1 página
8. CRM recebe automaticamente lead/tarefas/tickets em filas operacionais

## Observações ASAAS

- Configure no `.env`:
  - `ASAAS_API_KEY`
  - `ASAAS_WEBHOOK_TOKEN`
  - `ASAAS_BASE_URL`
- Sem `ASAAS_API_KEY`, API entra em modo mock para desenvolvimento.

## Endpoints principais

### Portal (8081)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/billing/customers`
- `POST /api/billing/subscriptions`
- `POST /api/billing/subscriptions/{id}/change-plan`
- `POST /api/webhooks/asaas`
- `POST /api/onboarding/site-brief`
- `POST /api/tickets`

### CRM V2 (8082)
- `POST /api/auth/login`
- `GET /api/dashboard/kpis`
- `GET /api/pipelines`
- `GET /api/pipelines/:id/board`
- `PATCH /api/pipeline-cards/:id/move`
- `POST /api/signup-sessions/start`
- `POST /api/signup-sessions/:id/heartbeat`
- `POST /api/proposals-avulsas`
- `PATCH /api/proposals-avulsas/:id/status`
- `POST /api/automation/reconcile`
- `POST /api/leads/ingest-site-form`

## Estrutura

- `apps/cliente/public/index.php`
- `apps/crm-next/*`
- `apps/shared/src/*`
- `database/init/001_init.sql`
- `worker/worker.php`
- `docker-compose.yml`
