# Design — Cost Intelligence

## Arhitectura generală

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER                                     │
│                                                                     │
│  /costs?v=<vehicleId>                                               │
│  ├── DropzoneUpload (imagine / PDF, max 10MB)                       │
│  ├── DocumentList (status cards cu preview)                         │
│  └── CostDashboard (KPI-uri + grafice)                              │
└────────────────────────┬────────────────────────────────────────────┘
                         │ POST multipart/form-data
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js API Routes (Vercel serverless)                             │
│                                                                     │
│  POST /api/documents/upload                                         │
│    1. Validează fișier (tip MIME, dimensiune)                       │
│    2. Upload la Supabase Storage (bucket: documents, private)       │
│    3. Insert rând în documents (status: pending)                    │
│    4. Apelează processDocument() async (fără await — fire & forget) │
│    5. Returnează { documentId, status: "pending" }                  │
│                                                                     │
│  GET /api/documents?vehicleId=                                      │
│    Returnează lista documentelor cu status + parsed preview         │
│                                                                     │
│  PATCH /api/documents/:id                                           │
│    Corecție manuală a câmpurilor (utilizatorul editează)            │
│                                                                     │
│  GET /api/costs?vehicleId=&from=&to=                                │
│    Agregare costuri pentru dashboard                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
    ┌───────────────────┐ ┌──────────────────────┐
    │  Claude API       │ │  BNR Exchange Rate   │
    │  (Anthropic SDK)  │ │  nbrfxrates.xml       │
    │                   │ │  cacheat în DB        │
    │  claude-opus-4-7  │ └──────────────────────┘
    │  multimodal       │
    │  tool_use / JSON  │
    └───────────────────┘
                │
                ▼
    ┌───────────────────────────────┐
    │  Supabase                     │
    │  ├── documents                │
    │  ├── energy_costs             │
    │  ├── exchange_rates           │
    │  └── charging_sessions        │
    │      (actualizat cu cost_ron) │
    └───────────────────────────────┘
```

## Schema bază de date

### Tabel `documents`

```sql
create table documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  vehicle_id        uuid references vehicles(id) on delete set null,
  source            text not null check (source in ('upload', 'email')),
  document_type     text check (document_type in ('home_bill', 'public_receipt', 'unknown')),
  storage_path      text not null,                -- Supabase Storage path
  mime_type         text not null,
  original_filename text,
  parsed_json       jsonb,                        -- output brut Claude
  status            text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'error', 'needs_review')),
  error_message     text,
  confidence        numeric(4,3),                 -- 0.000 – 1.000, medie câmpuri
  created_at        timestamptz not null default now(),
  processed_at      timestamptz
);

alter table documents enable row level security;
create policy "Users see own documents" on documents
  for all using (user_id = auth.uid());
```

### Tabel `energy_costs`

```sql
create table energy_costs (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references documents(id) on delete cascade,
  vehicle_id            uuid not null references vehicles(id) on delete cascade,
  document_type         text not null check (document_type in ('home_bill', 'public_receipt')),

  -- Perioadă
  period_start          date not null,
  period_end            date not null,

  -- Cantitate
  total_kwh             numeric(10,3),            -- din factură / bon
  vehicle_kwh_attributed numeric(10,3),           -- calculat (home_bill) sau direct (receipt)

  -- Cost în moneda originală
  original_amount       numeric(10,2) not null,
  original_currency     text not null default 'RON',
  exchange_rate         numeric(10,6) default 1,  -- față de RON la data documentului

  -- Cost în RON
  cost_ron              numeric(10,2) not null,

  -- Sursă / locație
  provider_name         text,                     -- E.ON, ENGIE, Renovatio, Ionity...
  charger_network       text,                     -- doar pentru public_receipt
  location_lat          numeric(9,6),
  location_lng          numeric(9,6),

  -- Link cu sesiunea de încărcare (doar public_receipt)
  charging_session_id   uuid references charging_sessions(id) on delete set null,

  -- Metadata
  is_manually_edited    boolean not null default false,
  created_at            timestamptz not null default now()
);

alter table energy_costs enable row level security;
create policy "Users see own energy costs" on energy_costs
  using (vehicle_id in (
    select id from vehicles where user_id = auth.uid()
  ));
```

### Tabel `exchange_rates`

```sql
create table exchange_rates (
  rate_date     date not null,
  currency      text not null,                    -- ISO 4217: EUR, GBP, USD, HUF...
  rate_to_ron   numeric(12,6) not null,
  primary key (rate_date, currency)
);
-- RLS nu e necesar; date publice BNR
```

### Modificare `charging_sessions`

```sql
-- Adaugă cost_ron (înlocuiește / completează cost_eur existent)
alter table charging_sessions
  add column if not exists cost_ron numeric(8,2),
  add column if not exists cost_source text
    check (cost_source in ('document', 'tariff_estimate', 'manual'));
```

## Fișiere noi și structură

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── costs/
│   │       ├── page.tsx                 -- Server component, fetch inițial documente
│   │       └── costs-client.tsx         -- Client component cu upload + dashboard
│   └── api/
│       ├── documents/
│       │   ├── route.ts                 -- GET lista, POST upload
│       │   └── [documentId]/
│       │       └── route.ts             -- GET detaliu, PATCH editare manuală
│       └── costs/
│           └── route.ts                 -- GET agregare pentru dashboard
├── components/
│   └── costs/
│       ├── DocumentUploadZone.tsx       -- Dropzone + preview imagine
│       ├── DocumentStatusCard.tsx       -- Card per document cu status + date extrase
│       ├── CostDashboard.tsx            -- KPI-uri + grafice
│       ├── CostPerKmCard.tsx
│       ├── MonthlyCostChart.tsx
│       └── FuelComparisonCard.tsx
├── lib/
│   ├── ai/
│   │   ├── document-parser.ts           -- parseDocument(storagePath, mimeType) → ParsedDocument
│   │   └── prompts/
│   │       └── document-extraction.ts   -- Prompt-ul Claude + schema JSON output
│   ├── external/
│   │   └── bnr/
│   │       ├── client.ts                -- fetchRates(date) → Record<string, number>
│   │       └── types.ts
│   └── costs/
│       ├── attribution.ts               -- Home bill attribution logic
│       ├── session-matcher.ts           -- Match receipt → charging_session
│       └── types.ts                     -- ParsedDocument, ExtractedCost, etc.
└── hooks/
    ├── useDocuments.ts                  -- TanStack Query: lista documente per vehicul
    └── useCosts.ts                      -- TanStack Query: agregare costuri
```

## Pipeline de procesare

### 1. Upload și stocare

```
POST /api/documents/upload
  body: FormData { file: File, vehicleId: string }

  → Validare Zod: vehicleId UUID, file.size ≤ 10MB, 
      file.type in [image/jpeg, image/png, image/webp, application/pdf]
  → supabase.storage.from("documents").upload(path, buffer)
      path = `${userId}/${vehicleId}/${uuid}.${ext}`
  → insert documents { status: "pending", storage_path, mime_type, vehicle_id }
  → processDocument(documentId) — fără await, rulează în background
  → return { id: documentId, status: "pending" }
```

### 2. Parsare Claude

```typescript
// src/lib/ai/document-parser.ts

async function parseDocument(doc: Document): Promise<ParsedDocument> {
  // 1. Descarcă fișierul din Supabase Storage
  const { data } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  
  // 2. Pregătește conținut pentru Claude
  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
  const mediaType = doc.mime_type; // image/jpeg sau application/pdf
  
  // 3. Apelează Claude multimodal
  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        {
          type: mediaType === "application/pdf" ? "document" : "image",
          source: { type: "base64", media_type: mediaType, data: base64 }
        },
        { type: "text", text: DOCUMENT_EXTRACTION_PROMPT }
      ]
    }]
  });
  
  // 4. Parsează JSON din răspuns
  return extractJSON(response.content[0].text);
}
```

### 3. Prompt-ul de extragere

```
Ești un expert în facturi de energie electrică și bonuri de la stații de 
încărcare pentru vehicule electrice, cu specializare pe piața din România 
și Europa.

Analizează documentul și extrage informațiile în formatul JSON de mai jos.
Dacă un câmp nu poate fi determinat cu certitudine, pune null și setează
confidence_<field> la 0.

{
  "document_type": "home_bill" | "public_receipt" | "unknown",
  "provider_name": string | null,        // E.ON, Enel, ENGIE, Ionity, Renovatio...
  "period_start": "YYYY-MM-DD" | null,   // data început perioadă facturare
  "period_end": "YYYY-MM-DD" | null,     // data sfârșit perioadă facturare
  "session_timestamp": "ISO8601" | null, // DOAR pentru bonuri publice — momentul sesiunii
  "total_kwh": number | null,
  "price_per_kwh": number | null,
  "cost_total": number | null,
  "currency": "RON" | "EUR" | "GBP" | "USD" | ...,
  "charger_network": string | null,      // Ionity, Renovatio, ENGIE Charging, Tesla SC...
  "location_name": string | null,        // numele stației / adresa
  "confidence": {                        // 0.0 – 1.0 per câmp
    "document_type": number,
    "total_kwh": number,
    "cost_total": number,
    "period_start": number,
    "session_timestamp": number
  }
}

Răspunde DOAR cu JSON valid, fără text suplimentar.
```

### 4. Atribuire și matching

```typescript
// Attribution pentru home_bill
async function attributeHomeBill(
  vehicleId: string,
  periodStart: Date,
  periodEnd: Date,
  totalKwh: number,
  costRon: number
): Promise<{ vehicleKwh: number; vehicleCostRon: number }> {
  
  const { data: sessions } = await supabase
    .from("charging_sessions")
    .select("energy_added_kwh")
    .eq("vehicle_id", vehicleId)
    .gte("started_at", periodStart.toISOString())
    .lte("started_at", periodEnd.toISOString())
    .is("network", null); // null = sesiune acasă
  
  const vehicleKwh = sessions?.reduce(
    (sum, s) => sum + (s.energy_added_kwh ?? 0), 0
  ) ?? 0;
  
  const fraction = totalKwh > 0 ? vehicleKwh / totalKwh : 0;
  return { vehicleKwh, vehicleCostRon: costRon * fraction };
}

// Matching pentru public_receipt
async function matchChargingSession(
  vehicleId: string,
  timestamp: Date,
  toleranceMinutes = 15
): Promise<string | null> {
  
  const { data } = await supabase
    .from("charging_sessions")
    .select("id, started_at")
    .eq("vehicle_id", vehicleId)
    .gte("started_at", subMinutes(timestamp, toleranceMinutes).toISOString())
    .lte("started_at", addMinutes(timestamp, toleranceMinutes).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  
  return data?.id ?? null;
}
```

### 5. Conversie BNR

```typescript
// src/lib/external/bnr/client.ts

const BNR_URL = "https://www.bnr.ro/nbrfxrates.xml";

async function getExchangeRate(
  currency: string,
  date: Date
): Promise<number> {
  if (currency === "RON") return 1;
  
  const dateStr = format(date, "yyyy-MM-dd");
  
  // Cache în DB
  const { data: cached } = await supabase
    .from("exchange_rates")
    .select("rate_to_ron")
    .eq("rate_date", dateStr)
    .eq("currency", currency)
    .single();
  
  if (cached) return cached.rate_to_ron;
  
  // Fetch BNR (cu retry la ziua anterioară dacă weekenduri/sărbători)
  const xml = await fetch(BNR_URL).then(r => r.text());
  const rates = parseBNRXml(xml); // parse XML → Record<string, number>
  
  const rate = rates[currency];
  if (!rate) throw new Error(`Currency ${currency} not in BNR rates`);
  
  await supabase.from("exchange_rates").upsert({ rate_date: dateStr, currency, rate_to_ron: rate });
  return rate;
}
```

## UI — Costs page

```
/costs?v=<vehicleId>

┌────────────────────────────────────────────────────────────────┐
│  Costs — Aurora (Polestar 2)                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────── Upload document ─────────────────────────┐ │
│  │                                                          │ │
│  │    📄  Trage factura sau bonul aici                      │ │
│  │        sau apasă să selectezi fișierul                   │ │
│  │        (JPG, PNG, PDF — max 10 MB)                       │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─── Cost per km ───┐  ┌─── Split ────┐  ┌─── Luna aceasta ─┐ │
│  │  0.19 lei/km      │  │ 78% acasă    │  │  47.30 lei       │ │
│  │  acasă            │  │ 22% public   │  │  +12% vs avg     │ │
│  │  0.84 lei/km      │  │──────────────│  │                  │ │
│  │  public           │  │ ████████░░   │  │                  │ │
│  └───────────────────┘  └──────────────┘  └──────────────────┘ │
│                                                                │
│  ── Documente procesate ────────────────────────────────────── │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ✓ Factura E.ON — mai 2026        47.30 lei  87 kWh     │  │
│  │   Perioadă: 1–31 mai · Atribuit auto: 24.8 kWh          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ✓ Ionity — 14 mai 2026           23.50 lei  28.4 kWh   │  │
│  │   Stație: Ionity A1 Km 132 · Sesiune găsită ✓           │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ⟳ Procesare...                  Factura_CEZ_apr.pdf     │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Polling procesare (fără WebSocket)

Clientul face polling la `GET /api/documents?vehicleId=` la fiecare 3 secunde când există documente cu `status: "pending" | "processing"`. TanStack Query `refetchInterval`:

```typescript
useQuery({
  queryKey: ["documents", vehicleId],
  queryFn: () => apiFetch(`/api/documents?vehicleId=${vehicleId}`),
  refetchInterval: (query) => {
    const hasPending = query.state.data?.some(
      d => d.status === "pending" || d.status === "processing"
    );
    return hasPending ? 3000 : false;
  }
})
```

## Variabile de mediu noi

```
ANTHROPIC_API_KEY=          # deja există sau se adaugă
SUPABASE_STORAGE_BUCKET_DOCUMENTS=documents
```

## Decizii de design

| Decizie | Alegere | Motiv |
|---------|---------|-------|
| Model AI | claude-opus-4-7 | Acuratețe maximă la parsarea documentelor; costul e neglijabil (<<$0.05/doc) |
| Storage documente | Supabase Storage (private bucket) | Evită dependență nouă; RLS garantează că user-ul vede doar propriile doc-uri |
| Procesare async | Fire-and-forget în API route | Vercel timeout 60s; parsarea Claude + BNR + DB durează 5–15s |
| Polling vs webhook | Polling 3s | Simplu, fără infra extra; se dezactivează când nu sunt doc pending |
| Email v1 | Nu în scope | Necesită serviciu plătit; upload e suficient pentru validare produs |
| Monedă afișaj | Mereu RON | Simplitate; originalul e stocat pentru audit |
| Attribution model | kWh proporțional | Cea mai corectă estimare fără smart meter; îmbunătățit când avem telemetrie reală |
