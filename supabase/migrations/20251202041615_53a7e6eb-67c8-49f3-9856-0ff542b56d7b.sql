-- Create token_transactions table to track all token movements
CREATE TABLE public.token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'bet_placed', 'bet_won', 'bet_lost', 'bet_void', 'bonus', 'redemption', 'adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('bet_slip', 'prediction', 'reward', 'admin', NULL)),
  reference_id UUID,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own transactions
CREATE POLICY "Users can view their own transactions"
  ON public.token_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
  ON public.token_transactions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow authenticated users to insert their own transactions
CREATE POLICY "Users can insert their own transactions"
  ON public.token_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_token_transactions_user_id ON public.token_transactions(user_id);
CREATE INDEX idx_token_transactions_created_at ON public.token_transactions(created_at DESC);
CREATE INDEX idx_token_transactions_type ON public.token_transactions(type);