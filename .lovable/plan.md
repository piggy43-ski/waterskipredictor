

## Give 100 Bonus Tokens + Send Beta Launch Email to All Users

### Overview

Award every user 100 bonus tokens and send them a personalized email announcing the beta launch with the upcoming tournament on **February 8th, 2026**.

---

### What Will Happen

| Action | Details |
|--------|---------|
| **Users affected** | 107 users |
| **Tokens awarded** | 100 per user (10,700 total) |
| **Email sent** | Beta launch announcement with tournament details |

---

### Implementation Steps

#### 1. Create New Edge Function: `send-beta-launch`

A one-time edge function that:
- Fetches all users from `profiles`
- Adds 100 tokens to each user's wallet
- Creates a bonus transaction record for tracking
- Sends a personalized beta launch email

#### 2. Email Content

**Subject:** "🎿 Your Beta Tokens Are Here - Tournament Opens Tomorrow!"

**Message:**
- Thank them for signing up early for the beta
- Announce they've received 100 free tokens
- Tournament is on **February 8th, 2026**
- Predictions open tomorrow
- CTA button to explore the platform

#### 3. Database Updates Per User

For each of the 107 users:
```sql
-- Update wallet balance
UPDATE token_wallets 
SET earned_tokens = earned_tokens + 100 
WHERE user_id = ?

-- Record the transaction
INSERT INTO token_transactions (user_id, type, amount, balance_after, description)
VALUES (?, 'bonus', 100, ?, 'Beta launch bonus - early signup reward')
```

---

### Technical Details

**Files to Create:**
- `supabase/functions/send-beta-launch/index.ts` - The one-time bulk send function

**Email Template Style:**
- Matches existing dark theme design (background: #0a0a0a)
- Blue accent color (#3b82f6) for branding
- Water ski emoji header
- Clear CTA button to explore tournaments

**Security:**
- Function uses service role key to update all wallets
- Admin-only trigger (won't be publicly callable after use)

---

### Execution Flow

```text
1. Admin triggers edge function
       ↓
2. Fetch all 107 users from profiles
       ↓
3. For each user:
   ├── Update token_wallets (+100 earned_tokens)
   ├── Insert token_transactions record
   └── Send personalized email via Resend
       ↓
4. Return summary (success count, failures)
```

---

### Edge Function Code Summary

The function will:
1. Query all profiles (email, username, id)
2. Loop through each user
3. Update their wallet balance
4. Log the bonus transaction
5. Send the beta launch email
6. Return a summary of results

