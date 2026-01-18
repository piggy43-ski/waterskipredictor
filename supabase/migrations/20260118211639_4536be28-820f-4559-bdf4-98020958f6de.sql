-- Create notification_jobs table for scheduled notification sends
CREATE TABLE public.notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for efficient job processing
CREATE INDEX idx_notification_jobs_status_scheduled 
  ON notification_jobs(status, scheduled_for) 
  WHERE status = 'PENDING';

-- Enable RLS
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

-- Admins can manage notification jobs
CREATE POLICY "Admins can manage notification jobs"
  ON public.notification_jobs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Add notification preference columns to email_preferences
ALTER TABLE public.email_preferences
ADD COLUMN IF NOT EXISTS prediction_reminders BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS results_notifications BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS promo_notifications BOOLEAN DEFAULT true;

-- Update notifications table RLS to allow service role inserts
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at on notification_jobs
CREATE TRIGGER update_notification_jobs_updated_at
  BEFORE UPDATE ON public.notification_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();