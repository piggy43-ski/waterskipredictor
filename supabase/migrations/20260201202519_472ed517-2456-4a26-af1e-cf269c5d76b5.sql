-- Create referral_codes table
CREATE TABLE public.referral_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'regular' CHECK (type IN ('regular', 'influencer')),
  bonus_multiplier NUMERIC NOT NULL DEFAULT 1.5,
  referrer_reward_pct NUMERIC NOT NULL DEFAULT 0.20,
  reward_type TEXT NOT NULL DEFAULT 'tokens' CHECK (reward_type IN ('tokens', 'cash')),
  owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses_total INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  start_at TIMESTAMP WITH TIME ZONE,
  end_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by_admin BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create referral_redemptions table
CREATE TABLE public.referral_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  referred_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  purchase_id TEXT NOT NULL,
  purchase_amount_tokens INTEGER NOT NULL,
  purchase_amount_usd NUMERIC NOT NULL,
  bonus_tokens_awarded INTEGER NOT NULL,
  referrer_reward_value NUMERIC NOT NULL,
  referrer_reward_type TEXT NOT NULL CHECK (referrer_reward_type IN ('tokens', 'cash')),
  referrer_paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add referral columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN referred_by_code_id UUID REFERENCES public.referral_codes(id) ON DELETE SET NULL,
ADD COLUMN first_purchase_at TIMESTAMP WITH TIME ZONE;

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can read active codes for validation
CREATE POLICY "Anyone can read active referral codes"
ON public.referral_codes
FOR SELECT
USING (is_active = true AND (start_at IS NULL OR start_at <= now()) AND (end_at IS NULL OR end_at > now()));

-- RLS: Admins can do everything with referral codes
CREATE POLICY "Admins can manage referral codes"
ON public.referral_codes
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Admins can view all redemptions
CREATE POLICY "Admins can view all redemptions"
ON public.referral_redemptions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Users can view their own redemptions (as referred or referrer)
CREATE POLICY "Users can view own redemptions"
ON public.referral_redemptions
FOR SELECT
USING (auth.uid() = referred_user_id OR auth.uid() = referrer_user_id);

-- RLS: Service role inserts redemptions (handled via supabase service key in webhook)

-- Create indexes for performance
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referral_codes_owner ON public.referral_codes(owner_user_id);
CREATE INDEX idx_referral_codes_active ON public.referral_codes(is_active) WHERE is_active = true;
CREATE INDEX idx_referral_redemptions_code ON public.referral_redemptions(referral_code_id);
CREATE INDEX idx_referral_redemptions_referred ON public.referral_redemptions(referred_user_id);
CREATE INDEX idx_referral_redemptions_referrer ON public.referral_redemptions(referrer_user_id);
CREATE INDEX idx_profiles_referred_by ON public.profiles(referred_by_code_id) WHERE referred_by_code_id IS NOT NULL;

-- Add updated_at trigger for referral_codes
CREATE TRIGGER update_referral_codes_updated_at
BEFORE UPDATE ON public.referral_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();