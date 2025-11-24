-- Phase 0: Add RLS policies for admin operations on markets, athletes, and selections

-- Markets table - Admin policies
CREATE POLICY "Admins can insert markets"
ON public.markets
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update markets"
ON public.markets
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete markets"
ON public.markets
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Athletes table - Admin policies
CREATE POLICY "Admins can insert athletes"
ON public.athletes
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update athletes"
ON public.athletes
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete athletes"
ON public.athletes
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Selections table - Admin policies
CREATE POLICY "Admins can insert selections"
ON public.selections
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update selections"
ON public.selections
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete selections"
ON public.selections
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));