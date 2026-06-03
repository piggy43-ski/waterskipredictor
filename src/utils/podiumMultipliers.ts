/**
 * Podium exact-order multiplier resolution.
 *
 * SAFE READ PATH (v2): the canonical multiplier for a specific (1st, 2nd, 3rd)
 * ordering on a podium market is sourced from `market_podium_ordering_overrides`.
 * Only when no override row matches do we fall back to a formula — and that
 * formula uses PODIUM_BONUS_FACTOR = 1.0 (no order-blind sum × 2 multiplier
 * inflation), capped at `MAX_PODIUM_EXACT_ORDER_MULTIPLIER`.
 *
 * Rationale: the older sum × 2 method priced every ordering of a given
 * triple identically (order-blind), which re-introduces the same-athlete
 * correlation mispricing the parlay safety fixes closed. The override table
 * encodes ordering as a primary key, so chalk orderings can be priced
 * explicitly and everything else falls back to a conservative formula.
 */
import {
  MAX_PODIUM_COMBINED_MULTIPLIER,
  MAX_PODIUM_EXACT_ORDER_MULTIPLIER,
} from './multiplierCaps';

const PODIUM_BONUS_FACTOR = 1;
const MAX_PODIUM_MULTIPLIER = MAX_PODIUM_EXACT_ORDER_MULTIPLIER;

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

export interface PodiumOrderingInput {
  marketId: string;
  firstAthleteId: string;
  secondAthleteId: string;
  thirdAthleteId: string;
  decimalOdds: [number, number, number];
}

export interface PodiumOrderingResolution {
  multiplier: number;
  source: 'override' | 'formula';
  is_protected: boolean;
}

/**
 * Resolve the multiplier for a specific podium ordering.
 * Reads the `market_podium_ordering_overrides` table first; falls back to the
 * formula above only when no enabled override matches.
 */
export async function resolvePodiumOrderedMultiplier(
  input: PodiumOrderingInput
): Promise<PodiumOrderingResolution> {
  const { marketId, firstAthleteId, secondAthleteId, thirdAthleteId, decimalOdds } = input;

  try {
    // Lazy-import the supabase client so this module stays unit-test friendly
    // (the client touches `localStorage` at import time).
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('market_podium_ordering_overrides' as any)
      .select('manual_multiplier, is_protected, is_enabled')
      .eq('market_id', marketId)
      .eq('first_athlete', firstAthleteId)
      .eq('second_athlete', secondAthleteId)
      .eq('third_athlete', thirdAthleteId)
      .eq('is_enabled', true)
      .maybeSingle();

    if (!error && data && typeof (data as any).manual_multiplier === 'number') {
      const m = Math.min((data as any).manual_multiplier, MAX_PODIUM_MULTIPLIER);
      return { multiplier: m, source: 'override', is_protected: !!(data as any).is_protected };
    }
  } catch {
    // Fall through to formula on any client error.
  }

  return {
    multiplier: calculatePodiumCombinedMultiplier(decimalOdds[0], decimalOdds[1], decimalOdds[2]),
    source: 'formula',
    is_protected: false,
  };
}

// Re-export the legacy combined cap so existing imports keep compiling.
export { MAX_PODIUM_COMBINED_MULTIPLIER };
