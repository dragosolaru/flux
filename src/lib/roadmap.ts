// Where the project is, in one place.
//
// `docs/NEXT-STEPS.md` is the long form — the reasoning behind each item and
// what to actually do. This is the short form the debug panel renders, so the
// list is readable from a phone without opening the repo.
//
// Every item that can be checked against the running deployment IS, so the list
// cannot quietly go stale the way a hand-maintained checklist does. Items with
// no `check` are judgement calls and stay manual — those are the ones to review
// when something feels wrong.
//
// Grouped into gates rather than a flat list. A flat list makes "add the Stripe
// keys" and "the signing proxy is an open relay" look like peers, and they are
// not: one is a task, the other is the reason a partner account gets suspended.

export type Gate = 1 | 2 | 3;

export const GATES: Record<Gate, string> = {
  1: "Înainte să conectăm mașina altcuiva",
  2: "Înainte să plătească cineva",
  3: "Ce diferențiază de fapt produsul",
};

export interface Milestone {
  gate: Gate;
  /** What we are trying to reach. */
  goal: string;
  /** The single next action. Not a list — if it needs a list, it is two items. */
  nextStep: string;
  /**
   * What breaks if this is skipped. Present on everything that is not merely a
   * task, because "nice to have" and "the reason a customer leaves" look
   * identical on a checklist.
   */
  cost?: string;
  /**
   * Resolved against the debug route's config. Omit when the milestone cannot
   * be observed from the outside; it then reports as "manual".
   */
  check?: (c: Record<string, boolean | string>) => boolean;
}

export const GOAL = "Clienți reali care conduc cu Flux, cu Tesla lor conectată.";

export const ROADMAP: Milestone[] = [
  // ---- Gate 1 -------------------------------------------------------------
  {
    gate: 1,
    goal: "Date despre stații suficient de bune pentru un traseu real",
    nextStep:
      "Reimportă Franța cu gruparea per priză reparată, apoi rulează deduplicarea până raportează 0.",
    check: (c) => c.tomtomKey === true && c.openChargeMapKey === true,
  },
  {
    gate: 1,
    goal: "Tesla conectată și comenzile funcționează",
    nextStep: "Gata — cont partener înregistrat, proxy pornit, comenzi confirmate pe mașină.",
    check: (c) => c.teslaLive === true && c.teslaProxy === true,
  },
  {
    gate: 1,
    goal: "Proxy-ul de semnare refuză străinii (T10)",
    nextStep:
      "Un header cu secret comun verificat în Caddy înainte de reverse_proxy, setat pe container și ca TESLA_PROXY_SECRET în Vercel. Vreo douăzeci de linii.",
    cost:
      "E un releu deschis. Oricine găsește hostname-ul și are un token Tesla valid pentru un cont împerecheat poate pune cheia ta privată să semneze comenzi, pe cota ta. Contul tău de partener e cel pe care Tesla îl suspendă.",
  },
  {
    gate: 1,
    goal: "Cota Fleet API rezistă la mai mult de un utilizator (T6)",
    nextStep:
      "O limită globală în fetchVehicleData/sendVehicleCommand, plus un cache Redis de 20-30s pentru vehicle_data per mașină, ca taburile și rutele să împartă un singur apel.",
    cost:
      "Limitele sunt per utilizator; Tesla numără per cont de partener. Un singur dashboard deschis stă deja la plafonul lui, deci zece utilizatori pun aplicația la de zece ori cât permite Tesla — și ea limitează pe toată lumea deodată.",
  },
  {
    gate: 1,
    goal: "Arată ce mașini le taxează Tesla la tarif redus",
    nextStep:
      "fleet_status returnează deja discounted_device_data per VIN și îl apelăm deja din Verifică împerecherea — trebuie doar afișat. Un singur câmp.",
    cost:
      "Tesla taxează contul de partener per cerere, nu per mașină, deci urmărirea costurilor trebuie făcută per mașină și per volum de cereri. Ieftin de adăugat acum, ghiceală când sunt multe mașini. Vezi docs/SCALING-AND-COSTS.md.",
  },
  {
    gate: 1,
    goal: "Comenzile funcționează pe o mașină adormită (T3/T4)",
    nextStep:
      "Întâi GET /api/1/vehicles/{id} (ieftin, nu trezește); dacă nu e online, wake_up DIRECT — niciodată prin proxy — apoi verifici cu pauze de 2/4/8/15s și trimiți. Cod VEHICLE_ASLEEP distinct.",
    cost:
      "Mașinile dorm mai tot timpul, iar logurile arată deja vehicle_data 408 vehicle unavailable. Cam jumătate din comenzile reale eșuează fără nicio explicație.",
  },

  // ---- Gate 2 -------------------------------------------------------------
  {
    gate: 2,
    goal: "Costurile raportează suma corectă (C1-C5)",
    nextStep:
      "Întâi decide un singur înțeles pentru energy_costs.cost_ron, apoi repară toate patru împreună: atribuirea filtrează network IS NULL ca să găsească încărcarea ACASĂ, toată factura casei ajunge pe mașină când nu se potrivește nicio sesiune, /api/costs înmulțește a doua oară cu fracția de atribuire, iar perioada de facturare își pierde ultima zi. Va fi nevoie de o migrație pentru rândurile deja salvate.",
    cost:
      "Numărul pentru care există produsul e greșit și nimic nu semnalează asta. Oamenii nu reclamă — pur și simplu nu mai au încredere.",
  },
  {
    gate: 2,
    goal: "Limitele de abonament sunt aplicate",
    nextStep: "Gata — 5 documente de energie și 10 de mașină pe lună, restaurate în f408593.",
    check: () => true,
  },
  {
    gate: 2,
    goal: "Planurile plătite chiar pot fi cumpărate",
    nextStep: "Adaugă cheile Stripe de producție și cele două price ID-uri.",
    check: (c) => c.stripe === true,
  },
  {
    gate: 2,
    goal: "Un al doilea utilizator își poate verifica emailul",
    nextStep:
      "Un buton în Setări care apelează POST /api/account/verify-email și un banner cât timp profiles.email_verified_at e null. Are nevoie de RESEND_API_KEY și RESEND_FROM.",
    cost:
      "API-ul funcționează și nu-l apelează nimic. Tu ești exceptat prin ADMIN_EMAILS, deci primul utilizator real primește 403 EMAIL_NOT_VERIFIED la recuperarea documentelor, fără nicio ieșire.",
  },

  // ---- Gate 3 -------------------------------------------------------------
  {
    gate: 3,
    goal: "Fleet Telemetry — mașina transmite în loc să fie interogată",
    nextStep:
      "Un receptor mTLS pe același host cu proxy-ul de semnare, plus un apel fleet_telemetry_config per mașină. Cam cât a fost munca la proxy.",
    cost:
      "Singura cale către istoric real de încărcare, consum real și pierdere vampirică — pe care interogarea nu o poate măsura, pentru că fiecare măsurătoare trezește mașina. Toate aplicațiile Tesla interoghează; aproape niciuna nu ascultă un flux. Ăsta e diferențiatorul.",
  },
  {
    gate: 3,
    goal: "Domeniu propriu, plecat de pe Vercel",
    nextStep:
      "Cumpără domeniul acum; fă mutarea și schimbarea de domeniu ÎMPREUNĂ, când Fleet Telemetry o va impune. Ordinea completă în docs/HOSTING-AND-DOMAIN.md.",
    cost:
      "Schimbarea domeniului reînregistrează contul de partener și DESPERECHEAZĂ fiecare mașină — cheia, redirect URI-ul și linkul _ak sunt toate legate de el. Ieftin cu o mașină, scump cu clienți. Vercel e și motivul pentru care proxy-ul e public (T10) și pentru care Fleet Telemetry e imposibil.",
  },
  {
    gate: 3,
    goal: "Redesignul — încheiat, /v2 e șters",
    nextStep:
      "Nimic de făcut. Judecat pe ecranul mașinii, v1 arăta și mergea mai bine, deci /v2 a fost șters și tot ce era util s-a mutat în v1. Ce s-a găsit pe drum — 52 de defecte, toate reparate în aplicația reală — e în docs/REDESIGN-V2.md.",
    cost:
      "Regula scrisă aici de la început a fost că fiecare ecran portat ori îl înlocuiește pe original, ori e șters, fiindcă un /v2 permanent e cel mai prost dintre cele trei rezultate. S-a închis pe regula aia, nu împotriva ei — iar defectele găsite au fost reparate în v1 tot timpul, deci munca nu s-a pierdut odată cu ecranele.",
  },
  {
    gate: 3,
    goal: "Disponibilitatea prizelor în timp real",
    nextStep:
      "NDW are deja availabilities[] live pentru Olanda, gratis. Dovedește interfața pe o singură țară înainte să plătești un flux comercial.",
  },
];

export type MilestoneState = "done" | "todo" | "manual";

export interface ResolvedMilestone {
  gate: Gate;
  gateLabel: string;
  goal: string;
  nextStep: string;
  cost?: string;
  state: MilestoneState;
}

export function resolveRoadmap(
  config: Record<string, boolean | string>,
): ResolvedMilestone[] {
  return ROADMAP.map((m) => ({
    gate: m.gate,
    gateLabel: GATES[m.gate],
    goal: m.goal,
    nextStep: m.nextStep,
    ...(m.cost ? { cost: m.cost } : {}),
    state: m.check ? (m.check(config) ? "done" : "todo") : "manual",
  }));
}
