#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

docker compose up -d --build

echo "Portal Cliente:      http://192.168.25.3:8081"
echo "CRM V2 (Next/Prisma): http://192.168.25.3:8092"
