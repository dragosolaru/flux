# COST INTELLIGENCE — Document Parsing & Energy Cost Tracking

> AI-powered ingestion of energy bills and charger receipts. Claude Vision parses uploaded or emailed documents, extracts cost data, and attributes it to the correct vehicle.

Source: `src/lib/costs/`, `src/lib/ai/`, `src/lib/external/bnr/`, `src/app/api/documents/`

---

## Overview

| Feature | Description |
|---|---|
| Input | JPG, PNG, WebP, PDF — up to 10 MB |
| Ingest channels | File upload in app + email attachment |
| Parsing | Claude Vision (`claude-sonnet-4-6`) |
| Currency conversion | BNR (Banca Națională a României) XML API |
| Cost ~per document | $0.003–0.008 |

---

## Document lifecycle

```
upload / email
      │
      ▼
 documents table: status = "pending"
      │
      ▼ (fire-and-forget async)
 processDocument(id)
      │
      ├─ status = "processing"
      │
      ├─ parseDocument()  →  Claude Vision  →  ParsedDocument JSON
      │
      ├─ getExchangeRate()  →  convert to RON
      │
      ├─ home_bill  →  attributeHomeBill()  →  vehicle's share
      │   public_receipt  →  matchChargingSession()  →  link session
      │
      ├─ insert energy_costs row
      │
      └─ status = "done" | "needs_review" | "error"
```

Documents with `min(confidence.cost_total, confidence.document_type) < 0.7` get `needs_review`.

Constant: `CONFIDENCE_THRESHOLD = 0.7` in `src/lib/costs/processor.ts`

---

## Document types

### home_bill

Romanian electricity bill (E.ON, Electrica, CEZ, etc.).

- Provider name, billing period (month range), total kWh, total cost
- Attribution: compare vehicle's home charging sessions (`network IS NULL`) in the billing period against the total bill kWh
  - `fraction = vehicleKwh / billTotalKwh`
  - `vehicleCostRon = billCostRon × fraction`
  - If no charging sessions found in period: use full bill cost (flagged as `needs_review`)

### public_receipt

Public charger receipt (Electromob, Tesla SC, etc.).

- Charger network, session timestamp, kWh delivered, cost
- Session matching: find the `charging_sessions` row within ±15 minutes of the receipt's timestamp
- Constant: `toleranceMinutes = 15` in `src/lib/costs/session-matcher.ts`

---

## Parsing pipeline

File: `src/lib/ai/document-parser.ts`

1. Download document from Supabase Storage
2. Encode as base64
3. Build Claude message: document block + extraction prompt
4. Parse JSON response, validate with Zod schema
5. Strip markdown fences from response (Claude sometimes wraps JSON in ` ```json `)

### Prompt

File: `src/lib/ai/prompts/document-extraction.ts`

Written in Romanian (documents are typically Romanian). Instructs Claude to output JSON with confidence scores per field (0.0–1.0).

Output schema:

```ts
{
  document_type: "home_bill" | "public_receipt" | "unknown";
  provider_name: string | null;
  period_start: string | null;        // ISO date YYYY-MM-DD
  period_end: string | null;
  session_timestamp: string | null;   // ISO datetime for receipts
  total_kwh: number | null;
  price_per_kwh: number | null;
  cost_total: number | null;
  currency: string;                   // default "RON"
  charger_network: string | null;
  location_name: string | null;
  confidence: {
    document_type: number;
    total_kwh: number;
    cost_total: number;
    period_start: number;
    session_timestamp: number;
  };
}
```

---

## Currency conversion

File: `src/lib/external/bnr/client.ts`

- BNR publishes a daily XML at `https://www.bnr.ro/nbrfxrates.xml`
- Rates are cached in the `exchange_rates` Supabase table (by date + currency)
- Weekend/holiday fallback: tries up to `BNR_MAX_FALLBACK_DAYS = 5` previous days
- HTTP cache: `BNR_REVALIDATE_SECONDS = 3600`

---

## Email inbound

File: `src/app/api/documents/inbound-email/route.ts`

Webhook URL: `POST /api/documents/inbound-email?secret=<EMAIL_WEBHOOK_SECRET>`

### Vehicle identification (priority order)

1. `+subaddress` matches a vehicle short ID (8 hex chars) → that vehicle
2. `+subaddress` matches a user's email local part → user's first active vehicle
3. Sender email matches a registered user → user's first active vehicle
4. Subject contains a vehicle nickname → that vehicle

Per-user address (primary UX): `cloudmailinid+dragosandreiolaru@cloudmailin.net`  
Per-vehicle address (legacy): `cloudmailinid+f793064e@cloudmailin.net`

Unmatched documents go to `unmatched/` in Storage with `user_id = '00000000-…'` and `vehicle_id = null`. The user can claim them via `POST /api/documents/recover` (button in `/costs`).

### Supported providers

| Provider | Format | Notes |
|---|---|---|
| Cloudmailin | JSON or Multipart | Auto-detected by Content-Type |
| Mailgun | multipart/form-data | `attachment-1`, `attachment-2` fields |
| SendGrid | multipart/form-data | Same field names |

---

## Dashboard aggregation

File: `src/app/api/costs/route.ts`

| KPI | Formula |
|---|---|
| Total cost | Sum of `energy_costs.cost_ron` for vehicle |
| Home/public split | Filter by `document_type` |
| Cost per km (home) | `homeCostRon / totalKm` |
| Cost per km (blended) | `totalCostRon / totalKm` |
| Petrol comparison | `(7.5 RON × 7 L/100km) / 100 × totalKm` |
| Monthly trend | Bucket by `period_start` YYYY-MM |

Constants in `src/app/api/costs/route.ts`:
- `PETROL_PRICE_RON = 7.5`
- `PETROL_L_PER_100KM = 7`

---

## Database tables

### documents

Tracks every uploaded/emailed file.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → profiles |
| `vehicle_id` | uuid | FK → vehicles; null if unmatched |
| `source` | text | `upload` \| `email` |
| `storage_path` | text | Path in Supabase Storage `documents` bucket |
| `mime_type` | text | |
| `original_filename` | text | |
| `status` | text | `pending` → `processing` → `done` \| `needs_review` \| `error` |
| `parsed_json` | jsonb | Full `ParsedDocument` output from Claude |
| `confidence` | numeric | Average confidence score |
| `error_message` | text | Friendly error string on failure |
| `created_at` | timestamptz | |
| `processed_at` | timestamptz | Set when processing completes |

### energy_costs

One row per processed document (after attribution).

| Column | Type | Notes |
|---|---|---|
| `document_type` | text | `home_bill` \| `public_receipt` |
| `period_start` / `period_end` | date | Billing period or session date |
| `total_kwh` | numeric | From parsed document |
| `vehicle_kwh_attributed` | numeric | Vehicle's share (home bill only) |
| `original_amount` | numeric | Cost in original currency |
| `original_currency` | text | e.g. `RON`, `EUR` |
| `exchange_rate` | numeric | Rate to RON on document date |
| `cost_ron` | numeric | Final cost in RON |
| `charging_session_id` | uuid | Linked session (public receipts) |

### exchange_rates

Cache for BNR rates.

| Column | Notes |
|---|---|
| `rate_date` | Date of the rate (YYYY-MM-DD) |
| `currency` | ISO 4217 currency code |
| `rate_to_ron` | 1 unit of currency in RON |
