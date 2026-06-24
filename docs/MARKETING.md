# Flux — Go-to-Market & Marketing Reference

> Living document. Update whenever pricing, positioning, or key features change.
> Primary market: Romania. Secondary: Germany, France, Hungary, international EV owners.

---

## 1. Product in one sentence

Flux is a premium PWA that gives Tesla owners a beautifully minimal dashboard for live vehicle state, smart charging schedules, real-road trip planning, and automatic cost tracking — all without touching a spreadsheet.

---

## 2. Target audience

### Primary personas

| Persona | Who they are | Pain they feel today |
|---------|-------------|----------------------|
| **The Daily Driver** | 25–45, urban professional, owns a Model 3 or Model Y, charges at home, commutes daily. Tech-savvy but not a power user. | Checks Tesla app every morning but finds it cluttered. Has no idea what charging actually costs per km. Wants one glance to know if they need to plug in tonight. |
| **The Trip Planner** | Same age range, comfortable doing longer journeys (Bucharest → Vienna, Cluj → Berlin). Plans road trips several times a year. | Hates guessing charging stops. Copy-pastes charger addresses manually. Worries about getting stranded on mountain crossings or Balkan routes. |
| **The Cost Tracker** | 30–50, cost-conscious, small-business owner or fleet user. Expensing or tracking EV running costs matters. | Keeps receipts in a shoebox. Manual entry into spreadsheets is tedious. Wants to know their real cost-per-km vs. petrol without doing the math themselves. |

### Secondary personas

| Persona | Who they are |
|---------|-------------|
| **The Evaluator** | Considering buying a Tesla or just bought one. Wants to understand what managing an EV actually looks like before committing to hardware or subscriptions. The zero-friction demo mode is built for them. |
| **The Fleet Manager** | Manages 2–5 EVs (company cars, delivery vehicles, rentals). Needs per-vehicle dashboards and cost breakdowns without enterprise pricing. |

---

## 3. Core value propositions

- **Try it in 30 seconds.** No Tesla connection required. The demo mode runs a realistic simulated vehicle — see every feature working before you commit anything.
- **Know your real cost-per-km.** Forward a charging receipt via email or WhatsApp. AI extracts provider, kWh, and cost automatically. Monthly trend, home vs. public split, and a petrol comparison computed for you.
- **Charge at the cheapest hour, automatically.** Connect your energy provider (Tibber and Romanian providers supported). Flux identifies the cheapest window in the next 24 hours and tells you exactly when to plug in.
- **Plan any route with real charging stops.** Enter origin and destination. Flux plans the route, inserts charging stops based on your actual battery and weather derating, and lets you send it directly to your Tesla's navigation.
- **One app, five languages.** English, Romanian, German, French, Hungarian — with correct locale formatting for dates, currency, and addresses.

---

## 4. Competitive landscape

### Direct competitors (per feature)

| Feature | Main alternatives | Flux difference |
|---------|-----------------|-----------------|
| Vehicle dashboard | Tesla official app | Cleaner mobile UX; cost intelligence built in; works offline (PWA) |
| Trip planning | ABRP (A Better Route Planner) | Integrated with cost tracking; no separate app; sends to Tesla |
| Charging map | PlugShare, Chargemap, AmpWhere | PostGIS-backed deduped station data from 5 open sources; power labels visible at a glance |
| Cost tracking | Manual spreadsheet, Fuelchief | AI OCR from photo or forwarded email; no manual entry |
| Smart charging | Tibber app, Tesla scheduled charging | Provider-agnostic; Romanian tariff providers included |

### Our differentiation

**All-in-one, premium experience.** Every competing tool solves one problem. Flux solves five, in a single PWA that installs on the home screen in seconds. The UX is intentionally minimal — numbers float on the screen, not inside card-inside-card-inside-modal bureaucracy.

**Romanian-first, then Europe.** No competitor targets Romanian EV owners natively, in Romanian, with Romanian energy providers (Electrica, E.ON, Enel, Hidroelectrica) built in. That is the initial wedge.

**Zero-friction entry.** ABRP asks for an account and a car before you see anything useful. Flux shows you a working dashboard, a planned route to anywhere in Europe, and a sample cost report before you've typed your email.

**Honest about what it is.** PWA-first (not native), Tesla-only for now, charging data from open sources that may lag on station availability. We say this clearly rather than hiding it in fine print.

---

## 5. Positioning statement

**For Tesla owners who want more than an app that shows battery percentage** — Flux is the EV management companion that turns raw vehicle data into decisions: when to charge, how much it costs, where to stop on your next road trip. Unlike generic EV trackers, Flux is built for the premium mobile experience you expect from your car.

---

## 6. Messaging framework

### Primary message

**Headline:** Your EV, beautifully managed.

**Sub-headline:** Live dashboard, smart charging, real-road trip planning, and automatic cost tracking — in one app that installs in seconds.

---

### Feature messages

**Zero-friction demo**
- Problem: I want to see if this is worth my time before connecting my car.
- Solution: Open Flux. Tap "Explore with demo data." You're looking at a working dashboard in 10 seconds — no account, no Tesla connection, no credit card.

**Smart charging schedule (Tibber / tariff integration)**
- Problem: I'm paying peak-rate electricity to charge because I plug in when I get home at 7pm.
- Solution: Flux reads your tariff's hourly price curve and tells you the cheapest 4-hour window tonight. One tap to schedule it. You charge at off-peak rates without thinking about it.

**Trip planner with real charging stops**
- Problem: I'm driving from Bucharest to Vienna and I don't know where to stop, how long it'll take, or what it'll cost.
- Solution: Enter your destination. Flux plans the real road route, inserts charging stops based on your actual battery level and weather (cold kills range), and sends the **complete route — all charging stops at once** — to your Tesla's navigation. Battery preconditioning is queued automatically at departure so each charger is warm and ready when you arrive. Save the route and reload it next time in one tap.

**Saved routes**
- Problem: I drive the same road trip 3–4 times a year. Re-entering origin, destination, and all charging stops every time is tedious.
- Solution: Tap the bookmark icon after planning any route. Flux saves it with the charging stops, times, and costs. Next time, one tap reloads the full plan and sends it to the car.

**Battery preconditioning for any charger**
- Problem: I know Tesla preconditions the battery before Superchargers, but I often use non-Tesla DC fast chargers and they're cold when I arrive — charging is slow for the first 10 minutes.
- Solution: When you send a route from Flux, preconditioning is activated at departure for every charging stop — Supercharger or not. Tesla handles Superchargers automatically; for other DC fast chargers, Flux triggers preconditioning so the battery arrives at temperature. *Note: Tesla's firmware makes the final decision on timing based on distance and temperature.*

**Receipt OCR / email ingest**
- Problem: I have a folder of charging receipts I've never looked at and no idea what my EV actually costs to run.
- Solution: Forward any charging receipt to your Flux inbox. The AI reads the provider, kWh, and cost — even from a photo taken in a car park. Your monthly cost dashboard updates automatically. No manual entry ever.

**5-language support**
- Problem: The Tesla app is in English. My electricity bill is in Romanian. My Airbnb host in Hungary only speaks Hungarian.
- Solution: Flux runs natively in your language — Romanian, English, German, French, or Hungarian. Switch any time in settings.

**2027 premium mobile design**
- Problem: Most EV apps look like a data table had a bad day.
- Solution: Your battery level floats on a dark screen in 7xl type. Quick actions are icon-only circles. The app adapts its ambient colour to your charging state. It feels as considered as the car.

---

## 7. Channels & launch strategy

### Pre-launch (before public announcement)

1. **Build a waitlist page** at the current domain. One-field email capture. Tagline + one screenshot. No feature list — just the aesthetic.
2. **Seed a 50-person beta** from Tesla owner Facebook groups (Romania: "Tesla Owners Romania"), Reddit (`r/teslamotors`, `r/Romania`), and LinkedIn EV communities. Gather friction points.
3. **Create demo video (60 seconds):** open on blank screen → type "Cluj → Berlin" → see the route plan animate → forward an email receipt → cost dashboard updates. No voiceover needed. Background music only.
4. **Set up Cloudmailin for email ingest** and WhatsApp for the receipt pipeline — these are the highest-surprise features and demo well on camera.
5. **Translate the landing page** into Romanian and German (the two highest-priority markets after English).
6. **Prepare pricing page** at `/pricing` — Free vs Pro (€4.99/mo or €39/year). Clear feature comparison table.

### Launch week

1. **Product Hunt** — post on a Tuesday or Wednesday. Tagline: "Your EV, beautifully managed." Use the 60-second demo video. Ask beta users to be the first 30 upvoters.
2. **Twitter/X thread** — "I built an EV management app in Next.js. Here's what took the most work: [thread with 5 genuine technical surprises — OCR pipeline, trip planner route through Balkan charging gaps, PostGIS dedup]." Technical audience; drives inbound curiosity.
3. **Romanian EV communities** — post in "Tesla Owners Romania" Facebook group and `r/Romania` subreddit. Romanian-language post. Lead with the free demo mode.
4. **LinkedIn post** (founder) — personal story angle: "I kept forwarding charging receipts to myself. So I built the thing that reads them automatically." Short, real, non-hypey.
5. **Submit to EV directories** — Plug In America, EV-volumes.com, Romanian EV association (ROMENERG).
6. **Email the waitlist** on day 1 of launch.

### Ongoing

| Channel | Cadence | Content type |
|---------|---------|-------------|
| Twitter/X | 2–3 posts/week | Product screenshots, trip planning routes, "did you know" tips about smart charging |
| LinkedIn | 1 post/week | Behind-the-build posts, milestone updates |
| Romanian Facebook groups | As relevant | Feature announcements in Romanian |
| Product Hunt follow-up | After 30 days | "One month later" post with user stats |
| SEO content | Monthly | Target: "Tesla cost tracking", "Tesla charging planner Romania", "cost per km Tesla" |
| Email digest | Monthly | "Your Flux month in review" to Pro subscribers — usage stats, new features |

---

## 8. App Store listing

> Note: Flux is currently a PWA. These listings are ready for when native iOS/Android wrappers ship. The PWA can be submitted to the Google Play Store today via Bubblewrap/TWA.

### Name + subtitle

**Name:** Flux — EV Manager

**Subtitle:** Tesla dashboard, trips & costs

### Short description (80 chars)

```
Live Tesla dashboard · smart charging · trip planner · cost tracking
```

### Full description

```
Flux is the EV management companion for Tesla owners who want more than a battery
percentage.

LIVE DASHBOARD
See your battery, range, tire pressure, climate status, and charging state at a
glance — beautifully laid out on a dark background that shifts colour as your
battery level changes.

SMART CHARGING
Connect your electricity provider and Flux finds the cheapest window in the next 24
hours to charge your car. Works with Tibber, Electrica, E.ON, Enel, Hidroelectrica,
and more.

TRIP PLANNER
Enter any destination and Flux plans the real road route with charging stops based on
your actual battery, vehicle model, and current weather. Send the entire route — all
charging stops — directly to your Tesla's navigation with one tap. Battery
preconditioning starts automatically so every charger is ready when you arrive.
Save up to 10 favourite routes and reload them instantly for recurring road trips.

AUTOMATIC COST TRACKING
Forward a charging receipt by email or WhatsApp photo. AI reads the provider, kWh,
and cost — no typing. See your monthly trend, cost-per-km, and a comparison against
what you'd have paid for petrol.

CHARGING MAP
Browse over 100,000 chargers across Europe. Filter by power (50 kW+, 150 kW+,
350 kW+) and connector type (CCS, CHAdeMO, Type 2, Tesla). Tap any pin for
availability and pricing information.

TRY WITHOUT CONNECTING YOUR CAR
Explore every feature with a realistic simulated Tesla. No credit card, no Tesla
connection required — see exactly what Flux does before you decide.

FIVE LANGUAGES
English, Romanian, German, French, Hungarian. Switch any time.

FREE & PRO
Free: 1 vehicle, 3 receipts/month, all planning tools.
Pro (€4.99/month): unlimited vehicles, unlimited receipts, CSV export,
email + WhatsApp inbox, battery health tracking.

Notes: Charging station data from OpenChargeMap + OpenStreetMap (coverage and
availability may vary by region). Currently supports Tesla vehicles. More brands
coming.
```

### Keywords (Apple App Store, 100 chars)

```
Tesla,EV,charging,trip planner,smart charge,Tibber,cost tracker,range,OCR,electric car
```

---

## 9. Social media starter kit

### 3 launch tweets/posts

**Post 1 — Demo hook (English)**

> You don't need a Tesla to try this.
>
> Open Flux → tap "Explore with demo" → you're looking at a live dashboard, a trip plan from Bucharest to Berlin, and a charging cost tracker — in about 10 seconds.
>
> No account. No credit card. No car.
>
> [link] #EVs #Tesla #BuildInPublic

---

**Post 1 — Demo hook (Romanian)**

> Nu ai nevoie de un Tesla ca să încerci asta.
>
> Deschizi Flux → apeși "Explorează cu date demo" → în vreo 10 secunde ai un dashboard live, un plan de traseu București → Berlin și un tracker de costuri de încărcare.
>
> Fără cont. Fără card. Fără mașină.
>
> [link] #EV #Tesla #Romania

---

**Post 2 — Cost tracking (English)**

> I had 4 months of charging receipts in a Gmail folder and zero idea what my Tesla actually costs per km.
>
> So I built the thing that reads them automatically.
>
> Forward the receipt → AI extracts kWh + cost → cost-per-km dashboard updates.
>
> It's free to try: [link]

---

**Post 2 — Cost tracking (Romanian)**

> Aveam 4 luni de bonuri de încărcare într-un folder Gmail și zero idee cât costă pe km Tesla-ul meu.
>
> Așa că am construit aplicația care le citește automat.
>
> Trimiți bonul pe email → AI extrage kWh + cost → se actualizează dashboard-ul.
>
> Gratuit de încercat: [link]

---

**Post 3 — Trip planner (English)**

> Planning a road trip in a Tesla is still weirdly manual.
>
> Flux fixes that: enter destination → get charging stops with exact arrival/departure SoC, charging time, cost, and a "send to Tesla" button that loads the plan in your car's nav.
>
> Works for long Balkan routes too (Cluj → Athens is 1,700 km and it handles it). [link]

---

**Post 3 — Trip planner (Romanian)**

> Planificarea unui drum lung cu Tesla e încă surprinzător de manuală.
>
> Flux rezolvă asta: introduci destinația → primești opriri de încărcare cu SoC la sosire/plecare, timp de încărcare, cost și un buton „Trimite la Tesla" care încarcă planul direct în navigație.
>
> Merge și pe trasee balcanice lungi (Cluj → Atena, 1.700 km). [link]

---

### 1 Product Hunt tagline

> **Flux — Your EV, beautifully managed.**
> Live Tesla dashboard, smart charging windows, real-road trip planner, and AI receipt scanning — all in a PWA that installs in seconds. Try the demo without connecting anything.

---

## 10. Launch readiness checklist

### Technical

- [ ] `LIVE_INTEGRATIONS=tesla` configured and Tesla OAuth flow tested end-to-end
- [ ] Stripe price IDs set; checkout + webhook verified in production
- [ ] Cloudmailin webhook live; email ingest tested with real receipts
- [ ] WhatsApp inbound webhook live and HMAC-verified
- [ ] PWA manifest + service worker tested on Android Chrome and iOS Safari
- [ ] `/pricing` page live and linked from landing page and upgrade prompts
- [ ] Demo mode vehicles seeded with realistic scenarios (commuter, road-trip, etc.)
- [ ] `npx tsc --noEmit` passes; `npm run lint` passes; no console errors in production
- [ ] Rate limiting verified (`checkRateLimit`) under simulated load
- [ ] GDPR data export (`/api/user/export`) and account deletion tested
- [ ] Error monitoring (Sentry or equivalent) connected
- [ ] Uptime monitoring active on a health endpoint

### Content

- [ ] Landing page (`/`) translated into Romanian and German
- [ ] `/pricing` page copy reviewed; Pro feature list accurate
- [ ] All 5 locale files (`en`, `ro`, `de`, `fr`, `hu`) complete — no missing keys
- [ ] Demo video (60s) produced and uploaded
- [ ] Product Hunt assets ready: logo, gallery screenshots (5), tagline, description
- [ ] Twitter/X account handle secured
- [ ] Open Graph images set for `/` and `/pricing` (1200×630)
- [ ] `docs/FEATURES.md` up to date

### Legal / GDPR

- [ ] Privacy policy published and linked from footer and register page
- [ ] Terms of service published and linked from footer
- [ ] Cookie notice / consent banner (if analytics are active)
- [ ] Data Processing Agreement with Anthropic (for OCR/AI processing of user documents)
- [ ] Data Processing Agreement with Supabase
- [ ] Stripe merchant account fully verified
- [ ] GDPR "right to erasure" — account deletion API tested and confirmed to delete all user data
- [ ] `/about-data` transparency page reviewed and accurate
- [ ] Romanian ANPC notice (if selling to Romanian consumers — required by law)

### Marketing

- [ ] Waitlist / early-access list exported and segmented
- [ ] Product Hunt launch scheduled (Tuesday or Wednesday)
- [ ] Launch day social posts drafted and queued (both EN and RO)
- [ ] Beta users briefed on launch day and asked to upvote / share
- [ ] Google Search Console set up; sitemap submitted
- [ ] Analytics (Plausible or equivalent, privacy-respecting) live
- [ ] App Store listing copy ready (for future TWA / native submission)
- [ ] Referral or invite mechanism planned for post-launch growth loop

---

*Last updated: 2026-06-11.*
