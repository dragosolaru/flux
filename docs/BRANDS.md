# BRANDS — Per-Brand Capability Matrix

All 7 brands are currently `dataSource = "mock"`. Live integration is gated by the `LIVE_INTEGRATIONS` env flag.

Source of truth: `src/lib/brands/<brand>/profile.ts` and `src/lib/brands/models.ts`.

---

## Models

| Brand | Models |
|---|---|
| Tesla | Model 3, Model Y, Model S |
| BMW | i4 eDrive35, i4 M50, iX xDrive40, iX M60 |
| Polestar | Polestar 2, Polestar 3 |
| Mercedes-EQ | EQE 300, EQE 43 AMG, EQS 450+ |
| Volkswagen ID | ID.3, ID.4, ID.7 |
| Hyundai / Kia | Ioniq 5, Ioniq 6, EV6, EV9 |
| Renault | Megane E-Tech, Scenic E-Tech |

---

## Telemetry capability matrix

`✓` = brand exposes this field. `—` = field is always `null` for this brand; UI card does not render.

| Telemetry field | Tesla | BMW | Polestar | Mercedes-EQ | VW | Hyundai/Kia | Renault |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| batteryLevel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| batteryRangeKm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| chargeLimit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| chargingState | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| chargingRateKw | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| timeToFullMinutes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **batteryHealthPct** | ✓ | — | ✓ | — | — | — | — |
| **cellVoltages** | ✓ | — | — | — | — | — | — |
| odometer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| speed | ✓ | ✓ | ✓ | ✓ | — | — | — |
| heading | ✓ | ✓ | — | ✓ | — | — | — |
| location | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| interiorTemp | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| exteriorTemp | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| climateOn | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| driverTempSetting | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| passengerTempSetting | ✓ | ✓ | — | ✓ | — | — | — |
| hvacMode | ✓ | ✓ | — | ✓ | — | — | — |
| seatHeating | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| steeringHeating | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| locked | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **doorsOpen** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **windowsOpen** | ✓ | ✓ | — | ✓ | — | — | — |
| trunkOpen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| frunkOpen | ✓ | — | — | — | — | — | — |
| **sentryMode** | ✓ | — | — | — | — | — | — |
| **dashcam** | ✓ | — | — | — | — | — | — |
| **softwareVersion** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| updateAvailable | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| **tirePressure** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **safetyScore** | ✓ | — | — | — | — | — | — |
| **efficiencyScore** | — | ✓ | ✓ | ✓ | — | — | — |

Fields in **bold** are highlighted because they differ most across brands and drive the most noticeable UI differences.

---

## Command capability matrix

`✓` = command available. `—` = rejected with HTTP 422 if attempted.

| Command | Tesla | BMW | Polestar | Mercedes-EQ | VW | Hyundai/Kia | Renault |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| lock / unlock | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| climateOn / climateOff | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| setClimateTemp | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| honk | ✓ | — | — | ✓ | ✓ | ✓ | — |
| flash | ✓ | — | — | ✓ | ✓ | ✓ | — |
| setChargeLimit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| setChargeAmps | ✓ | — | — | — | — | ✓ | — |
| startCharging | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| stopCharging | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| openChargePort | ✓ | ✓ | — | ✓ | — | — | — |
| closeChargePort | ✓ | ✓ | — | ✓ | — | — | — |
| ventWindows | ✓ | — | — | — | — | — | — |
| closeWindows | ✓ | — | — | — | — | — | — |
| activateSentry | ✓ | — | — | — | — | — | — |
| deactivateSentry | ✓ | — | — | — | — | — | — |
| remoteStart | ✓ | — | — | ✓ | — | — | — |

---

## History and refresh

| | Tesla | BMW | Polestar | Mercedes-EQ | VW | Hyundai/Kia | Renault |
|---|---|---|---|---|---|---|---|
| chargingSessions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| trips | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| consumption | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| commandLog | ✓ | ✓ | ✓ | ✓ | — | — | — |
| retention | unlimited | 90 days | 90 days | 30 days | 30 days | 30 days | 7 days |
| refreshModel | polling | polling | polling | polling | polling | polling | on-demand |

---

## Model specs (from `src/lib/brands/models.ts`)

WLTP figures, EU spec.

### Tesla

| Model | Battery (kWh) | Efficiency (kWh/100km) | Max AC (kW) | Max DC (kW) | Range (km) |
|---|---|---|---|---|---|
| Model 3 | 75 | 16 | 11 | 250 | 602 |
| Model Y | 75 | 17 | 11 | 250 | 533 |
| Model S | 100 | 20 | 11 | 250 | 600 |

### BMW

| Model | Battery (kWh) | Efficiency (kWh/100km) | Max AC (kW) | Max DC (kW) | Range (km) |
|---|---|---|---|---|---|
| i4 eDrive35 | 70.2 | 18 | 11 | 180 | 483 |
| i4 M50 | 80.7 | 21 | 11 | 205 | 465 |
| iX xDrive40 | 71 | 19 | 11 | 150 | 426 |
| iX M60 | 105.2 | 23 | 22 | 195 | 561 |

### Polestar

| Model | Battery (kWh) | Efficiency (kWh/100km) | Max AC (kW) | Max DC (kW) | Range (km) |
|---|---|---|---|---|---|
| Polestar 2 | 78 | 17 | 11 | 205 | 551 |
| Polestar 3 | 111 | 21 | 22 | 250 | 631 |

### Mercedes-EQ

| Model | Battery (kWh) | Efficiency (kWh/100km) | Max AC (kW) | Max DC (kW) | Range (km) |
|---|---|---|---|---|---|
| EQE 300 | 90.6 | 17 | 22 | 170 | 654 |
| EQE 43 AMG | 90.6 | 21 | 22 | 170 | 516 |
| EQS 450+ | 107.8 | 18 | 22 | 200 | 782 |

### Volkswagen ID

| Model | Battery (kWh) | Efficiency (kWh/100km) | Max AC (kW) | Max DC (kW) | Range (km) |
|---|---|---|---|---|---|
| ID.3 | 58 | 15 | 11 | 130 | 430 |
| ID.4 | 77 | 17 | 11 | 135 | 529 |
| ID.7 | 77 | 16 | 11 | 170 | 621 |

### Hyundai / Kia

| Model | Battery (kWh) | Efficiency (kWh/100km) | Max AC (kW) | Max DC (kW) | Range (km) |
|---|---|---|---|---|---|
| Ioniq 5 | 77.4 | 17 | 11 | 230 | 507 |
| Ioniq 6 | 77.4 | 14 | 11 | 230 | 614 |
| EV6 | 77.4 | 16 | 11 | 230 | 528 |
| EV9 | 99.8 | 21 | 11 | 230 | 563 |

### Renault

| Model | Battery (kWh) | Efficiency (kWh/100km) | Max AC (kW) | Max DC (kW) | Range (km) |
|---|---|---|---|---|---|
| Megane E-Tech | 60 | 16 | 22 | 130 | 450 |
| Scenic E-Tech | 87 | 17 | 22 | 150 | 620 |

---

## Notes

- **Capability mask in the UI**: The `useBrandCapabilities(brand)` hook returns the capability map from the brand's `profile.ts`. UI components only render elements for capabilities that are `true`. There are no `disabled` states for missing capabilities — the element is absent entirely.
- **Adapter**: Each brand's `adapter(raw) => Partial<VehicleState>` normalizes simulator output to the `VehicleState` superset. In v1, all adapters are pass-through (`(raw) => raw`). As brand-specific data quirks surface, transformations move into the adapter without touching the UI.
- **Live re-activation**: When a brand is added to `LIVE_INTEGRATIONS`, its `dataSource` flips to `"live"` and requests route through the brand's live adapter instead of the simulator. The capability map and UI are unchanged.
