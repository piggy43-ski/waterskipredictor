

# Send Bulk Announcement: "Moomba Masters is Open"

## Approach

Create a new edge function `send-announcement` based on the existing `send-beta-launch` pattern. It will:

1. Fetch all users from `profiles` who have `marketing: true` in `email_preferences` (or default to sending if no preference row exists)
2. Send a branded announcement email about Moomba Masters being open for predictions
3. Use the 600ms delay between sends (Resend rate limit: 2/sec)
4. Track how many were sent. If it hits **90 emails** (safe buffer under Resend's daily free-tier limit of 100), stop and return a response indicating how many remain — you can re-invoke the next day to continue
5. Log each send attempt to `email_logs` for tracking

## Edge Function: `supabase/functions/send-announcement/index.ts`

- Accept optional `{ batchSize?: number, offset?: number }` so you can resume from where it left off
- Default `batchSize` = 90 (safe daily limit)
- Query `profiles` joined with `email_preferences` to respect `marketing` opt-in
- Generate a Moomba Masters announcement HTML (dark theme matching existing emails)
- Subject: "🎿 Moomba Masters is Open for Predictions!"
- CTA button links to the tournament page
- 600ms delay between each send
- Returns `{ sent, remaining, nextOffset }` so you know if a second batch is needed

## Email Content

- Headline: "Moomba Masters is Open!"
- Body: Predictions are now open for Moomba Masters. Get in early and lock in your picks.
- CTA: "Make Your Predictions" linking to the tournament page
- Footer: standard WaterSki Predictor branding

## Admin Dashboard Integration

Add a simple "Send Announcement" section or just invoke it from the admin dashboard's existing email test area. Or you can call it directly via the backend function tools.

## No database migration needed

Uses existing `profiles`, `email_preferences`, and `email_logs` tables.

## Files to create/edit
- **Create**: `supabase/functions/send-announcement/index.ts`
- **Edit**: `supabase/config.toml` — not needed (auto-configured)

