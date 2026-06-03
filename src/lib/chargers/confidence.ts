// Confidence scoring for deduplicated chargers. A canonical charger's trust is
// driven mainly by how many independent sources agree on it, nudged by field
// completeness and penalized when sources contradict each other. See Section 3
// of the charger data platform spec.

export interface ConfidenceInput {
  sourceCount: number;
  hasOperator: boolean;
  hasPoweredConnector: boolean;
  hasAddress: boolean;
  conflict: boolean;
}

function baseFromSourceCount(sourceCount: number): number {
  if (sourceCount >= 3) return 0.9;
  if (sourceCount === 2) return 0.75;
  return 0.5;
}

export function computeConfidence(input: ConfidenceInput): number {
  let score = baseFromSourceCount(input.sourceCount);

  if (input.hasOperator) score += 0.03;
  if (input.hasPoweredConnector) score += 0.04;
  if (input.hasAddress) score += 0.03;

  if (input.conflict) score -= 0.15;

  const clamped = Math.min(1, Math.max(0, score));
  return Math.round(clamped * 100) / 100;
}
