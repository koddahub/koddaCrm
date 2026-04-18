# Módulos

Status: Atual  
Última revisão: 2026-04-18  
Fonte principal: árvore real do repositório + rotas em `apps/cliente/public/index.php` + rotas em `apps/crm-next/app/api`

## Módulos reais e responsabilidades
| Módulo | Caminho | Responsabilidade principal | Status |
|---|---|---|---|
| Portal do cliente | `apps/cliente/public` | jornada de cadastro/login, billing, briefing, tickets e webhook ASAAS | Confirmado |
| CRM comercial/operacional | `apps/crm-next/app` + `apps/crm-next/app/api` | funil, board, deals, propostas, KPIs, sessões de signup, integrações operacionais | Confirmado |
| Biblioteca compartilhada PHP | `apps/shared/src` | base técnica comum do portal/worker (db, cliente ASAAS, validação, auth) | Confirmado |
| Worker | `worker/worker.php` | reconciliação periódica e execução de tarefas assíncronas | Confirmado |
| Persistência relacional | `database/init` + `database/migrations` | estrutura de dados dos domínios `client`, `crm`, `audit` e `saas` | Confirmado |
| Testes/fixtures operacionais | `tests/fixtures/asaas-webhooks` | cenários de webhook ASAAS para validação/manual | Confirmado |

## Recortes sensíveis de domínio
### Regra de negócio
- pipeline, estágio e lifecycle de deals não devem ser redefinidos fora das APIs/serviços centrais
- proposta, atividade e histórico do deal devem manter rastreabilidade
- autenticação de integração deve seguir cabeçalhos/tokens já previstos em código

## Módulos citados em documentos antigos que não são módulo dedicado no repositório
### Incerteza encontrada
- "módulo de integrações 2.5.0" descreve componentes arquiteturais próprios, mas o repositório atual implementa integrações via endpoints e serviços existentes, sem os componentes nomeados completos.

### Hipótese atual
- o documento v2.5.0 representa alvo evolutivo e não espelho fiel da implementação atual.

### Precisa validação
- quais partes desse alvo entrarão no mesmo repositório e quais serão separadas em outros serviços.
