/**
 * Podium prediction multiplier calculation
 *
 * Formula: (M1 + M2 + M3) × 2
 *
 * Rationale: Predicting exact podium positions is difficult,
 * so we reward with sum × 2 instead of product × haircut.
 * This makes podium predictions more attractive while still
 * being risk-managed via the cap.
 *
 * Combined cap is sourced from the single source of truth
 * (`multiplierCaps.MAX_PODIUM_COMBINED_MULTIPLIER` = PODIUM.max × 3).
 */
import { MAX_PODIUM_COMBINED_MULTIPLIER } from './multiplierCaps';

const PODIUM_BONUS_FACTOR = 2;
const MAX_PODIUM_MULTIPLIER = MAX_PODIUM_COMBINED_MULTIPLIER;

/**
 * Calculate combined multiplier for podium predictions
 * @param firstMultiplier - Multiplier for 1st place pick
 * @param secondMultiplier - Multiplier for 2nd place pick
 * @param thirdMultiplier - Multiplier for 3rd place pick
 * @returns Combined multiplier (sum × 2, capped at 30x)
 */
export function calculatePodiumCombinedMultiplier(
  firstMultiplier: number,
  secondMultiplier: number,
  thirdMultiplier: number
): number {
  const sum = firstMultiplier + secondMultiplier + thirdMultiplier;
  const raw = sum * PODIUM_BONUS_FACTOR;
  return Math.min(raw, MAX_PODIUM_MULTIPLIER);
}

/**
 * Get podium multiplier configuration for display
 */
export function getPodiumMultiplierConfig() {
  return {
    bonusFactor: PODIUM_BONUS_FACTOR,
    maxMultiplier: MAX_PODIUM_MULTIPLIER,
  };
}
