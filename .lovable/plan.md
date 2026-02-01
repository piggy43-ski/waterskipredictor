

# Referral & Influencer System Implementation

## Overview

Build a secure, beta-safe referral system that:
- Rewards new users with bonus tokens on their **first purchase only**
- Tracks influencer commissions for real-money payouts
- Provides full admin control and revenue analytics
- Prevents all forms of abuse (self-referrals, retroactive application, multi-use)

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SIGNUP                                                      │
│     ├─ User enters optional referral code                       │
│     ├─ Code validated (exists, active, not expired)             │
│     └─ Code permanently linked to profile                       │
│                                                                 │
│  2. FIRST PURCHASE (Stripe Webhook)                             │
│     ├─ Check: first_purchase_at IS NULL?                        │
│     ├─ Check: referred_by_code_id IS NOT NULL?                  │
│     ├─ Apply bonus tokens (1.5x or 2x depending on code type)   │
│     ├─ Calculate referrer reward (tokens or USD)                │
│     ├─ Log redemption for auditing                              │
│     └─ Set first_purchase_at = NOW()                            │
│                                                                 │
│  ❌ BLOCKED: Existing users cannot apply codes                  │
│  ❌ BLOCKED: Second+ purchases do not trigger bonuses           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: `referral_codes`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| code | text | Unique, uppercase, e.g. "WATERDAVE" |
| type | text | 'regular' or 'influencer' |
| bonus_multiplier | numeric | 1.5 (50% bonus) or 2.0 (100% bonus) |
| referrer_reward_pct | numeric | 0.20 = 20% of purchase value |
| reward_type | text | 'tokens' or 'cash' |
| owner_user_id | uuid | FK → profiles (nullable for system codes) |
| is_active | boolean | Admin can toggle |
| max_uses_total | integer | Null = unlimited |
| uses_count | integer | Tracks current uses |
| start_at | timestamp | Null = immediately active |
| end_at | timestamp | Null = never expires |
| notes | text | Admin notes |
| created_by_admin | boolean | True if admin-created |
| created_at | timestamp | Auto |

### New Table: `referral_redemptions`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| referral_code_id | uuid | FK → referral_codes |
| referred_user_id | uuid | FK → profiles |
| referrer_user_id | uuid | FK → profiles (nullable) |
| purchase_id | text | Stripe payment intent ID |
| purchase_amount_tokens | integer | Original token amount |
| purchase_amount_usd | numeric | USD value of purchase |
| bonus_tokens_awarded | integer | Extra tokens given |
| referrer_reward_value | numeric | Reward owed (tokens or USD) |
| referrer_reward_type | text | 'tokens' or 'cash' |
| referrer_paid_at | timestamp | Null until paid out |
| created_at | timestamp | Auto |

### Modify: `profiles` Table

Add columns:
- `referred_by_code_id` (uuid, nullable, FK → referral_codes)
- `first_purchase_at` (timestamp, nullable)

---

## RLS Policies

| Table | Policy |
|-------|--------|
| referral_codes | Everyone can SELECT active codes for validation |
| referral_codes | Admins can INSERT/UPDATE/DELETE |
| referral_redemptions | Admins can SELECT all |
| referral_redemptions | Users can SELECT their own |
| referral_redemptions | Service role can INSERT (webhook) |

---

## Code Type Comparison

| Feature | Regular User | Influencer/Athlete |
|---------|--------------|-------------------|
| Creation | Self-service (future) or Admin | Admin only |
| Referred User Bonus | +50% (1.5x) | +100% (2x) |
| Referrer Reward | 20% as tokens | 20-30% as tokens OR cash |
| Payout | Automatic (tokens) | Manual (admin triggers) |
| Example | User buys 100 tokens for $1 → gets 150 | User buys 100 tokens for $1 → gets 200 |

---

## Implementation Files

### New Files

| File | Purpose |
|------|---------|
| `src/pages/admin/Referrals.tsx` | Admin referral code manager + analytics |
| `src/components/admin/ReferralCodeForm.tsx` | Create/edit referral code dialog |
| `src/components/admin/ReferralAnalytics.tsx` | Per-code performance metrics |

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/Auth.tsx` | Add optional referral code field in signup |
| `src/contexts/AuthContext.tsx` | Accept referral code in signUp, save to profile |
| `supabase/functions/stripe-webhook/index.ts` | Add referral bonus logic after purchase |
| `src/components/AdminLayout.tsx` | Add Referrals nav item |

---

## Signup Flow Changes

### Auth.tsx Updates

Add to signup form:
```text
┌──────────────────────────────────────────┐
│ Have a referral code? (Optional)         │
│ ┌──────────────────────────────────────┐ │
│ │ WATERDAVE                            │ │
│ └──────────────────────────────────────┘ │
│ ✓ Code validated                         │
└──────────────────────────────────────────┘
```

- Validate code on blur (check exists + active)
- Show green checkmark if valid
- Show error if invalid/expired
- Pass code to AuthContext.signUp()

### AuthContext Changes

Update `signUp()` to:
1. Accept optional `referralCode` parameter
2. After profile creation, update `referred_by_code_id` if code is valid
3. Increment `uses_count` on the referral code

---

## Stripe Webhook Changes

Update `checkout.session.completed` handler:

```text
1. Get user profile with referred_by_code_id and first_purchase_at
2. IF first_purchase_at IS NOT NULL → skip (not first purchase)
3. IF referred_by_code_id IS NULL → skip (no referral)
4. Get referral code details (bonus_multiplier, referrer_reward_pct, etc.)
5. Calculate bonus:
   - bonus_tokens = tokenAmount × (bonus_multiplier - 1)
6. Credit bonus to user wallet (as earned_tokens)
7. Calculate referrer reward:
   - reward_value = purchase_usd × referrer_reward_pct
8. Create referral_redemptions record
9. IF reward_type = 'tokens' AND owner_user_id exists:
   - Auto-credit tokens to referrer's wallet
10. Set first_purchase_at = NOW() on profile
```

---

## Admin Panel Features

### Referral Code Manager

- Table listing all codes with stats
- Create new code button
- Edit/deactivate existing codes
- Filter by type (regular/influencer)
- Search by code

### Per-Code Analytics

| Metric | Calculation |
|--------|-------------|
| Total Signups | COUNT users with this code |
| Total Conversions | COUNT redemptions |
| Conversion Rate | Conversions / Signups × 100% |
| Revenue Generated | SUM purchase_amount_usd |
| Bonus Tokens Issued | SUM bonus_tokens_awarded |
| Referrer Payout Owed | SUM referrer_reward_value WHERE paid_at IS NULL |
| Referrer Payout Paid | SUM referrer_reward_value WHERE paid_at IS NOT NULL |

### Export Features

- CSV export of all codes with stats
- CSV export of pending payouts (for influencers)

---

## Security Measures

| Risk | Prevention |
|------|------------|
| Self-referral | owner_user_id ≠ referred_user_id check |
| Multiple bonuses | first_purchase_at check in webhook |
| Retroactive application | Code must be attached at signup, before any purchase |
| Expired codes | start_at/end_at checks at signup validation |
| Deactivated codes | is_active check at signup validation |
| Max uses exceeded | uses_count < max_uses_total check |
| Existing user abuse | Cannot add code to profile after creation |

---

## UI Copy

### Signup Form
- Label: "Have a referral code? (Optional)"
- Placeholder: "Enter code"
- Valid: "✓ Code applied"
- Invalid: "Invalid or expired code"

### Purchase Success (with referral)
- "🎉 Referral bonus applied! You received X extra tokens thanks to your referral code."

### Purchase Success (without referral)
- Standard success message

### Invalid Use Attempt
- "Referral codes can only be applied when signing up and used on first purchase only."

---

## Phase 1 Scope (This Implementation)

**In Scope:**
- Database schema + RLS
- Signup flow with code input
- Stripe webhook bonus logic
- Admin code management
- Basic analytics
- CSV export

**Out of Scope (Future):**
- User self-service code generation
- Multi-tier referrals
- Leaderboards
- Automatic cash payouts
- Wallet integrations

---

## File Changes Summary

### Database Migration
- Create `referral_codes` table
- Create `referral_redemptions` table
- Add columns to `profiles`
- RLS policies for all

### Frontend (4 files)
- `src/pages/Auth.tsx` - Add referral code input
- `src/contexts/AuthContext.tsx` - Handle referral code in signup
- `src/pages/admin/Referrals.tsx` - New admin page
- `src/components/AdminLayout.tsx` - Add nav item

### Backend (1 file)
- `supabase/functions/stripe-webhook/index.ts` - Referral bonus logic

