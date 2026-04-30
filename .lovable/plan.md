

# Settle 3 Stuck PODIUM Bet Slips (Swiss Pro Tricks)

Three PODIUM bet slips for the Swiss Pro Tricks tournament were skipped by the auto-settlement because their `selection_id` values use a composite format (`<market_uuid>-podium`) that doesn't join to a single `selections` row. They need a manual settlement update.

## Comparison vs. Official Results

**Actual Open Men podium:** 🥇 Gonzalez Matias · 🥈 Abelson Jake · 🥉 Labra Martin
**Actual Open Women podium:** 🥇 Lang Erika · 🥈 Ross Neilly · 🥉 Hansen Kennedy

| Pred ID | User Pick | Result |
|---|---|---|
| `a3cec460…` (Men) | Font Patricio / Gonzalez / Abelson | **LOST** (no positions match in exact order) |
| `0bfca8e3…` (Men) | Gonzalez / Font Patricio / Abelson | **LOST** (only 1st matches; exact-order requires all 3) |
| `f603cf76…` (Women) | Lang / Ross / **Hunter Anna** | **LOST** (3rd is Hansen, not Hunter) |

Per project rule **"Podium Exact Order Settlement"**, all three positions must match exactly → all 3 settle as `LOST`.

## Steps

1. **Update predictions** — set `status = 'LOST'`, `payout_tokens = 0`, `settled_at = now()`, and populate `settlement_metadata` JSONB with:
   - `status: 'LOST'`
   - `actual_results.position_1st/2nd/3rd` (Men or Women podium)
   - `your_pick.market_type: 'PODIUM'` + `podium_picks` array (parsed from `athlete_name`)
   - `payout_details.stake` + `odds_decimal`
   - `explanation: "Podium picks did not match the exact order."`
2. **Update bet_slips** — set `status = 'LOST'`, `actual_payout_tokens = 0`, `settled_at = now()` for the 3 slip IDs.
3. **No wallet changes** — entry tokens were already deducted at placement; LOST = no payout, no refund.
4. **Verify** — confirm 0 PENDING slips remain for tournament `7bf0f645-54f5-497a-9b95-208c01fb9609`.
5. **Mark tournament fully settled** — set `tournaments.settled_at = now()`, `status = 'completed'` (clears `market_liability` via trigger). This step was deferred earlier and can now complete.

## Technical Details

- Done via a single migration (UPDATE-only, satisfies UPPERCASE status rule).
- `settlement_metadata` shape matches `SettlementExplanation.tsx` so the UI renders the side-by-side podium comparison and the "Entry Used: 100/350 tokens" line.
- No email resend needed — these are losses, not wins.
- Root cause to consider for follow-up: `settle-predictions` should detect the `-podium` suffix in `selection_id` and resolve the parent market UUID. Out of scope for this fix; flag-only.

## Out of Scope

- Patching the `settle-predictions` function for composite podium selection IDs (separate hardening task).
- Athlete rating updates from results.

