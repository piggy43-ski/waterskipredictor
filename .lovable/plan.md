

# Add "Coming Soon" Empty State to Rewards Page

## Overview
When there are no rewards available, display a friendly "Coming Soon" message instead of an empty page.

---

## Current Behavior
- Page shows tabs but with empty content when no rewards exist
- Only the "VIP" tab has a "Coming Soon" placeholder card

## New Behavior
- When `rewards.length === 0`, show a single "Coming Soon" card instead of the tabs
- Keep earning tokens message to encourage continued engagement

---

## Implementation

### File: `src/pages/Rewards.tsx`

**Change:** Add conditional rendering after the Trust Banner section (around line 438)

**Logic:**
```text
if (rewards.length === 0) {
  → Show "Coming Soon" card with Gift icon
  → Hide the tabs entirely
} else {
  → Show existing tabs and reward cards
}
```

**Empty State Card Design:**
- Gift/Package icon in a circular container
- "Rewards Coming Soon" title
- "Coming Soon" badge
- Encouraging message: "We're working on exciting rewards for you. Keep earning tokens!"
- Consistent styling with the existing VIP "Coming Soon" card

---

## Visual Preview

```text
┌─────────────────────────────────────────┐
│           Rewards Store        [tokens] │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │ Redeem tokens for real rewards... │  │
│  └───────────────────────────────────┘  │
│                                         │
│          ┌─────────────────┐            │
│          │    📦 (icon)    │            │
│          │                 │            │
│          │ Rewards Coming  │            │
│          │     Soon        │            │
│          │  [Coming Soon]  │            │
│          │                 │            │
│          │ We're working   │            │
│          │ on exciting     │            │
│          │ rewards...      │            │
│          └─────────────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

---

## Code Change Summary

| Location | Change |
|----------|--------|
| Line ~438 | Add `{rewards.length === 0 ? <ComingSoonCard /> : <Tabs>...</Tabs>}` |

The empty state will use the `Package` icon (already imported) and match the styling of the existing VIP "Coming Soon" card for visual consistency.

