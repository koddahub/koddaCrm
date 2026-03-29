# Módulo de Integrações - KoddaCRM

Documentação técnica do módulo de integrações do KoddaCRM (foco atual: integração Freelas/99Freelas via n8n).

## 1) Escopo

Este módulo está implementado em:

- `apps/crm-next/app/api/integrations/freelas/tickets/route.ts`
- `apps/crm-next/app/api/integrations/freelas/tickets/[id]/route.ts`
- `apps/crm-next/app/api/integrations/freelas/tickets/[id]/approve/route.ts`
- `apps/crm-next/app/api/integrations/freelas/tickets/[id]/reject/route.ts`
- `apps/crm-next/lib/integration-auth.ts`

Responsabilidade do módulo:

- Ingerir propostas de projetos vindas da automação externa (n8n/Freelas).
- Criar ou atualizar `deal` no pipeline de avulsos.
- Abrir ticket interno de revisão técnica/comercial.
- Permitir revisão manual, aprovação (simulada) e rejeição.
- Registrar trilha de auditoria em atividades do deal.

## 2) Arquitetura do Fluxo

Fluxo principal (ingestão):

1. Sistema externo envia `POST /api/integrations/freelas/tickets`.
2. API valida autenticação (`cookie admin` OU `x-crm-integration-token`).
3. API valida payload mínimo (`project.link`, `project.title`, `analysis.proposal_text`/`analysis.proposalText`).
4. API aplica deduplicação por `project_link + integration_execution_id` (quando `execution_id` existe).
5. API encontra ou cria `deal` no pipeline `comercial_avulsos`.
6. API cria registro em `crm.freelas_proposal_ticket` com status `NEW`.
7. API cria atividade `FREELAS_TICKET_CREATED` no `crm.deal_activity`.

Fluxo de revisão:

1. Admin abre detalhes do deal (UI usa `/api/deals/:id` e lê tickets Freelas).
2. Admin atualiza ticket por `PATCH /api/integrations/freelas/tickets/:id`.
3. Status muda de `NEW` para `UNDER_REVIEW` no primeiro patch.

Fluxo de aprovação:

1. Admin aciona `POST /api/integrations/freelas/tickets/:id/approve`.
2. API exige campos obrigatórios de proposta final.
3. Somente `FREELAS_DISPATCH_MODE=DRY_RUN` é aceito atualmente.
4. API grava `crm.freelas_proposal_dispatch` com `SIMULATED`.
5. Ticket vai para `DISPATCH_SIMULATED` e atividade é registrada.

Fluxo de rejeição:

1. Admin aciona `POST /api/integrations/freelas/tickets/:id/reject`.
2. API atualiza ticket para `REJECTED`.
3. Atividade `FREELAS_TICKET_REJECTED` é registrada.

## 3) Segurança e Autenticação

### 3.1 Credenciais

- Sessão admin (cookie): `crm_admin_session`
- Token de integração (header): `x-crm-integration-token`

Implementações:

- `apps/crm-next/lib/api-auth.ts`
- `apps/crm-next/lib/integration-auth.ts`

### 3.2 Matriz de autenticação por endpoint

| Endpoint | Método | Auth aceito |
|---|---|---|
| `/api/integrations/freelas/tickets` | `GET` | `cookie admin` **ou** `x-crm-integration-token` |
| `/api/integrations/freelas/tickets` | `POST` | `cookie admin` **ou** `x-crm-integration-token` |
| `/api/integrations/freelas/tickets/:id` | `PATCH` | `cookie admin` |
| `/api/integrations/freelas/tickets/:id/approve` | `POST` | `cookie admin` |
| `/api/integrations/freelas/tickets/:id/reject` | `POST` | `cookie admin` |

Observações importantes:

- Em `GET/POST` da raiz de tickets, a autorização é híbrida: primeiro tenta `cookie admin`; se falhar, tenta token de integração.
- Se `CRM_INTEGRATION_TOKEN` não estiver configurado e a chamada depender de token de integração, a API retorna `500` (`Integração não configurada no servidor`).
- `PATCH/approve/reject` não aceitam token de integração hoje.

## 4) Variáveis de Ambiente

Variáveis relevantes (veja `.env.example` na raiz do projeto):

- `CRM_ADMIN_SESSION_TOKEN`
- `CRM_INTEGRATION_TOKEN`
- `FREELAS_DISPATCH_MODE` (atual esperado: `DRY_RUN`)
- `FEATURE_TICKET_THREAD_SYNC` (impacta leitura de threads em `/api/deals/:id`, não a ingestão Freelas)

Configuração mínima para integração externa:

```env
CRM_INTEGRATION_TOKEN=change-me-integration-token
FREELAS_DISPATCH_MODE=DRY_RUN
```

## 5) Modelo de Dados

Migração principal:

- `database/migrations/015_freelas_proposal_tickets_up.sql`

### 5.1 Tabela `crm.freelas_proposal_ticket`

Campos centrais:

- `id` (UUID, PK)
- `deal_id` (FK -> `crm.deal.id`)
- `status` (`NEW`, `UNDER_REVIEW`, `DISPATCH_SIMULATED`, `REJECTED`, etc.)
- `project_link`, `project_title`
- `project_payload` (JSONB)
- `analysis_payload` (JSONB)
- `proposal_text`
- `offer_amount_cents`, `final_offer_amount_cents`
- `estimated_duration_text`, `details_text`, `review_notes`
- `approved_by`, `approved_at`
- `integration_execution_id`
- `created_at`, `updated_at`

Índices:

- `idx_freelas_proposal_ticket_deal_created`
- `idx_freelas_proposal_ticket_status`
- `uq_freelas_ticket_project_exec` (único parcial em `project_link + integration_execution_id` quando `integration_execution_id IS NOT NULL`)

### 5.2 Tabela `crm.freelas_proposal_dispatch`

Campos centrais:

- `id` (UUID, PK)
- `ticket_id` (FK -> `crm.freelas_proposal_ticket.id`)
- `mode` (`DRY_RUN`)
- `status` (`SIMULATED` no fluxo atual)
- `request_payload`, `response_payload`, `error_text`
- `created_at`, `updated_at`

Índices:

- `idx_freelas_dispatch_ticket_created`
- `idx_freelas_dispatch_status`

### 5.3 Observação Prisma

As tabelas Freelas são acessadas via SQL raw (`$queryRaw`, `$executeRaw`) e não estão modeladas explicitamente no `schema.prisma`.

## 6) Contrato HTTP

Base URL local: `http://localhost:8092` (ou `http://192.168.25.3:8092` no ambiente atual).

### 6.1 Listar tickets Freelas

`GET /api/integrations/freelas/tickets`

Query params:

- `dealId` (UUID, opcional)
- `status` (opcional; API aplica `toUpperCase()`)
- `limit` (opcional; padrão `80`, mínimo `1`, máximo `200`)

Resposta `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "deal_id": "uuid",
      "status": "NEW",
      "project_link": "https://www.99freelas.com.br/projeto/...",
      "project_title": "Site institucional",
      "project_payload": {},
      "analysis_payload": {},
      "proposal_text": "...",
      "offer_amount_cents": 95000,
      "final_offer_amount_cents": 85000,
      "estimated_duration_text": "7 dias",
      "details_text": "...",
      "review_notes": null,
      "approved_by": null,
      "approved_at": null,
      "integration_execution_id": "exec_123",
      "created_at": "2026-03-29T12:00:00.000Z",
      "updated_at": "2026-03-29T12:00:00.000Z"
    }
  ]
}
```

### 6.2 Ingerir ticket Freelas

`POST /api/integrations/freelas/tickets`

Body esperado:

```json
{
  "project": {
    "link": "https://www.99freelas.com.br/projeto/123",
    "title": "Landing page para escritório"
  },
  "analysis": {
    "proposal_text": "Texto da proposta",
    "score": 8.4,
    "offer_amount_cents": 120000,
    "final_offer_amount_cents": 95000,
    "estimated_timeline": "7 dias"
  },
  "metadata": {
    "execution_id": "n8n_exec_abc",
    "workflow_name": "freelas_ingest",
    "node_name": "post_to_crm"
  }
}
```

Regras:

- Obrigatórios: `project.link`, `project.title`, `analysis.proposal_text` (ou `analysis.proposalText`).
- `analysis.offer_amount_cents` e `analysis.final_offer_amount_cents` devem ser enviados **já em centavos** na ingestão.
- Deduplicação ativa quando `metadata.execution_id` (ou `executionId`) é enviado.
- Deal é criado/atualizado no pipeline `avulsos` (`comercial_avulsos`).
- Estágio alvo: `proposta_enviada`; fallback para o primeiro estágio do pipeline.

Resposta `201` (novo ticket):

```json
{
  "ok": true,
  "deduplicated": false,
  "dealId": "uuid",
  "ticketId": "uuid",
  "status": "NEW"
}
```

Resposta `200` (deduplicado):

```json
{
  "ok": true,
  "deduplicated": true,
  "dealId": "uuid",
  "ticketId": "uuid",
  "status": "NEW"
}
```

Erros comuns:

- `422` campos obrigatórios ausentes
- `401` não autorizado
- `500` falha interna (inclui erro SQL/infra)

### 6.3 Atualizar ticket (revisão)

`PATCH /api/integrations/freelas/tickets/:id`

Body (todos opcionais):

```json
{
  "offerAmountCents": "950,00",
  "finalOfferAmountCents": "850,00",
  "estimatedDurationText": "7 dias",
  "detailsText": "Detalhes finais da proposta",
  "reviewNotes": "Ajustar prazo no primeiro contato"
}
```

Regras:

- Se status atual for `NEW`, passa para `UNDER_REVIEW`.
- Campos monetários passam por parser que aceita string humana (`R$ 1.234,56`, `950,00`, etc.) e converte para centavos.
- Se um campo monetário vier inválido no PATCH, o valor existente é preservado (não é limpo para `null`).

Resposta `200`:

```json
{
  "ok": true,
  "ticket": {
    "id": "uuid",
    "status": "UNDER_REVIEW"
  }
}
```

Erros comuns:

- `404` ticket não encontrado
- `401` não autorizado
- `500` falha ao atualizar

### 6.4 Aprovar ticket (dispatch simulado)

`POST /api/integrations/freelas/tickets/:id/approve`

Body:

```json
{
  "reviewNotes": "Aprovado para envio"
}
```

Pré-condições obrigatórias no ticket:

- `offer_amount_cents`
- `final_offer_amount_cents`
- `estimated_duration_text`
- `details_text`

Resposta `200`:

```json
{
  "ok": true,
  "dispatch": {
    "id": "uuid",
    "status": "SIMULATED"
  },
  "mode": "DRY_RUN"
}
```

Erros comuns:

- `422` faltam campos obrigatórios (`missing`)
- `409` modo diferente de `DRY_RUN` (envio real bloqueado neste ambiente)
- `404` ticket não encontrado
- `401` não autorizado

### 6.5 Rejeitar ticket

`POST /api/integrations/freelas/tickets/:id/reject`

Body:

```json
{
  "reviewNotes": "Projeto fora do perfil"
}
```

Resposta `200`:

```json
{
  "ok": true,
  "status": "REJECTED"
}
```

Erros comuns:

- `404` ticket não encontrado
- `401` não autorizado
- `500` falha ao rejeitar

## 7) Máquina de Estados do Ticket

Transições atualmente implementadas:

- `NEW` -> `UNDER_REVIEW` (PATCH)
- `NEW|UNDER_REVIEW` -> `DISPATCH_SIMULATED` (approve em DRY_RUN)
- `NEW|UNDER_REVIEW|DISPATCH_SIMULATED` -> `REJECTED` (reject)

Status reconhecidos na UI (inclui possíveis extensões):

- `NEW`
- `UNDER_REVIEW`
- `APPROVED` (reservado/não produzido neste fluxo atual)
- `REJECTED`
- `DISPATCH_SIMULATED`
- `DISPATCH_FAILED` (reservado para envio real futuro)

## 8) Efeitos Colaterais no Deal

Durante ingestão (`POST /tickets`):

- Busca deal existente por:
  - `pipeline_id` do avulsos
  - `origin = 'FREELAS_N8N'`
  - `metadata->>'project_link' = project.link`
- Se existir, atualiza dados principais do deal.
- Se não existir, cria novo deal com:
  - `dealType = PROJETO_AVULSO`
  - `category = AVULSO`
  - `intent = projeto_avulso`
  - `productCode = site_institucional`
  - `origin = FREELAS_N8N`
- `valueCents` é derivado de `analysis.score * 10000` (quando score é numérico).

Atividades registradas:

- `FREELAS_TICKET_CREATED`
- `FREELAS_DISPATCH_SIMULATED`
- `FREELAS_TICKET_REJECTED`

## 9) Idempotência e Concorrência

- Idempotência funcional: se `integration_execution_id` for informado, a API tenta reaproveitar ticket já criado com mesmo `project_link + execution_id`.
- Idempotência estrutural: índice único parcial `uq_freelas_ticket_project_exec` protege contra duplicidade no banco.
- Em corrida simultânea extrema, pode ocorrer conflito de índice retornando erro interno (`500`) no segundo request; o índice ainda preserva consistência.

## 10) Setup e Migração

### 10.1 Ambiente local

```bash
cd /home/server/projects/projeto-area-cliente
cp .env.example .env
./scripts/up.sh
```

### 10.2 Aplicar migração Freelas em banco já existente

A migração `015_freelas_proposal_tickets_up.sql` está em `database/migrations` e **não** em `database/init`.
Com isso, aplique manualmente em qualquer ambiente que ainda não possua as tabelas Freelas:

```bash
cd /home/server/projects/projeto-area-cliente
docker exec -i ac_postgres psql -U ac_user -d ac_db < database/migrations/015_freelas_proposal_tickets_up.sql
```

Rollback:

```bash
cd /home/server/projects/projeto-area-cliente
docker exec -i ac_postgres psql -U ac_user -d ac_db < database/migrations/015_freelas_proposal_tickets_down.sql
```

## 11) Smoke Test (cURL)

### 11.1 Ingestão por token de integração

```bash
curl -X POST "http://localhost:8092/api/integrations/freelas/tickets" \
  -H "Content-Type: application/json" \
  -H "x-crm-integration-token: change-me-integration-token" \
  -d '{
    "project": {
      "link": "https://www.99freelas.com.br/projeto/123",
      "title": "Site institucional para clínica"
    },
    "analysis": {
      "proposal_text": "Proposta técnica inicial",
      "score": 8.1,
      "offer_amount_cents": 120000,
      "final_offer_amount_cents": 95000,
      "estimated_timeline": "7 dias"
    },
    "metadata": {
      "execution_id": "exec_smoke_001",
      "workflow_name": "freelas_ingest"
    }
  }'
```

### 11.2 Listagem por token de integração

```bash
curl "http://localhost:8092/api/integrations/freelas/tickets?limit=20&status=NEW" \
  -H "x-crm-integration-token: change-me-integration-token"
```

### 11.3 Login admin para operações de revisão

```bash
curl -i -c /tmp/kodda.cookie -X POST "http://localhost:8092/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@koddahub.local","password":"admin123"}'
```

### 11.4 PATCH de revisão com cookie admin

```bash
curl -b /tmp/kodda.cookie -X PATCH "http://localhost:8092/api/integrations/freelas/tickets/<TICKET_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "offerAmountCents": "950,00",
    "finalOfferAmountCents": "850,00",
    "estimatedDurationText": "7 dias",
    "detailsText": "Escopo final aprovado internamente",
    "reviewNotes": "Pode seguir para aprovação"
  }'
```

### 11.5 Aprovação DRY_RUN

```bash
curl -b /tmp/kodda.cookie -X POST "http://localhost:8092/api/integrations/freelas/tickets/<TICKET_ID>/approve" \
  -H "Content-Type: application/json" \
  -d '{"reviewNotes":"Aprovado pelo time comercial"}'
```

### 11.6 Rejeição

```bash
curl -b /tmp/kodda.cookie -X POST "http://localhost:8092/api/integrations/freelas/tickets/<TICKET_ID>/reject" \
  -H "Content-Type: application/json" \
  -d '{"reviewNotes":"Sem aderência ao escopo estratégico"}'
```

## 12) Troubleshooting

### `401 Nao autorizado`

- Verifique cookie `crm_admin_session` para rotas administrativas.
- Verifique header `x-crm-integration-token` para ingest/listagem externa.
- Confirme que `CRM_ADMIN_SESSION_TOKEN` e `CRM_INTEGRATION_TOKEN` estão coerentes entre caller e CRM.

### `500 Integração não configurada no servidor`

- Defina `CRM_INTEGRATION_TOKEN` no ambiente do CRM.

### `422 Campos obrigatórios ausentes para aprovar`

- Execute `PATCH /tickets/:id` preenchendo:
  - `offerAmountCents`
  - `finalOfferAmountCents`
  - `estimatedDurationText`
  - `detailsText`

### `409 Envio real bloqueado`

- Fluxo atual só permite `FREELAS_DISPATCH_MODE=DRY_RUN`.

### Ticket duplicado por chamadas repetidas

- Envie sempre `metadata.execution_id` único por execução n8n.
- Reaproveite `project.link` original para ativar deduplicação.

## 13) Pontos de Extensão

Para adicionar novas integrações no mesmo módulo:

1. Criar novo namespace em `app/api/integrations/<provedor>/...`.
2. Reusar `ensureIntegrationAuth` para chamadas server-to-server.
3. Definir tabela própria de ticket/dispatch + índices de idempotência.
4. Registrar eventos de auditoria em `dealActivity`.
5. Documentar contrato HTTP e estratégia de retry/dedup neste README.

## 14) Endpoints Relacionados (fora de `/api/integrations`)

Usam também o header `x-crm-integration-token` (modo híbrido com admin):

- `POST /api/internal/email/send`
- `POST /api/projects/create-for-organization`

Esses endpoints não fazem parte do fluxo Freelas, mas compartilham a mesma infraestrutura de autenticação de integrações.
