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

  // Tesla Superchargers Romania
  { id: "tsc-ro-cluj", networkId: "tesla-sc", name: "Tesla SC Cluj-Napoca", lat: 46.777, lng: 23.617, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Cluj-Napoca", addressCountry: "RO" },
  { id: "tsc-ro-sibiu", networkId: "tesla-sc", name: "Tesla SC Sibiu", lat: 45.793, lng: 24.152, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Sibiu", addressCountry: "RO" },
  { id: "tsc-ro-pitesti", networkId: "tesla-sc", name: "Tesla SC Pitești", lat: 44.856, lng: 24.869, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Pitești", addressCountry: "RO" },
  { id: "tsc-ro-ploiesti", networkId: "tesla-sc", name: "Tesla SC Ploiești", lat: 44.952, lng: 26.023, maxKw: 250, totalStalls: 6, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Ploiești", addressCountry: "RO" },
  { id: "tsc-ro-brasov", networkId: "tesla-sc", name: "Tesla SC Brașov", lat: 45.658, lng: 25.601, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Brașov", addressCountry: "RO" },
  { id: "tsc-ro-timisoara", networkId: "tesla-sc", name: "Tesla SC Timișoara", lat: 45.749, lng: 21.230, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Timișoara", addressCountry: "RO" },
  { id: "tsc-ro-iasi", networkId: "tesla-sc", name: "Tesla SC Iași", lat: 47.158, lng: 27.600, maxKw: 150, totalStalls: 6, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Iași", addressCountry: "RO" },
  { id: "tsc-ro-constanta", networkId: "tesla-sc", name: "Tesla SC Constanța", lat: 44.174, lng: 28.638, maxKw: 150, totalStalls: 6, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Constanța", addressCountry: "RO" },
  { id: "tsc-ro-oradea", networkId: "tesla-sc", name: "Tesla SC Oradea", lat: 47.061, lng: 21.946, maxKw: 150, totalStalls: 6, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Oradea", addressCountry: "RO" },
  { id: "tsc-ro-craiova", networkId: "tesla-sc", name: "Tesla SC Craiova", lat: 44.316, lng: 23.801, maxKw: 150, totalStalls: 4, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.39, addressCity: "Craiova", addressCountry: "RO" },

  // Balkan corridor (RO → GR via Serbia / Bulgaria)
  { id: "ion-bal-001", networkId: "ionity", name: "IONITY Belgrade A1", lat: 44.797, lng: 20.460, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Belgrade", addressCountry: "RS" },
  { id: "ion-bal-002", networkId: "ionity", name: "IONITY Niš A1", lat: 43.323, lng: 21.899, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Niš", addressCountry: "RS" },
  { id: "tsc-bal-001", networkId: "tesla-sc", name: "Tesla SC Sofia", lat: 42.680, lng: 23.319, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.46, addressCity: "Sofia", addressCountry: "BG" },
  { id: "ion-bal-003", networkId: "ionity", name: "IONITY Sofia Ring Road", lat: 42.677, lng: 23.285, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Sofia", addressCountry: "BG" },
  { id: "ion-bal-004", networkId: "ionity", name: "IONITY Plovdiv Trakia", lat: 42.137, lng: 24.743, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Plovdiv", addressCountry: "BG" },
  { id: "tsc-bal-002", networkId: "tesla-sc", name: "Tesla SC Thessaloniki", lat: 40.628, lng: 22.944, maxKw: 250, totalStalls: 8, plugTypes: ["Tesla", "CCS"], priceEurKwh: 0.46, addressCity: "Thessaloniki", addressCountry: "GR" },
  { id: "ion-bal-005", networkId: "ionity", name: "IONITY Thessaloniki Egnatia", lat: 40.621, lng: 22.956, maxKw: 350, totalStalls: 6, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Thessaloniki", addressCountry: "GR" },
  { id: "ion-bal-006", networkId: "ionity", name: "IONITY Larissa A1", lat: 39.638, lng: 22.419, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Larissa", addressCountry: "GR" },
  { id: "ion-bal-007", networkId: "ionity", name: "IONITY Lamia A1", lat: 38.900, lng: 22.431, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Lamia", addressCountry: "GR" },
  // Bucharest → Sofia corridor (via Giurgiu / Ruse, A1/E79 Bulgaria)
  { id: "bg-001", networkId: "enbw", name: "Charge4Europe Ruse A2", lat: 43.847, lng: 25.968, maxKw: 150, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.55, addressCity: "Ruse", addressCountry: "BG" },
  { id: "bg-002", networkId: "ionity", name: "IONITY Beli Izvor A3", lat: 43.415, lng: 23.946, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Beli Izvor", addressCountry: "BG" },
  { id: "bg-003", networkId: "enbw", name: "EV Network Pleven E79", lat: 43.409, lng: 24.621, maxKw: 120, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.52, addressCity: "Pleven", addressCountry: "BG" },
  { id: "bg-004", networkId: "enbw", name: "EV Network Lovech A3", lat: 43.136, lng: 24.715, maxKw: 100, totalStalls: 2, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.52, addressCity: "Lovech", addressCountry: "BG" },
  { id: "bg-005", networkId: "ionity", name: "IONITY Stara Zagora A1", lat: 42.432, lng: 25.637, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Stara Zagora", addressCountry: "BG" },
  // Sofia → Thessaloniki via E79/A3 (Blagoevgrad corridor)
  { id: "bg-006", networkId: "ionity", name: "IONITY Blagoevgrad A3", lat: 42.022, lng: 23.095, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Blagoevgrad", addressCountry: "BG" },
  { id: "bg-007", networkId: "enbw", name: "EV Network Sandanski E79", lat: 41.563, lng: 23.280, maxKw: 120, totalStalls: 2, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.52, addressCity: "Sandanski", addressCountry: "BG" },
  // Kavala / eastern Greece (Thasos ferry gateway)
  { id: "gr-001", networkId: "ionity", name: "IONITY Kavala Egnatia", lat: 40.937, lng: 24.401, maxKw: 350, totalStalls: 4, plugTypes: ["CCS"], priceEurKwh: 0.79, addressCity: "Kavala", addressCountry: "GR" },
  { id: "gr-002", networkId: "enbw", name: "EV Network Xanthi E90", lat: 41.135, lng: 24.888, maxKw: 100, totalStalls: 2, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.55, addressCity: "Xanthi", addressCountry: "GR" },

  // IONITY Romania
  { id: "ion-ro-001", networkId: "ionity", name: "IONITY Boița", lat: 45.668, lng: 24.329, maxKw: 350, totalStalls: 6, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.69, addressCity: "Boița", addressCountry: "RO" },
  { id: "ion-ro-002", networkId: "ionity", name: "IONITY Câmpina", lat: 45.123, lng: 25.741, maxKw: 350, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.69, addressCity: "Câmpina", addressCountry: "RO" },
  { id: "ion-ro-003", networkId: "ionity", name: "IONITY Deva", lat: 45.879, lng: 22.909, maxKw: 350, totalStalls: 6, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.69, addressCity: "Deva", addressCountry: "RO" },
  { id: "ion-ro-004", networkId: "ionity", name: "IONITY Turda", lat: 46.571, lng: 23.787, maxKw: 350, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.69, addressCity: "Turda", addressCountry: "RO" },

  // EnBW/Renovatio Romania
  { id: "enbw-ro-001", networkId: "enbw", name: "Renovatio Câmpia Turzii", lat: 46.548, lng: 23.882, maxKw: 120, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.55, addressCity: "Câmpia Turzii", addressCountry: "RO" },
  { id: "enbw-ro-002", networkId: "enbw", name: "Renovatio Sibiu Nord", lat: 45.814, lng: 24.148, maxKw: 120, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.55, addressCity: "Sibiu", addressCountry: "RO" },
  { id: "enbw-ro-003", networkId: "enbw", name: "Renovatio Pitești Sud", lat: 44.831, lng: 24.892, maxKw: 120, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.55, addressCity: "Pitești", addressCountry: "RO" },
  { id: "enbw-ro-004", networkId: "enbw", name: "Renovatio Băilești", lat: 44.024, lng: 23.347, maxKw: 100, totalStalls: 2, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.55, addressCity: "Băilești", addressCountry: "RO" },

  // Fastned Romania
  { id: "fast-ro-001", networkId: "fastned", name: "Fastned Balș A1", lat: 44.359, lng: 24.088, maxKw: 300, totalStalls: 8, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.59, addressCity: "Balș", addressCountry: "RO" },
  { id: "fast-ro-002", networkId: "fastned", name: "Fastned Curtea de Argeș", lat: 45.138, lng: 24.681, maxKw: 300, totalStalls: 4, plugTypes: ["CCS", "CHAdeMO"], priceEurKwh: 0.59, addressCity: "Curtea de Argeș", addressCountry: "RO" },
];

export function getStations() {
  return STATIONS;
}

export function getStation(id: string) {
  return STATIONS.find((s) => s.id === id) ?? null;
}
