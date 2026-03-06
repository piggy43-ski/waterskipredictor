

## Plan: Add Test Token Transaction Record

Add a `token_transactions` record for the 5,000 token credit so it appears in the user's ledger as a documented "testing tokens drop" rather than a silent balance update.

### Implementation
- Insert a single row into `token_transactions` for user `b9920bcb-b9b3-497b-84c6-14afa9d9c02b` with:
  - type: `deposit`
  - amount: `5000`
  - balance_after: current balance (4800 + active stakes)
  - description: "Testing tokens drop - Moomba Masters launch testing"
  - reference_type: `admin_adjustment`

No code changes needed — just a data insert.

