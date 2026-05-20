import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const adminStatusCache = new Map<string, boolean>();

export const useAdminCheck = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(() =>
    user ? adminStatusCache.get(user.id) ?? null : null
  );
  const [isLoading, setIsLoading] = useState(() =>
    user ? !adminStatusCache.has(user.id) : true
  );
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const checkAdminStatus = async () => {
      if (!user) {
        if (!cancelled) {
          setIsAdmin(false);
          setIsLoading(false);
        }
        navigate('/auth');
        return;
      }

      const cached = adminStatusCache.get(user.id);
      if (cached !== undefined) {
        if (!cancelled) {
          setIsAdmin(cached);
          setIsLoading(false);
        }
        if (!cached) navigate('/');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (error) throw error;

        const adminStatus = !!data;
        adminStatusCache.set(user.id, adminStatus);
        if (!cancelled) setIsAdmin(adminStatus);
        
        if (!adminStatus) {
          navigate('/');
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        if (!cancelled) setIsAdmin(false);
        navigate('/');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    checkAdminStatus();

    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  return { isAdmin, isLoading };
};
