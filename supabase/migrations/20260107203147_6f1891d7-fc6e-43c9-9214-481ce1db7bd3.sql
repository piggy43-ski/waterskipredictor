-- Create email preferences table for user opt-in/opt-out
CREATE TABLE public.email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transactional BOOLEAN NOT NULL DEFAULT true,
  notifications BOOLEAN NOT NULL DEFAULT true,
  marketing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own email preferences"
ON public.email_preferences FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own email preferences"
ON public.email_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own email preferences"
ON public.email_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create email logs table for tracking sent emails
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  resend_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view email logs
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert logs (edge functions)
CREATE POLICY "Service can insert email logs"
ON public.email_logs FOR INSERT
WITH CHECK (true);

-- Add trigger for updated_at on email_preferences
CREATE TRIGGER update_email_preferences_updated_at
  BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create email preferences for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_email_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-create preferences when profile is created
CREATE TRIGGER on_profile_created_create_email_preferences
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_email_preferences();