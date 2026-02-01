
# Require Authentication for All App Access

## Overview
Force all visitors to sign up or log in before they can see any app content. When someone clicks a link to the app, they'll be immediately redirected to the authentication page.

---

## Current Behavior

- Visitors can access the home page and see a welcome card + featured tournament preview
- Other pages (Profile, Wallet, etc.) individually redirect to `/auth` if not logged in
- The Auth page checks if user is logged in and redirects to `/` if so

## New Behavior

- ANY route except `/auth`, `/reset-password`, `/update-password`, `/terms`, and `/privacy` requires authentication
- Unauthenticated visitors are immediately redirected to `/auth`
- No app content is visible without signing in

---

## Implementation

### 1. Create a ProtectedRoute Component

Create a new component that wraps protected routes and handles the redirect logic:

```text
src/components/ProtectedRoute.tsx
```

This component will:
- Check if the user is authenticated using `useAuth()`
- Show a loading state while checking auth status
- Redirect to `/auth` if not authenticated
- Render the child content if authenticated

### 2. Update App.tsx Routes

Wrap all protected routes with the `ProtectedRoute` component:

**Public routes (no wrapper):**
- `/auth` - Authentication page
- `/reset-password` - Password reset
- `/update-password` - Update password (after email link)
- `/terms` - Terms of Service (legal requirement)
- `/privacy` - Privacy Policy (legal requirement)

**Protected routes (wrapped):**
- `/` - Home
- `/profile` - User profile
- `/tournaments` - Browse tournaments
- `/tournaments/:id` - Tournament detail
- `/wallet` - Token wallet
- `/predictions` - User predictions
- `/rewards` - Rewards page
- `/fantasy/*` - All fantasy routes
- `/athletes/:id` - Athlete profiles
- `/help` - Help center
- `/admin/*` - All admin routes
- All other app routes

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/ProtectedRoute.tsx` | **NEW** - Auth guard component |
| `src/App.tsx` | Wrap routes with ProtectedRoute |
| `src/pages/Index.tsx` | Remove unauthenticated welcome view (no longer needed) |

---

## User Experience

1. User clicks any app link (e.g., shared tournament link)
2. App checks authentication status
3. If not logged in → redirect to `/auth` (landing page with Sign Up / Log In)
4. User signs up or logs in
5. Redirected to the home page (or original destination)

---

## Technical Notes

- Uses existing `AuthContext` for auth state
- Shows loading skeleton while checking auth
- Terms and Privacy pages remain public (legal requirement)
- Reset password flow remains public (needed for account recovery)
