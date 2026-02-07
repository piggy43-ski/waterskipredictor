
Goal: unblock BETA immediately and make pricing deterministic so every market’s implied sum lands inside its target band even after caps + ladder rounding + small fields, with clear audit/debug signals.

What I found (root cause)
1) The screen you shared is /admin/odds-review (labelled “Multiplier Review”), backed by the backend function manage-multiplier-overrides.
2) That page is currently showing:
   - Market type: HIGHEST_SCORE
   - Implied sum: 206.28% (2.0628)
   - Override count: 11/11
   - Caps displayed: 2x–8x
3) If all 11 athletes are capped at max 8x, the best-case implied sum is:
   implied_sum_min = 11 * (1/8) = 1.375 = 137.5%
   So 0.87–0.89 is mathematically impossible if the effective max cap is truly 8x for the entire field.
4) “Regenerate Auto” currently calls generate-market-odds, but it does not clear/disable multiplier overrides. Since Override count is 11/11, the override layer continues to dominate what the admin page (and users) see, so regeneration can appear to “do nothing”.
5) There’s also a correctness issue in the override tooling design: manage-multiplier-overrides currently writes manual overrides back into selections.decimal_odds. That destroys the separation between “auto price” and “manual lock”, and makes it very hard to recover to true auto-pricing.

Non-negotiables we’ll enforce
- A market’s auto-generated pricing must converge into TARGET_IMPLIED_SUM[marketType] after rounding/clamping.
- Deterministic generation: no Date.now()-seeded randomness in probability generation.
- Overrides must not be required to hit the band; if overrides exist, the engine must either:
  (a) re-calibrate remaining non-overridden selections to keep implied sum in-band, or
  (b) explicitly explain why it’s impossible (caps/overrides conflict).
- Admin UX must clearly show when overrides are the reason regeneration doesn’t change implied sum.
- Users must be able to place beta entries; if pricing is updating, show “pricing updating—try again in a minute” instead of leaving the tournament “blocked”.

Implementation (exact changes)

Phase 0 — Emergency unblock (same-day)
A) Change /admin/odds-review “Regenerate Auto” to “Clear overrides + Regenerate”
- Update src/pages/admin/MarketOddsReview.tsx:
  - Replace the current regenerate call with a 2-step action:
    1) Disable all enabled multiplier overrides for the selected market
    2) Invoke generate-market-odds({ market_id, force: true, debug: true })
  - Add a confirm dialog that warns: “You have N/N overrides enabled. Auto-regeneration will not apply until overrides are cleared.”
  - Show two implied sums in the metrics area:
    - Auto implied sum (from market_odds final odds / adjusted_probability sum)
    - Displayed implied sum (with overrides applied)
  - If auto is in-band but displayed is out-of-band, show a red banner: “Overrides are forcing implied sum out of range.”

B) Fix override tool so it no longer corrupts the auto price
- Update supabase/functions/manage-multiplier-overrides/index.ts:
  - Stop updating selections.decimal_odds inside the upsert action.
  - Add a new action:
    - action: 'bulk_disable'
    - Disables overrides for a market (set is_enabled=false) instead of deleting rows (preserves audit trail).
  - Update delete/bulk_reset behavior:
    - If “delete” is used, do not attempt to “revert to auto” using selections.decimal_odds (because it may be stale). Instead, treat delete as removing the override record only and leave auto odds untouched.
  - Ensure list() returns both:
    - auto_multiplier: from market_odds.final_decimal_odds (or selections.decimal_odds if market_odds missing)
    - final_multiplier: auto unless an enabled override exists

C) One-time repair for markets that already have overrides written into selections.decimal_odds
- Add a backend repair path that can be run per market from admin UI:
  - “Repair Auto Odds” button that:
    - Sets selections.decimal_odds = market_odds.final_decimal_odds for the market (only for athletes without enabled overrides, or for all if the admin is clearing overrides).
  - This ensures “reset to auto” actually returns to the engine output.

Phase 1 — Deterministic probability → deterministic multipliers
D) Make the probability model deterministic and rating-first
- Update supabase/functions/generate-market-odds/index.ts:
  - Remove Date.now() from any RNG seeding and remove Monte Carlo from the core pricing path.
  - Implement a single deterministic strength + softmax pipeline:
    - strength_i = rating_z + 0.15 * rank_z (rank_z based on 1/rank z-score or field-rank inverse)
    - logits = strength / T
    - p_raw = softmax(logits)
    - apply p_floor and renormalize exactly to sum 1
  - Temperature defaults per type (adjustable via constants):
    - WINNER: 0.85
    - PODIUM: 1.05
    - HIGHEST_SCORE: 1.00

E) Single source of truth function: generateMultipliers(selections, marketType)
- Inside generate-market-odds/index.ts, factor the multiplier algorithm into a pure function that returns:
  - multipliers[]
  - implied_sum
  - debug: temperature, iterations, clipped_count, dynamicMax, band, status, feasibility flags
- The algorithm will follow your scaling rule precisely:
  1) p_i computed
  2) m_raw = 1 / p_i
  3) implied_raw = Σ(1/m_raw) (should be 1.0)
  4) scale k = implied_raw / targetMid (so m = m_raw * k → implied becomes targetMid before clamping)
  5) iterative loop (≤25):
     - clamp + ladder-round
     - implied = Σ(1/m)
     - if in band: success
     - else recompute k = implied / targetMid and rescale multipliers, then clamp+round again
  6) if cannot converge because too many are clipped:
     - adjust temperature up/down (≤5 attempts), recompute p_i from softmax, restart
  7) feasibility guardrails:
     - If fieldSize/baseMax > target.max, dynamicMax must increase (otherwise impossible).
     - Conversely, if hitting minCap too often, allow a small minCap relaxation by marketType only if needed to converge (or prefer raising dynamicMax).

F) Override-aware calibration (so overrides can’t break the band)
- Update generate-market-odds/index.ts to read enabled market_multiplier_overrides for the market.
- Treat enabled overrides as “locked multipliers”:
  - implied_locked = Σ(1/m_locked)
  - remaining_budget = targetMid - implied_locked
  - If remaining_budget <= 0: mark NEEDS_REVIEW with explicit reason “locked multipliers consume full implied budget”
  - Otherwise calibrate only the unlocked athletes to hit remaining_budget (same iterative clamp+round loop applied to the unlocked set)
- This ensures:
  - Overrides no longer make markets permanently BLOCKED unless truly impossible.

Phase 2 — Persist debug fields and provide audit query
G) Persist debugging fields per athlete/market
- market_odds already stores: strength_score, temperature_used, calibration_iterations.
- Add storage for clipped_count and dynamic_max_used (migration):
  - market_odds.clipped_count integer
  - market_odds.dynamic_max_used numeric
- Continue writing a structured audit_logs entry per generation with:
  - implied_sum, target band, temperature, iterations, clipped_count, override_count, dynamic_max_used, model_version

H) Provide an audit view/query
- Add a database view (migration) for admins:
  market_odds_audit_v
  Columns:
  - market_id, selection_id, athlete_id, athlete_name
  - rating_used, rank_used
  - strength_score
  - normalized_probability (p_i)
  - final_decimal_odds (multiplier)
  - implied_contrib = 1/final_decimal_odds
  - temperature_used, calibration_iterations, clipped_count, dynamic_max_used

Phase 3 — Admin UX & “blocked” semantics
I) Fix the admin “BLOCKED” source of truth
- Update /admin/odds-review page logic to stop treating “out of band” as a dead-end:
  - If overrides are the cause: display “Overrides causing out-of-band pricing” with a one-click fix (Clear overrides + Regenerate).
  - If engine can’t converge: display “Needs review” with the explicit feasibility reason (caps/overrides conflict).
- Ensure the label and copy matches what you actually have:
  - “Multiplier Review” (not “Market Odds Review”)
  - Clarify implied sum definition and why <100% is targeted.

J) Ensure beta users aren’t blocked by admin-only status flags
- Keep the strict “no publish if out of band” rule for admin publish actions.
- For the user betting flow:
  - If a market is mid-regeneration or marked needs_review, show “Market pricing updating—try again in a minute” (and optionally disable entry buttons briefly), rather than leaving the tournament unusable.

Regression tests (Deno unit tests)
Add at least 6 tests under supabase/functions/generate-market-odds/:
1) WINNER fieldSize 6 → implied_sum in [0.90,0.92] after rounding/clamp
2) WINNER fieldSize 12 → in band, favorites lowest multipliers
3) PODIUM fieldSize 25 → in band
4) HIGHEST_SCORE fieldSize 11 (your screenshot case) → in band, and confirm feasibility-driven dynamicMax > baseMax when required
5) With 2 locked multiplier overrides → still converges in band
6) Cap conflict case (locks consume implied budget) → returns NEEDS_REVIEW with explicit reason

Acceptance test (your exact scenario)
For slalom open_men HIGHEST_SCORE with 11 athletes:
- After “Clear overrides + Regenerate”:
  - odds_validation_status becomes VALID
  - implied_sum is between 0.87 and 0.89
  - favorites have the lowest multipliers
  - the system may raise dynamicMax above 8x if required by feasibility; the UI will show “Dynamic cap raised due to field size to meet target band” so this is transparent and auditable
  - tournament is usable for beta predictions immediately

Files that will be changed
Backend functions:
- supabase/functions/generate-market-odds/index.ts
- supabase/functions/manage-multiplier-overrides/index.ts

Frontend:
- src/pages/admin/MarketOddsReview.tsx (this is the /admin/odds-review “Multiplier Review” page)
- (optional) src/components/admin/ProbabilityReviewPanel.tsx if it still uses approximation math anywhere for gating publish, to rely on odds_validation_status and backend implied sum.

Database migration:
- Add market_odds.clipped_count, market_odds.dynamic_max_used
- Create/replace market_odds_audit_v view

Rollout steps
1) Ship Phase 0 unblock + override hygiene first (immediately makes “Regenerate Auto” actually work).
2) Ship deterministic engine + override-aware calibration.
3) Run “Clear overrides + Regenerate” on the beta tournament’s problematic markets.
4) Verify from /admin/odds-review that implied sum is in-band and that override count is no longer 11/11 unless intentionally set.
