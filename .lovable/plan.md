## Add $10 Token Pack

Add a new entry-level token pack at $10 to give users a smaller starting price point.

### New pack details
- **Name:** Mini
- **Price:** $10
- **Base tokens:** 1,000 (matches the 100 tokens = $1 rate)
- **Bonus:** 0% (entry-tier, no bonus — same as Starter)
- **Popular flag:** false

### Steps

1. **Create the Stripe price** — Use Stripe tools to create a new product "Mini Token Pack" with a one-time price of $10 USD. Capture the resulting `price_id` (e.g. `price_xxx`). This will be created in whichever mode (test/live) the current Stripe key is using.

2. **Update `src/pages/Wallet.tsx`** — Prepend a new entry to `BASE_TOKEN_PACKS`:
   ```ts
   { name: 'Mini', price: 10, baseTokens: 1000, baseBonus: 0, popular: false, priceId: '<new_price_id>' },
   ```
   Order: Mini → Starter → Standard → Pro → Elite.

3. **Referral bonus handling** — The referral bonus switch in `Wallet.tsx` only handles Starter/Standard/Pro/Elite. For Mini, it will fall back to `bonusPct = 0`, which is the desired behavior (no referral bonus on the smallest pack). No schema change needed.

4. **No backend/webhook changes required** — `create-token-checkout` and `stripe-webhook` already handle any `priceId` + `tokenAmount` passed from the client; they don't hardcode pack names.

### Files changed
- `src/pages/Wallet.tsx` (one-line addition to the packs array)

### Note on live vs test
Since you just got live mode approved, let me know if you want me to:
- **A)** Create the new $10 price in **live mode** (real customers can buy immediately), or
- **B)** Create it in **test mode** first to verify, then duplicate to live

I'll default to whichever mode your existing 4 price IDs are in (so all 5 packs stay consistent) unless you say otherwise.