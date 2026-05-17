## 66th US Masters — Tournament Setup Plan

This is a data-heavy admin setup plus a few small platform changes (concentration cap enforcement + banned-word lint). I'll do it in three migration/data passes plus targeted code work, with a verification SELECT at the end.

### 1. Tournament row

Insert into `tournaments`:
- name: `66th US Masters`
- location: `Callaway Gardens, Pine Mountain, GA`
- start_date `2026-05-22`, end_date `2026-05-24`
- start_datetime `2026-05-22 08:00 ET`, end_datetime `2026-05-24 17:00 ET`
- disciplines `{slalom,trick,jump}`
- betting_open_time `2026-05-18 08:00 ET` (this is what the app reads as "predictions open")
- status `upcoming`, year 2026, has_semifinal true, has_final true
- notes carries the slug `us-masters-2026` and `featured: true` for the homepage card

### 2. Athletes

For each of the 28 unique athletes in the spec:
- Look up by `full_name` / `name` first. If present, reuse the existing row (and keep current `profile_image_url` per the spec).
- If missing, insert with name, country, country_code, gender, disciplines, `profile_image_url` from the spec, `is_retired=false`. `year_of_birth` is required NOT NULL in `athletes` — I'll use a placeholder 1990 when unknown, since the spec doesn't supply DOBs and we don't want to block on it (flagged for admin to enrich later).

### 3. Markets (6 divisions, no juniors, no wakeboard)

Six WINNER markets, one per division. Each carries:
- name (e.g. `Pro Men's Slalom — Winner`), market_type `WINNER`, category `pro`, discipline, tournament_id
- `locked_at` = division start − 30 min (per spec close time)
- `is_published=false` initially; admin flips after QA passes
- Semis/Finals share one WINNER market per discipline+gender (the bet is on the eventual division winner). Semis times are stored as `notification_jobs` reminders only.

Hard guard: SQL trigger on `markets` that rejects insert/update when discipline = `wakeboard` OR name ILIKE `%junior%` OR `%wakeboard%`. Keeps the wakeboard/junior rule enforced at DB level forever.

### 4. Market entries + hardcoded multipliers

For each division, insert `market_entries` (athlete↔market) and one `market_odds` row per athlete with:
- `final_decimal_odds` = the spec multiplier (e.g. 3.5)
- `base_decimal_odds` = same
- `base_probability` = 1/mult, `adjusted_probability` = implied%/100 from the spec
- `athlete_rank` from spec (#1..#8)
- `is_frozen=true` and `model_version='masters-2026-manual-v1'` so the odds engine can run in shadow mode without overwriting
- `manual_multiplier=1.0` (no further haircut — values already net)

Overrounds verified per division: 1.220 / 1.186 / 1.217 / 1.186 / 1.204 / 1.180.

### 5. Concentration caps (Regina pile-on protection)

New table `market_concentration_caps` (admin-managed) and a SECURITY DEFINER function `check_athlete_capacity(p_market_id, p_athlete_id, p_added_tokens)` that returns `{at_cap: bool, remaining_tokens: int}`. Caps stored per market+athlete with the tier %:
- Tier 1 (mult ≤ 4.0): 18%
- Tier 2 (4 < mult ≤ 7): 22%
- Tier 3+ (> 7): 25%

The function reads `market_liability.total_stake_tokens` for that athlete vs. SUM across the market.

Wire-in points:
- `validate-entry` edge function calls the capacity check before accepting an entry, and on `at_cap` returns neutral message: `"<Athlete> is at predicted entry capacity for this division — try another pick."` (matches the spec wording; satisfies our memory rule of neutral, no risk language).
- Admin dashboard surfaces caps in the existing Market Liability page.

### 6. Banned-word lint

Add `supabase/functions/_shared/bannedWords.ts` exporting the list (bet, wager, odds, sportsbook, payout, cashout, bookmaker, line, spread, gambling, stake). The market publish path (`publish_market` RPC and the admin UI publish handler) runs the lint over market name + tournament notes and blocks publish on any case-insensitive match. Output the matched token for the admin.

### 7. Risk pre-publish check

A SQL function `compute_worst_case_liability(tournament_id)` returning percentage of `house_bankroll_baseline`. Used by the admin publish gate; expected ~67% for this event with the current caps.

### 8. SEO + sitemap

- Update `src/pages/TournamentDetailClean.tsx` SEO call to consume the keywords list when the tournament slug matches.
- Add the new route `/tournaments/<id>` to `public/sitemap.xml`.
- SportsEvent JSON-LD (already shipped per previous SEO fix) will populate automatically from the tournament row.

### 9. Final verification

Run and report:
```sql
SELECT m.name, m.discipline, COUNT(me.*) AS athletes,
       ROUND(SUM(1 / mo.final_decimal_odds)::numeric, 3) AS overround
FROM markets m
JOIN market_entries me ON me.market_id = m.id
JOIN market_odds mo ON mo.market_id = m.id AND mo.athlete_id = me.athlete_id
WHERE m.tournament_id = '<new-id>'
GROUP BY m.id ORDER BY m.name;
```
Plus the QA checklist items (wakeboard=0, junior=0, multipliers exact, predictions_open_at correct).

### Order of execution

1. Migration: add wakeboard/junior trigger, `market_concentration_caps`, `check_athlete_capacity`, `compute_worst_case_liability`.
2. Data insert: tournament → athletes → markets → market_entries → market_odds → concentration caps.
3. Code: `validate-entry` capacity check, banned-word lint shared module, publish-gate wiring.
4. SEO/sitemap touch-ups.
5. Verification SELECT + QA checklist report.

### Open questions before I start

1. `athletes.year_of_birth` is NOT NULL — OK to use 1990 placeholder for any newly-created athletes and flag them in `notes='masters-2026-import: dob_unknown'` for admin enrichment?
2. The spec lists semis on Saturday and finals on Sunday but says one prediction window per division. Confirm: one WINNER market per discipline+gender (predictions close 30 min before *semis*, not finals) — that's the conservative, safer reading, but I want to confirm before I lock 12:00 ET Saturday as Pro Women's Slalom close.
3. The `validate-entry` capacity cap check is a server-side enforcement change. Anything client-side (greying out cards once at cap) — should that ship in the same pass, or admin-only enforcement first and UI later?
