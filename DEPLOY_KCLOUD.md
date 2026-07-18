# KCLOUD VM deployment

This deployment runs PostgreSQL, FastAPI, and the React frontend on one Ubuntu VM. Only the
frontend proxy is exposed publicly; the API and database stay on the Docker network.

## VM requirements

- Ubuntu 22.04 or 24.04
- At least 2 vCPU, 2 GB RAM, and 20 GB disk
- Inbound TCP 22, 80, and 443 allowed
- A public IP

## 1. Install Docker

Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository, then
verify these commands:

```bash
docker --version
docker compose version
```

## 2. Clone and configure

```bash
git clone https://github.com/ssiuuuuuu/omys.git
cd omys
cp .env.kcloud.example .env.kcloud
nano .env.kcloud
```

Set `PUBLIC_ORIGIN` to `http://<PUBLIC_IP>` for the first boot. Do not commit `.env.kcloud`.

## 3. Start

```bash
docker compose --env-file .env.kcloud -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.kcloud -f docker-compose.prod.yml ps
curl http://127.0.0.1:8080/api/health
```

The app listens only on `127.0.0.1:8080`. Configure the existing Cloudflare Tunnel ingress to
send the public hostname to `http://127.0.0.1:8080`.

## 4. HTTPS

Browser geolocation requires HTTPS outside localhost. Point a domain at the public IP and put a
TLS reverse proxy such as Caddy in front of the frontend, or issue a Let's Encrypt IP certificate.
After HTTPS is ready, change `PUBLIC_ORIGIN` to the final `https://` URL and rebuild:

```bash
docker compose --env-file .env.kcloud -f docker-compose.prod.yml up -d --build
```

Register the same final URL in the Kakao Developers web-domain settings.

## Operations

```bash
# Logs
docker compose --env-file .env.kcloud -f docker-compose.prod.yml logs -f --tail=200

# Deploy a new revision
git pull --ff-only
docker compose --env-file .env.kcloud -f docker-compose.prod.yml up -d --build

# Database backup
docker compose --env-file .env.kcloud -f docker-compose.prod.yml exec -T db \
  pg_dump -U omys -d omys > omys-backup.sql
```
