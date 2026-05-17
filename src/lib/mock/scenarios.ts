import type { Scenario, ScenarioStep } from "./types";
import commuterJson from "@/data/scenarios/commuter.json";
import roadTripJson from "@/data/scenarios/road-trip.json";
import weekendErrandsJson from "@/data/scenarios/weekend-errands.json";
import vacationJson from "@/data/scenarios/vacation.json";

// Milliseconds of a known cycle-start epoch (midnight 2026-01-01 UTC).
// Used to compute how far into a scenario cycle any given timestamp falls.
const CYCLE_ANCHOR_MS = new Date("2026-01-01T00:00:00Z").getTime();

const ALL_SCENARIOS: Scenario[] = [
  commuterJson as Scenario,
  roadTripJson as Scenario,
  weekendErrandsJson as Scenario,
  vacationJson as Scenario,
];

const SCENARIO_MAP = new Map<string, Scenario>(
  ALL_SCENARIOS.map((s) => [s.id, s])
);

export function getScenario(id: string | null): Scenario | null {
  if (!id) return null;
  return SCENARIO_MAP.get(id) ?? null;
}

export function listScenarios(): Scenario[] {
  return ALL_SCENARIOS;
}

export interface StepInfo {
  step: ScenarioStep;
  stepDuration: number; // total seconds this step spans within cycle
  positionInStep: number; // seconds elapsed into this step at the query time
}

// Returns which scenario step is active at `now`, plus timing metadata.
export function getStepInfoAt(scenario: Scenario, now: Date): StepInfo {
  const elapsedSinceAnchor = now.getTime() - CYCLE_ANCHOR_MS;
  const cycleDurationMs = scenario.cycleDurationSeconds * 1000;
  // Positive modulo — getTime() may be before anchor for past dates
  const cycleOffsetMs = ((elapsedSinceAnchor % cycleDurationMs) + cycleDurationMs) % cycleDurationMs;
  const cycleOffsetSec = cycleOffsetMs / 1000;

  const steps = scenario.steps;
  let stepIdx = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].startOffsetSeconds <= cycleOffsetSec) stepIdx = i;
  }

  const step = steps[stepIdx];
  const nextStepOffset =
    stepIdx + 1 < steps.length
      ? steps[stepIdx + 1].startOffsetSeconds
      : scenario.cycleDurationSeconds;

  return {
    step,
    stepDuration: nextStepOffset - step.startOffsetSeconds,
    positionInStep: cycleOffsetSec - step.startOffsetSeconds,
  };
}
