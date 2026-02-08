

# Consistent Tournament Timing Messages

## Current Problem

For the same tournament, users see:
- **Predictions**: "Predictions open in 22h"
- **Fantasy**: "1d 22h until lock"

This is confusing because they reference different events (window opening vs. tournament starting).

## Solution

Use tournament start as the universal anchor and make messaging consistent across features.

## Message Format Changes

### Before (Confusing)

| Feature | Message |
|---------|---------|
| Predictions | "Predictions open in 22h" |
| Fantasy | "1d 22h until lock" |

### After (Consistent)

| Feature | Status | Message |
|---------|--------|---------|
| Predictions | Pre-open | "Opens in 22h (event starts in 1d 22h)" |
| Predictions | Open | "Open - Locks in 23h 45m" |
| Fantasy | Pre-start | "Locks in 1d 22h" |

Both now clearly show time relative to when they **lock** (tournament start), so users understand the relationship.

---

## Files to Modify

### 1. `src/utils/predictionWindows.ts`

Update the `getPredictionWindowStatus` function messages:

**When predictions not yet open (line 98-102):**
```typescript
// Before
const message = days > 0 
  ? `Predictions open in ${days}d ${hours}h`
  : hours > 0
    ? `Predictions open in ${hours}h ${minutes}m`
    : `Predictions open in ${minutes}m`;

// After - show BOTH times
const timeUntilStart = start.getTime() - now.getTime();
const startDays = Math.floor(timeUntilStart / (1000 * 60 * 60 * 24));
const startHours = Math.floor((timeUntilStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

const opensIn = days > 0 
  ? `${days}d ${hours}h`
  : hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m`;

const locksIn = startDays > 0 
  ? `${startDays}d ${startHours}h`
  : `${startHours}h`;

const message = `Opens in ${opensIn} · Locks in ${locksIn}`;
```

**When predictions are open (line 78-82):**
```typescript
// Before
const message = days > 0 
  ? `Predictions open – Starts in ${days}d ${hours}h`
  : hours > 0
    ? `Predictions open – Starts in ${hours}h ${minutes}m`
    : `Predictions open – Starts in ${minutes}m`;

// After - use "Locks in" terminology
const message = days > 0 
  ? `Open – Locks in ${days}d ${hours}h`
  : hours > 0
    ? `Open – Locks in ${hours}h ${minutes}m`
    : `Open – Locks in ${minutes}m`;
```

### 2. `src/utils/fantasyLockRules.ts`

Update `getTimeUntilLock` (line 217-223) to match format:

```typescript
// Before
if (days > 0) {
  return `${days}d ${hours}h until lock`;
} else if (hours > 0) {
  return `${hours}h ${minutes}m until lock`;
} else {
  return `${minutes}m until lock`;
}

// After - use "Locks in" for consistency
if (days > 0) {
  return `Locks in ${days}d ${hours}h`;
} else if (hours > 0) {
  return `Locks in ${hours}h ${minutes}m`;
} else {
  return `Locks in ${minutes}m`;
}
```

---

## Result

With these changes, users will see consistent messaging:

| Time Before Event | Predictions Message | Fantasy Message |
|-------------------|---------------------|-----------------|
| 46h (1d 22h) | "Opens in 22h · Locks in 1d 22h" | "Locks in 1d 22h" |
| 23h | "Open – Locks in 23h" | "Locks in 23h" |
| 1h | "Open – Locks in 1h" | "Locks in 1h" |
| Event started | "Predictions locked – event in progress" | (Locked badge) |

Both features now use "Locks in X" as the primary time reference, making it clear that everything locks at the same time (tournament start).

