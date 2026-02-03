

# Remove Welcome Bonus Tokens from Existing Users

## Overview

Burn the 10,000 welcome bonus tokens from all 12 users who received them.

---

## Users Affected

| Username | Email | Tokens to Remove |
|----------|-------|------------------|
| mmg | rrttee@gmail.com | 10,000 |
| Nicolas | nicoskis@icloud.com | 10,000 |
| BallOfSpray | horton@ballofspray.com | 10,000 |
| Domino | oscar100606@outlook.dk | 10,000 |
| ryanmead | r.mead@ryanmead.co.uk | 10,000 |
| sean_hunter65 | seanskisdthree@gmail.com | 10,000 |
| CamiPhoto | bernalmariacamila@gmail.com | 10,000 |
| likebaconinthemornings | waterskijaramillo@gmail.com | 10,000 |
| Tony Lightfoot | tony@tonylightfoot.com | 10,000 |
| jdecker | jackdeckerskis@icloud.com | 10,000 |
| Pettodipollo | floriparth@gmail.com | 10,000 |
| Lorenzonelson | lorenzoskis@icloud.com | 10,000 |

**Total: 120,000 tokens to remove**

---

## What Will Happen

1. Set `earned_tokens = 0` for all 12 users
2. Create a `burn` transaction record for each user for audit purposes
3. All users will have 0 balance after this change

---

## SQL to Execute

```sql
-- Step 1: Reset all earned_tokens to 0
UPDATE token_wallets 
SET earned_tokens = 0, updated_at = now()
WHERE earned_tokens = 10000;

-- Step 2: Log burn transactions for audit trail
INSERT INTO token_transactions (user_id, type, amount, balance_after, description)
SELECT 
  user_id, 
  'burn', 
  -10000, 
  0, 
  'Admin burn: Removed welcome bonus tokens - beta cleanup'
FROM token_wallets
WHERE user_id IN (
  '24f8d7cc-8010-4c58-a22d-a6783c7d3c09',
  'c47a7e8d-7165-474a-9175-4968d1f83131',
  '5ba913f1-8fb8-4932-a9b4-4a41f4d6d82a',
  '9ae147e5-53a4-46d9-8631-e254c67c5173',
  'd478168e-42cc-424e-ab68-22ca3a08f36a',
  '17171d61-c006-430f-bcaf-15de16617cb9',
  '78e395f6-0741-4944-bb54-8bb40d3f524e',
  '3093c972-eb46-4a70-bff7-82e8eeb074d4',
  '1c1ac6f8-3f85-4c86-b7f1-80c4f5e2008e',
  '427b2e4d-3915-42ab-9dc6-5b6c6c0c716a',
  'ae914292-be3f-4755-b367-2d38bc4758c6',
  '11ca6f65-b5ad-4688-a0de-f8e6d65bd5a3'
);
```

---

## Result

- All 12 users will have **0 tokens**
- A burn transaction will be recorded for each user
- The Admin Users page will show updated balances
- Total tokens in circulation will drop from 120,000 to 0

