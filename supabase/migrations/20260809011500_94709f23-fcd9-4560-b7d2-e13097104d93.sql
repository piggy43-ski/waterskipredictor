CREATE TABLE IF NOT EXISTS public.vault_notify_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ski_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ski_id)
);

GRANT ALL ON public.vault_notify_log TO service_role;
ALTER TABLE public.vault_notify_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vault notify log" ON public.vault_notify_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));