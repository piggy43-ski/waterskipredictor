/**
 * Pure helpers describing the contract of `reverse_settlement(p_run_id, p_slip_id, p_reason, p_actor_id)`.
 *
 * The Postgres function does the actual work; these helpers exist so callers and tests
 * can validate inputs identically to the DB without round-tripping.
 */

export interface ReverseSettlementArgs {
  runId?: string | null;
  slipId?: string | null;
  reason?: string | null;
}

export interface ReverseSettlementValidation {
  ok: boolean;
  error?: string;
  mode?: "run" | "slip";
}

/**
 * XOR check: exactly one of runId or slipId must be supplied; reason must be non-empty.
 * Mirrors the RAISE EXCEPTION branches inside reverse_settlement().
 */
export function validateReverseSettlementArgs(
  args: ReverseSettlementArgs,
): ReverseSettlementValidation {
  const hasRun = !!args.runId;
  const hasSlip = !!args.slipId;

  if (hasRun === hasSlip) {
    return {
      ok: false,
      error: "reverse_settlement requires exactly one of runId or slipId (XOR)",
    };
  }

  if (!args.reason || args.reason.trim().length === 0) {
    return { ok: false, error: "reverse_settlement requires a non-empty reason" };
  }

  return { ok: true, mode: hasRun ? "run" : "slip" };
}