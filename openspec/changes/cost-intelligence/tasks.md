# Tasks — Cost Intelligence

Plan fazat. Fiecare fază livrează o felie funcțională și lasă `main` deployabil.

---

## Faza 1 — Schema DB + migrare

- [x] 1.1 Scrie migrarea SQL cu tabelele `documents`, `energy_costs`, `exchange_rates`
- [x] 1.2 Adaugă coloanele `cost_ron`, `cost_source` la `charging_sessions`
- [x] 1.3 Adaugă politici RLS pentru `documents` și `energy_costs`
- [ ] 1.4 Creează bucket Supabase Storage `documents` (private, max 10MB per fișier) — **manual în dashboard**
- [ ] 1.5 Rulează migrarea în Supabase și verifică schema — **manual în dashboard**
- [x] 1.6 Adaugă tipurile TypeScript pentru noile tabele în `src/types/costs.ts`

---

## Faza 2 — Integrare BNR Exchange Rate

- [x] 2.1 Creează `src/lib/external/bnr/client.ts`
- [x] 2.2 Implementează `parseBNRXml(xml: string): Record<string, number>`
- [x] 2.3 Implementează `getExchangeRate(currency, date)` cu cache în `exchange_rates`
- [x] 2.4 Adaugă fallback la ziua anterioară (weekenduri și sărbători BNR)
- [x] 2.5 Creează `src/lib/external/bnr/types.ts`
- [ ] 2.6 Test manual: verifică că EUR→RON returnează valoare rezonabilă — **post-deploy**

---

## Faza 3 — Parser AI cu Claude

- [x] 3.1 Adaugă `@anthropic-ai/sdk` la dependențe
- [x] 3.2 Creează `src/lib/ai/prompts/document-extraction.ts`
- [x] 3.3 Creează `src/lib/ai/document-parser.ts`
  - [x] 3.3a Download fișier din Supabase Storage
  - [x] 3.3b Conversie la base64
  - [x] 3.3c Apel Claude multimodal (image + document/PDF)
  - [x] 3.3d Parsare și validare JSON output cu Zod
  - [x] 3.3e Returnează `ParsedDocument` tipizat
- [x] 3.4 Creează `src/lib/costs/types.ts`
- [x] 3.5 Adaugă `ANTHROPIC_API_KEY` la `.env.local.example`
- [ ] 3.6 Test manual cu o imagine de bon și un PDF de factură — **post-deploy**

---

## Faza 4 — Attribution + Session Matching

- [x] 4.1 Creează `src/lib/costs/attribution.ts`
  - [x] 4.1a `attributeHomeBill()` — calculează fracția auto
  - [x] 4.1b Sesiunile acasă = `charging_sessions` cu `network IS NULL`
- [x] 4.2 Creează `src/lib/costs/session-matcher.ts`
  - [x] 4.2a `matchChargingSession()` — sesiunea cea mai apropiată ±15 min
  - [x] 4.2b Returnează `{ sessionId, deltaMinutes }` sau `null`
- [x] 4.3 Creează `src/lib/costs/processor.ts`
  - [x] 4.3a–h Pipeline complet: parse → conversie → attribution/matching → insert → status

---

## Faza 5 — API Routes

- [x] 5.1 Creează `src/app/api/documents/route.ts` (GET + POST upload)
- [x] 5.2 Creează `src/app/api/documents/[documentId]/route.ts` (GET + PATCH)
- [x] 5.3 Creează `src/app/api/costs/route.ts` (GET agregare)
- [x] 5.4 Validare Zod la fiecare route
- [x] 5.5 Auth check + ownership vehicul la fiecare route

---

## Faza 6 — Hooks TanStack Query

- [x] 6.1 Creează `src/hooks/useDocuments.ts`
  - [x] 6.1a `useDocuments(vehicleId)` cu polling 3s
  - [x] 6.1b `useUploadDocument()` mutation
  - [x] 6.1c `useEditDocument()` mutation
- [x] 6.2 Creează `src/hooks/useCosts.ts`

---

## Faza 7 — UI: Costs page + componente

- [x] 7.1 Creează `src/app/(dashboard)/costs/page.tsx`
- [x] 7.2 Creează `src/app/(dashboard)/costs/costs-client.tsx`
- [x] 7.3 Creează `src/components/costs/DocumentUploadZone.tsx`
  - [x] 7.3a–d Drag-and-drop, preview, progress, validare
- [x] 7.4 Creează `src/components/costs/DocumentStatusCard.tsx`
  - [x] 7.4a–c Toate stările + editare inline
- [x] 7.5 Creează `src/components/costs/CostDashboard.tsx`
  - [x] 7.5a CostPerKmCard
  - [x] 7.5b HomeSplitCard
  - [x] 7.5c MonthlyCostChart
  - [x] 7.5d FuelComparisonCard
- [x] 7.6 Adaugă **Costs** în sidebar cu icon Receipt

---

## Faza 8 — Email inbound

- [x] 8.1 Creează `src/app/api/documents/inbound-email/route.ts`
  - [x] Compatible Mailgun + SendGrid multipart
  - [x] Identificare vehicul prin adresă `flux+<vehicleId>@domain` sau subject nickname
  - [x] Fire-and-forget procesare după ingestie
- [x] 8.2 Adaugă `EMAIL_WEBHOOK_SECRET` + `NEXT_PUBLIC_APP_URL` la `.env.local.example`
- [x] 8.3 Afișează adresa email per vehicul în pagina Costs
- [ ] 8.4 Configurare provider email — **manual de utilizator**

---

## Pași manuali rămași (în Supabase dashboard)

1. **SQL Editor** → paste + run `supabase/006_cost_intelligence.sql`
2. **Storage** → New bucket: Name=`documents`, Public=OFF
3. **Vercel** → Environment Variables: `ANTHROPIC_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`
