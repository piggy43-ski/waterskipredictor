import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeaderboardRow {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_staked: number;
  total_won: number;
  net_pnl: number;
  win_count: number;
  total_predictions: number;
  accuracy_pct: number | null;
  rank: number;
}

export const useLeaderboardTop = (limit = 10) => {
  return useQuery({
    queryKey: ['leaderboard-2026', limit],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase
        .from('leaderboard_season_2026')
        .select('*')
        .order('rank', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });
};

export interface UserLeaderboardPosition {
  rank: number;
  net_pnl: number;
  total_predictions: number;
  accuracy_pct: number | null;
  username: string;
  avatar_url: string | null;
}

export const useUserLeaderboardPosition = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['leaderboard-position', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserLeaderboardPosition | null> => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc('get_user_leaderboard_position', {
        p_user_id: userId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as UserLeaderboardPosition | undefined) ?? null;
    },
  });
};