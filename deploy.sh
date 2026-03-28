#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
PRISMA_MIGRATIONS_DIR="$ROOT_DIR/apps/crm-next/prisma/migrations"
WITH_SEED=false
SKIP_PULL=false
COMPOSE_BAKE_VALUE="${COMPOSE_BAKE:-0}"

COMPOSE_SERVICES=(
  ac_web_cliente
  ac_nginx_cliente
  ac_crm_next
  ac_worker
)

usage() {
  cat <<'EOF'
Uso:
  ./deploy.sh [--with-seed] [--skip-pull]

Opcoes:
  --with-seed   Executa seed Prisma no ac_crm_next (se script existir)
  --skip-pull   Nao executa git pull origin main
  -h, --help    Exibe esta ajuda
EOF
}

for arg in "$@"; do
  case "$arg" in
    --with-seed) WITH_SEED=true ;;
    --skip-pull) SKIP_PULL=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opcao invalida: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v git >/dev/null 2>&1; then
  echo "Erro: git nao encontrado." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Erro: docker nao encontrado." >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Erro: docker-compose.yml nao encontrado em $ROOT_DIR" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose -f "$COMPOSE_FILE")
else
  echo "Erro: docker compose nao encontrado (plugin ou binario)." >&2
  exit 1
fi

echo "==> Projeto: $ROOT_DIR"

if [ "$SKIP_PULL" = false ]; then
  echo "==> Atualizando codigo (git pull origin main)"
  git -C "$ROOT_DIR" pull origin main
else
  echo "==> Pulando git pull (--skip-pull)"
fi

echo "==> Rebuild e subida dos servicos principais"
echo "==> COMPOSE_BAKE=${COMPOSE_BAKE_VALUE}"
(
  cd "$ROOT_DIR"
  COMPOSE_BAKE="$COMPOSE_BAKE_VALUE" "${COMPOSE_CMD[@]}" up -d --build "${COMPOSE_SERVICES[@]}"
)

if [ -d "$PRISMA_MIGRATIONS_DIR" ] && [ -n "$(find "$PRISMA_MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -print -quit 2>/dev/null)" ]; then
  echo "==> Aplicando migracoes Prisma no container ac_crm_next"
  docker exec -i ac_crm_next sh -lc 'npx prisma migrate deploy'
else
  echo "==> Pulando migracoes Prisma: apps/crm-next/prisma/migrations inexistente ou vazia"
  echo "==> Banco deste ambiente e inicializado por SQL em database/init"
fi

if [ "$WITH_SEED" = true ]; then
  echo "==> Tentando executar seed Prisma"
  if docker exec -i ac_crm_next sh -lc 'npm run | grep -q "prisma:seed"'; then
    docker exec -i ac_crm_next sh -lc 'npm run prisma:seed'
  else
    echo "==> Seed ignorado: script prisma:seed nao encontrado em apps/crm-next/package.json"
  fi
fi

echo "==> Validando servicos"
curl -fsS http://localhost:8092/api/health >/dev/null
curl -fsS -I http://localhost:8081 >/dev/null

echo "==> Deploy concluido."
echo "Portal Cliente: http://localhost:8081"
echo "CRM V2:         http://localhost:8092/login"
echo "Dominio CRM:    https://koddacrm.koddahub.com.br"
