import type { TariffProvider } from "./types";
import { tibberMock } from "./providers/tibber-mock";
import { octopusMock } from "./providers/octopus-mock";
import { awattarMock } from "./providers/awattar-mock";
import { electricaRo } from "./providers/electrica";
import { eonRo } from "./providers/eon-ro";
import { enelRo } from "./providers/enel-ro";
import { hidroelectrica } from "./providers/hidroelectrica";

export const TARIFF_PROVIDERS: Record<string, TariffProvider> = {
  // Real Romanian providers (unlock hasTariff = true)
  "electrica-ro":   electricaRo,
  "eon-ro":         eonRo,
  "enel-ro":        enelRo,
  "hidroelectrica": hidroelectrica,
  // Mock providers for demo/testing
  "tibber-mock":    tibberMock,
  "octopus-mock":   octopusMock,
  "awattar-mock":   awattarMock,
};

export const DEFAULT_PROVIDER_ID = "electrica-ro"; // default to real Romanian provider

export function getProvider(id: string): TariffProvider {
  return TARIFF_PROVIDERS[id] ?? TARIFF_PROVIDERS[DEFAULT_PROVIDER_ID]!;
}

export function listProviders(): TariffProvider[] {
  return Object.values(TARIFF_PROVIDERS);
}
