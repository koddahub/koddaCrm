# Deploy e Operacao do CRM V2 na porta 8092

Data de referencia: 28/03/2026

## Objetivo
Padronizar o CRM V2 (`ac_crm_next`) na porta local `8092`, mantendo o dominio publico `koddacrm.koddahub.com.br` no Cloudflare Tunnel.

## Mapeamento oficial de portas
- Portal cliente (Nginx): `8081 -> ac_nginx_cliente:80`
- CRM V2 (Next.js): `8092 -> ac_crm_next:3000`
- Postgres: `5434 -> ac_postgres:5432`
- Redis: `6381 -> ac_redis:6379`

Arquivo fonte: `docker-compose.yml`

## Cloudflare Zero Trust (Tunnel)
No hostname `koddacrm.koddahub.com.br`, configure:
- Service Type: `HTTP`
- URL: `localhost:8092`

Observacao:
- O Access Policy (Allow/Bypass) controla autenticacao.
- A porta/origem e definida no Tunnel (Public Hostname).

## Deploy padrao
No diretorio do projeto:

```bash
cd /home/server/projects/projeto-area-cliente
./deploy.sh
```

Opcoes:

```bash
./deploy.sh --skip-pull
./deploy.sh --with-seed
```

## O que o deploy.sh faz
1. (Opcional) `git pull origin main`
2. Rebuild e subida de:
   - `ac_web_cliente`
   - `ac_nginx_cliente`
   - `ac_crm_next`
   - `ac_worker`
3. Executa migracoes Prisma no `ac_crm_next`
4. Valida HTTP local em `8081` e `8092`

## Validacao rapida
### No servidor
```bash
curl -I http://localhost:8092/login
curl -I http://localhost:8081
```

### No navegador (sua maquina)
- Nao use `http://localhost:8092` (isso aponta para seu computador local).
- Use:
  - `http://192.168.25.3:8092/login` (rede interna)
  - `https://koddacrm.koddahub.com.br/login` (dominio publico)

## Troubleshooting
### 1) Dominio abre app errado
- Verifique no Tunnel se `koddacrm.koddahub.com.br` aponta para `localhost:8092`.

### 2) `ERR_CONNECTION_REFUSED` no navegador em `localhost:8092`
- Esperado quando testado fora do servidor.
- Troque para `192.168.25.3:8092` ou dominio publico.

### 3) Container subiu, mas porta sem resposta
```bash
docker ps | rg ac_crm_next
docker logs --tail 200 ac_crm_next
```

### 4) Forcar atualizacao do tunnel
```bash
sudo systemctl restart cloudflared
```

## Referencias do projeto
- `docker-compose.yml`
- `deploy.sh`
- `scripts/up.sh`
- `README.md`
