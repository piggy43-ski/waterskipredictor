

# Fix: Incorrect Win Emails + Discipline Tab Default

## Two Issues Reported by Beta Tester

### Issue 1: Wrong "You Won!" Emails

**Root Cause**: In `settle-predictions/index.ts` (lines 1179-1252), the email notification logic fetches **ALL** settled predictions for each affected user — not just the ones settled in the current batch. It then prioritizes sending the first WON prediction it finds (line 1227):

```typescript
const winPred = userPredictions.find(p => p.status === 'WON');
const predToEmail = winPred || userPredictions[0];
```

The user who bet on Jaimee Bull as **WINNER** (correctly settled as LOST) also had a **PODIUM** prediction that included Bull and was correctly settled as WON. The email picked the podium WON prediction and sent `"🎉 You Won!: Bull Jaimee"` — which reads misleadingly as if Bull won the event.

Additionally, the query has no time filter, so it pulls in WON predictions from **previous tournaments** too, making this worse.

**Fix**: Track settled prediction IDs during the settlement loop, then only email about predictions settled in this batch. Also include the market type in the email subject for clarity.

In `supabase/functions/settle-predictions/index.ts`:
- Add a `Set<string>` to track prediction IDs settled in this batch
- Replace the generic `predictions` query (lines 1179-1193) with a filter using these tracked IDs
- Include market type context in the email data so the subject reads `"🎉 You Won!: Bull Jaimee (Podium)"` instead of just `"🎉 You Won!: Bull Jaimee"`

### Issue 2: Discipline Tabs Always Default to Slalom

**Root Cause**: In `TournamentDetailClean.tsx` line 1025, the discipline tabs use `defaultValue="slalom"`:

```tsx
<Tabs defaultValue="slalom" className="w-full">
```

When a user clicks the "Jump" badge on the TournamentCard or wants to view Jump results, the page always opens to Slalom.

**Fix**: 
1. Make `TournamentCard` pass the clicked discipline as a URL parameter: `/tournaments/:id?discipline=jump`
2. In `TournamentDetailClean.tsx`, read the `discipline` query param and use it as the default tab value (falling back to the first discipline)
3. Also make the `TournamentResults` component respect the same parameter for consistency

**Files Changed**:
- `supabase/functions/settle-predictions/index.ts` — fix email selection logic
- `supabase/functions/send-email/index.ts` — add market type to subject line
- `src/pages/TournamentDetailClean.tsx` — read discipline query param for tab default
- `src/components/TournamentCard.tsx` — pass discipline on badge click (optional enhancement)

