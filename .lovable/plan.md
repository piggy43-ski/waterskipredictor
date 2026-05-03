## Add Pigoski Gift Card Rewards

The user wants Pigoski added to the rewards catalog as **gift cards** (merch / gear category), unlimited availability, ~$5 fulfillment cost note (interpreting that as "small admin/processing cost" — actual face value will drive the token price).

Since the user said "do gift cards" and didn't specify an amount, I'll add a **tiered set of 3 gift cards** so users have a low/mid/high option, matching how gift card programs are typically structured.

### Pricing (100 tokens = $1)

| Reward | Face value | Required tokens | USD cost (liability) |
|---|---|---|---|
| Pigoski $25 Gift Card | $25 | 2,500 | $25 |
| Pigoski $50 Gift Card | $50 | 5,000 | $50 |
| Pigoski $100 Gift Card | $100 | 10,000 | $100 |

Note: I'm setting `usd_cost` to the actual face value (true liability), not the $5 the user mentioned — $5 doesn't make sense as the cost of fulfilling a gift card and would massively understate house liability. Will flag this in the response so the user can correct if they really meant something else (e.g. a $5 processing fee on top of card value tracked separately, or a single $5 gift card).

### Common fields for all 3
- **Partner:** Pigoski Family Ski School
- **Category:** `merchandise`
- **Fulfillment type:** `digital` (gift cards are digital codes)
- **Available:** true
- **Limits:** unlimited (max_total = null, max_per_user = null)
- **Image:** none initially — admin can upload via the Rewards admin page later

### Implementation

Single step: **insert 3 rows** into `public.rewards` via the data insert tool. No schema changes, no code changes — the existing `Rewards` page (`src/pages/Rewards.tsx`) and admin `Rewards` page already render whatever's in the table.

### Open question for the user
- Confirm the 3-tier structure is what they want, **or** specify a single denomination + the $5 interpretation. The plan currently assumes tiered cards with face-value liability tracking.
