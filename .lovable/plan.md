
# Add Visual Indicator for Prediction Status

## Current State
The `TournamentCard` component already displays prediction window status with:
- A clock icon
- Text message (e.g., "Open – Locks in 1d 22h")
- Color coding based on `canPredict` and prediction status

However, the indicator is subtle and could be more visually prominent, especially to distinguish between:
- **Open** (can predict) - predictions are available
- **Closed** (locked) - predictions are locked because event is in progress
- **Finished** - event has completed

## Solution
Enhance the visual indicator in `TournamentCard` to:

1. **Add a Status Badge** - Display a prominent badge next to or near the prediction status text showing:
   - "✓ OPEN" (green) when `canPredict: true`
   - "🔒 LOCKED" (red) when `canPredict: false` and status is `'closed'`
   - "SETTLED" (gray) when status is `'finished'`

2. **Improve Visual Hierarchy** - Make the prediction status section more visually distinct from other information

3. **Color Coordination** - Use consistent colors:
   - Green (`text-success`) for open predictions
   - Red (`text-destructive`) for locked predictions
   - Gray (`text-muted-foreground`) for finished/settled

## Files to Modify

### `src/components/TournamentCard.tsx`

**Location**: Lines 82-96 (Prediction Window Status section)

**Changes**:
- Replace the simple text display with an enhanced section that includes:
  - A status badge showing "OPEN", "LOCKED", or "SETTLED"
  - Better visual separation and styling
  - Keep the countdown message below the status badge
  - Use appropriate color classes based on `predictionWindow.status` and `canPredict`

**Implementation approach**:
```typescript
// Create helper function to get status badge text and color
const getPredictionStatusDisplay = () => {
  if (predictionWindow.status === 'finished') {
    return { badge: 'SETTLED', color: 'text-muted-foreground' };
  }
  if (predictionWindow.status === 'closed') {
    return { badge: '🔒 LOCKED', color: 'text-destructive' };
  }
  if (predictionWindow.canPredict) {
    return { badge: '✓ OPEN', color: 'text-success' };
  }
  return { badge: 'UNAVAILABLE', color: 'text-muted-foreground' };
};

// Update the JSX to show badge + message
<div className="mt-4 pt-3 border-t border-border/50">
  <div className="flex items-center gap-2 mb-2">
    <Clock className="w-4 h-4 text-muted-foreground" />
    <span className={`text-sm font-bold ${statusDisplay.color}`}>
      {statusDisplay.badge}
    </span>
  </div>
  <p className="text-xs text-muted-foreground ml-6">
    {predictionWindow.message}
  </p>
</div>
```

## Result

Users will now see clearer, more visually distinct indicators:

| Prediction Status | Display | Color |
|-------------------|---------|-------|
| Open | "✓ OPEN" + "Open – Locks in 22h" | Green + Gray countdown |
| Locked (in progress) | "🔒 LOCKED" + "Predictions locked – event in progress" | Red |
| Finished/Settled | "SETTLED" + "Tournament settled" | Gray |

This makes it immediately obvious at a glance whether a user can place predictions on a tournament.
