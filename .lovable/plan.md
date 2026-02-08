

# Align Prediction and Fantasy Windows

## Problem
Currently there are two different rules:
- **Fantasy**: Can join/edit teams anytime before tournament starts (locks at start)
- **Predictions**: Can only predict within the 24-hour window before start

This is confusing - users can set up their fantasy team but can't make predictions until the 24h window opens.

## Solution
Match prediction availability to fantasy - both should be **open immediately** and **lock at tournament start**.

## Technical Changes

### File: `src/utils/predictionWindows.ts`

Remove the 24-hour restriction. Predictions should be open anytime before the tournament starts.

**Current logic (lines 41-42, 71-72, 91-120):**
```typescript
// Predictions open 24 hours before tournament start
const predictionsOpen = new Date(start.getTime() - 24 * 60 * 60 * 1000);

// ...later...
// Prediction window is open (within 24h before start)
if (now >= predictionsOpen && now < start) { ... }

// Too early - predictions not yet open
// Shows "Opens in X · Locks in Y"
```

**New logic:**
```typescript
// Predictions are open anytime before tournament starts
// (no more 24h restriction - consistent with fantasy)

// If before tournament start, predictions are open
if (now < start) {
  const timeLeft = start.getTime() - now.getTime();
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  
  const message = days > 0 
    ? `Open – Locks in ${days}d ${hours}h`
    : hours > 0
      ? `Open – Locks in ${hours}h ${minutes}m`
      : `Open – Locks in ${minutes}m`;
  
  return {
    status: 'open',
    message,
    canPredict: true
  };
}
```

## Result

| Time Before Event | Before (Predictions) | After (Predictions) | Fantasy |
|-------------------|----------------------|---------------------|---------|
| 2 days out | "Opens in 1d · Locks in 2d" | "Open – Locks in 2d" | "Locks in 2d" |
| 22h out | "Opens in 22h · Locks in 1d 22h" | "Open – Locks in 22h" | "Locks in 22h" |
| Event started | "Predictions locked" | "Predictions locked" | (Locked badge) |

Both features now open at the same time and lock at the same time, creating a consistent user experience.

