

# Email Infrastructure Launch-Ready Implementation Plan

## Current State Analysis

### What's Working
- **4 email templates** exist in `send-email` edge function: `welcome`, `bet_confirmation`, `bet_result`, `redemption_receipt`
- **Welcome email** is triggered on signup in `AuthContext.tsx`
- **Bet result emails** are triggered during settlement in `settle-predictions` edge function
- **Redemption emails** are triggered in `Rewards.tsx`
- **Email logging** works via `email_logs` table
- **User preferences** respected via `email_preferences` table
- `RESEND_API_KEY` secret is configured

### Critical Blockers

| Issue | Impact | Fix Required |
|-------|--------|--------------|
| Domain not verified | All external emails fail (restricted to `onboarding@resend.dev`) | User must verify domain at resend.com/domains |
| `FROM_EMAIL` missing | Using fallback `onboarding@resend.dev` | Add secret with branded sender |
| `APP_URL` missing | Links in emails use hardcoded fallback | Add secret with production URL |
| Bet confirmation trigger missing | Users get no confirmation after placing predictions | Add trigger in 3 locations |

---

## Implementation Steps

### Step 1: Add Required Secrets (EMAIL-1)

Request user to configure two new secrets:

```
FROM_EMAIL = "WaterSki Predictor <support@yourdomain.com>"
APP_URL = "https://waterskipredictor.lovable.app"
```

### Step 2: Update send-email Edge Function (EMAIL-1)

Modify `supabase/functions/send-email/index.ts`:

1. **Require environment variables** - fail loudly if missing:
```text
const fromEmail = Deno.env.get("FROM_EMAIL");
const appUrl = Deno.env.get("APP_URL");

if (!fromEmail || !appUrl) {
  throw new Error("Missing required env: FROM_EMAIL or APP_URL");
}
```

2. **Remove hardcoded fallbacks** from `getEmailContent()` and `send()` call

3. **Add structured logging** for failures

### Step 3: Add Bet Confirmation Trigger (EMAIL-2)

Add email trigger to **3 prediction placement locations**:

**Location 1:** `src/pages/TournamentDetailClean.tsx` - Single predictions (after line ~775)
```text
// After toast and before fetchWalletBalance
await supabase.functions.invoke('send-email', {
  body: {
    type: 'bet_confirmation',
    to: user.email,
    userId: user.id,
    data: {
      username: user.email.split('@')[0],
      athleteName: selectedSelection.athlete.name,
      tournamentName: tournament.name,
      discipline: market.discipline,
      marketType: market.market_type,
      stakedTokens: stakeAmount,
      potentialPayout: potentialPayout,
      odds: finalOdds
    }
  }
});
```

**Location 2:** `src/pages/TournamentDetailClean.tsx` - Podium predictions (after line ~606)

**Location 3:** `src/components/ParlayBuilder.tsx` - Parlay/combo predictions (after wallet deduction succeeds)

All triggers will:
- Be wrapped in try/catch (non-blocking)
- Log failures but not prevent prediction placement
- Respect `email_preferences` (handled by edge function)

### Step 4: Add Admin Email Test Button (EMAIL-1)

Add to admin Dashboard (`src/pages/admin/Dashboard.tsx`):

```text
A "Send Test Email" card that:
- Has an email input field
- Has email type dropdown (welcome, bet_confirmation, bet_result, redemption_receipt)
- Calls send-email edge function with test data
- Shows success/failure result
- Links to email_logs for verification
```

### Step 5: Supabase Auth Email Verification (EMAIL-3)

Auth emails (signup verification, password reset) are handled by Supabase Auth natively. 

To verify:
1. Check auth config for custom SMTP settings
2. Test signup flow delivers verification email
3. Test password reset flow delivers reset link

If Supabase default emails are not acceptable, can configure SMTP to use Resend.

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/send-email/index.ts` | Remove fallbacks, require env vars, improve logging |
| `src/pages/TournamentDetailClean.tsx` | Add bet_confirmation trigger (2 locations) |
| `src/components/ParlayBuilder.tsx` | Add bet_confirmation trigger for parlays |
| `src/pages/admin/Dashboard.tsx` | Add test email UI card |

### Email Trigger Data Structure

For `bet_confirmation`, the edge function expects:
```text
{
  type: "bet_confirmation",
  to: "user@email.com",
  userId: "uuid",
  data: {
    username: string,
    athleteName: string,
    tournamentName: string,
    discipline: string,
    marketType: string,
    stakedTokens: number,
    potentialPayout: number,
    odds: number
  }
}
```

### Error Handling

All email triggers will be non-blocking:
```text
try {
  await supabase.functions.invoke('send-email', { body: {...} });
} catch (emailError) {
  console.error('Bet confirmation email failed:', emailError);
  // Do not block prediction placement
}
```

---

## Verification Checklist

After implementation:

1. [ ] `FROM_EMAIL` and `APP_URL` secrets are set
2. [ ] Domain verified at Resend (user action required)
3. [ ] Test email sends successfully from admin panel
4. [ ] Place prediction → bet_confirmation email received
5. [ ] `email_logs` shows `status = 'sent'` entries
6. [ ] No hardcoded fallback domains in sent emails

---

## User Action Required (Before Implementation)

**You must verify your Resend domain first:**

1. Go to [resend.com/domains](https://resend.com/domains)
2. Add your domain (e.g., `waterskipredictor.com`)
3. Add the DNS records (SPF/DKIM/DMARC) to your domain provider
4. Wait until Resend shows **Verified**

Once verified, I can implement the code changes and you'll provide the `FROM_EMAIL` and `APP_URL` values.

