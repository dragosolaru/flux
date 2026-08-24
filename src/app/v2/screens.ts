/**
 * The redesign's own checklist. The /v2 index renders this, so the list on the
 * phone cannot drift from what actually exists — a screen is "done" here only
 * once its route is written.
 *
 * `legacy` is where the same screen lives in the shipping app, so the two can
 * be compared side by side on the same device.
 */
export interface V2Screen {
  key: string;
  /** i18n key under the `v2.screens` namespace. */
  label: string;
  href: string | null;
  legacy: string;
  done: boolean;
}

export const V2_SCREENS: V2Screen[] = [
  { key: "dashboard", label: "dashboard", href: "/v2/dashboard", legacy: "/dashboard", done: true },
  { key: "commands", label: "commands", href: null, legacy: "/commands", done: false },
  { key: "map", label: "map", href: null, legacy: "/map", done: false },
  { key: "charging", label: "charging", href: null, legacy: "/charging", done: false },
  { key: "trip", label: "trip", href: null, legacy: "/trip", done: false },
  { key: "costs", label: "costs", href: null, legacy: "/costs", done: false },
  { key: "garage", label: "garage", href: null, legacy: "/garage", done: false },
  { key: "documents", label: "documents", href: null, legacy: "/documents", done: false },
  { key: "insights", label: "insights", href: null, legacy: "/insights", done: false },
  { key: "energy", label: "energy", href: null, legacy: "/energy", done: false },
  { key: "settings", label: "settings", href: null, legacy: "/settings", done: false },
];
