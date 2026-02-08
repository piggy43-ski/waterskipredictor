
# Fix: Race Condition Causing Non-Admin Users to Be Redirected

## Problem Identified

The `TournamentDetailClean.tsx` page has a redundant authentication check that doesn't respect the loading state:

```typescript
// Line 85-89 - TournamentDetailClean.tsx
useEffect(() => {
  if (!user) {
    navigate('/auth');  // ← PROBLEM: Runs before auth state is loaded
    return;
  }
  fetchTournamentData();
  fetchWalletBalance();
}, [user, navigate, id]);
```

**What happens:**
1. User clicks on tournament → `ProtectedRoute` checks auth (shows loading skeleton)
2. Once loaded, `TournamentDetailClean` renders
3. The component's `useEffect` runs immediately
4. If there's any timing issue with `useAuth()` context, `user` can briefly be `null`
5. This triggers `navigate('/auth')` which then redirects back to home (if user IS logged in)

This explains why it works for you (admin) but not for other users — different network speeds, caching, or device performance can affect the timing.

## Solution

Remove the redundant `navigate('/auth')` redirect from `TournamentDetailClean.tsx` since `ProtectedRoute` already guarantees the user is authenticated when the component renders.

### File Change: `src/pages/TournamentDetailClean.tsx`

**Before (lines 85-93):**
```typescript
useEffect(() => {
  if (!user) {
    navigate('/auth');
    return;
  }
  
  fetchTournamentData();
  fetchWalletBalance();
}, [user, navigate, id]);
```

**After:**
```typescript
useEffect(() => {
  if (!user) return; // Just skip if no user - ProtectedRoute handles auth
  
  fetchTournamentData();
  fetchWalletBalance();
}, [user, id]); // Removed navigate from deps
```

## Why This Fixes It

| Before | After |
|--------|-------|
| Component redirects to `/auth` if user is null | Component waits for user to be populated |
| Race condition causes premature redirect | ProtectedRoute guarantees user exists when rendered |
| Some users get kicked to home page | All users can access tournament details |

## Additional Safety

We should also audit other pages to ensure they don't have similar issues. Pages to check:
- `AthleteProfile.tsx`
- `FantasyTeamView.tsx`  
- `FantasyTeamEdit.tsx`
- `FantasySeasonView.tsx`

These should either:
1. Not redirect at all (rely on ProtectedRoute)
2. Or check the `loading` state before redirecting

## Testing

After the fix:
1. Log in as user "paigepigozzi" (or any non-admin)
2. Navigate to a tournament detail page
3. Confirm the page loads properly without redirecting
4. Confirm predictions can be placed
