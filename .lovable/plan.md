

# Resend Audience Subscription System

## Overview

Build an automated system to subscribe users to a Resend Audience list ("WaterSki Predictor Users") whenever they sign up with marketing consent. This enables email broadcasts and marketing campaigns.

---

## Current State Analysis

| Component | Status |
|-----------|--------|
| `email_preferences.marketing` column | ✅ Already exists (defaults to `false`) |
| `profiles` table | ✅ Has user info (username, email) |
| `send-email` edge function | ✅ Exists, uses Resend API |
| `RESEND_API_KEY` secret | ✅ Already configured |
| Marketing opt-in checkbox on signup | ❌ Not implemented |
| Resend Audience integration | ❌ Not implemented |

---

## Implementation Components

### 1. Add Marketing Opt-In Checkbox to Signup Form

Add a checkbox to the signup page asking users if they want to receive marketing emails:

```
☐ Keep me updated on tournaments, promotions, and news
```

This is **optional** and unchecked by default.

---

### 2. Create Tracking Table

New `email_subscriptions` table to log all Resend subscription attempts:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Reference to auth user |
| `email` | TEXT | Email address |
| `audience_id` | TEXT | Resend audience ID |
| `contact_id` | TEXT | Resend contact ID (if created) |
| `subscribed` | BOOLEAN | Success status |
| `tags` | TEXT[] | Tags applied |
| `error_message` | TEXT | Error details if failed |
| `created_at` | TIMESTAMP | When subscription was attempted |
| `updated_at` | TIMESTAMP | Last update time |

---

### 3. Create Edge Function: `subscribe-to-audience`

New backend function to handle Resend Audience subscriptions:

```text
Flow:
1. Receive: { email, userId, firstName, tags[], marketingOptIn }
2. Validate email format
3. Check marketingOptIn = true (if false, return early)
4. Check for existing contact in Resend
5. If exists → update tags
6. If not exists → create contact with:
   - email
   - first_name
   - external_id (user_id)
   - tags: ["beta-user", "registered-user"]
7. Log result to email_subscriptions table
8. Return success/failure (never throw - fail gracefully)
```

**Key APIs Used:**
- `POST /audiences/{audience_id}/contacts` - Create contact
- `GET /audiences/{audience_id}/contacts?email=x` - Check existing
- `PATCH /audiences/{audience_id}/contacts/{id}` - Update tags

---

### 4. Integration Points

**A. On User Signup (AuthContext.tsx)**

After successful signup, call the edge function:

```typescript
// After profile update, if marketing consent given
if (marketingOptIn) {
  await supabase.functions.invoke('subscribe-to-audience', {
    body: {
      email,
      userId: data.user.id,
      firstName: username,
      tags: ['registered-user', 'beta-user'],
      source: 'signup'
    }
  });
}
```

**B. On Profile Email Update (future enhancement)**

When user updates their email in profile settings, call the function to update Resend.

---

### 5. Environment Variable Needed

| Secret | Purpose |
|--------|---------|
| `RESEND_AUDIENCE_ID` | The Resend Audience ID for "WaterSki Predictor Users" |

You'll need to:
1. Go to [Resend Audiences](https://resend.com/audiences)
2. Create audience named "WaterSki Predictor Users"
3. Copy the audience ID
4. Add it as a secret

---

### 6. Fail-Safe Design

The subscription system is designed to **never block user signup**:

```text
try {
  await supabase.functions.invoke('subscribe-to-audience', {...})
} catch (error) {
  console.error('Audience subscription failed:', error)
  // Signup continues normally - user is NOT affected
}
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/subscribe-to-audience/index.ts` | **Create** - New edge function |
| `src/pages/Auth.tsx` | **Modify** - Add marketing checkbox |
| `src/contexts/AuthContext.tsx` | **Modify** - Pass marketing opt-in, call edge function |
| Database migration | **Create** - Add `email_subscriptions` table |

---

## Signup Flow After Implementation

```text
┌─────────────────────────────────────────────────────────┐
│                    USER SIGNUP FORM                      │
├─────────────────────────────────────────────────────────┤
│  Email: _______________                                  │
│  Username: _______________                               │
│  Password: _______________                               │
│                                                          │
│  ☑ I confirm I am 18 years or older                     │
│  ☑ I agree to Terms and Privacy Policy                  │
│  ☐ Keep me updated on tournaments and promotions        │
│                                                          │
│         [ SIGN UP ]                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 SIGNUP PROCESS                           │
├─────────────────────────────────────────────────────────┤
│  1. Create auth user                                     │
│  2. Create profile                                       │
│  3. Set email_preferences.marketing = true/false         │
│  4. Send welcome email                                   │
│  5. IF marketing = true:                                 │
│     └→ Call subscribe-to-audience (async, fail-safe)    │
└─────────────────────────────────────────────────────────┘
```

---

## Edge Function Logic

```typescript
// subscribe-to-audience/index.ts

// 1. Validate request
// 2. Check consent - if false, log skipped and return
// 3. Search for existing contact by email
// 4. If found, update tags (add any new ones)
// 5. If not found, create new contact
// 6. Log result to email_subscriptions table
// 7. Return { success: true, contactId: "..." }
```

---

## Tags System

| Tag | Applied When |
|-----|--------------|
| `registered-user` | On signup |
| `beta-user` | On signup (during beta period) |
| `active-user` | (Future) After first prediction |
| `premium-user` | (Future) After first token purchase |

---

## Security Measures

- Email validation (proper format check)
- Server-side only (edge function)
- Rate limiting via Resend API limits
- No sensitive data exposed
- Consent verified before subscription

