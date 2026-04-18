# Visão Geral

Status: Atual  
Última revisão: 2026-04-18  
Fonte principal: código + `docker-compose.yml` + `apps/cliente/public/index.php` + `apps/crm-next/*` + `worker/worker.php`

## O que é
Este repositório implementa um projeto combinado do ecossistema KoddaHub com:
- portal do cliente em PHP (`apps/cliente/public`)
- CRM V2 em Next.js + Prisma (`apps/crm-next`)
- camada compartilhada PHP (`apps/shared/src`)
- worker PHP (`worker/worker.php`)
- banco PostgreSQL com schemas separados (`client`, `crm`, `audit`) e também `saas`

## Para que serve
- operar cadastro e jornada do cliente no portal
- processar cobrança/assinatura com ASAAS
- gerir funil comercial e operação no CRM
- executar reconciliações e envios assíncronos no worker
- centralizar envio transacional de e-mail no CRM (relay)

## Papel no ecossistema KoddaHub
### Confirmado no código
- este repositório acumula responsabilidades de portal + CRM + operação + worker
- o CRM expõe endpoints de autenticação, dashboard, pipelines, deals, propostas, integrações e automação
- o portal expõe endpoints de autenticação, billing, briefing, tickets e webhook ASAAS

### Incerteza encontrada
- a fronteira completa com sistemas externos do ecossistema (ex.: KoddaProspect) não está formalizada no código deste repositório.

### Hipótese atual
- parte da geração/qualificação de demanda pode ocorrer fora deste repositório e chegar aqui por integração.

### Precisa validação
- contrato oficial entre este repositório e sistemas externos para "lead bruto", enriquecimento e segmentação.

## O que faz e o que não faz
### Confirmado no código
- faz: portal, CRM, reconciliação, webhook ASAAS, relay de e-mail, integrações específicas (Freelas/Instagram)
- não há evidência de plataforma genérica de integrações orientada a eventos com filas/DLQ multi-tenant já ativa como descrita em documento de evolução

## Limites atuais do MVP
### Confirmado no código
- deploy local baseado em Docker Compose
- `scripts/up.sh` para subida local
- `script/deploy.sh` para deploy operacional
- Prisma presente no CRM, mas sem pasta de migrações em `apps/crm-next/prisma/migrations` no estado atual

### Incerteza encontrada
- alguns documentos legados referenciam `./deploy.sh` na raiz, mas o arquivo real é `script/deploy.sh`.

## Riscos e ambiguidades
- divergência entre documentação antiga e estrutura real de deploy
- coexistência de documentação "planejada" junto de contratos operacionais atuais
- criação dinâmica de algumas tabelas via código (portal/worker/CRM), exigindo cuidado de rastreabilidade
