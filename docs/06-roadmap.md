# Roadmap

Status: Planejado  
Última revisão: 2026-04-18  
Fonte principal: estado atual do código + `docs/archive/KODDACRM_MODULO_INTEGRACOES_v2.5.0.md`

## Estado atual (confirmado no código)
- portal + CRM + worker ativos no mesmo repositório
- integrações implementadas por endpoints e serviços específicos
- integração de e-mail relay, ASAAS, Freelas e Instagram com evidência de código

## Lacunas e dívidas
- divergência entre documentação operacional antiga e caminhos reais de deploy
- ausência de trilha documental única consolidando fronteiras de dados por sistema
- partes de schema criadas também via execução de código (além de init/migrations), exigindo governança de mudança

## Itens planejados (não implementar automaticamente)
- evolução do módulo de integrações v2.5.0 (event-driven, multi-tenant, DLQ, webhook handler genérico, manager central)
- padronização ampliada para novos provedores conforme documento de evolução

## Próximos passos sugeridos
1. Consolidar contratos versionados das integrações já ativas (ASAAS, relay, Freelas, Instagram).
2. Definir fronteiras oficiais entre este repositório e serviços externos do ecossistema.
3. Planejar migração incremental do estado atual para o desenho v2.5.0 sem quebrar contratos.

## Incerteza encontrada
- não há no código atual todos os componentes nomeados do documento v2.5.0 como serviços dedicados.

## Hipótese atual
- o documento v2.5.0 é alvo arquitetural, não retrato do runtime atual.

## Precisa validação
- backlog oficial com prioridade, dono e janela de execução para cada item v2.5.0.
