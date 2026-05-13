UPDATE public.redemptions
SET fulfillment_status = 'shipped', tracking_number = '1Z9999W99999999999', carrier = 'UPS', updated_at = now()
WHERE id = 'c66c813a-b53f-4776-a3d7-ef6d568964cd';

UPDATE public.house_rewards_liability
SET status = 'shipped', notes = COALESCE(notes||E'\n','') || 'Shipped UPS 1Z9999W99999999999', updated_at = now()
WHERE redemption_id = 'c66c813a-b53f-4776-a3d7-ef6d568964cd';