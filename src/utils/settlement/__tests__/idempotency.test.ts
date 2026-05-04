import { describe, it, expect } from "vitest";
import {
  buildCreditIdempotencyKey,
  filterNewlyClaimed,
  isUniqueViolation,
  CREDIT_LEDGER_TYPES,
} from "../idempotency";

describe("filterNewlyClaimed (atomic claim pattern)", () => {
  it("returns only rows whose settlement_run_id matches this run", () => {
    const run = "11111111-1111-1111-1111-111111111111";
    const other = "22222222-2222-2222-2222-222222222222";
    const rows = [
      { id: "a", status: "WON", settlement_run_id: run },
      { id: "b", status: "WON", settlement_run_id: other },
      { id: "c", status: "WON", settlement_run_id: null },
      { id: "d", status: "WON", settlement_run_id: run },
    ];
    const result = filterNewlyClaimed(rows, run);
    expect(result.map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("handles null/undefined input safely", () => {
    expect(filterNewlyClaimed(null, "x")).toEqual([]);
    expect(filterNewlyClaimed(undefined, "x")).toEqual([]);
    expect(filterNewlyClaimed([], "x")).toEqual([]);
  });
});

describe("buildCreditIdempotencyKey", () => {
  it("builds canonical key for valid credit type", () => {
    expect(
      buildCreditIdempotencyKey({
        userId: "u1",
        referenceType: "prediction",
        referenceId: "r1",
        type: "prediction_won",
      }),
    ).toBe("u1|prediction|r1|prediction_won");
  });

  it("returns null for non-credit types (debits/audit markers)", () => {
    for (const debit of ["prediction_lost", "bet_placed", "entry_placed", "burn"]) {
      expect(
        buildCreditIdempotencyKey({
          userId: "u1",
          referenceType: "prediction",
          referenceId: "r1",
          type: debit,
        }),
      ).toBeNull();
    }
  });

  it("returns null when any component is missing", () => {
    expect(
      buildCreditIdempotencyKey({
        userId: null,
        referenceType: "prediction",
        referenceId: "r1",
        type: "prediction_won",
      }),
    ).toBeNull();
    expect(
      buildCreditIdempotencyKey({
        userId: "u1",
        referenceType: "prediction",
        referenceId: null,
        type: "prediction_won",
      }),
    ).toBeNull();
  });

  it("CREDIT_LEDGER_TYPES is exactly the four agreed types", () => {
    expect([...CREDIT_LEDGER_TYPES].sort()).toEqual(
      ["bet_won", "fantasy_payout", "prediction_void", "prediction_won"].sort(),
    );
  });
});

describe("isUniqueViolation", () => {
  it("recognises pg 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });
  it("rejects other / missing codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});

describe("idempotency contract: second settle of same slip is a no-op", () => {
  // Simulates the partial unique index behaviour at the application layer.
  it("rejects a duplicate credit insert with the same idempotency key", () => {
    const seen = new Set<string>();
    const tryInsert = (input: Parameters<typeof buildCreditIdempotencyKey>[0]) => {
      const key = buildCreditIdempotencyKey(input);
      if (key === null) return { inserted: false, reason: "non-credit" };
      if (seen.has(key)) return { inserted: false, reason: "duplicate" };
      seen.add(key);
      return { inserted: true };
    };

    const args = {
      userId: "u1",
      referenceType: "prediction",
      referenceId: "slip-1",
      type: "prediction_won" as const,
    };

    expect(tryInsert(args)).toEqual({ inserted: true });
    expect(tryInsert(args)).toEqual({ inserted: false, reason: "duplicate" });
    expect(tryInsert(args)).toEqual({ inserted: false, reason: "duplicate" });
  });
});