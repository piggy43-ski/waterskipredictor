import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Module-level cache so navigating between protected routes doesn't
// re-trigger a full-page skeleton flash while we re-check onboarding.
const onboardingCache = new Map<string, boolean>();

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(
    user ? onboardingCache.get(user.id) ?? null : null
  );

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setNeedsOnboarding(null);
      return;
    }
    const cached = onboardingCache.get(user.id);
    if (cached !== undefined) {
      setNeedsOnboarding(cached);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .maybeSingle();
      const value = data ? !data.onboarding_completed : false;
      onboardingCache.set(user.id, value);
      if (!cancelled) setNeedsOnboarding(value);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && needsOnboarding === null)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-12 w-3/4 mx-auto" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const onOnboarding = location.pathname === '/onboarding';
  if (needsOnboarding && !onOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!needsOnboarding && onOnboarding) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
