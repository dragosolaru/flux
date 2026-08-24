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
  /**
   * What this screen deliberately hands back to v1 rather than redrawing.
   * i18n key under `v2.handoff`, or null when the screen is self-contained.
   */
  handoff?: string;
}

export const V2_SCREENS: V2Screen[] = [
  { key: "dashboard", label: "dashboard", href: "/v2/dashboard", legacy: "/dashboard", done: true },
  { key: "commands", label: "commands", href: "/v2/commands", legacy: "/commands", done: true },
  {
    key: "map",
    label: "map",
    href: "/v2/map",
    legacy: "/map",
    done: true,
    handoff: "planner",
  },
  { key: "charging", label: "charging", href: "/v2/charging", legacy: "/charging", done: true },
  { key: "costs", label: "costs", href: "/v2/costs", legacy: "/costs", done: true },
  { key: "garage", label: "garage", href: "/v2/garage", legacy: "/garage", done: true },
  {
    key: "documents",
    label: "documents",
    href: "/v2/documents",
    legacy: "/documents",
    done: true,
    handoff: "upload",
  },
  { key: "insights", label: "insights", href: "/v2/insights", legacy: "/insights", done: true },
  { key: "energy", label: "energy", href: "/v2/energy", legacy: "/energy", done: true },
  {
    key: "settings",
    label: "settings",
    href: "/v2/settings",
    legacy: "/settings",
    done: true,
    handoff: "editing",
  },
];
