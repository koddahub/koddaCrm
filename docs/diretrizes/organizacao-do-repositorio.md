# Diretriz: Organização do Repositório

Status: Atual  
Última revisão: 2026-04-18  
Fonte principal: árvore real do projeto

## Estrutura real (resumo)
```text
/
├── README.md
├── AGENTS.md
├── apps/
│   ├── cliente/public/        # Portal PHP (UI + API)
│   ├── crm-next/              # CRM V2 Next.js + Prisma
│   └── shared/src/            # Base compartilhada PHP
├── database/
│   ├── init/                  # bootstrap SQL
│   └── migrations/            # migrações SQL incrementais
├── worker/worker.php          # processamento assíncrono/reconciliação
├── scripts/up.sh              # subida local
├── script/deploy.sh           # deploy operacional
├── docker-compose.yml
├── tests/
└── docs/
```

## Regras de organização
- documentação principal permanece em `docs/` com arquivos numerados `01-` a `06-`
- material legado vai para `docs/archive/`
- diretrizes permanentes ficam em `docs/diretrizes/`
- arquivos de apoio visual ficam em `docs/referencias/`

## Incerteza encontrada
- coexistem diretórios `script/` e `scripts/` com papéis diferentes; manter convenção atual até decisão explícita de padronização.
