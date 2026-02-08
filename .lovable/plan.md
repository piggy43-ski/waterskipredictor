
# Fix: Tournament Detail Redirecting Non-Admin Users to Homepage

## The Problem

The `TournamentDetailClean.tsx` page incorrectly uses the `useAdminCheck()` hook, which was designed **only for admin pages**. This hook has aggressive navigation logic:

```typescript
// Line 34-35 in useAdminCheck.tsx
if (!adminStatus) {
  navigate('/');  // ← Kicks ALL non-admins to homepage!
}
```

**Impact:**
- **121 total users** in the system
- **Only 1 admin** (you)
- **120 users cannot access tournament pages** ← Critical bug!

## Root Cause

| File | Issue |
|------|-------|
| `src/pages/TournamentDetailClean.tsx` (line 46) | Uses `useAdminCheck()` which redirects non-admins |
| `src/hooks/useAdminCheck.tsx` (line 34-35) | Navigates non-admins away from page |

## The Solution

Create a new **non-redirecting** admin check hook for pages that need to know admin status without enforcing admin-only access.

### Files to Modify

#### 1. Create New Hook: `src/hooks/useIsAdmin.ts`

```typescript
/**
 * Check if current user is an admin WITHOUT redirecting
 * Use this for pages that show admin features but are accessible to all users
 */
export const useIsAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      setIsAdmin(!!data);
      setIsLoading(false);
    };

    checkAdmin();
  }, [user]);

  return { isAdmin, isLoading };
};
```

#### 2. Update `src/pages/TournamentDetailClean.tsx`

**Before (line 25-46):**
```typescript
import { useAdminCheck } from '@/hooks/useAdminCheck';
...
const { isAdmin } = useAdminCheck();  // ← REDIRECTS NON-ADMINS!
```

**After:**
```typescript
import { useIsAdmin } from '@/hooks/useIsAdmin';
...
const { isAdmin } = useIsAdmin();  // ← Just checks, no redirect
```

## Summary

| Change | Before | After |
|--------|--------|-------|
| Hook used | `useAdminCheck` (redirects) | `useIsAdmin` (no redirect) |
| Non-admin users | Redirected to `/` | Can view tournament |
| Admin features | Hidden for non-admins | Still hidden for non-admins |
| Affected users | **120 users blocked** | **0 users blocked** |

## Verification After Fix

1. Log in as a non-admin user (e.g., Paigepigozzi)
2. Navigate to a tournament detail page
3. Confirm the page loads and predictions can be made
4. Confirm admin-only features (if any) are still hidden
