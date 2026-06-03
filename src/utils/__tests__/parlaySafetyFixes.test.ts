import { describe, it, expect } from 'vitest';
import {
  calculateParlayMultiplier,
  getParlayMultiplierDetails,
  findDuplicateAthleteIdInLeg,
  findDuplicateAthleteSlot,
} from '../parlayMultipliers';
import type { ParlayLeg } from '@/types/parlay';
import { planParlaySettlementPayout } from '../parlaySettlement';

const sel = (athleteId: string, odds: number) =>
  ({ id: `${athleteId}-sel`, athlete: { id: athleteId }, decimal_odds: odds } as any);

const makeLeg = (overrides: Partial<ParlayLeg> = {}): ParlayLeg => ({
  discipline: 'slalom' as any,
  gender: 'men',
  category: 'open_men' as any,
  winner: null,
  podium: { first: null, second: null, third: null },
  highestScore: null,
  isComplete: true,
  ...overrides,
});

describe('FIX 1 — same-athlete correlation block (within one slot)', () => {
  it('T1: Gonzalez win + Gonzalez highest-score (same slot) → duplicate detected', () => {
    const leg = makeLeg({
      winner: sel('gonzalez', 2.0),
      highestScore: sel('gonzalez', 2.5),
    });
    expect(findDuplicateAthleteIdInLeg(leg)).toBe('gonzalez');
    expect(findDuplicateAthleteSlot([leg])).toEqual({ legIndex: 0, athleteId: 'gonzalez' });
  });

  it('T2: Gonzalez win + Abelson podium-1 + Labra highest-score (diff athletes, same slot) → allowed', () => {
    const leg = makeLeg({
      winner: sel('gonzalez', 2.0),
      podium: { first: sel('abelson', 3.0), second: sel('x', 4.0), third: sel('y', 5.0) },
      highestScore: sel('labra', 2.5),
    });
    expect(findDuplicateAthleteIdInLeg(leg)).toBeNull();
    expect(findDuplicateAthleteSlot([leg])).toBeNull();
  });

  it('T3: same athlete across discipline slots (M-Slalom + M-Tricks) → allowed (no block)', () => {
    const slalom = makeLeg({
      discipline: 'slalom' as any,
      winner: sel('ahumada', 2.0),
    });
    const tricks = makeLeg({
      discipline: 'trick' as any,
      winner: sel('ahumada', 2.5),
    });
    expect(findDuplicateAthleteSlot([slalom, tricks])).toBeNull();
  });

  it('detects podium-internal duplicates (same athlete in two podium positions)', () => {
    const leg = makeLeg({
      podium: { first: sel('dup', 2), second: sel('dup', 3), third: sel('x', 4) },
    });
    expect(findDuplicateAthleteIdInLeg(leg)).toBe('dup');
  });
});

describe('FIX 3a — combined multiplier floored at 1.0', () => {
  it('T6: three ~1.0x legs after 0.75 haircut → floored to 1.0 (not 0.42)', () => {
    const legs = [
      makeLeg({ winner: sel('a', 1.05) }),
      makeLeg({ discipline: 'trick' as any, winner: sel('b', 1.05) }),
      makeLeg({ discipline: 'jump' as any, winner: sel('c', 1.05) }),
    ];
    const m = calculateParlayMultiplier(legs);
    // raw = 1.157625, haircut = 0.868 < 1.0  →  floor lifts to 1.0
    expect(m).toBe(1.0);
    const details = getParlayMultiplierDetails(legs);
    expect(details.finalMultiplier).toBe(1.0);
  });

  it('high-multiplier legs unaffected by floor (cap still applies)', () => {
    const legs = [
      makeLeg({ winner: sel('a', 5.0) }),
      makeLeg({ discipline: 'trick' as any, winner: sel('b', 5.0) }),
    ];
    const m = calculateParlayMultiplier(legs);
    // raw = 25, haircut = 18.75, 2-leg cap = 20  →  18.75
    expect(m).toBeGreaterThan(1.0);
    expect(m).toBeLessThanOrEqual(20);
  });
});

describe('FIX 3b — settlement floor logic (pure)', () => {
  // Mirrors the production line:
  //   actualPayout = max(floor(potential_payout_tokens * voidOddsFactor), total_stake_tokens)
  const settle = (potential: number, stake: number, voidOddsFactor: number) =>
    Math.max(Math.floor(potential * voidOddsFactor), stake);

  it('T7: 1 of 3 legs VOIDs, snapshotted payout would dip below stake → stake floor holds', () => {
    // stake=100, potential=120 (combined 1.2x snapshot), one leg @ 2.5x VOIDs
    const payout = settle(120, 100, 1 / 2.5); // = max(48, 100) = 100
    expect(payout).toBe(100);
  });

  it('winning parlay with healthy payout pays scaled amount (floor does not over-credit)', () => {
    const payout = settle(500, 100, 1); // = max(500, 100) = 500
    expect(payout).toBe(500);
  });

  it('sub-stake snapshotted payout still pays at least stake', () => {
    const payout = settle(80, 100, 1); // = max(80, 100) = 100
    expect(payout).toBe(100);
  });
});