# Projeto Área Cliente KoddaHub

Repositório combinado do ecossistema KoddaHub com:
- portal do cliente em PHP (`apps/cliente/public`)
- CRM V2 em Next.js + Prisma (`apps/crm-next`)
- worker em PHP (`worker/worker.php`)
- banco compartilhado em PostgreSQL

## Subida rápida (local)
```bash
cd /home/server/projects/projeto-area-cliente
cp .env.example .env
./scripts/up.sh
```

Acessos locais:
- Portal: `http://192.168.25.3:8081`
- CRM: `http://192.168.25.3:8092/login`

## Deploy operacional
```bash
cd /home/server/projects/projeto-area-cliente
./script/deploy.sh
```

## Documentação principal
- Índice mestre: `docs/README.md`
- Guia operacional para agentes: `AGENTS.md`
