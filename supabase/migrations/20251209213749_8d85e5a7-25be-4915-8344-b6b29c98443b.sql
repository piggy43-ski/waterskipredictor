-- Step 1: Fix bet_slips status based on their predictions
-- Update bet_slips to WON where all predictions are WON
UPDATE bet_slips bs
SET status = 'WON',
    settled_at = NOW(),
    actual_payout_tokens = bs.potential_payout_tokens
WHERE bs.status = 'PENDING'
AND bs.leg_count = 1
AND EXISTS (
  SELECT 1 FROM predictions p 
  WHERE p.bet_slip_id = bs.id 
  AND p.status = 'WON'
);

-- Update bet_slips to LOST where any prediction is LOST (for singles)
UPDATE bet_slips bs
SET status = 'LOST',
    settled_at = NOW(),
    actual_payout_tokens = 0
WHERE bs.status = 'PENDING'
AND bs.leg_count = 1
AND EXISTS (
  SELECT 1 FROM predictions p 
  WHERE p.bet_slip_id = bs.id 
  AND p.status = 'LOST'
);

-- Update bet_slips to VOID where all predictions are VOID (for singles)
UPDATE bet_slips bs
SET status = 'VOID',
    settled_at = NOW(),
    actual_payout_tokens = bs.total_stake_tokens
WHERE bs.status = 'PENDING'
AND bs.leg_count = 1
AND EXISTS (
  SELECT 1 FROM predictions p 
  WHERE p.bet_slip_id = bs.id 
  AND p.status = 'VOID'
);

-- Fix parlays: set to WON only if ALL legs are WON
UPDATE bet_slips bs
SET status = 'WON',
    settled_at = NOW(),
    actual_payout_tokens = bs.potential_payout_tokens
WHERE bs.status = 'PENDING'
AND (bs.leg_count > 1 OR bs.type = 'parlay')
AND NOT EXISTS (
  SELECT 1 FROM predictions p 
  WHERE p.bet_slip_id = bs.id 
  AND p.status != 'WON'
);

-- Fix parlays: set to LOST if ANY leg is LOST
UPDATE bet_slips bs
SET status = 'LOST',
    settled_at = NOW(),
    actual_payout_tokens = 0
WHERE bs.status = 'PENDING'
AND (bs.leg_count > 1 OR bs.type = 'parlay')
AND EXISTS (
  SELECT 1 FROM predictions p 
  WHERE p.bet_slip_id = bs.id 
  AND p.status = 'LOST'
);

-- Step 2: Calculate the over-payment and create adjustment transactions
-- First, let's see what was paid vs what should have been paid
-- Get the sum of incorrect payouts (individual parlay leg payouts that shouldn't have happened)
-- The correct payout should be: bet_slip.potential_payout_tokens for WON slips, 0 for LOST

-- Create adjustment transaction for the user who was overpaid
-- Total paid: sum of all bet_won transactions
-- Correct total: sum of (bet_slip.actual_payout_tokens) for all settled slips

-- Find the user with overpayments and calculate adjustment
DO $$
DECLARE
  affected_user_id UUID;
  total_paid NUMERIC;
  correct_payout NUMERIC;
  adjustment_amount NUMERIC;
  current_balance NUMERIC;
BEGIN
  -- Get the user with bet_won transactions
  SELECT DISTINCT user_id INTO affected_user_id
  FROM token_transactions
  WHERE type = 'bet_won'
  LIMIT 1;
  
  IF affected_user_id IS NOT NULL THEN
    -- Calculate total paid through bet_won transactions
    SELECT COALESCE(SUM(amount), 0) INTO total_paid
    FROM token_transactions
    WHERE user_id = affected_user_id
    AND type = 'bet_won';
    
    -- Calculate what should have been paid (sum of actual_payout_tokens for WON slips only)
    SELECT COALESCE(SUM(bs.actual_payout_tokens), 0) INTO correct_payout
    FROM bet_slips bs
    WHERE bs.user_id = affected_user_id
    AND bs.status = 'WON';
    
    -- Calculate adjustment (negative if overpaid)
    adjustment_amount := correct_payout - total_paid;
    
    -- Only create adjustment if there's a difference
    IF adjustment_amount != 0 THEN
      -- Get current wallet balance
      SELECT (earned_tokens + purchased_tokens) INTO current_balance
      FROM token_wallets
      WHERE user_id = affected_user_id;
      
      -- Create adjustment transaction
      INSERT INTO token_transactions (
        user_id,
        type,
        amount,
        balance_after,
        description,
        reference_type
      ) VALUES (
        affected_user_id,
        'adjustment',
        adjustment_amount,
        current_balance + adjustment_amount,
        'Correction for settlement calculation error - adjusted to correct payout amount',
        'bet_slip_correction'
      );
      
      -- Update wallet balance
      UPDATE token_wallets
      SET earned_tokens = earned_tokens + adjustment_amount,
          updated_at = NOW()
      WHERE user_id = affected_user_id;
      
      RAISE NOTICE 'Created adjustment of % for user %', adjustment_amount, affected_user_id;
    END IF;
  END IF;
END $$;

-- Step 3: Clear existing fantasy scoring for rescore
DELETE FROM fantasy_scoring_events;

-- Step 4: Reset fantasy entry points and athlete points for fresh rescore
UPDATE fantasy_entries SET total_points = 0, rank = NULL;
UPDATE fantasy_entry_athletes SET points_earned = 0;