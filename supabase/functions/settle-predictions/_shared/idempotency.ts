/**
 * Pure helpers for settlement idempotency.
 *
 * The contract enforced here:
 *   1. Each settlement run is identified by a single UUID (`settlement_run_id`).
 *   2. Slips are claimed atomically by flipping `status = 'PENDING' AND settlement_run_id IS NULL`
 *      to `settlement_run_id = <run>` in a single UPDATE ... RETURNING.
 *      Anything we don't get back was already claimed by an earlier run — skip it.
 *   3. Credit-ledger writes for settled slips carry `(user_id, reference_type, reference_id, type)`
 *      and the partial unique index `token_tx_credit_idem` blocks a second insert with the same key.
 *      A second settle invocation for an already-credited slip therefore becomes a no-op.
 */

export type CreditLedgerType =
  | "prediction_won"
  | "prediction_void"
  | "bet_won"
  | "fantasy_payout";

export const CREDIT_LEDGER_TYPES: ReadonlyArray<CreditLedgerType> = [
  "prediction_won",
  "prediction_void",
  "bet_won",
  "fantasy_payout",
];

export interface SettlementClaimRow {
  id: string;
  settlement_run_id: string | null;
  status: string;
}

/**
 * Given the rows returned by an atomic claim UPDATE ... RETURNING,
 * return only the rows that were actually newly claimed by THIS run.
 * Rows missing the run id (claimed by someone else, or never updated) are filtered out.
 */
export function filterNewlyClaimed<T extends SettlementClaimRow>(
  returnedRows: T[] | null | undefined,
  runId: string,
): T[] {
  if (!returnedRows || returnedRows.length === 0) return [];
  return returnedRows.filter((r) => r.settlement_run_id === runId);
}

/**
 * Build the canonical idempotency key for a credit ledger row.
 * If any component is missing, returns null — caller should treat that as
 * "cannot enforce idempotency, do not write."
 */
export function buildCreditIdempotencyKey(args: {
  userId: string | null | undefined;
  referenceType: string | null | undefined;
  referenceId: string | null | undefined;
  type: string | null | undefined;
}): string | null {
  const { userId, referenceType, referenceId, type } = args;
  if (!userId || !referenceType || !referenceId || !type) return null;
  if (!CREDIT_LEDGER_TYPES.includes(type as CreditLedgerType)) return null;
  return `${userId}|${referenceType}|${referenceId}|${type}`;
}

/**
 * Postgres unique-violation SQLSTATE.
 * Used by callers to recognise that an INSERT was harmlessly rejected by `token_tx_credit_idem`.
 */
export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === PG_UNIQUE_VIOLATION;
}