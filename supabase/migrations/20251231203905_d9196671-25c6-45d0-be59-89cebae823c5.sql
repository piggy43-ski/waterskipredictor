-- Enhance token_transactions table for formal ledger
ALTER TABLE token_transactions
ADD COLUMN IF NOT EXISTS source_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_type text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS counterparty text DEFAULT NULL;

-- Update status column if it exists as a different type, or add it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'token_transactions' AND column_name = 'transaction_status') THEN
    ALTER TABLE token_transactions ADD COLUMN transaction_status text DEFAULT 'completed';
  END IF;
END $$;

COMMENT ON COLUMN token_transactions.source_id IS 'References reward_id, bet_slip_id, fantasy_entry_id, etc.';
COMMENT ON COLUMN token_transactions.source_type IS 'Type of source: reward, bet, league, admin, system';
COMMENT ON COLUMN token_transactions.counterparty IS 'Who the tokens flow to/from: house, brand_partner';

-- Add fulfillment fields to rewards table
ALTER TABLE rewards
ADD COLUMN IF NOT EXISTS fulfillment_type text DEFAULT 'digital',
ADD COLUMN IF NOT EXISTS usd_cost numeric(10,2) DEFAULT NULL;

-- Create house_rewards_liability table
CREATE TABLE IF NOT EXISTS house_rewards_liability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id uuid NOT NULL REFERENCES redemptions(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES rewards(id),
  user_id uuid NOT NULL,
  token_cost integer NOT NULL,
  usd_estimated_cost numeric(10,2) DEFAULT NULL,
  fulfillment_type text NOT NULL DEFAULT 'digital',
  partner text NOT NULL,
  status text NOT NULL DEFAULT 'unfulfilled',
  notes text DEFAULT NULL,
  fulfilled_at timestamptz DEFAULT NULL,
  fulfilled_by uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for operations queries
CREATE INDEX IF NOT EXISTS idx_liability_status ON house_rewards_liability(status);
CREATE INDEX IF NOT EXISTS idx_liability_partner ON house_rewards_liability(partner);
CREATE INDEX IF NOT EXISTS idx_liability_fulfillment ON house_rewards_liability(fulfillment_type);
CREATE INDEX IF NOT EXISTS idx_liability_user ON house_rewards_liability(user_id);

-- Enable RLS
ALTER TABLE house_rewards_liability ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage liabilities
CREATE POLICY "Admins can view all liabilities"
ON house_rewards_liability FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert liabilities"
ON house_rewards_liability FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update liabilities"
ON house_rewards_liability FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete liabilities"
ON house_rewards_liability FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow system to insert liabilities (for redemption flow)
CREATE POLICY "Users can insert their own liabilities via redemption"
ON house_rewards_liability FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_house_rewards_liability_updated_at
BEFORE UPDATE ON house_rewards_liability
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();