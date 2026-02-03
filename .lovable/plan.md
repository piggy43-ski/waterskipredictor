

# Remove 10,000 Token Welcome Bonus

## Problem Summary

The database function `handle_new_user()` automatically gives **10,000 tokens** to every new user on signup. This needs to be stopped.

**Current State:**
- 17 total users in the system
- 10 welcome bonuses issued = 100,000 tokens given away
- All tokens are in `earned_tokens` column (0 purchased)
- Help articles still reference the 10k bonus

---

## What Will Change

### 1. Database Function Update

Modify `handle_new_user()` to create wallets with **0 tokens** instead of 10,000:

```text
BEFORE:
INSERT INTO token_wallets (user_id, earned_tokens, purchased_tokens)
VALUES (NEW.id, 10000, 0);

AFTER:
INSERT INTO token_wallets (user_id, earned_tokens, purchased_tokens)
VALUES (NEW.id, 0, 0);
```

Also remove the welcome bonus transaction record that gets created.

### 2. Help Article Update

Update the "How to create an account" article to remove the mention of bonus tokens:

| Before | After |
|--------|-------|
| "Get 10,000 bonus tokens as a new user!" | "Buy tokens in the Wallet tab to start predicting!" |

---

## Migration SQL

```sql
-- Update handle_new_user to NOT give tokens
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Create profile for new user
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  
  -- Create token wallet with ZERO tokens (users must purchase)
  INSERT INTO public.token_wallets (user_id, earned_tokens, purchased_tokens)
  VALUES (NEW.id, 0, 0);
  
  -- No welcome bonus transaction - users start at 0
  
  RETURN NEW;
END;
$$;

-- Update help article to remove 10k bonus mention
UPDATE help_articles 
SET body = REPLACE(
  body, 
  'Get 10,000 bonus tokens as a new user!', 
  'Buy tokens in the Wallet tab to start predicting!'
)
WHERE title = 'How to create an account';
```

---

## Existing Users

The 100,000 tokens already given to existing users will remain in their accounts. If you want to reclaim those tokens, that would be a separate admin action (burning tokens per user).

---

## Files Changed

| File | Change |
|------|--------|
| Database migration | New migration to update `handle_new_user()` function |
| Database | Update help article content |

---

## Result

After this change:
- New users will start with **0 tokens**
- They must purchase tokens via the Wallet to play
- The welcome email already prompts them to "Buy Tokens to Start"
- Help articles will reflect the correct flow

