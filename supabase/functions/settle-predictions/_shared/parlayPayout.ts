/**
 * Fix 3b — parlay settlement payout planner (mirror of src/utils/parlaySettlement.ts).
 * Keep the two copies in lock-step. Tests against the src copy.
 */

export interface ParlaySettlementLeg {
  id: string;
  status: 'WON' | 'VOID';
  decimal_odds: number | null;
}

export interface ParlayPayoutPlan {
  shares: number[];
  refunds: { leg_id: string; amount: number }[];
  survivingStake: number;
  survivingMultiplier: number;
  winCredit: number;
  walletDelta: number;
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

  const baseMultiplier =
    totalStakeTokens > 0 ? potentialPayoutTokens / totalStakeTokens : 1;

  let survivingMultiplier = baseMultiplier;
  for (let i = 0; i < n; i++) {
    const leg = legs[i];
    if (leg.status === 'VOID' && leg.decimal_odds && leg.decimal_odds > 1) {
      survivingMultiplier = survivingMultiplier / leg.decimal_odds;
    }
  }
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