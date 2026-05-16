# NEXT STEPS — Tesla Command Proxy (mâine)

Ultima sesiune (2026-05-16) a livrat:

- Dashboard read-only live pe https://flux-alpha-three.vercel.app
- Autentificare (Google + email/password) funcțională
- OAuth Tesla complet (PKCE, partner registration, Virtual Key paired)
- Citirea datelor live de la "Black Panther" (Model 3, 2023, VIN `LRW3E7EL...`)

Ce **NU** funcționează încă: comenzile (Lock/Unlock, Climate, Honk, Flash, Set Charge Limit).
Cauză: Tesla cere **Vehicle Command Protocol** (signed commands) pe Model 3/Y/S/X
post-2021. REST commands returnează 403.

## Plan pentru sesiunea următoare

Rulăm proxy-ul oficial Tesla (`tesla-http-proxy`, Go binary open-source) ca microserviciu
pe Fly.io. Proxy-ul ține cheia privată EC, primește REST de la Flux și retransmite
ca comenzi semnate. Aplicația Flux deja are integrare condiționată: dacă
`TESLA_PROXY_BASE_URL` e setat, comenzile trec prin proxy; dacă nu, lovesc Tesla direct.

Toate fișierele necesare sunt deja în repo, sub `tesla-proxy/`:

- `Dockerfile` — build `tesla-http-proxy` din `github.com/teslamotors/vehicle-command`
- `entrypoint.sh` — materializează cheia privată din secret, generează cert intern, lansează proxy-ul pe `$PORT`
- `fly.toml` — config Fly.io (Frankfurt, shared 256MB, auto-stop)
- `README.md` — pașii de deploy pentru viitor

## Checklist pentru tine (manual, în terminalul tău)

### 1. Instalare `flyctl`

```bash
curl -L https://fly.io/install.sh | sh
```

Adaugă în PATH dacă nu apare automat:

```bash
export PATH="$HOME/.fly/bin:$PATH"
fly version   # trebuie să afișeze versiunea
```

### 2. Cont Fly.io + autentificare

```bash
fly auth signup   # sau "fly auth login" dacă ai deja cont
```

⚠️ Fly cere card de credit pentru verificare. Planul gratuit acoperă 1-2 app-uri
mici fără să taxeze nimic. Dacă nu vrei card, spune-mi și mutăm pe **Railway**
($5 flat / lună) sau **Render** (gratis dar app-ul intră în sleep după 15 min).

### 3. Deploy proxy

```bash
cd "/Users/dragosolaru/Learn/Tesla Dasboard/flux/tesla-proxy"
fly launch --copy-config --no-deploy
```

Răspunsuri la prompt-uri:
- App name: `flux-tesla-proxy` (acceptă)
- Organization: `personal`
- Region: `fra` (Frankfurt) — cel mai aproape
- Postgres / Redis / Tigris / Sentry: toate **No**

Setează cheia privată ca secret (e cea pe care am generat-o în sesiunea trecută):

```bash
fly secrets set TESLA_PRIVATE_KEY="$(base64 < ~/.flux-keys/tesla-command-signing.pem)"
```

Apoi deploy:

```bash
fly deploy
```

Așteaptă ~3–4 minute. La final vezi URL-ul de forma `https://flux-tesla-proxy.fly.dev`.

### 4. Configurează Flux să-l folosească

În Vercel dashboard → `flux` → **Settings → Environment Variables** → **Add**:

| Name | Value |
|---|---|
| `TESLA_PROXY_BASE_URL` | URL-ul Fly de la pasul 3 (ex: `https://flux-tesla-proxy.fly.dev`) |

Bifează Production + Preview + Development. **Save**. Apoi **Deployments → ⋯ → Redeploy**
pe ultimul deployment (sau push un commit gol).

### 5. Test

Deschide https://flux-alpha-three.vercel.app/dashboard și apasă **Honk** sau **Flash**.
Ar trebui să vezi toast verde "Command sent: honk horn" și mașina răspunde fizic.

## Dacă apare ceva nou

- `502` pe `/api/tesla/command` cu mesaj de la proxy → verifică `fly logs` în terminal
- `412 VCP_REQUIRED` în continuare → `TESLA_PROXY_BASE_URL` nu e citit, verifică
  că redeploy-ul a inclus env-ul nou
- `403` de la proxy către Tesla → cheia privată din secret nu se potrivește cu
  cheia publică înregistrată ca partner / cu Virtual Key paired pe mașină

## Locații cheie

| Ce | Unde |
|---|---|
| Cheia privată EC (signing) | `~/.flux-keys/tesla-command-signing.pem` (chmod 600) |
| Cheia publică EC | `src/app/api/tesla-public-key/route.ts` (hardcoded — e publică) |
| Cheia publică servită | `https://flux-alpha-three.vercel.app/.well-known/appspecific/com.tesla.3p.public-key.pem` |
| Tokens Tesla ale userului | Supabase tabela `tesla_tokens`, criptate AES-256-GCM |
| Cheia AES de criptare | `TESLA_TOKEN_ENCRYPTION_KEY` în `.env.local` + Vercel |
| Vehicle ID Tesla | `929644865845425` (Black Panther, VIN `LRW3E7EL0PC661169`, EU) |

## Cum pornesc serverul

### Production (Vercel) — NU trebuie pornit, rulează 24/7

Vercel rulează aplicația ca **serverless functions on-demand**. Nu există un proces
care "pornește" sau "oprește". Fiecare cerere care vine la `flux-alpha-three.vercel.app`
ridică o instanță, răspunde, se oprește. Costă $0 când nu vin cereri.

Pentru a redeploy (după ce schimbi env vars sau cod):

- **Cod:** `git push origin main` din `flux/` → Vercel face autodeploy în 2 minute.
- **Env vars:** modifici în dashboard → la Deployments alegi ultimul deployment →
  meniul `⋯` → **Redeploy**. Sau push un commit gol: `git commit --allow-empty -m "redeploy" && git push`.

Status în orice moment: https://vercel.com/dragosolaru → proiectul `flux`. Deployment-ul
cu badge "Production" e cel care rulează.

### Dev local — când vrei să modifici cod

```bash
cd "/Users/dragosolaru/Learn/Tesla Dasboard/flux"
nvm use         # citește .nvmrc → trece pe Node 22
npm run dev     # pornește pe http://localhost:3000
```

Pentru OAuth Tesla doar production merge (Tesla nu acceptă `localhost` în redirect URI).
Pentru tot ce înseamnă citire Tesla **după ce ai conectat o dată mașina pe production**,
poți testa local fără probleme — același DB Supabase, aceiași tokeni criptați.

Oprire: `Ctrl+C` în terminal.
