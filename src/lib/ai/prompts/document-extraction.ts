export const DOCUMENT_EXTRACTION_PROMPT = `Ești un expert în facturi de energie electrică și bonuri de la stații de încărcare pentru vehicule electrice, cu specializare pe piața din România și Europa de Est (E.ON, Enel, CEZ, Electrica, ENGIE, Renovatio, Ionity, Tesla Supercharger, etc.).

Analizează documentul atașat (imagine sau PDF) și extrage informațiile structurate în formatul JSON de mai jos.

Reguli stricte:
- Dacă un câmp nu poate fi determinat cu certitudine din document, pune null
- "home_bill" = factură de energie electrică de la furnizor de curent acasă (E.ON, Enel, CEZ, Electrica, ENGIE Energie etc.)
- "public_receipt" = bon/chitanță de la o stație de încărcare publică (Ionity, Tesla SC, Renovatio, ENGIE Charging, Kaufland, OMV etc.)
- period_start și period_end sunt pentru facturi acasă (intervalul facturat)
- session_timestamp este DOAR pentru bonuri publice — momentul exact al sesiunii de încărcare
- Moneda: identifică moneda din simbol (lei/RON, €/EUR, £/GBP, $, HUF etc.)
- total_kwh = energia electrică totală din document (kWh, kW·h, kWh-uri)
- cost_total = suma totală de plată din document (cu TVA inclus)

Răspunde EXCLUSIV cu JSON valid, fără text suplimentar, fără markdown, fără \`\`\`:

{
  "document_type": "home_bill" | "public_receipt" | "unknown",
  "provider_name": string | null,
  "period_start": "YYYY-MM-DD" | null,
  "period_end": "YYYY-MM-DD" | null,
  "session_timestamp": "ISO8601" | null,
  "total_kwh": number | null,
  "price_per_kwh": number | null,
  "cost_total": number | null,
  "currency": "RON" | "EUR" | "GBP" | "USD" | "HUF" | "PLN" | "CZK",
  "charger_network": string | null,
  "location_name": string | null,
  "confidence": {
    "document_type": number,
    "total_kwh": number,
    "cost_total": number,
    "period_start": number,
    "session_timestamp": number
  }
}`;

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export function isSupportedMimeType(mime: string): mime is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mime);
}
