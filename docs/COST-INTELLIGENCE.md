# COST INTELLIGENCE — Document Parsing & Energy Cost Tracking

> AI-powered ingestion of energy bills and charger receipts. Claude Vision parses uploaded or emailed documents, extracts cost data, and attributes it to the correct vehicle.

Source: `src/lib/costs/`, `src/lib/ai/`, `src/lib/external/bnr/`, `src/app/api/documents/`, `src/app/api/costs/`

---

## Overview

| Feature | Description |
|---|---|
| Input | JPG, PNG, WebP, GIF, PDF — up to 10 MB |
| Ingest channels | File upload (app + vault), inbound email, inbound WhatsApp |
| Parsing | Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Currency conversion | BNR (Banca Națională a României) XML API |

---

## Document lifecycle

```
upload / email / whatsapp
      │
      ▼
 documents table: status = "pending"
      │
      ▼ (async, via Next.js after())
 processDocument(id)
      │
      ├─ status = "processing"
      │
      ├─ pass 1: parseDocument()  →  Claude (energy prompt)  →  ParsedDocument JSON
      │
      ├─ if document_type is a car-doc type (rca/casco/itp/…):
      │     pass 2: parseCarDocument()  →  Claude (car prompt)
      │             → insert vehicle_doc_meta row → done | needs_review  (returns; no energy_costs)
      │
      ├─ if document_type is gas_bill / petrol_receipt / other:
      │     status = "needs_review"  (returns; no energy_costs)
      │
      ├─ getExchangeRate()  →  convert to RON
      │
      ├─ home_bill      →  attributeHomeBill()    →  vehicle's share
      │   public_receipt →  matchChargingSession() →  link + write cost back to session
      │
      ├─ insert energy_costs row (only if vehicle_id set and type != "unknown")
      │
      └─ status = "done" | "needs_review" | "error"
```

`processDocument` runs a **two-pass** flow: the energy prompt classifies and extracts first; if it
detects a car-document type, the document is re-parsed with the dedicated car prompt and stored in
`vehicle_doc_meta` instead of `energy_costs`.

Confidence: a document is flagged `needs_review` when
`min(confidence.cost_total, confidence.document_type) < 0.7` (energy docs) or when its average
confidence `< 0.7` (car docs).

Constant: `CONFIDENCE_THRESHOLD = 0.7` in `src/lib/costs/processor.ts`

---

## Document types

The classifier recognizes a wide set of types (see `DocumentType` in `src/types/costs.ts`):
energy docs (`home_bill`, `public_receipt`), other-fuel docs (`gas_bill`, `petrol_receipt`),
and a large group of **car documents** (`rca`, `casco`, `itp`, `rovinieta`, `vignette`,
`bridge_toll`, `car_tax`, `service`, `parking`, `fuel`, `tires`, `fine`, `highway_toll`,
`car_wash`, `leasing`, `roadside_assistance`, `spare_parts`, `ferry`, `talon`), plus
`other` and `unknown`.

Only the two energy types create `energy_costs` rows. Car-document types go to
`vehicle_doc_meta` (the document vault); everything else is stored on the `documents` row and
flagged `needs_review`.

### home_bill

Romanian electricity bill (E.ON, Electrica, CEZ, etc.).

- Provider name, billing period (month range), total kWh, total cost
- Attribution (`attributeHomeBill` in `src/lib/costs/attribution.ts`): compare the vehicle's home
  charging sessions (`network IS NULL`) in the billing period against the total bill kWh
  - `fraction = min(vehicleKwh / billTotalKwh, 1)`
  - `vehicleCostRon = billCostRon × fraction`
  - If no charging sessions found in period: store the full bill cost and `vehicle_kwh_attributed =
    total_kwh` (flagged `needs_review` only if confidence is low)
- If `period_start`/`period_end` are missing, the period defaults to the last
  `HOME_BILL_DEFAULT_PERIOD_DAYS = 30` days (`src/lib/costs/constants.ts`)

### public_receipt

Public charger receipt (Ionity, Tesla Supercharger, Renovatio, etc.).

- Charger network, session timestamp, kWh delivered, cost
- Session matching (`matchChargingSession` in `src/lib/costs/session-matcher.ts`): find the
  `charging_sessions` row within ±15 minutes of the receipt's timestamp; on a match, write
  `cost_ron` + `cost_source = "document"` back to that session
- Constant: `toleranceMinutes = 15` (default parameter in `session-matcher.ts`)

---

## Parsing pipeline

File: `src/lib/ai/document-parser.ts` (model `claude-sonnet-4-6`, `max_tokens: 1024`)

1. Download document from Supabase Storage (`documents` bucket)
2. Encode as base64; PDFs sent as a `document` block, images as an `image` block
3. Build the Claude message: file block + extraction prompt
4. Strip markdown fences from the response (Claude sometimes wraps JSON in ` ```json `)
5. Parse JSON, validate with Zod (`ParsedDocumentSchema` / `CarDocSchema`)

Two entry points: `parseDocument` (energy prompt) and `parseCarDocument` (car prompt, normalized
back into the `ParsedDocument` shape).

### Prompts

Files in `src/lib/ai/prompts/`:

- `document-extraction.ts` (`DOCUMENT_EXTRACTION_PROMPT`) — energy/classification prompt, used by `parseDocument`
- `car-document-extraction.ts` (`CAR_DOCUMENT_EXTRACTION_PROMPT`) — used by `parseCarDocument`
- `document-triage.ts` (`DOCUMENT_TRIAGE_PROMPT`) — a classify-only triage prompt that exists in
  the tree but is **not yet wired into `processDocument`** (the pipeline is two-pass today)

Prompts are written in Romanian (documents are typically Romanian). They instruct Claude to output
JSON with per-field confidence scores (0.0–1.0).

Energy output schema (`ParsedDocumentSchema`, abridged):

```ts
{
  document_type: DocumentType;        // full enum, see src/types/costs.ts
  has_non_electricity_items: boolean; // true for combined gas+electricity bills, etc.
  provider_name: string | null;
  period_start: string | null;        // ISO date YYYY-MM-DD
  period_end: string | null;
  session_timestamp: string | null;   // ISO datetime for receipts
  total_kwh: number | null;
  price_per_kwh: number | null;
  electricity_cost: number | null;    // electricity-only subtotal; preferred over cost_total
  cost_total: number | null;
  currency: string;                   // default "RON"
  charger_network: string | null;
  location_name: string | null;
  // car-doc fields (populated by parseCarDocument): plate_number, valid_from, valid_until, issuer
  confidence: {
    document_type: number;
    total_kwh: number;
    cost_total: number;
    period_start: number;
    session_timestamp: number;
    valid_until?: number;
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

Webhook URL: `POST /api/documents/inbound-email` — authenticated via the `x-webhook-secret: <EMAIL_WEBHOOK_SECRET>` HTTP header (the old `?secret=` query param was removed; fails closed with 503 if the env var is unset).

### Addressing model

Each vehicle has its own auto-generated inbound address. Format:

```
{cloudmailin-local}+{vehicleShortId}@{cloudmailin-domain}
```

`vehicleShortId` = first 8 hex chars of the vehicle UUID. Example:
`2b31b9c101b11f6682f3+f793064e@cloudmailin.net`

The address is generated by `src/lib/costs/vehicle-email.ts` and shown to the user in `/costs` with a copy button. **No mailbox is created** — Cloudmailin's plus-addressing feature forwards anything matching `2b31b9c101b11f6682f3+*@cloudmailin.net` to the same webhook.

### Vehicle identification (priority order in `resolveVehicle`)

1a. `+subaddress` matches a full vehicle UUID (legacy `flux+<full-uuid>@…` format) → that vehicle
1b. `+subaddress` matches a vehicle short ID (8 hex chars) → **primary path**, that vehicle
2. `+subaddress` matches a user's email local part (exact, no normalization) → user's first active vehicle
3. Sender email matches a registered user → user's first active vehicle

There is **no** subject-nickname fallback: scanning nicknames across users is a cross-tenant IDOR
(a spoofed sender could attribute a document to a victim's vehicle), so it was deliberately removed.

Unmatched mail lands in the fallback pool: documents go to `unmatched/` in Storage with
`user_id = '00000000-0000-0000-0000-000000000000'`, `vehicle_id = null`, and status
`needs_review`. The user can claim them via `POST /api/documents/recover` (matched by
`sender_email`).

### Supported providers

| Provider | Format | Notes |
|---|---|---|
| Cloudmailin | JSON or Multipart | Auto-detected by Content-Type (`application/json` → JSON parser, else multipart) |
| Mailgun | multipart/form-data | `attachment*` fields |
| SendGrid | multipart/form-data | Same field names |

---

## WhatsApp inbound

File: `src/app/api/documents/inbound-whatsapp/route.ts`

Webhook URL: `POST /api/documents/inbound-whatsapp` — a Twilio media webhook. Authenticated by
validating Twilio's `X-Twilio-Signature` (HMAC-SHA1 of the URL + sorted POST params, keyed by the
Twilio Auth Token) — not a static shared secret. Media is downloaded, filtered by supported MIME
type, stored, and queued through the same `processDocument` pipeline. Unmatched media lands in the
same fallback pool.

---

## Dashboard aggregation

File: `src/app/api/costs/route.ts`

| KPI | Formula |
|---|---|
| Total cost | Sum of `energy_costs.cost_ron` for vehicle |
| Home/public split | Filter by `document_type` |
| Cost per km (home) | `homeAttributedCostRon / totalKm` — home bills count only the vehicle's share (`cost_ron × vehicle_kwh_attributed / total_kwh`) |
| Cost per km (public) | `publicCostRon / totalKm` |
| Cost per km (blended) | `(homeAttributedCostRon + publicCostRon) / totalKm` |
| Petrol comparison | `(7.5 RON × 7 L/100km) / 100 × totalKm` |
| Monthly trend | Bucket by `period_start` (YYYY-MM), sorted ascending |

`totalKm` comes from `trips` in the same date window, preferring `distance_km` and falling back to
`end_odometer_km − start_odometer_km`.

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
| `source` | text | `upload` \| `email` \| `whatsapp` \| `vault-upload` \| `manual` |
| `document_type` | text | Set after parsing (see `DocumentType`) |
| `storage_path` | text | Path in Supabase Storage `documents` bucket |
| `mime_type` | text | |
| `original_filename` | text | |
| `sender_email` | text | Set for inbound email; used by the recover flow |
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
| `cost_ron` | numeric | Final cost in RON (vehicle's attributed share for home bills) |
| `provider_name` | text | From parsed document |
| `charger_network` | text | From parsed document (public receipts) |
| `location_name` | text | From parsed document |
| `charging_session_id` | uuid | Linked session (public receipts) |
| `is_manually_edited` | boolean | User overrode the parsed values |

### exchange_rates

Cache for BNR rates.

| Column | Notes |
|---|---|
| `rate_date` | Date of the rate (YYYY-MM-DD) |
| `currency` | ISO 4217 currency code |
| `rate_to_ron` | 1 unit of currency in RON |
