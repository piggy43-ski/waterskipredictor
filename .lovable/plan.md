
# RLS Hardening Plan

## Executive Summary
This plan addresses all Row-Level Security (RLS) policy gaps across 44 tables. The goal is to ensure every table has explicit, well-defined access controls following the principle of least privilege.

## Table Classification

### Category A: Public Read-Only (14 tables)
These tables contain non-sensitive data that needs to be visible to all users for the app to function:

| Table | Current SELECT | Write Policies | Status |
|-------|----------------|----------------|--------|
| athletes | USING (true) | Admin-only | OK |
| athlete_rankings | USING (true) | Admin-only | OK |
| athlete_results | USING (true) | Admin-only | OK |
| tournaments | USING (true) | Admin-only | OK |
| tournament_entries | USING (true) | Admin-only | OK |
| tournament_results | USING (true) | Admin-only | OK |
| markets | USING (true) | Admin-only | OK |
| market_entries | USING (true) | Admin-only | OK |
| market_odds | USING (true) | Admin-only | OK |
| market_results | USING (true) | Admin-only | OK |
| selections | USING (true) | Admin-only | OK |
| rewards | USING (true) | **MISSING ADMIN WRITE** | NEEDS FIX |
| help_articles | is_active = true | Admin-only | OK |
| fantasy_config | USING (true) | Admin-only | OK |

### Category B: User-Owned Private (13 tables)
These tables contain user-specific data:

| Table | Current Policies | Issues |
|-------|------------------|--------|
| profiles | user_id = auth.uid() | OK |
| predictions | user_id = auth.uid() | OK |
| bet_slips | user_id = auth.uid() | OK |
| podium_selections | via prediction ownership | OK |
| token_wallets | user_id = auth.uid() | **MISSING INSERT** |
| token_transactions | user_id = auth.uid() | OK |
| email_preferences | user_id = auth.uid() | OK |
| notifications | user_id = auth.uid() | OK |
| fantasy_entries | user_id = auth.uid() | OK |
| fantasy_entry_athletes | via entry ownership | OK |
| fantasy_invites | ownership checks | OK |
| fantasy_pots | visibility + ownership | OK |
| redemptions | user_id = auth.uid() | **MISSING ADMIN ACCESS** |

### Category C: Admin-Only (13 tables)
These tables should only be accessible to admins:

| Table | Current Policies | Issues |
|-------|------------------|--------|
| audit_logs | SELECT: admin, INSERT: true | OK (service role INSERT) |
| user_roles | Admin SELECT/INSERT/DELETE | OK |
| notification_jobs | Admin ALL | OK |
| odds_generation_jobs | Admin ALL | OK |
| safe_mode_jobs | Admin ALL | OK |
| house_rewards_liability | Admin + user INSERT | OK |
| fantasy_scoring_events | Admin write, user SELECT | OK |
| rating_adjustments | USING (true) SELECT | **SHOULD BE ADMIN-ONLY** |
| rating_history | USING (true) SELECT | **SHOULD BE ADMIN-ONLY** |
| risk_config | USING (true) SELECT | **EXPOSES BUSINESS RULES** |
| market_liability | auth.uid() IS NOT NULL | **EXPOSES RISK DATA** |
| system_events | Admin SELECT only | **NEEDS INSERT FOR SERVICE** |
| email_logs | **NO POLICIES** | **NEEDS ADMIN POLICIES** |

### Category D: Override/Config Tables (4 tables)
| Table | Current Policies | Status |
|-------|------------------|--------|
| market_multiplier_overrides | is_enabled SELECT | OK |
| market_probability_overrides | is_enabled SELECT | OK |
| parlay_markets | status = OPEN SELECT | OK |

---

## Required Policy Changes

### 1. rewards - Add Admin Write Policies
**Current:** SELECT only with `USING (true)`
**Issue:** Admins cannot manage rewards from the UI
**New policies:**
```sql
-- Admins can insert rewards
CREATE POLICY "Admins can insert rewards"
ON public.rewards FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update rewards
CREATE POLICY "Admins can update rewards"
ON public.rewards FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete rewards
CREATE POLICY "Admins can delete rewards"
ON public.rewards FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

### 2. token_wallets - Add User INSERT Policy
**Current:** Missing INSERT (wallets created by triggers)
**Issue:** If trigger fails, users can't create wallet
**New policy:**
```sql
-- Users can insert their own wallet
CREATE POLICY "Users can insert their own wallet"
ON public.token_wallets FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

### 3. redemptions - Add Admin Access Policies
**Current:** Users can INSERT/SELECT only
**Issue:** Admins can't view or update redemption status for fulfillment
**New policies:**
```sql
-- Admins can view all redemptions
CREATE POLICY "Admins can view all redemptions"
ON public.redemptions FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update redemption status
CREATE POLICY "Admins can update redemptions"
ON public.redemptions FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

### 4. email_logs - Add Admin Policies
**Current:** RLS enabled but NO policies (complete lockout)
**Issue:** No one can access email logs, breaking admin audit capability
**New policies:**
```sql
-- Admins can view email logs
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role insert (for edge functions)
CREATE POLICY "Service role can insert email logs"
ON public.email_logs FOR INSERT
TO authenticated
WITH CHECK (true);
```

### 5. system_events - Add INSERT Policy for Service Role
**Current:** Only SELECT for admins
**Issue:** Edge functions can't insert events
**New policies:**
```sql
-- Service role can insert events
CREATE POLICY "Service role can insert events"
ON public.system_events FOR INSERT
TO authenticated
WITH CHECK (true);

-- Service role can update events
CREATE POLICY "Service role can update events"
ON public.system_events FOR UPDATE
TO authenticated
USING (true);
```

### 6. risk_config - Restrict to Admin-Only
**Current:** `USING (true)` exposes liability caps and risk thresholds
**Issue:** Exposes internal business rules to all users
**Change:** Drop public read, add admin-only
```sql
DROP POLICY "Everyone can read risk_config" ON public.risk_config;

CREATE POLICY "Admins can read risk_config"
ON public.risk_config FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

### 7. market_liability - Restrict to Admin-Only
**Current:** Any authenticated user can read
**Issue:** Exposes real-time risk exposure data
**Change:**
```sql
DROP POLICY "Authenticated users can read market_liability" ON public.market_liability;
-- Admin ALL policy already exists
```

### 8. rating_adjustments - Restrict to Admin-Only
**Current:** `USING (true)` for SELECT
**Issue:** Exposes internal rating model mechanics
**Change:**
```sql
DROP POLICY "Rating adjustments viewable by everyone" ON public.rating_adjustments;

CREATE POLICY "Admins can view rating adjustments"
ON public.rating_adjustments FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

### 9. rating_history - Restrict to Admin-Only
**Current:** `USING (true)` for SELECT
**Issue:** Exposes internal rating calculations
**Change:**
```sql
DROP POLICY "Rating history is viewable by everyone" ON public.rating_history;

CREATE POLICY "Admins can view rating history"
ON public.rating_history FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

---

## Summary of Changes

| Table | Old Policy | New Policy | Rationale |
|-------|------------|------------|-----------|
| rewards | SELECT only | +INSERT/UPDATE/DELETE for admins | Enable reward management |
| token_wallets | No INSERT | +INSERT for user | Fallback wallet creation |
| redemptions | User only | +SELECT/UPDATE for admins | Fulfillment workflow |
| email_logs | No policies | +SELECT for admin, +INSERT | Admin audit + edge function write |
| system_events | SELECT only | +INSERT/UPDATE | Edge function event writing |
| risk_config | Public read | Admin-only read | Protect business rules |
| market_liability | Auth users read | Admin-only | Protect risk data |
| rating_adjustments | Public read | Admin-only | Protect rating model |
| rating_history | Public read | Admin-only | Protect rating model |

---

## Tables Confirmed as Public-Readable (Intentional)

These tables must remain publicly readable for the app to function:

1. **athletes** - Display athlete profiles
2. **athlete_rankings** - Show world rankings
3. **athlete_results** - Display competition results
4. **tournaments** - List available tournaments
5. **tournament_entries** - Show who's competing
6. **tournament_results** - Display final standings
7. **markets** - Show betting markets
8. **market_entries** - Show athletes in markets
9. **market_odds** - Display betting odds
10. **market_results** - Show market outcomes
11. **selections** - Show selection options
12. **rewards** - Display reward catalog
13. **help_articles** - Show help content (filtered by is_active)
14. **fantasy_config** - Display fantasy rules

---

## Technical Implementation

The implementation will use a single migration with all policy changes executed atomically:

1. Drop overly permissive policies
2. Create new restrictive policies
3. Verify no breaking changes to app functionality

---

## Post-Implementation Verification

After applying changes:
1. Re-run Supabase linter to confirm no warnings
2. Test user flows (predictions, fantasy, rewards)
3. Test admin flows (settlement, redemptions, audit)
4. Verify edge functions still work with service role
