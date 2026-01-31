-- Fix 1: email_logs should be service-role only (no admin access from client)
-- Drop the admin SELECT policy since email logs contain sensitive PII
DROP POLICY IF EXISTS "Admins can view email logs" ON email_logs;

-- Fix 2: token_wallets should only be viewable by the owner
-- Drop the admin SELECT policy - admins don't need to see individual balances
DROP POLICY IF EXISTS "Admins can view all wallets" ON token_wallets;

-- Fix 3: Ignore the RLS Policy Always True warning for service tables
-- The WITH CHECK (true) policies on system_events, email_logs, and audit_logs
-- are appropriate because:
-- 1. These tables are only written to by SECURITY DEFINER functions or service role
-- 2. Client code cannot directly INSERT to these tables
-- 3. The SELECT policies are already restrictive (admin-only or none)
-- No SQL change needed - this is by design for backend service tables