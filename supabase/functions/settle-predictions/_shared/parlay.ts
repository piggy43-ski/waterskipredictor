/**
 * Pure helpers for parlay leg state transitions during settlement.
 *
 * Rules (per project decision, May 2026):
 *  - A parlay slip resolves WON  iff every leg is WON or VOID (no PENDING legs).
 *  - A parlay slip resolves LOST iff at least one leg is LOST.
 *  - When the slip resolves LOST, sibling legs that are still PENDING become VOID
 *    (NOT LOST — they were never independently evaluated; calling them LOST would assert
 *    a fact we don't have, and would corrupt per-leg analytics).
 *  - When the slip is about to resolve WON, any leg still PENDING is a bug:
 *    log a warning and force WON (the slip-WON precondition has been violated upstream).
 */

export type LegStatus = "PENDING" | "WON" | "LOST" | "VOID";

export interface ParlayLeg {
  id: string;
  status: LegStatus;
}

export type SlipResolution = "WON" | "LOST" | "PENDING";

export interface SlipResolutionResult {
  resolution: SlipResolution;
  /** Sibling legs whose status must be patched before the slip is finalised. */
  legUpdates: Array<{ id: string; from: LegStatus; to: LegStatus }>;
  /** Diagnostic warnings (caller should log). */
  warnings: string[];
}

export function resolveParlay(legs: ParlayLeg[]): SlipResolutionResult {
  const warnings: string[] = [];
  const legUpdates: SlipResolutionResult["legUpdates"] = [];

  if (legs.length === 0) {
    return { resolution: "PENDING", legUpdates, warnings: ["resolveParlay called with no legs"] };
  }

  const hasLost = legs.some((l) => l.status === "LOST");

  if (hasLost) {
    // LOST branch: pending siblings → VOID
    for (const leg of legs) {
      if (leg.status === "PENDING") {
        legUpdates.push({ id: leg.id, from: "PENDING", to: "VOID" });
      }
    }
    return { resolution: "LOST", legUpdates, warnings };
  }

  const hasPending = legs.some((l) => l.status === "PENDING");
  const allWonOrVoid = legs.every((l) => l.status === "WON" || l.status === "VOID");

  if (allWonOrVoid) {
    return { resolution: "WON", legUpdates, warnings };
  }

  if (hasPending) {
    // No LOST, but still some PENDING → slip is not yet ready to resolve.
    return { resolution: "PENDING", legUpdates, warnings };
  }

  // Defensive fallthrough — shouldn't be reachable.
  warnings.push(
    `resolveParlay: unreachable state for legs=${JSON.stringify(legs.map((l) => l.status))}`,
  );
  return { resolution: "PENDING", legUpdates, warnings };
}

/**
 * Vitest-checkable invariant: a slip MUST NOT resolve WON while any leg is PENDING.
 * Returns the offending leg ids (empty array means OK).
 */
export function pendingLegsBlockingWon(legs: ParlayLeg[]): string[] {
  return legs.filter((l) => l.status === "PENDING").map((l) => l.id);
}