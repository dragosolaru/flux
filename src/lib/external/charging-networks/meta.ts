import type { NetworkMeta } from "./types";

export const NETWORK_META: Record<string, NetworkMeta> = {
  "ionity":   { id: "ionity",   displayName: "Ionity",         color: "#E94F37", plugTypes: ["CCS"] },
  "tesla-sc": { id: "tesla-sc", displayName: "Tesla SC",       color: "#E82127", plugTypes: ["Tesla", "CCS"] },
  "enbw":     { id: "enbw",     displayName: "EnBW",           color: "#009FE3", plugTypes: ["CCS", "CHAdeMO", "Type2"] },
  "allego":   { id: "allego",   displayName: "Allego",         color: "#00A551", plugTypes: ["CCS", "CHAdeMO", "Type2"] },
  "fastned":  { id: "fastned",  displayName: "Fastned",        color: "#FFD100", plugTypes: ["CCS", "CHAdeMO", "Type2"] },
  "other":    { id: "other",    displayName: "Other",          color: "#888888", plugTypes: ["CCS", "CHAdeMO", "Type2"] },
};

export function getNetworkMeta(id: string): NetworkMeta {
  return NETWORK_META[id] ?? NETWORK_META["other"]!;
}
