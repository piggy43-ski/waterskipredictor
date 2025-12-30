import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface WalletData {
  purchasedTokens: number;
  earnedTokens: number;
  totalBalance: number;
}

export const useWallet = () => {
  const { user, loading: authLoading } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    // Don't fetch if auth is still loading
    if (authLoading) {
      return;
    }

    if (!user) {
      setWallet(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('token_wallets')
      .select('purchased_tokens, earned_tokens')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching wallet:', fetchError);
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    setWallet({
      purchasedTokens: data?.purchased_tokens ?? 0,
      earnedTokens: data?.earned_tokens ?? 0,
      totalBalance: (data?.purchased_tokens ?? 0) + (data?.earned_tokens ?? 0)
    });
    setLoading(false);
  }, [user, authLoading]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Return loading true if auth is still loading OR wallet is loading
  return { 
    wallet, 
    loading: authLoading || loading, 
    error, 
    refetch: fetchWallet 
  };
};
