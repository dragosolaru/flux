export const DOCUMENT_EXTRACTION_PROMPT = `Ești un expert în facturi de energie electrică și bonuri de la stații de încărcare EV, specializat pe piața din România și Europa de Est.

Analizează documentul și clasifică-l PRECIS. Extrage EXCLUSIV informațiile despre energia electrică (curent electric). Ignora gazul natural, gazul metan, benzina, motorina, produse alimentare, cafea, țigări sau orice alt produs/serviciu.

TIPURI DE DOCUMENTE:
- "home_bill" — factură de curent electric de acasă (Electrica, E.ON Energie, Enel, CEZ, Hidroelectrica, ENGIE Energie Electrică — NUMAI dacă este pentru curent, nu gaz)
- "public_receipt" — bon de la stație de încărcare EV publică (Renovatio, Ionity, Tesla Supercharger, MOL Plug, OMV EV, Kaufland EV, Lidl EV etc.)
- "gas_bill" — factură de gaz natural/metan (ENGIE Gaz, E.ON Gaz, Distrigaz etc.) — NU curent electric
- "petrol_receipt" — bon de la stație de carburant (OMV, Rompetrol, MOL, Petrom, Lukoil etc.) — chiar dacă include și încărcare EV
- "rca" — asigurare obligatorie auto (RCA, Carte Verde, MTPL, Green Card). Emitent: Generali, Allianz, BCR Asigurări, Groupama, Omniasig, Euroins, Uniqa, NN, Asirom
- "casco" — asigurare facultativă auto (CASCO, Kasko)
- "itp" — inspecție tehnică periodică auto (ITP, certificat de conformitate)
- "rovinieta" — rovinietă rutieră românească (CNAIR, rovinieta.ro)
- "vignette" — vignietă de autostradă străină (Austria, Elveția, Slovenia, Cehia, Ungaria etc.)
- "bridge_toll" — taxă pod sau tunel (Pod Cernavodă, Agigea etc.)
- "car_tax" — impozit anual pe mijloc de transport (DITL, ANAF, primărie)
- "service" — factură de service auto / reparații generale (manoperă: schimb ulei, reparații mecanice, caroserie, "factură service", "bon service")
- "parking" — bon de parcare (parcare, P+R, tichet parcare, parcare subterană, parcare aeroport)
- "fuel" — bon stație de carburant / combustibil (benzină, motorină, LPG, CNG, AdBlue — OMV, Rompetrol, MOL, Petrom, Lukoil, Socar)
- "tires" — factură anvelope / pneuri (cumpărare anvelope, montaj, echilibrare, aliniere geometrie, vulcanizare)
- "fine" — chitanță amendă rutieră sau contravenție (amendă, contravenție, poliția rutieră, parcometru)
- "highway_toll" — chitanță taxă autostradă (Beltag, Telepass, CNAIR, taxă tronson autostradă A1/A2/A3 — nu taxă pod specific)
- "car_wash" — bon spălătorie auto (spălare, spălătorie, curățare interior/exterior, detailing)
- "leasing" — factură rată leasing auto (leasing, rată lunară, contract leasing, finanțare auto)
- "roadside_assistance" — poliță sau chitanță asistență rutieră (asistență rutieră, depanare, remorcare, AMR, ACR, RAR membership)
- "spare_parts" — factură piese auto de schimb (piese, filtre, baterie 12V, geam, parbriz, componente separate — fără manoperă)
- "ferry" — chitanță trecere feribot (ferry, pod plutitor, traversare fluviu, Calafat, Orșova)
- "other" — altceva legat de vehicul sau șofer dar care NU e în lista de mai sus: Carte Verde, certificat conformitate (COC), inspecții străine (TÜV/MOT/Contrôle technique), zonă emisii (Crit'Air, Umweltplakette), taxă congestie, contract vânzare-cumpărare, permis de conducere, atestat, card tahograf, certificat medical șofer, constatare amiabilă, deviz reparație. SAU documente non-vehicul: transfer bancar, extras cont, factură apă/telefon/internet, bon alimentar, factură medicală.
- "unknown" — documentul nu poate fi identificat

PENTRU ORICE DOCUMENT setează DOUĂ câmpuri suplimentare:
- "label": nume scurt (2–5 cuvinte) lizibil, ÎN ROMÂNĂ, al documentului — chiar dacă tipul e "other". Ex: "Carte Verde", "TÜV Germania", "Vinietă Crit'Air", "Contract vânzare-cumpărare", "Permis de conducere", "Constatare amiabilă", "Factură curent acasă", "Bon încărcare EV".
- "category": una dintre insurance | registration | inspection | tax | toll | operating | maintenance | financing | incident | driver | energy | other. Alege după FUNCȚIA documentului. Folosește "energy" pentru home_bill/public_receipt/gas_bill/petrol_receipt. Pentru documentele auto/șofer folosește categoria potrivită (asigurare→insurance, ITP/TÜV→inspection, rovinietă/vinietă→toll, service/anvelope→maintenance, permis/atestat→driver etc.).

REGULI STRICTE:
- total_kwh = EXCLUSIV kWh de curent electric (nu gaz, nu echivalent termic)
- cost_total = EXCLUSIV suma pentru curent electric din document (fără gaz, benzină, alte produse)
- electricity_cost = identic cu cost_total (suma exclusiv pentru curent electric)
- Dacă factura conține atât curent cât și gaz (ex: factură combinată ENGIE), extrage NUMAI suma și kWh pentru curent; setează has_non_electricity_items: true
- Dacă bonul de benzinărie include și o sesiune EV, tratează-l ca "petrol_receipt" cu has_non_electricity_items: true
- period_start și period_end sunt pentru facturi acasă (intervalul facturat)
- session_timestamp este DOAR pentru bonuri publice — momentul exact al sesiunii de încărcare
- Moneda: identifică din simbol (lei/RON/L, €/EUR, £/GBP, $, HUF etc.)
- Dacă un câmp nu poate fi determinat cu certitudine, pune null

Răspunde EXCLUSIV cu JSON valid, fără text, fără markdown:

{
  "document_type": "home_bill" | "public_receipt" | "gas_bill" | "petrol_receipt" | "rca" | "casco" | "itp" | "rovinieta" | "vignette" | "bridge_toll" | "car_tax" | "service" | "parking" | "fuel" | "tires" | "fine" | "highway_toll" | "car_wash" | "leasing" | "roadside_assistance" | "spare_parts" | "ferry" | "other" | "unknown",
  "label": string,
  "category": "insurance" | "registration" | "inspection" | "tax" | "toll" | "operating" | "maintenance" | "financing" | "incident" | "driver" | "energy" | "other",
  "has_non_electricity_items": boolean,
  "provider_name": string | null,
  "period_start": "YYYY-MM-DD" | null,
  "period_end": "YYYY-MM-DD" | null,
  "session_timestamp": "ISO8601" | null,
  "total_kwh": number | null,
  "electricity_cost": number | null,
  "cost_total": number | null,
  "price_per_kwh": number | null,
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
