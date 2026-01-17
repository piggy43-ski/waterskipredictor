-- Create help_articles table
CREATE TABLE public.help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for help_articles
CREATE INDEX idx_help_articles_section ON public.help_articles(section);
CREATE INDEX idx_help_articles_active ON public.help_articles(is_active);
CREATE INDEX idx_help_articles_sort ON public.help_articles(section, sort_order);

-- Updated_at trigger for help_articles
CREATE TRIGGER update_help_articles_updated_at
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create help_feedback table
CREATE TABLE public.help_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  article_id UUID NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  helpful BOOLEAN NOT NULL,
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_help_feedback_article ON public.help_feedback(article_id);

-- RLS for help_articles
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active help articles"
  ON public.help_articles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can view all help articles"
  ON public.help_articles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert help articles"
  ON public.help_articles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update help articles"
  ON public.help_articles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete help articles"
  ON public.help_articles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- RLS for help_feedback
ALTER TABLE public.help_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can submit feedback"
  ON public.help_feedback FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can view all feedback"
  ON public.help_feedback FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Seed initial FAQ content
INSERT INTO public.help_articles (section, title, body, sort_order) VALUES
-- Contests & Rules
('Contests & Rules', 'What is a contest?', 'A contest is a prediction game where you pick which athlete will perform best in a specific waterski event. If your prediction is correct, you win tokens based on the odds at the time of your entry.

**How it works:**
1. Browse available tournaments and contests
2. Review the athletes and their odds
3. Place your prediction using tokens
4. Wait for the event results
5. Win tokens if your prediction is correct!', 1),

('Contests & Rules', 'Contest types explained', 'We offer several types of contests to keep things exciting:

**Winner (Outright)**
Pick the athlete who will finish in 1st place. Higher risk, higher reward!

**Podium (Top 3)**
Pick an athlete to finish in the top 3 positions. Easier to win but lower odds.

**Highest Score**
Pick the athlete who will post the highest raw score in their discipline (slalom buoys, trick points, or jump distance).

Each contest type has different odds based on the difficulty of the prediction.', 2),

('Contests & Rules', 'When do contests close?', 'Contests close shortly before the tournament begins. The exact closing time is shown on each contest card.

**Important timing:**
- You can place entries anytime before the contest closes
- Once closed, no new entries or modifications are allowed
- Results are finalized after the official tournament results are published

Plan ahead and place your entries before the deadline!', 3),

('Contests & Rules', 'Can I change an entry after confirming?', 'No, entries are **final once confirmed**. 

Before confirming, you can:
- Review your selection
- Adjust the token amount
- Cancel and start over

After confirming:
- The entry is locked
- Tokens are deducted from your balance
- You will see the entry in "My Bets"

Please double-check your entries before confirming!', 4),

('Contests & Rules', 'What happens if an athlete does not compete?', 'If an athlete withdraws or does not compete in the event:

**Full Refund:** Your staked tokens will be returned to your balance.

**No Score Recorded:** If the athlete starts but records no score (e.g., falls on all attempts), the entry is evaluated as a loss.

Refunds for withdrawals are processed automatically when results are finalized.', 5),

-- Tokens & Limits
('Tokens & Limits', 'What are tokens used for?', 'Tokens are the virtual currency used throughout the app:

**Use tokens for:**
- 🎯 Contest entries and predictions
- ⚽ Fantasy team entry fees
- 🎁 Redeeming rewards in the store

**Earning tokens:**
- Winning contest predictions
- Fantasy team performance payouts
- Welcome bonus when you sign up

Tokens have no cash value and cannot be exchanged for real money.', 1),

('Tokens & Limits', 'How do I buy tokens?', 'Purchasing tokens is easy:

1. Go to the **Tokens** tab
2. Select a token pack
3. Complete payment via Stripe
4. Tokens are added to your balance instantly

**Payment methods:**
- Credit/debit cards
- Apple Pay / Google Pay (where available)

Your purchase history is available in your transaction log.', 2),

('Tokens & Limits', 'Daily purchase limit', 'To promote responsible use, we have daily limits:

**Purchase Limits:**
- Maximum $250 per day (25,000 tokens)
- Resets at midnight UTC

**Entry Limits:**
- Maximum 10,000 tokens per single entry ($100 equivalent)

These limits help ensure the platform remains fun and sustainable for everyone.', 3),

('Tokens & Limits', 'Max entry per pick', 'Each individual prediction has a maximum stake of **10,000 tokens** (equivalent to $100).

This limit:
- Applies per entry, not per event
- Helps manage platform liability
- Ensures fair play for all users

You can make multiple entries on different athletes in the same event, each up to the maximum.', 4),

('Tokens & Limits', 'Are tokens redeemable for cash?', '**No, tokens cannot be exchanged for cash.**

Tokens are for entertainment purposes only. They can be used to:
- Make predictions on contests
- Enter fantasy competitions
- Redeem rewards from partner brands

This keeps the platform fun and focused on the sport we all love!', 5),

-- Rewards & Redemption
('Rewards & Redemption', 'How to redeem rewards', 'Redeem your earned tokens for real rewards:

1. Go to the **Rewards** tab
2. Browse available rewards
3. Check you have enough tokens
4. Click "Redeem" on your chosen reward
5. Follow any additional instructions

**Note:** Only **earned tokens** (from winnings) can be used for rewards, not purchased tokens.', 1),

('Rewards & Redemption', 'Token balance types', 'Your wallet shows two types of tokens:

**Purchased Tokens** 💰
- Bought with real money
- Used for contest entries and fantasy fees
- Cannot be used for reward redemptions

**Earned Tokens** 🏆
- Won from successful predictions
- Received as bonuses
- Can be used for everything including rewards

The app automatically uses earned tokens first when placing entries.', 2),

('Rewards & Redemption', 'Redemption status meanings', 'Track your redemption progress:

| Status | Meaning |
|--------|---------|
| **Requested** | We received your redemption request |
| **Approved** | Approved and being processed |
| **Ordered** | Physical item has been ordered |
| **Shipped** | On its way to you! |
| **Delivered** | Successfully fulfilled |
| **Cancelled** | Redemption was cancelled (tokens refunded) |

You will receive notifications as your redemption progresses.', 3),

('Rewards & Redemption', 'When will I receive my reward?', 'Fulfillment times vary by reward type:

**Digital Rewards:** Usually within 24-48 hours

**Physical Products:** 
- Processing: 1-3 business days
- Shipping: Depends on your location (typically 5-14 days)

**Experiences/Lessons:**
- Scheduling coordinated after approval
- Depends on instructor/partner availability

Check your redemption status for updates!', 4),

('Rewards & Redemption', 'What if a reward is out of stock?', 'Some rewards have limited availability:

**Before redeeming:**
- Check the stock indicator on the reward card
- "Limited" or quantity shown means restricted supply

**If out of stock:**
- The "Redeem" button will be disabled
- Check back later for restocks
- Try a different reward

We regularly add new rewards, so keep checking!', 5),

-- Results & Finalization
('Results & Finalization', 'Where results come from', 'All results are sourced from **official tournament records**:

- IWWF (International Waterski & Wakeboard Federation)
- National federation results
- Official tournament scoring systems

We do not determine results ourselves—we only use verified official data to ensure fairness and accuracy.', 1),

('Results & Finalization', 'When results are posted', 'Results are typically available:

**Timeline:**
- During event: Live updates when available
- After event: Final results within 24-48 hours
- Settlement: Winnings credited after verification

**Delays may occur due to:**
- Protests or scoring reviews
- Multi-day events
- Technical issues at the venue

We prioritize accuracy over speed.', 2),

('Results & Finalization', 'What "Results Finalized / Locked" means', 'When results are marked as **Finalized** or **Locked**:

✅ Official results have been verified
✅ All entries have been evaluated
✅ Winnings have been distributed
✅ Results cannot be changed

This protects both users and the platform by ensuring all settlements are final and auditable.', 3),

('Results & Finalization', 'How entries are evaluated', 'Each contest type is evaluated differently:

**Winner Markets:**
- Your pick must finish 1st place
- Ties may result in dead-heat rules (reduced payout)

**Podium Markets:**
- Your pick must finish 1st, 2nd, or 3rd
- Any top-3 position wins

**Highest Score Markets:**
- Your pick must have the highest raw score
- Slalom: Most buoys at shortest line
- Trick: Highest trick points
- Jump: Longest distance

Evaluation is automatic based on official results.', 4),

-- Troubleshooting
('Troubleshooting', 'I bought tokens but don''t see them', 'If your purchased tokens are not showing:

1. **Wait 5 minutes** - Processing can take a moment
2. **Pull to refresh** your wallet
3. **Check your email** for payment confirmation
4. **View Transactions** to see if purchase is recorded

**Still missing?**
- Check your payment method was charged
- Contact support with your payment receipt

We will resolve any payment issues promptly!', 1),

('Troubleshooting', 'My entry is missing', 'Can''t find your contest entry?

**Check these locations:**
1. **My Bets** page - Shows all active entries
2. **Predictions** tab - Full prediction history
3. **Specific tournament** - Look for your picks

**Possible reasons:**
- Entry wasn''t confirmed (check tokens weren''t deducted)
- Tournament has been settled (check history)
- Filter is hiding certain entries

If still missing after checking, contact support with details.', 2),

('Troubleshooting', 'I can''t redeem a reward', 'Having trouble redeeming?

**Common reasons:**

❌ **Insufficient tokens**
- Check your earned token balance
- Purchased tokens cannot be used for rewards

❌ **Out of stock**
- Reward may have limited quantity
- Try a different reward

❌ **Already redeemed**
- Some rewards have per-user limits
- Check your redemption history

❌ **Reward inactive**
- Some rewards are seasonal or time-limited

Contact support if none of these apply.', 3),

('Troubleshooting', 'App crashes or loading issues', 'Try these steps to resolve app issues:

**Quick fixes:**
1. Close and reopen the app
2. Check your internet connection
3. Clear browser cache (if using web)
4. Try a different browser

**Still having issues?**
- Note what you were doing when it crashed
- Take a screenshot if possible
- Contact support with details

We actively monitor for issues and release fixes regularly.', 4),

('Troubleshooting', 'Contact support', 'Need more help? Reach out to us:

📧 **Email:** support@waterskipredictor.com

**When contacting support, include:**
- Your username or email
- Description of the issue
- Screenshots if applicable
- Device and browser information

**Response times:**
- Most inquiries answered within 24 hours
- Urgent payment issues prioritized

We are here to help!', 5);