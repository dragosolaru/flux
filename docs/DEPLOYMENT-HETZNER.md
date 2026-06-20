# Flux — Hetzner Deployment Guide

Self-hosted production deployment on Hetzner Cloud using Docker Compose + Traefik.

---

## Ce cumpărăm (cost lunar estimat)

### Hetzner Cloud (obligatoriu)

| Resursă | Model | Preț/lună |
|---------|-------|-----------|
| VM principal | **CX22** — 2 vCPU AMD, 4 GB RAM, 40 GB SSD | ~€4.55 |
| Floating IP | IP dedicat (zero-downtime redeploy) | ~€1.19 |
| **Total Hetzner** | | **~€5.75/lună** |

> CX22 este suficient pentru 100–500 utilizatori activi. La creștere, upgrade la **CX32** (~€7.76/lună, 4 vCPU, 8 GB).

### Domeniu

- Orice registrar: **Namecheap**, **Cloudflare Registrar**, **GoDaddy**
- Cost: **€10–20/an**
- Recomandare: Cloudflare Registrar (cel mai ieftin, DNS inclus, nu comision la reînnoire)

### Servicii externe (rămân în cloud — NU le self-hostăm)

| Serviciu | Plan | Preț |
|----------|------|------|
| **Supabase** (DB + Auth + Storage) | Free (până la 500 MB DB, 1 GB storage) | €0 → $25/lună Pro |
| **Anthropic Claude** (OCR documente) | Pay-per-use | ~$1–5/lună tipic |
| **Google OAuth** | Gratuit | €0 |
| **Cloudmailin** (email ingest costuri) | Free (100 emails/lună) | €0 → $10/lună |
| **Tibber API** (prețuri energie live) | Gratuit dacă ai contract Tibber | €0 |

**Total estimat: €5.75/lună + $25 Supabase Pro când e necesar**

---

## Arhitectură

```
Internet
    │
    ▼
Hetzner CX22 (Floating IP)
├── Traefik :80/:443 (SSL termination, Let's Encrypt auto)
│   ├── flux.yourdomain.com → Next.js app :3000
│   └── proxy.yourdomain.com → Tesla VCP Proxy :443
├── Docker: flux (Next.js)
└── Docker: tesla-proxy (Go binary Tesla)

Supabase Cloud (extern)
├── PostgreSQL — users, vehicles, sessions, documents, chargers
├── Auth — user table (bridged cu NextAuth via ensure-user.ts)
└── Storage — documente încărcate (/documents bucket)
```

**De ce nu self-hostăm Supabase?**
Supabase self-hosted necesită 7 servicii (Kong, GoTrue, PostgREST, Realtime, Storage, pg-meta, Postgres) — complexitate ridicată, risc de pierdere date, backup manual. Supabase Cloud gratuit acoperă fazele inițiale.

---

## Setup pas cu pas

### 1. Crează serverul Hetzner

1. Mergi la [console.hetzner.com](https://console.hetzner.com)
2. **Create Server**
   - Location: **Nuremberg** sau **Helsinki** (latență mică pentru Europa)
   - Image: **Ubuntu 24.04**
   - Type: **CX22** (Shared vCPU)
   - SSH Key: adaugă cheia ta publică (`~/.ssh/id_ed25519.pub`)
   - Networking: activează **Public IPv4**
3. Opțional: creează un **Floating IP** și asignează-l serverului
4. Notează IP-ul

### 2. Configurează DNS-ul

La registrar/Cloudflare, adaugă:

```
A    yourdomain.com         → <IP Hetzner>
A    www.yourdomain.com     → <IP Hetzner>
A    proxy.yourdomain.com   → <IP Hetzner>   # Tesla VCP proxy
```

> Dacă folosești Cloudflare: **dezactivează proxy (norul portocaliu)** pentru `proxy.yourdomain.com` — Tesla VCP proxy folosește TLS mutual, incompatibil cu Cloudflare MITM.

### 3. Instalează Docker pe server

```bash
ssh root@<IP>

# Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Docker Compose plugin
apt-get install -y docker-compose-plugin

# Verify
docker --version && docker compose version
```

### 4. Clonează repo-ul pe server

```bash
cd /opt
git clone https://github.com/dragosolaru/flux.git
cd flux
```

### 5. Creează fișierul de secrets

```bash
cp .env.local.example .env.production
nano .env.production
```

Completează **toate** valorile (vezi tabelul de mai jos). Niciodată nu comite acest fișier.

Adaugă la final și:
```
DOMAIN=yourdomain.com
ACME_EMAIL=admin@yourdomain.com
```

### 6. Build imaginea Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key> \
  --build-arg NEXT_PUBLIC_APP_URL=https://yourdomain.com \
  --build-arg NEXT_PUBLIC_CLOUDMAILIN_ADDRESS=<address>@cloudmailin.net \
  -t flux:latest .
```

> `NEXT_PUBLIC_*` sunt "baked in" la build time — Next.js le include în bundle-ul JS al clientului. Toate celelalte sunt injected la runtime via `.env.production`.

### 7. Tesla VCP Proxy (pentru comenzi pe mașini post-2021)

```bash
mkdir -p tesla-proxy/certs

# Generează cheia privată și certificatul virtual key
# Urmează: https://github.com/teslamotors/vehicle-command#generating-keys
# Salvează cert.pem și key.pem în tesla-proxy/certs/
```

Dacă nu ai mașini post-2021 sau nu ai nevoie de comenzi, comentează serviciul `tesla-proxy` din `docker-compose.yml`.

### 8. Pornește stack-ul

```bash
docker compose --env-file .env.production up -d

# Verifică logurile
docker compose logs -f flux
docker compose logs -f traefik
```

Traefik va obține automat certificatul SSL de la Let's Encrypt la primul request.

### 9. Testează

```bash
curl -I https://yourdomain.com       # trebuie să primești 200
curl -I https://www.yourdomain.com   # redirect → yourdomain.com
```

---

## Variabilele de mediu (`.env.production`)

| Variabilă | Cum o obții |
|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API (secret!) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://yourdomain.com` |
| `GOOGLE_CLIENT_ID` | [console.cloud.google.com](https://console.cloud.google.com) → Credentials |
| `GOOGLE_CLIENT_SECRET` | același loc |
| `TESLA_CLIENT_ID` | [developer.tesla.com](https://developer.tesla.com) |
| `TESLA_CLIENT_SECRET` | același loc |
| `TESLA_REDIRECT_URI` | `https://yourdomain.com/api/tesla/callback` |
| `TESLA_TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `TESLA_PROXY_BASE_URL` | `https://proxy.yourdomain.com` (dacă ai VCP proxy) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `EMAIL_WEBHOOK_SECRET` | `openssl rand -hex 24` |
| `NEXT_PUBLIC_CLOUDMAILIN_ADDRESS` | [app.cloudmailin.com](https://app.cloudmailin.com) |
| `LIVE_INTEGRATIONS` | `tesla` (sau gol pentru demo) |
| `DOMAIN` | `yourdomain.com` |
| `ACME_EMAIL` | emailul tău (pentru alerte Let's Encrypt) |

---

## Google OAuth — redirect URI

La [console.cloud.google.com](https://console.cloud.google.com):
- **Authorized redirect URIs**: `https://yourdomain.com/api/auth/callback/google`

---

## Supabase — configurări necesare

În Supabase Dashboard:
1. **Authentication → URL Configuration**
   - Site URL: `https://yourdomain.com`
   - Redirect URLs: `https://yourdomain.com/**`
2. **Authentication → Providers → Email** → activat
3. Rulează migrațiile: `supabase db push` sau copiază fișierele din `supabase/migrations/` manual prin SQL Editor

---

## Update / redeploy

```bash
cd /opt/flux
git pull origin main

# Rebuild imaginea
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.production | cut -d= -f2) \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.production | cut -d= -f2) \
  --build-arg NEXT_PUBLIC_APP_URL=https://yourdomain.com \
  -t flux:latest .

# Zero-downtime restart
docker compose --env-file .env.production up -d --no-deps flux
```

> Cu Floating IP: poți rula un al doilea server, build acolo, swap IP-ul, fără downtime.

---

## Backup

Datele critice sunt în **Supabase Cloud** (Postgres + Storage) — Supabase Pro include backup automat zilnic cu retenție 7 zile. Serverul Hetzner nu stochează date persistente (doar imaginea Docker și `.env.production`).

```bash
# Backup manual Supabase DB
supabase db dump --db-url <connection_string> > backup-$(date +%Y%m%d).sql
```

---

## Firewall Hetzner

În Hetzner Console → Firewall:

| Port | Protocol | Source | Scop |
|------|----------|--------|------|
| 22 | TCP | IP-ul tău | SSH |
| 80 | TCP | Any | HTTP (redirect HTTPS) |
| 443 | TCP | Any | HTTPS (app + Tesla proxy) |

Blochează tot restul.

---

## Monitoring (opțional, gratuit)

- **Hetzner Cloud Monitoring** — CPU/RAM/disk inclus în consolă
- **UptimeRobot** (gratuit) — ping la `https://yourdomain.com` la fiecare 5 minute, alertă email la down
- **Loguri**: `docker compose logs -f --tail=100 flux`

---

## Checklist final înainte de go-live

- [ ] DNS propagat (`dig yourdomain.com` returnează IP Hetzner)
- [ ] SSL valid (`curl -I https://yourdomain.com` → `200`)
- [ ] Login Google funcționează
- [ ] Supabase URL Configuration setat la domeniul de producție
- [ ] Tesla redirect URI actualizat în developer.tesla.com
- [ ] `LIVE_INTEGRATIONS=tesla` setat (dacă vrei date reale)
- [ ] Cloudmailin endpoint actualizat la `https://yourdomain.com/api/documents/inbound-email`
- [ ] Firewall Hetzner activ
- [ ] UptimeRobot monitor creat
