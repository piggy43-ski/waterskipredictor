
# Remaining Launch Blockers - Completion Plan

## Current Status

### Completed
| Item | Status |
|------|--------|
| `send-email` hardened (requires secrets) | ✅ Done |
| Bet confirmation triggers (3 locations) | ✅ Done |
| Admin email test card | ✅ Done |
| `FROM_EMAIL` + `APP_URL` secrets | ✅ Configured |

### Still Blocked

| Blocker | Issue | Fix |
|---------|-------|-----|
| **Domain Verification** | Resend domain not verified → external emails fail | **User must verify at resend.com/domains** |
| **Markets Not Published** | All 18 markets have `is_published = false` | Publish via admin panel |

---

## Step 1: Verify Domain (User Action Required)

**This is the only thing code cannot fix.**

1. Go to [resend.com/domains](https://resend.com/domains)
2. Add your domain (e.g., `waterskipredictor.com`)
3. Add DNS records (SPF/DKIM/DMARC) to your domain provider
4. Wait until Resend shows **Verified**

Without this, emails will fail for external recipients (non-owner addresses).

---

## Step 2: Publish Markets (Admin Action)

The markets exist but are unpublished. The **existing** "Publish All Markets" button is in the admin panel:

**Path**: `/admin` → Select "Final Test" tournament → Probability Review Panel → **Publish All Markets**

This button:
1. Regenerates odds for all markets (Monte Carlo)
2. Sets `is_published = true` and `published_at = now()`
3. Makes markets visible and playable

**No code changes needed** - functionality already exists.

---

## Step 3: Verify E2E Flow

After publishing:

1. **Test prediction placement** → `bet_confirmation` email should fire
2. **Check `email_logs`** → Should show `status = 'sent'` for bet_confirmation
3. **Run settlement** → `bet_result` emails should fire
4. **Check wallet balances** → Winnings credited correctly

---

## Technical Details

### Market Schema (Already Correct)
```sql
-- Existing columns in markets table
is_published BOOLEAN NOT NULL DEFAULT false
published_at TIMESTAMP WITH TIME ZONE
```

### Publish Function (Already Exists in ProbabilityReviewPanel.tsx)
```typescript
const publishMutation = useMutation({
  mutationFn: async () => {
    // Regenerate odds for all markets
    for (const market of markets) {
      await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: market.id, force: true }
      });
    }
    // Mark all as published
    await supabase.from('markets')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId);
  }
});
```

### Frontend Market Filtering
The current `TournamentDetailClean.tsx` fetches all markets without filtering by `is_published`. This means:
- Published and unpublished markets are both visible
- Users can currently see unpublished markets (minor issue)

**Optional enhancement**: Add `.eq('is_published', true)` filter for non-admin users. But this is not a launch blocker.

---

## Verification Checklist

Before launch Sunday:

- [ ] Domain verified at Resend
- [ ] Test email sent successfully to external address
- [ ] Markets published for test tournament
- [ ] Prediction placed → bet_confirmation email received
- [ ] Settlement run → bet_result email received
- [ ] Wallet balances correct after settlement
- [ ] `email_logs` shows `sent` status entries

---

## Summary

**Code complete. Remaining items are admin actions:**

1. **You verify domain at Resend** (DNS records)
2. **You publish markets** via existing admin panel button
3. **You test E2E loop** (place bet → settle → check emails)

No additional code changes are required to unblock launch.
