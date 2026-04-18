# Diretriz: Regras de Negócio Sensíveis

Status: Atual  
Última revisão: 2026-04-18  
Fonte principal: AGENTS.md + rotas do CRM/portal + schema SQL/Prisma

## Regras contratuais que não podem ser quebradas sem versionamento
- contratos de endpoint usados por integrações (ASAAS webhook, lead ingest, relay email, reconcile, tickets Freelas)
- semântica de pipeline, stage e histórico de movimentação
- ciclo de status de propostas e reconciliações operacionais
- autenticação S2S em endpoints de integração

## Fronteiras de responsabilidade
### Confirmado no código
- CRM: funil/operação comercial, ingestão de leads, relay de e-mail, integrações operacionais
- Portal: cadastro e billing do cliente, webhook ASAAS, briefing/tickets do cliente
- Worker: processamento assíncrono e reconciliação

### Incerteza encontrada
- fronteira completa com sistemas externos (fora deste repo) para enriquecimento de lead e regras de autenticação Praja

### Precisa validação
- contratos intersistemas versionados para fronteiras ainda implícitas

## Dados sensíveis e auditabilidade
- não expor tokens/segredos em logs
- preservar eventos e histórico de mudança
- manter idempotência em webhooks/eventos quando já implementada

## Fluxos críticos
- movimento de pipeline e stage history
- confirmação/reconciliação de assinatura/pagamento
- despacho de e-mail relay com trilha em `saas.email_log`
- processamento de tickets de integração com auditoria em atividades do deal
