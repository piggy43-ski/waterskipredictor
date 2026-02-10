

# Auto-Detect Round Type (Semi/Final) from AI Parsing

## Problem
When you upload an image or link of tournament results, the AI parser extracts athletes and scores but does NOT detect which round (semifinal vs final) the results belong to. It always applies results to whichever round tab you have manually selected. You want the system to automatically figure out whether the content is semifinals or finals.

## Solution
Add round detection to the AI parsing pipeline:

1. **Update the AI prompt** in the `parse-tournament-scores` edge function to also detect the round type from the content (looking for keywords like "Semi", "Final", "Semifinal", "Preliminary", "Qualification", etc.)
2. **Return the detected round** in the AI response as a new `round_type` field
3. **Auto-switch the round tab** on the frontend when AI results are applied, based on what was detected
4. **Also auto-detect discipline** -- the AI already returns a `discipline` field but the frontend ignores it; we should use it too

## Implementation

### 1. Edge Function: `supabase/functions/parse-tournament-scores/index.ts`

- Add `round_type` to the `ParseResponse` interface: `round_type?: 'qual' | 'semi' | 'final'`
- Update the system prompt to include round detection instructions:
  - Look for headers like "Semi-Final", "Semifinal", "Semi", "Final", "Finals", "Qualifying", "Preliminary"
  - Default to "final" if unclear
- Update the JSON response schema in the user prompt to include `"round_type": "qual|semi|final"`

### 2. Frontend: `src/pages/admin/TournamentSettlement.tsx`

- Update the `AIParseResponse` type to include `round_type?: 'qual' | 'semi' | 'final'` and use the existing `discipline` field
- In `applyAIResults()`:
  - Read the detected `round_type` from parsed results (majority vote if multiple files)
  - Auto-set `selectedRound` to the detected round
  - Read the detected `discipline` and auto-set `selectedDiscipline`
  - Show a toast confirming what was auto-detected: "Detected: Semi-Final, Slalom"
- In the AI preview dialog, show the detected round and discipline so the admin can verify before applying

### 3. ParsedAthlete type update
- Add `round_type` to `ParsedAthlete` interface on both frontend and edge function

## Technical Details

### AI Prompt Addition (system prompt)
```
ROUND DETECTION:
- Look for "Semi-Final", "Semifinal", "Semi" -> round_type: "semi"
- Look for "Final", "Finals" -> round_type: "final" 
- Look for "Qualifying", "Preliminary", "Prelim" -> round_type: "qual"
- If the document says both (e.g. "Semi-Final & Final"), use the LAST/highest round
- Default to "final" if no round indicators found
```

### Response Schema Addition
```json
{
  "round_type": "semi|final|qual",
  "discipline": "slalom|trick|jump",
  "athletes": [...],
  "confidence": 0.95
}
```

### Frontend Auto-Apply Logic
When AI results come back:
1. Determine round from first result's `round_type` (or majority if multiple files)
2. Determine discipline from first result's `discipline`
3. Switch `selectedRound` and `selectedDiscipline` before applying entries
4. Show confirmation toast with detected values

