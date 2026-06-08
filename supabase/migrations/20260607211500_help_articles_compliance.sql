-- ============================================================
-- Help Center compliance + visibility fix
-- 1. Re-section 'Contests & Rules' -> 'Predictions & Rules' so the 8
--    articles hidden by the HelpCenter sectionOrder whitelist render.
-- 2. Rewrite/clean articles that used gambling terminology
--    (odds/bet/payout/winnings/stake/cash out) with approved language
--    (prediction, entry, multiplier, projected reward).
-- 3. Correct the false "$250 / 25,000 tokens" daily limit to the real,
--    now-enforced limits (50,000/day, 32,500/single purchase).
-- ============================================================

-- 1. Re-section so hidden articles become visible
UPDATE public.help_articles
SET section = 'Predictions & Rules'
WHERE section = 'Contests & Rules';

-- 2a. Full rewrite: "How do odds work?" -> "How do multipliers work?"
UPDATE public.help_articles
SET title = 'How do multipliers work?',
    body = E'Multipliers show the projected reward for a correct prediction.\n\n**Multipliers Explained:**\n- A 2.50x multiplier means a correct prediction returns 2.5x your entry\n- A 1,000 token entry at 2.50x = 2,500 tokens if your prediction is correct\n\n**Why Multipliers Differ:**\n- Multipliers are based on athlete performance ratings and current rankings\n- Favorites have lower multipliers; longshots have higher ones\n- Your multiplier is locked the moment you confirm your entry\n\nYour projected reward is always shown before you confirm.'
WHERE title = 'How do odds work?';

-- 2b. Full rewrite: "What is a parlay?"
UPDATE public.help_articles
SET body = E'A parlay combines multiple predictions into one entry for a higher projected reward.\n\n**How Parlays Work:**\n1. Select 2 or more athletes across different events\n2. The multipliers combine\n3. ALL predictions must be correct for the entry to win\n\n**Example:**\n- Pick 1: Athlete A at 2.0x\n- Pick 2: Athlete B at 1.8x\n- Combined: 3.6x\n- 1,000 token entry = 3,600 token projected reward\n\n**Risk vs Reward:**\n❌ If ANY pick misses, the entire entry is lost\n✅ If ALL picks hit, you earn the combined multiplier\n\nParlays are high-risk, high-reward. Only enter what you''re comfortable with.'
WHERE title = 'What is a parlay?';

-- 2c. Retitle prediction history article + clean "My Bets" references
UPDATE public.help_articles
SET title = 'How to view your prediction history',
    body = replace(replace(replace(body,
      'betting history', 'prediction history'),
      'My Bets', 'My Predictions'),
      'winnings', 'rewards')
WHERE title = 'How to view your betting history';

-- 2d. Retitle "My winnings weren't credited" + clean body
UPDATE public.help_articles
SET title = 'My rewards weren''t credited',
    body = replace(replace(replace(body,
      'winnings', 'rewards'),
      'payout', 'reward'),
      'payouts', 'rewards')
WHERE title LIKE 'My winnings weren%';

-- 2e. Correct the false daily limit article (now matches enforced caps)
UPDATE public.help_articles
SET body = E'To promote responsible use, we have purchase limits:\n\n**Purchase Limits:**\n- Maximum 50,000 tokens per day\n- Maximum 32,500 tokens in a single purchase\n- Daily limit resets at midnight UTC\n\nThese limits help ensure the platform remains fun and sustainable for everyone.'
WHERE title = 'Daily purchase limit';

-- 2f. "Max entry per pick" — entry-side caps were removed by product
-- decision (2026-05-20); wallet balance is the bound. Replace stale copy.
UPDATE public.help_articles
SET body = E'Your wallet balance is the upper bound for any entry, with a minimum entry of **100 tokens**.\n\n- You can make multiple entries on different athletes in the same event\n- Each entry locks its multiplier at confirmation\n- Entries are final once confirmed'
WHERE title = 'Max entry per pick';

-- 2g. Phrase-level cleanups across remaining seeded articles
UPDATE public.help_articles
SET body = replace(body, 'You will see the entry in "My Bets"', 'You will see the entry in "My Predictions"')
WHERE body LIKE '%My Bets%';

UPDATE public.help_articles
SET body = replace(body, '**My Bets** page', '**My Predictions** page')
WHERE body LIKE '%**My Bets** page%';

UPDATE public.help_articles
SET body = replace(body, 'Fantasy team performance payouts', 'Fantasy team performance rewards')
WHERE body LIKE '%Fantasy team performance payouts%';

UPDATE public.help_articles
SET body = replace(body, 'Winning contest predictions', 'Correct predictions')
WHERE body LIKE '%Winning contest predictions%';

UPDATE public.help_articles
SET body = replace(replace(body, 'winnings', 'rewards'), 'Winnings', 'Rewards')
WHERE (body LIKE '%winnings%' OR body LIKE '%Winnings%')
  AND section IN ('Rewards & Redemption', 'Results & Finalization');

UPDATE public.help_articles
SET body = replace(body, 'payout', 'reward')
WHERE body LIKE '%payout%'
  AND section IN ('Results & Finalization', 'Tokens & Limits');

-- Remaining generic 'odds' mentions in cleaned sections -> 'multipliers'
UPDATE public.help_articles
SET body = replace(replace(body, 'the odds at the time of your entry', 'the multiplier at the time of your entry'),
                   'odds', 'multipliers')
WHERE section = 'Predictions & Rules' AND body LIKE '%odds%';
