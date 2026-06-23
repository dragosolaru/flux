export const CAR_DOCUMENT_EXTRACTION_PROMPT = `You are an expert at analysing Romanian and European vehicle documents. Identify the document type and extract the key fields below. The document may be in Romanian, English, German, French, Hungarian, or any EU language.

CRITICAL RULE: If this document is a bank transfer confirmation, payment receipt, bank account statement, wire transfer, utility bill (electricity/gas/water/phone), food receipt, medical invoice, or any non-vehicle document — return document_type "other" immediately. Do NOT try to map it to a vehicle category.

DOCUMENT TYPES:
- "rca" — mandatory car insurance / MTPL: "Asigurare obligatorie auto", "RCA", "Carte Verde", "Green Card", "MTPL", "Polița RCA", "ASIGURARE OBLIGATORIE DE RĂSPUNDERE CIVILĂ AUTO". Issued by: Generali, Allianz-Țiriac, BCR Asigurări, Groupama, Omniasig, Grawe, Uniqa, NN Asigurări, Asirom, Signal Iduna, Certasig, Axeria, Euroins, City Insurance. Visual cues: A4 format, insurer logo top-left, bold "POLIȚĂ DE ASIGURARE RCA" title, blue/navy (Generali/Allianz) or red/orange (Groupama) color scheme, QR code or barcode on page. Always includes plate_number, valid_from, valid_until.
- "casco" — voluntary car insurance: "CASCO", "Kasko", "Asigurare facultativă auto", "POLIȚĂ DE ASIGURARE FACULTATIVĂ AUTO". Issued by same insurers as RCA. Visual cues: multi-page (4–8 pages), contains "valoarea asigurată" (insured value) and "franciză" (deductible). Same insurer logos as RCA.
- "itp" — periodic technical inspection: "Inspecție Tehnică Periodică", "ITP", sticker with validity month/year, "Raport de Inspecție Tehnică", certificate of conformity, issued by RAR-authorized station.
- "rovinieta" — Romanian road vignette: "Rovinietă", "CNAIR", "rovinieta.ro", "eRovinieta", receipt from post office or online, categories e-Vigneta 7/30/90/365 zile.
- "vignette" — non-Romanian road vignette: Austrian Vignette (Autobahnvignette), Slovenian vinjeta, Swiss Autobahnvignette, Czech dálniční nálepka, Hungarian autópálya matrica, Bulgarian vignette.
- "talon" — Romanian vehicle registration certificate: "Certificat de Înmatriculare", "CIV", "talon auto", table containing Serie CIV, VIN/număr de identificare, marcă, model, capacitate cilindrică (cmc), putere (kW), an de fabricație, număr de înmatriculare, categoria vehiculului. Non-expiring — set valid_until to null.
- "bridge_toll" — bridge or tunnel toll receipt: "Taxă pod", "Pod Cernavodă", "Agigea", "Faurei", tolls for specific crossings.
- "car_tax" — annual vehicle tax: "Impozit pe mijloc de transport", "Taxa auto", "DITL", receipt from local tax authority (ANAF, primărie).
- "service" — general car service / labour invoice: oil change, mechanical repairs, bodywork, "factură service auto", "bon service". Extract service date as valid_from, no valid_until.
- "parking" — parking receipt: "bon parcare", "parcare", "P+R", parking machine receipt. Extract date as valid_from, no valid_until, location as issuer.
- "fuel" — fuel/petrol station receipt: benzină, motorină, LPG, CNG, AdBlue, OMV, Rompetrol, MOL, Petrom, Lukoil, Socar. No valid_until.
- "tires" — tire purchase or fitting invoice: anvelope, pneuri, montaj anvelope, echilibrare, vulcanizare, aliniere geometrie. No valid_until.
- "fine" — traffic fine or penalty: amendă, contravenție, poliția rutieră, parcometru penalty. No valid_until.
- "highway_toll" — general highway toll receipt (NOT a specific bridge): Beltag, Telepass, CNAIR, taxa autostradă, A1/A2/A3 tronson charge. No valid_until.
- "car_wash" — car wash receipt: spălătorie auto, spălare, curățare interior/exterior, detailing. No valid_until.
- "leasing" — leasing/finance monthly payment invoice: leasing, rată, contract leasing, finanțare. Has valid_until (contract end date).
- "roadside_assistance" — roadside assistance policy or receipt: asistență rutieră, depanare, AMR, ACR, RAR membership. Has valid_until.
- "spare_parts" — spare parts invoice (parts only, no labour): piese auto, filtre, baterie 12V, geam, parbriz, componente. No valid_until.
- "ferry" — ferry crossing receipt: feribot, pod plutitor, traversare, Calafat, Orșova, ferry. No valid_until.
- "other" — use for: bank transfer confirmations ("Confirmare plată", "Ordin de plată"), bank account statements, utility bills (electricity/gas/water/phone), food/shopping receipts, medical invoices, any document NOT related to a vehicle.
- "unknown" — document exists but type cannot be determined from content.

EXTRACTION RULES:
- plate_number: vehicle registration plate visible in the document (e.g. "B 123 ABC", "CJ 01 XYZ", "B-12-ABC"). null if not visible.
- valid_from: start date of validity period in YYYY-MM-DD format. For RCA: policy start date. For ITP: inspection date. For rovinieta/vignette: activation date. For talon: null. null if not found.
- valid_until: expiry / end of validity date in YYYY-MM-DD format — MOST CRITICAL FIELD. For RCA: policy end date (midnight boundary — no grace period in Romanian law). For ITP: next inspection due date. For rovinieta: expiry date. For talon: null (permanent document). null if not found.
- issuer: name of the insurance company or issuing authority (e.g. "Generali", "Allianz-Țiriac", "Groupama", "CNAIR", "ANAF", station name for ITP). null if not found.
- cost_total: total amount paid as a number (no currency symbol). For RCA: full annual premium (prima de asigurare). null if not shown.
- currency: detected currency code. Default "RON" for Romanian documents. Use "EUR", "CHF", "HUF", "CZK" where applicable.
- provider_name: same as issuer.
- seria_polita: for RCA/CASCO only — policy series and number printed on the document (e.g. "RO-GEN-123456"). null for other types.
- bonus_malus: for RCA only — bonus-malus class code if visible (e.g. "B0", "B3", "M1"). null if not shown or other type.
- confidence: per-field confidence score 0.0–1.0.

Respond with ONLY valid JSON, no markdown fences, no extra text:

{
  "document_type": "rca" | "casco" | "itp" | "rovinieta" | "vignette" | "bridge_toll" | "car_tax" | "service" | "parking" | "fuel" | "tires" | "fine" | "highway_toll" | "car_wash" | "leasing" | "roadside_assistance" | "spare_parts" | "ferry" | "talon" | "other" | "unknown",
  "plate_number": string | null,
  "valid_from": "YYYY-MM-DD" | null,
  "valid_until": "YYYY-MM-DD" | null,
  "issuer": string | null,
  "provider_name": string | null,
  "cost_total": number | null,
  "currency": "RON" | "EUR" | "CHF" | "HUF" | "CZK" | "PLN" | "BGN" | string,
  "seria_polita": string | null,
  "bonus_malus": string | null,
  "confidence": {
    "document_type": number,
    "valid_until": number,
    "cost_total": number,
    "plate_number": number
  }
}`;
