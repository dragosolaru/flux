import type { TariffProvider } from "./types";
import { tibberMock } from "./providers/tibber-mock";
import { octopusMock } from "./providers/octopus-mock";
import { awattarMock } from "./providers/awattar-mock";

export const TARIFF_PROVIDERS: Record<string, TariffProvider> = {
  "tibber-mock":  tibberMock,
  "octopus-mock": octopusMock,
  "awattar-mock": awattarMock,
};

export const DEFAULT_PROVIDER_ID = "tibber-mock";

export function getProvider(id: string): TariffProvider {
  return TARIFF_PROVIDERS[id] ?? TARIFF_PROVIDERS[DEFAULT_PROVIDER_ID]!;
}

export function listProviders(): TariffProvider[] {
  return Object.values(TARIFF_PROVIDERS);
}
