-- Add per-package referral bonus columns to referral_codes
-- These replace the single bonus_multiplier for more granular control

-- Add per-package bonus percentages (stored as decimals, e.g., 0.15 = 15%)
ALTER TABLE public.referral_codes 
ADD COLUMN IF NOT EXISTS starter_bonus_pct numeric DEFAULT 0.15,
ADD COLUMN IF NOT EXISTS standard_bonus_pct numeric DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS pro_bonus_pct numeric DEFAULT 0.75,
ADD COLUMN IF NOT EXISTS elite_bonus_pct numeric DEFAULT 1.00;

-- Add constraint to ensure commission rate stays within 15-30% range
ALTER TABLE public.referral_codes
ADD CONSTRAINT referrer_reward_pct_range 
CHECK (referrer_reward_pct >= 0.15 AND referrer_reward_pct <= 0.30);

-- Add columns to referral_redemptions for better audit trail
ALTER TABLE public.referral_redemptions
ADD COLUMN IF NOT EXISTS pack_name text,
ADD COLUMN IF NOT EXISTS base_discount_pct numeric,
ADD COLUMN IF NOT EXISTS referral_discount_pct numeric,
ADD COLUMN IF NOT EXISTS effective_discount_pct numeric,
ADD COLUMN IF NOT EXISTS commission_rate_used numeric;

-- Comment for clarity
COMMENT ON COLUMN public.referral_codes.starter_bonus_pct IS 'Bonus % for Starter pack (e.g., 0.15 = 15% extra tokens)';
COMMENT ON COLUMN public.referral_codes.standard_bonus_pct IS 'Bonus % for Standard pack (e.g., 0.50 = 50% extra tokens)';
COMMENT ON COLUMN public.referral_codes.pro_bonus_pct IS 'Bonus % for Pro pack (e.g., 0.75 = 75% extra tokens)';
COMMENT ON COLUMN public.referral_codes.elite_bonus_pct IS 'Bonus % for Elite pack (e.g., 1.00 = 100% extra tokens)';