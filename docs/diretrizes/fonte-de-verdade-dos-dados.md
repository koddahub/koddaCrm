# Diretriz: Fonte de Verdade dos Dados

Status: Em validação  
Última revisão: 2026-04-18  
Fonte principal: `database/init/*.sql` + `apps/crm-next/prisma/schema.prisma` + APIs do portal/CRM

## Regra central
Cada entidade crítica deve ter um dono explícito e um ponto primário de escrita. Evitar duplicação de responsabilidade entre sistemas.

## Tabela de responsabilidade dos dados
| Entidade/Dado | Dono principal (neste repositório) | Fonte de verdade atual | Grau de certeza |
|---|---|---|---|
| Usuário/organização do cliente | Portal (`apps/cliente/public`) | tabelas `client.users`, `client.organizations` | Confirmado |
| Assinatura/pagamento ASAAS | Portal + shared processor | `client.subscriptions`, `client.payments`, `client.webhook_events` | Confirmado |
| Lead comercial | CRM API | `crm.leads` | Confirmado |
| Oportunidade/deal e estágio | CRM API | `crm.deal`, `crm.pipeline*`, `crm.deal_stage_history` | Confirmado |
| Sessão de signup | CRM API | `crm.signup_session` | Confirmado |
| Propostas avulsas | CRM API | `crm.proposal_avulsa` | Confirmado |
| Tickets de proposta Freelas | CRM API integração | `crm.freelas_proposal_ticket` | Confirmado |
| Contas/templates/logs de e-mail relay | CRM API/worker | schema `saas` (`email_template`, `email_account`, `email_log`) | Confirmado |
| Regras de autenticação/reset do Praja | Sistema Praja (fora deste repo) | fora deste repositório | Em validação |
| Lead bruto/enriquecimento externo | Não comprovado neste repo | não definido aqui | Em validação |

## Incerteza encontrada
- não há contrato versionado neste repositório definindo de ponta a ponta dono de dados entre KoddaCRM, KoddaProspect e Praja.

## Hipótese atual
- este repositório é dono do estado comercial/operacional de CRM e do ciclo de cliente no portal.

## Precisa validação
- owner oficial de "lead bruto" e "enriquecimento" no ecossistema completo.

## Regras normativas
- não duplicar estado crítico em UI/local state quando já existe tabela canônica
- não criar status paralelos para pipeline/proposta sem contrato
- preservar histórico (auditoria/atividades/stage history) ao mover estado de negócio
