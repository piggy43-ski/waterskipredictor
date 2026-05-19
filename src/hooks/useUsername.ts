import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/** Returns the current user's username (or a fallback derived from email). */
export function useUsername(): string {
  const { user } = useAuth();
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    if (!user) {
      setUsername('');
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setUsername(data?.username || user.email?.split('@')[0] || 'player');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return username;
}
