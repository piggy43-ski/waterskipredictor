

# Fix: BETA TESTING Tournament Predictions Stuck as PENDING

## Problem

All 22 pending predictions in the system are from the **"BETA TESTING" tournament** (ID: `d26feef0-7dee-4eba-aa8b-d36df42b30f7`). They remain PENDING because:

1. The tournament status is still **"upcoming"** -- it was never changed to "finished", so settlement was never triggered.
2. All 22 predictions are **podium bets** with selection IDs ending in `-podium` (e.g., `9caa0027-...-podium`). The settlement function queries the `predictions` table using selection IDs provided by the admin UI, but if the admin UI only sends the base selection UUID (without `-podium`), the query won't match these rows.

## Fix

### Step 1: Admin action to void BETA TESTING predictions

Since this was a test tournament with no real results, the cleanest approach is to **void all 22 predictions and refund stakes**. This requires:

- A database migration (or manual SQL via the settlement page) that:
  - Updates all 22 predictions to `status = 'VOID'`, `settled_at = now()`
  - Refunds `staked_tokens` back to each user's wallet via `increment_earned_tokens` RPC
  - Updates the corresponding `bet_slips` to `status = 'VOID'`
  - Updates the tournament status to `finished` and sets `settled_at`

### Step 2: Add "Void All" button for test/beta tournaments

Add a simple admin action on the Tournament Settlement page specifically for voiding all predictions on a tournament (useful for test events):

- Button: "Void All Predictions" (with confirmation dialog)
- Calls the `settle-predictions` edge function with all selection IDs set to `result: 'void'`
- Must include the `-podium` suffixed IDs so the query matches

### Step 3: Fix settlement to handle podium selection IDs

Update the `settle-predictions` edge function to also query for `-podium` suffixed variants:

- When building the `selectionIds` array, also include `${selectionId}-podium` for each ID
- This ensures podium predictions are found and settled regardless of how the admin UI sends the IDs

## Files to modify

| File | Change |
|------|--------|
| `supabase/functions/settle-predictions/index.ts` | Expand selection ID matching to include `-podium` variants |
| `src/pages/admin/TournamentSettlement.tsx` | Add "Void All" button for admin to bulk-void a tournament's predictions |

## Immediate data fix

Run a one-time SQL to void the 22 stuck BETA TESTING predictions and refund users. This will be done via a database migration that:
- Sets `status = 'VOID'`, `settled_at = now()` on all 22 predictions
- Refunds staked tokens to user wallets
- Marks the BETA TESTING tournament as finished

