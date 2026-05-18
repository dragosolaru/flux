import type { ChargingStation } from "./types";

// ~50 real-world EU charging stations (coordinates are approximate/public)
export const STATIONS: ChargingStation[] = [
  // IONITY — 350kW CCS corridor stations
  { id: "ion-001", networkId: "ionity", name: "IONITY Prague West", lat: 50.108, lng: 14.168, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Prague", addressCountry: "CZ" },
  { id: "ion-002", networkId: "ionity", name: "IONITY Brno", lat: 49.195, lng: 16.608, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Brno", addressCountry: "CZ" },
  { id: "ion-003", networkId: "ionity", name: "IONITY Vienna Süd", lat: 48.137, lng: 16.337, maxKw: 350, totalStalls: 8, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Vienna", addressCountry: "AT" },
  { id: "ion-004", networkId: "ionity", name: "IONITY Salzburg", lat: 47.812, lng: 13.033, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Salzburg", addressCountry: "AT" },
  { id: "ion-005", networkId: "ionity", name: "IONITY Munich East", lat: 48.137, lng: 11.576, maxKw: 350, totalStalls: 8, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Munich", addressCountry: "DE" },
  { id: "ion-006", networkId: "ionity", name: "IONITY Frankfurt A3", lat: 50.113, lng: 8.682, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Frankfurt", addressCountry: "DE" },
  { id: "ion-007", networkId: "ionity", name: "IONITY Hamburg Nord", lat: 53.551, lng: 9.993, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Hamburg", addressCountry: "DE" },
  { id: "ion-008", networkId: "ionity", name: "IONITY Berlin Ost", lat: 52.520, lng: 13.405, maxKw: 350, totalStalls: 8, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Berlin", addressCountry: "DE" },
  { id: "ion-009", networkId: "ionity", name: "IONITY Amsterdam A10", lat: 52.370, lng: 4.895, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Amsterdam", addressCountry: "NL" },
  { id: "ion-010", networkId: "ionity", name: "IONITY Paris Est", lat: 48.856, lng: 2.352, maxKw: 350, totalStalls: 8, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Paris", addressCountry: "FR" },
  { id: "ion-011", networkId: "ionity", name: "IONITY Lyon", lat: 45.764, lng: 4.836, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Lyon", addressCountry: "FR" },
  { id: "ion-012", networkId: "ionity", name: "IONITY Warsaw A2", lat: 52.229, lng: 21.012, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Warsaw", addressCountry: "PL" },

  // TESLA Supercharger
  { id: "tsc-001", networkId: "tesla-sc", name: "Tesla SC Prague Centre", lat: 50.075, lng: 14.437, maxKw: 250, totalStalls: 12, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.49, addressCity: "Prague", addressCountry: "CZ" },
  { id: "tsc-002", networkId: "tesla-sc", name: "Tesla SC Munich Pasing", lat: 48.149, lng: 11.461, maxKw: 250, totalStalls: 16, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.49, addressCity: "Munich", addressCountry: "DE" },
  { id: "tsc-003", networkId: "tesla-sc", name: "Tesla SC Berlin Schöneberg", lat: 52.483, lng: 13.352, maxKw: 250, totalStalls: 20, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.49, addressCity: "Berlin", addressCountry: "DE" },
  { id: "tsc-004", networkId: "tesla-sc", name: "Tesla SC Vienna Erdberg", lat: 48.199, lng: 16.412, maxKw: 250, totalStalls: 12, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.49, addressCity: "Vienna", addressCountry: "AT" },
  { id: "tsc-005", networkId: "tesla-sc", name: "Tesla SC Paris Villeneuve", lat: 48.836, lng: 2.479, maxKw: 250, totalStalls: 16, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.49, addressCity: "Paris", addressCountry: "FR" },
  { id: "tsc-006", networkId: "tesla-sc", name: "Tesla SC Amsterdam Zuidas", lat: 52.338, lng: 4.869, maxKw: 250, totalStalls: 12, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.49, addressCity: "Amsterdam", addressCountry: "NL" },
  { id: "tsc-007", networkId: "tesla-sc", name: "Tesla SC Budapest Kelenföld", lat: 47.474, lng: 19.035, maxKw: 250, totalStalls: 10, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.44, addressCity: "Budapest", addressCountry: "HU" },
  { id: "tsc-008", networkId: "tesla-sc", name: "Tesla SC Bucharest", lat: 44.439, lng: 26.097, maxKw: 250, totalStalls: 12, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Bucharest", addressCountry: "RO" },

  // EnBW
  { id: "enbw-001", networkId: "enbw", name: "EnBW Stuttgart Mitte", lat: 48.775, lng: 9.183, maxKw: 150, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.49, addressCity: "Stuttgart", addressCountry: "DE" },
  { id: "enbw-002", networkId: "enbw", name: "EnBW Karlsruhe", lat: 49.009, lng: 8.403, maxKw: 150, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.49, addressCity: "Karlsruhe", addressCountry: "DE" },
  { id: "enbw-003", networkId: "enbw", name: "EnBW Freiburg", lat: 47.997, lng: 7.842, maxKw: 150, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.49, addressCity: "Freiburg", addressCountry: "DE" },
  { id: "enbw-004", networkId: "enbw", name: "EnBW Mannheim", lat: 49.487, lng: 8.466, maxKw: 150, totalStalls: 6, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.49, addressCity: "Mannheim", addressCountry: "DE" },

  // Allego
  { id: "alg-001", networkId: "allego", name: "Allego Brussels Noord", lat: 50.862, lng: 4.362, maxKw: 175, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.65, addressCity: "Brussels", addressCountry: "BE" },
  { id: "alg-002", networkId: "allego", name: "Allego Ghent Ring", lat: 51.050, lng: 3.718, maxKw: 175, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.65, addressCity: "Ghent", addressCountry: "BE" },
  { id: "alg-003", networkId: "allego", name: "Allego Rotterdam Centrum", lat: 51.919, lng: 4.477, maxKw: 175, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.59, addressCity: "Rotterdam", addressCountry: "NL" },
  { id: "alg-004", networkId: "allego", name: "Allego Utrecht Science Park", lat: 52.085, lng: 5.172, maxKw: 175, totalStalls: 6, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.59, addressCity: "Utrecht", addressCountry: "NL" },

  // Fastned
  { id: "fst-001", networkId: "fastned", name: "Fastned Eindhoven", lat: 51.441, lng: 5.478, maxKw: 300, totalStalls: 8, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.69, addressCity: "Eindhoven", addressCountry: "NL" },
  { id: "fst-002", networkId: "fastned", name: "Fastned The Hague", lat: 52.073, lng: 4.316, maxKw: 300, totalStalls: 8, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.69, addressCity: "The Hague", addressCountry: "NL" },
  { id: "fst-003", networkId: "fastned", name: "Fastned Antwerp A1", lat: 51.220, lng: 4.404, maxKw: 300, totalStalls: 8, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.69, addressCity: "Antwerp", addressCountry: "BE" },
  { id: "fst-004", networkId: "fastned", name: "Fastned Cologne A1", lat: 50.938, lng: 6.960, maxKw: 300, totalStalls: 8, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.69, addressCity: "Cologne", addressCountry: "DE" },
  { id: "fst-005", networkId: "fastned", name: "Fastned Düsseldorf A3", lat: 51.226, lng: 6.773, maxKw: 300, totalStalls: 8, plugTypes: ["CCS", "CHAdeMO", "Type2"], priceEurKwh: 0.69, addressCity: "Düsseldorf", addressCountry: "DE" },

  // Extra IONITY for more coverage
  { id: "ion-013", networkId: "ionity", name: "IONITY Bratislava D1", lat: 48.148, lng: 17.107, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Bratislava", addressCountry: "SK" },
  { id: "ion-014", networkId: "ionity", name: "IONITY Copenhagen S", lat: 55.676, lng: 12.568, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Copenhagen", addressCountry: "DK" },
  { id: "ion-015", networkId: "ionity", name: "IONITY Stockholm E4", lat: 59.329, lng: 18.069, maxKw: 350, totalStalls: 8, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Stockholm", addressCountry: "SE" },
  { id: "ion-016", networkId: "ionity", name: "IONITY Barcelona AP7", lat: 41.385, lng: 2.173, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Barcelona", addressCountry: "ES" },
  { id: "ion-017", networkId: "ionity", name: "IONITY Madrid A4", lat: 40.417, lng: -3.703, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Madrid", addressCountry: "ES" },
  { id: "ion-018", networkId: "ionity", name: "IONITY Milan A1", lat: 45.465, lng: 9.188, maxKw: 350, totalStalls: 8, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Milan", addressCountry: "IT" },
  { id: "ion-019", networkId: "ionity", name: "IONITY Rome GRA", lat: 41.902, lng: 12.496, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Rome", addressCountry: "IT" },
  { id: "ion-020", networkId: "ionity", name: "IONITY Zurich A1", lat: 47.377, lng: 8.541, maxKw: 350, totalStalls: 8, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Zurich", addressCountry: "CH" },

  // Extra Tesla SCs
  { id: "tsc-009", networkId: "tesla-sc", name: "Tesla SC Brno Spielberk", lat: 49.192, lng: 16.603, maxKw: 250, totalStalls: 10, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.44, addressCity: "Brno", addressCountry: "CZ" },
  { id: "tsc-010", networkId: "tesla-sc", name: "Tesla SC Kraków", lat: 50.061, lng: 19.938, maxKw: 250, totalStalls: 10, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.42, addressCity: "Kraków", addressCountry: "PL" },
  { id: "tsc-011", networkId: "tesla-sc", name: "Tesla SC Lisbon", lat: 38.717, lng: -9.138, maxKw: 250, totalStalls: 12, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.45, addressCity: "Lisbon", addressCountry: "PT" },
  { id: "tsc-012", networkId: "tesla-sc", name: "Tesla SC Athens", lat: 37.983, lng: 23.727, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.46, addressCity: "Athens", addressCountry: "GR" },
];

export function getStations() {
  return STATIONS;
}

export function getStation(id: string) {
  return STATIONS.find((s) => s.id === id) ?? null;
}
