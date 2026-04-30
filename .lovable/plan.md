
# End-to-End Testing: All Bet Types + Fantasy

I'll use the browser to place real bets on the Swiss Pro Slalom through the app UI, testing every prediction type and fantasy entry. Your account has **8,514 tokens** available.

## Bet Allocation Plan (playing to win)

| # | Type | Category | Pick | Stake | Why |
|---|------|----------|------|-------|-----|
| 1 | **Winner** (Men) | open_men | Nate Smith (2.50x) | 500 | Defending champ, highest rating (99) |
| 2 | **Winner** (Women) | open_women | Regina Jaquess (2.50x) | 500 | Defending champ, rating 98 |
| 3 | **Highest Score** (Men) | open_men | Nate Smith (2.50x) | 500 | Best raw scoring ability |
| 4 | **Highest Score** (Women) | open_women | Regina Jaquess | 500 | Dominant scorer |
| 5 | **Podium** (Men) | open_men | Nate/Charlie/Will | 500 | Top 3 rated skiers |
| 6 | **Podium** (Women) | open_women | Regina/Jaimee/Allie | 500 | Top 3 rated skiers |
| 7 | **Parlay** | Men slalom | Multi-selection | 500 | Test parlay builder flow |
| 8 | **Fantasy** | Slalom | Join pot + draft roster | 1,000 | Entry fee for Swiss Pro Slalom 2026 pot |

**Total: ~4,500 tokens** (well within your 8,514 balance)

## Steps

1. Navigate to Swiss Pro Slalom tournament page
2. Place Men's Winner bet on Nate Smith (500 tokens)
3. Place Women's Winner bet on Regina Jaquess (500 tokens)
4. Place Men's Highest Score bet on Nate Smith (500 tokens)
5. Place Women's Highest Score bet on Regina Jaquess (500 tokens)
6. Place Men's Podium prediction (Nate 1st, Charlie 2nd, Will 3rd - 500 tokens)
7. Place Women's Podium prediction (Regina 1st, Jaimee 2nd, Allie 3rd - 500 tokens)
8. Build and place a Parlay (men's slalom multi-leg - 500 tokens)
9. Navigate to Fantasy page, join Swiss Pro Slalom 2026 pot (1,000 tokens)
10. Draft a roster of top-rated slalom athletes within 100k budget
11. Verify all bets appear on the Predictions page
12. Report any issues found during testing

## What This Tests
- Full bet placement flow (insert bet_slip + prediction + wallet deduction)
- All 3 market types: WINNER, PODIUM, HIGHEST_SCORE
- Both genders (open_men and open_women)
- Parlay builder flow
- Fantasy pot joining + team building
- Wallet balance updates
- UI navigation and confirmation flows
