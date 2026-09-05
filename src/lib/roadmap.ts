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
  1: "Înainte să folosească altcineva aplicația",
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

export const GOAL =
  "Clienți plătitori care își știu costurile mașinii din hârtiile lor, în RON.";

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
    goal: "Harta nu mai are filigran",
    nextStep: "Ia o cheie CARTO și pune-o în variabilele de mediu.",
    cost:
      "Fiecare dală din producție scrie API KEY REQUIRED peste ea, inclusiv în orice captură de ecran. E primul lucru pe care îl vede cineva care încearcă aplicația.",
  },
  {
    gate: 1,
    goal: "Sursele de stații își spun singure starea",
    nextStep:
      "Gata — registrul național se înregistrează sub numele lui, cu disabled/error/ok, iar prospețimea nu se mai acordă când sursa de care depinde țara a picat.",
    check: () => true,
  },

  // ---- Gate 2 -------------------------------------------------------------
  {
    gate: 2,
    goal: "OCR-ul e verificat, nu presupus",
    nextStep:
      "Corpus golden de 10–15 documente reale anonimizate, plus două poze de ecran. Regula: fiecare câmp ori corect, ori marcat needs_review. Nu există niciun test azi.",
    cost:
      "Produsul plătit e citirea documentelor. Că merge se sprijină pe faptul că a mers pe documentele autorului — o presupunere, nu o măsurătoare.",
  },
  {
    gate: 2,
    goal: "Costurile raportează suma corectă",
    nextStep:
      "Întâi decide un singur înțeles pentru energy_costs.cost_ron, apoi repară cele patru rămase: ziua pierdută la marginea perioadei, cipul de economie și cipurile de cost/km care folosesc baze diferite, și costPerKmHome care împarte costul de acasă la kilometrii totali.",
    cost:
      "Numărul pentru care există produsul e greșit și nimic nu semnalează asta. Oamenii nu reclamă — pur și simplu nu mai au încredere.",
  },
  {
    gate: 2,
    goal: "Kilometrii ajung în aplicație",
    nextStep:
      "Odometru din patru surse — la adăugarea mașinii, manual oricând, din ITP și facturi de service, din poza ecranului — plus memento lunar și gol onest când lipsesc două citiri.",
    cost:
      "Fără două citiri la distanță în timp, cost/km și economia față de benzină rămân goale. Adică exact promisiunea din pagina de preț.",
  },
  {
    gate: 2,
    goal: "Planurile plătite chiar pot fi cumpărate",
    nextStep: "Adaugă cheile Stripe de producție și price ID-urile.",
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
    goal: "Mașina, cândva",
    nextStep:
      "Nimic de făcut acum. Integrarea Tesla a fost retrasă pe 2026-09-05 și trăiește pe ramura `v3`; docs/TESLA-PARKED.md spune ce s-a scos și cum se aduce înapoi.",
    cost:
      "Cinci analize independente au dat aceeași concluzie: ca aplicație-companion pentru Tesla pierdem în fața aplicației gratuite Tesla și a Tessie. Se reia când avem un motiv, nu un calendar.",
  },
  {
    gate: 3,
    goal: "Disponibilitatea prizelor în timp real",
    nextStep:
      "NDW are deja availabilities[] live pentru Olanda, gratis. Dovedește interfața pe o singură țară înainte să plătești un flux comercial.",
  },
  {
    gate: 3,
    goal: "tomtom și overpass rulează pe cron",
    nextStep:
      "Azi rulează doar în modul regiune, deci rândurile lor îmbătrânesc la nesfârșit dacă nu declanșează cineva o zonă manual. Ori intră pe cron și plătim apelurile, ori acceptăm explicit că sunt un supliment.",
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
