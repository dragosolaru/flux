# Moving off Vercel, and changing the domain

*2026-08-12. Written because both are being considered, and one of them is far
more dangerous than it looks.*

---

## Read this first: changing the domain unpairs the car

The domain is not a cosmetic setting. It is the identity Tesla's whole trust
chain is built on, and four things are bound to it:

1. **The partner account.** `POST /api/1/partner_accounts` registers a *domain*.
   Tesla fetches the public key from
   `https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem` and
   stores it against that domain.
2. **`TESLA_REDIRECT_URI`**, which is registered in Tesla's developer portal.
   OAuth fails outright if the callback URL does not match what is registered.
3. **The Virtual Key pairing link**, `https://tesla.com/_ak/<domain>` — derived
   from the redirect URI's host by `teslaVirtualKeyUrl()`.
4. **The key the car stored.** The car holds the key it was paired with, under
   the domain it was paired through.

So a domain change is not a DNS edit. It is:

- register the new domain in the Tesla developer portal and update
  `TESLA_REDIRECT_URI`
- serve `.well-known/...public-key.pem` on the new domain, with the **same**
  public key the proxy signs with
- register the partner account for the new domain
- **re-pair every car** through the new `_ak` link
- expect `/debug` → Check status to show `tesla` lagging until the new partner
  registration takes

We spent days on that chain when only one link was wrong. Do it deliberately,
with `/debug` → Car → **Check status** open, and do it **before** there is a
second user — every one of them has to re-pair.

**Keep the old deployment alive during the switch.** The old `.well-known` must
keep answering until Tesla has the new record, or pairing breaks in the middle.

---

## Vercel vs Hetzner, honestly

Hetzner is the right destination, and the reason has nothing to do with price.

### What Vercel is actively costing us

- **No fixed egress IPs.** This is why `tesla-proxy` needs a public hostname
  with a valid certificate, which is why it is reachable by strangers, which is
  **T10 — the open relay**. On one host, the proxy binds to a private interface
  and the problem disappears rather than being mitigated.
- **Per-instance state does not exist.** The refresh-token single-flight guard
  was a `Map` in module scope, which is empty in the lambda racing the one
  holding it. Tesla rotates refresh tokens on use, so the loser wrote an
  already-invalidated token and the next refresh failed `invalid_grant`. We
  fixed it with a Redis lock — necessary on serverless, unnecessary on one box.
- **`maxDuration`.** Several routes carry `export const maxDuration = 60` and
  the migration runner 120. A wake-then-command sequence (gate 1, T3) wants to
  poll a sleeping car for ~30s and then send. That fits, barely.
- **Fleet Telemetry cannot run there at all.** It needs a long-lived mTLS
  listener. That is not a serverless function, and it is the single most
  valuable thing left to build.

### What Vercel is genuinely good at

Preview deployments per branch, zero-config CDN, image optimisation, and cron
without a scheduler. You will rebuild all four, and the first one is the one
you will miss.

### The recommendation

**Move, but not yet, and not all at once.**

The order that minimises risk:

1. **Now — nothing.** Gate 1 in `/debug` has three unfinished items and all
   three are cheaper to fix on Vercel than mid-migration. A move does not fix
   them; it just adds a second variable to every failure.
2. **Buy the domain now, point it nowhere.** Domains are cheap and the name is
   the part with lead time. Do not attach it yet.
3. **When Fleet Telemetry starts** — that is the forcing function. It cannot run
   on Vercel, it needs the same box as the proxy, and at that point you are
   deploying a long-lived service anyway. Move the app then, in one operation,
   with the domain change.
4. **Do the domain change and the host change together**, not separately. Both
   require re-pairing; doing them apart means pairing twice.

### What the move actually involves

You already run Coolify on Hetzner and `tesla-proxy` is deployed there, so the
platform is proven. The app is a standard Next.js standalone build — there is a
`Dockerfile` and `output: "standalone"` is already set in `next.config.ts`.

What has to be replaced:

| Vercel gives us | On Hetzner |
|---|---|
| `vercel.json` crons (`/api/internal/warm`, `/api/cron/poll-vehicles`) | Coolify scheduled tasks, or a systemd timer hitting the same URLs with `CRON_SECRET` |
| Automatic TLS | Traefik in Coolify, already doing it for the proxy |
| Preview deployments | Coolify per-branch apps, or accept losing them |
| Edge CDN | Cloudflare in front, free tier |
| `NEXT_PUBLIC_*` build-time injection | Same, but the build now happens on the box — watch out for Coolify printing build args in the deploy log, which it does |

What gets *simpler*:

- The proxy stops being public. Bind it to the Docker network, drop the Caddy
  TLS bridge, and **T10 is gone** — not mitigated, gone.
- `TESLA_PROXY_BASE_URL` becomes `http://tesla-proxy:8080` on the internal
  network, so the plaintext guard in `teslaProxyBaseUrl()` needs its loopback
  exemption widened to private ranges. One small, deliberate change.
- Fleet Telemetry becomes possible.
- One place to read logs.

What gets *harder*:

- You own uptime. Vercel's failure modes are someone else's pager.
- Postgres stays on Supabase either way — do not move that at the same time.

---

## Checklist for the day you do it

- [ ] Buy the domain; leave it unattached
- [ ] Gate 1 in `/debug` clear (proxy secret, quota bucket, wake-before-command)
- [ ] Deploy the app to Coolify on the new domain, **old deployment still live**
- [ ] Verify `/debug` → **Show published key** on the new domain returns the
      same key the proxy signs with — all three paths identical
- [ ] Register the new domain in the Tesla developer portal; update
      `TESLA_REDIRECT_URI`
- [ ] `/debug` → **Register** the partner account for the new domain
- [ ] `/debug` → **Check status**: env, domain, proxy, tesla all equal
- [ ] Re-pair the car through the new `_ak` link
- [ ] `/debug` → **Check pairing** reports `paired true`
- [ ] Send one command
- [ ] Point `TESLA_PROXY_BASE_URL` at the internal address, redeploy, command
      again
- [ ] Only now retire the Vercel deployment
