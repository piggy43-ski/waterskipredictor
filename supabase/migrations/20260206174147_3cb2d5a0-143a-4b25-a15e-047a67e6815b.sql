-- Create email_subscriptions table to track Resend audience subscription attempts
CREATE TABLE public.email_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  audience_id TEXT,
  contact_id TEXT,
  subscribed BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'signup',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_subscriptions ENABLE ROW LEVEL SECURITY;

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all email subscriptions"
ON public.email_subscriptions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage subscriptions
CREATE POLICY "Admins can manage email subscriptions"
ON public.email_subscriptions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (for edge function)
CREATE POLICY "Service role can insert subscriptions"
ON public.email_subscriptions
FOR INSERT
WITH CHECK (true);

-- Create index for lookups
CREATE INDEX idx_email_subscriptions_email ON public.email_subscriptions(email);
CREATE INDEX idx_email_subscriptions_user_id ON public.email_subscriptions(user_id);

-- Add updated_at trigger
CREATE TRIGGER update_email_subscriptions_updated_at
  BEFORE UPDATE ON public.email_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();