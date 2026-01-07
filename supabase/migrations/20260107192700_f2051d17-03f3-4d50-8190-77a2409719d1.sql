-- Add 'burn' to allowed transaction types
ALTER TABLE token_transactions 
DROP CONSTRAINT IF EXISTS token_transactions_type_check;

ALTER TABLE token_transactions 
ADD CONSTRAINT token_transactions_type_check 
CHECK (type = ANY (ARRAY['deposit', 'bet_placed', 'bet_won', 'bet_lost', 'bet_void', 'bonus', 'redemption', 'adjustment', 'burn']));