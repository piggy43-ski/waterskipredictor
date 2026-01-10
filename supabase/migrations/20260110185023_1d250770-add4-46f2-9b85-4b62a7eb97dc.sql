-- Remove overly permissive INSERT/UPDATE policies from system_events and email_logs tables
-- These tables should only be written to by SECURITY DEFINER functions (emit_event) or edge functions

-- Drop the overly permissive policies on system_events
DROP POLICY IF EXISTS "Service role can insert events" ON public.system_events;
DROP POLICY IF EXISTS "Service role can update events" ON public.system_events;

-- Drop the overly permissive policy on email_logs
DROP POLICY IF EXISTS "Service can insert email logs" ON public.email_logs;

-- Note: Writes to these tables will continue to work through:
-- 1. SECURITY DEFINER functions (emit_event) for system_events
-- 2. Edge functions running with service role for email_logs
-- The existing SELECT policies (admin-only) remain in place for reads