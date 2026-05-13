CREATE OR REPLACE FUNCTION public.notify_admins_redemption_new(
  p_redemption_id uuid,
  p_reward_name text,
  p_tokens integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, link, read, metadata)
  SELECT
    ur.user_id,
    'redemption_new',
    'New redemption',
    p_reward_name || ' — ' || p_tokens::text || ' tokens',
    '/admin/liabilities',
    false,
    jsonb_build_object('redemption_id', p_redemption_id)
  FROM public.user_roles ur
  WHERE ur.role = 'admin';
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_admins_redemption_new(uuid, text, integer) TO authenticated;

-- Add notifications table to realtime publication so admin in-app notifications show without a refresh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;