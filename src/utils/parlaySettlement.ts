/**
 * Fix 3b — parlay settlement payout planner (Option 3: per-leg refund + win on surviving stake).
 *
 * Pure helper. Mirrored in supabase/functions/settle-predictions/_shared/parlayPayout.ts.
 * Keep the two copies in lock-step. Tests live in src/utils/__tests__/parlaySafetyFixes.test.ts
 * and exercise this src copy.
 *
 * Contract:
 *   - Stake shares are integer tokens that sum to EXACTLY total_stake_tokens
 *     (floor each, last leg absorbs the remainder).
 *   - Each VOID leg refunds its share as a separate ledger row.
 *   - Surviving stake = sum(non-void shares). The combined multiplier baked into
 *     potential_payout_tokens at place-time (haircut + leg-count cap + Fix 3a 1.0
 *     floor already applied) is stripped of any void legs' odds, re-floored at 1.0,
 *     then applied to the surviving stake only.
 *   - walletDelta = sum(refunds) + winCredit, re-derivable from emitted ledger rows.
 */

export interface ParlaySettlementLeg {
  id: string;
  status: 'WON' | 'VOID';
  decimal_odds: number | null;
}

export interface ParlayPayoutPlan {
  shares: number[]; // per-leg, original order; sum === totalStakeTokens
  refunds: { leg_id: string; amount: number }[];
  survivingStake: number;
  survivingMultiplier: number;
  winCredit: number;
  walletDelta: number; // refundTotal + winCredit
}

export function planParlaySettlementPayout(args: {
  totalStakeTokens: number;
  potentialPayoutTokens: number;
  legs: ParlaySettlementLeg[];
}): ParlayPayoutPlan {
  const { totalStakeTokens, potentialPayoutTokens, legs } = args;
  const n = legs.length;

  if (n === 0 || totalStakeTokens <= 0) {
    return {
      shares: [],
      refunds: [],
      survivingStake: 0,
      survivingMultiplier: 1,
      winCredit: 0,
      walletDelta: 0,
    };
  }

  // Deterministic floor-then-remainder split. Last leg absorbs the remainder
  // so int shares always sum to exactly totalStakeTokens.
  const baseShare = Math.floor(totalStakeTokens / n);
  const shares: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) shares[i] = baseShare;
  shares[n - 1] = totalStakeTokens - baseShare * (n - 1);

  const refunds: { leg_id: string; amount: number }[] = [];
  let survivingStake = 0;
  for (let i = 0; i < n; i++) {
    if (legs[i].status === 'VOID') {
      refunds.push({ leg_id: legs[i].id, amount: shares[i] });
    } else {
      survivingStake += shares[i];
    }
  }

  // Place-time combined multiplier (haircut + cap + 1.0 floor already baked in).
  const baseMultiplier =
    totalStakeTokens > 0 ? potentialPayoutTokens / totalStakeTokens : 1;

  // Strip void legs the same way the legacy voidOddsFactor did.
  let survivingMultiplier = baseMultiplier;
  for (let i = 0; i < n; i++) {
    const leg = legs[i];
    if (leg.status === 'VOID' && leg.decimal_odds && leg.decimal_odds > 1) {
      survivingMultiplier = survivingMultiplier / leg.decimal_odds;
    }
  }
  // Re-floor at 1.0 so surviving stake is never returned at a loss.
  if (survivingMultiplier < 1) survivingMultiplier = 1;

  const winCredit =
    survivingStake > 0 ? Math.floor(survivingStake * survivingMultiplier) : 0;

  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
  const walletDelta = refundTotal + winCredit;

  return {
    shares,
    refunds,
    survivingStake,
    survivingMultiplier,
    winCredit,
    walletDelta,
  };
}