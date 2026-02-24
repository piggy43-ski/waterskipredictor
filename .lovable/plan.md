

# Airdrop 100 Tokens + Email All Users for Beta Testing 2

## What Will Happen

1. Every user gets **100 bonus tokens** added to their wallet
2. Every user receives an **email** announcing the airdrop and that Beta Testing 2 is open and settles on Monday

## How

The project already has a `send-beta-launch` edge function that does almost exactly this. We'll update it with the new messaging and then invoke it.

### Changes to `supabase/functions/send-beta-launch/index.ts`

- Update the email subject to reference **Beta Testing 2**
- Update the email body:
  - "We've airdropped you 100 tokens for Beta Testing 2"
  - "Beta Testing 2 is now open -- predictions close soon"
  - "Results will be settled on **Monday**"
- Keep the existing token logic (adds 100 earned tokens, records a `bonus` transaction)
- Keep the 600ms rate-limiting delay between emails

### Execution

After deploying the updated function, we'll invoke it once. It will:
1. Loop through all users in the `profiles` table
2. Add 100 to each user's `earned_tokens` in `token_wallets`
3. Record a `bonus` transaction in `token_transactions`
4. Send each user the updated email via Resend

### No Database Changes Needed

The existing `token_wallets`, `token_transactions`, and `email_logs` tables handle everything.

