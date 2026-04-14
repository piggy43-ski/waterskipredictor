

## Send Swiss Pro Tricks Announcement Email

### Summary
Update the `send-announcement` edge function to announce "Swiss Pro Tricks is Open for Predictions", then invoke it in 3 batches (100/day) to stay within your daily email limit.

### What Changes

**1. Update `supabase/functions/send-announcement/index.ts`**
- Change email subject to "Swiss Pro Tricks is Open for Predictions!"
- Update HTML template: replace all "Moomba Masters" references with "Swiss Pro Tricks"
- Update copy to mention Trick discipline only (not Slalom/Jump)
- Update `tournamentPath` default to `/tournaments/7bf0f645-54f5-497a-9b95-208c01fb9609`
- Update `campaignId` default to `swiss-pro-tricks-2026`
- Update dedup filter to match the new subject
- Set default `batchSize` to 100

**2. Deploy and send Day 1 batch**
- Deploy the updated edge function
- Invoke it with `batchSize: 100` — sends first 100 emails
- Dedup logic ensures no double-sends

**3. Day 2 and Day 3**
- Same function call again (dedup skips already-sent users)
- Day 2: next 100, Day 3: remaining ~30

### Stats
- **230 total users** with emails
- **100/day limit** → Day 1: 100, Day 2: 100, Day 3: ~30
- Existing dedup logic prevents duplicate sends across batches

### No code file changes needed in the frontend — this is all edge function + invocation.

