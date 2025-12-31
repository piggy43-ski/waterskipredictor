-- Create system_events table (event queue)
CREATE TABLE IF NOT EXISTS system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_events_unprocessed ON system_events(processed, created_at) WHERE processed = false;
CREATE INDEX idx_events_type ON system_events(event_type);
CREATE INDEX idx_events_user ON system_events(user_id);

-- Enable RLS
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

-- Only backend/admins can read events
CREATE POLICY "Admins can view all events"
ON system_events FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only backend can insert events (via security definer functions)
CREATE POLICY "Service role can insert events"
ON system_events FOR INSERT
WITH CHECK (true);

-- Only backend can update events
CREATE POLICY "Service role can update events"
ON system_events FOR UPDATE
USING (true);

-- Add notification_preferences to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{
  "email_enabled": true,
  "sms_enabled": false,
  "sms_phone": null,
  "channels": {
    "reward_updates": ["email", "push"],
    "betting_alerts": ["email", "push"],
    "tournament_updates": ["email"],
    "league_invites": ["email"]
  }
}'::jsonb;

-- Create emit_event function
CREATE OR REPLACE FUNCTION emit_event(
  p_event_type text,
  p_user_id uuid,
  p_payload jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id uuid;
BEGIN
  INSERT INTO system_events (event_type, user_id, payload)
  VALUES (p_event_type, p_user_id, p_payload)
  RETURNING id INTO event_id;
  
  RETURN event_id;
END;
$$;

-- Trigger function for liability status changes
CREATE OR REPLACE FUNCTION on_liability_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only emit for status changes we care about
  IF OLD.status IS DISTINCT FROM NEW.status AND 
     NEW.status IN ('ordered', 'shipped', 'delivered') THEN
    
    PERFORM emit_event(
      'reward_status_changed',
      NEW.user_id,
      jsonb_build_object(
        'liability_id', NEW.id,
        'reward_id', NEW.reward_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'notes', NEW.notes
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on house_rewards_liability
DROP TRIGGER IF EXISTS trigger_liability_status_change ON house_rewards_liability;
CREATE TRIGGER trigger_liability_status_change
  AFTER UPDATE ON house_rewards_liability
  FOR EACH ROW
  EXECUTE FUNCTION on_liability_status_change();

-- Trigger function for new redemptions
CREATE OR REPLACE FUNCTION on_redemption_created()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM emit_event(
    'reward_redeemed',
    NEW.user_id,
    jsonb_build_object(
      'redemption_id', NEW.id,
      'reward_id', NEW.reward_id,
      'tokens_spent', NEW.tokens_spent
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on redemptions
DROP TRIGGER IF EXISTS trigger_redemption_created ON redemptions;
CREATE TRIGGER trigger_redemption_created
  AFTER INSERT ON redemptions
  FOR EACH ROW
  EXECUTE FUNCTION on_redemption_created();