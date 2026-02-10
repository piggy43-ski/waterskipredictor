

# Fix: Auto-Determine Winners, Podiums, and Highest Scores from Entered Results

## Problem
The settlement preview doesn't automatically determine results from scores. Instead:
- **HIGHEST_SCORE** only picks a single winner (no tie support), and uses `raw_score` which loses slalom precision
- **WINNER** and **PODIUM** rely on manually-entered `final_overall_rank` fields instead of deriving positions from actual scores
- This forces you to manually verify every market result, defeating the purpose of entering scores

## Solution
Rewrite the settlement preview logic to **derive all market outcomes directly from scores**, using discipline-aware comparison (slalom notation, numeric for trick/jump), with proper tie handling.

## Changes

### File: `src/pages/admin/TournamentSettlement.tsx`

**A) Fix HIGHEST_SCORE: support ties and use discipline-aware comparison**

Replace the single-winner tracking with a list that collects all athletes sharing the top score:

```
- Track highestScorers[] instead of single highestScorerId
- Use compareScores() for comparison instead of raw numeric >
- When scores are equal (compareScores returns 0), add to the list
- When a higher score is found, reset the list
- Map ALL tied winners to winning selections
```

This means if Nate and Charlie both score `3@41` (the highest), both get flagged as HIGHEST_SCORE winners.

**B) Fix WINNER: derive from scores, not manual rank**

Instead of `validResults.find(r => r.final_overall_rank === 1)`:

```
- Sort final results using compareScores() (discipline-aware)
- The athlete(s) with the best score are the winner(s)
- Support ties at position 1 (both get winning selections)
```

**C) Fix PODIUM: derive top-3 from scores, not manual rank**

Instead of filtering by `final_overall_rank <= 3`:

```
- Sort final results by score (discipline-aware)
- Take the top 3 positions (accounting for ties -- e.g., if 2 athletes tie for 2nd, both are podium)
- Build the actualPodiumMap from derived positions, not manual ranks
- For exact-order podium bets, use the derived positions for matching
```

**D) Cross-round highest score: use score_display for slalom**

For slalom, compare using `score_display` (which contains `3@41` notation) or the parsed slalom value, not just `raw_score`. For trick/jump, `raw_score` continues to work fine.

### Summary of Logic Flow

```text
Scores entered --> Sort by discipline-aware comparison
                      |
                      v
              Derive positions (1st, 2nd, 3rd...)
                      |
          +-----------+-----------+
          |           |           |
       WINNER      PODIUM    HIGHEST_SCORE
      (rank 1)   (rank 1-3)  (max across all rounds,
                              ties supported)
```

### Files Modified
- `src/pages/admin/TournamentSettlement.tsx` (settlement preview calculation logic, ~lines 714-810)

