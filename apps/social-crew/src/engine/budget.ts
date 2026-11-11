export const STEP_COSTS = {
  manager: 2,
  scout: 8,
  writer: 6,
  designer: 4,
  scheduler: 3,
  analyst: 4,
} as const;

export const FULL_RUN_COST =
  STEP_COSTS.manager +
  STEP_COSTS.scout +
  STEP_COSTS.writer +
  STEP_COSTS.designer +
  STEP_COSTS.scheduler +
  STEP_COSTS.analyst;

export const ROSTER_COST = 1;
export const DEFAULT_CAP = 80;

export function canAfford(spent: number, cap: number, cost: number): boolean {
  return spent + cost <= cap;
}

export function remaining(spent: number, cap: number): number {
  return cap - spent;
}
