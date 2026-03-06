import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, TrendingUp, Clock, User, Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  user_id: string;
  username: string | null;
  athlete_name: string;
  tournament_name: string;
  market_type: string;
  discipline: string;
  staked_tokens: number;
  total_stake_tokens: number;
  decimal_odds: number;
  status: string;
  created_at: string;
  bet_type: string;
  leg_count: number;
  isNew?: boolean;
}

export function RealtimeActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial activities
  useEffect(() => {
    const fetchInitialActivities = async () => {
      const { data: predictions, error: predError } = await supabase
        .from('predictions' as any)
        .select('id, user_id, athlete_name, tournament_name, market_type, discipline, staked_tokens, decimal_odds, status, created_at, bet_slip_id')
        .order('created_at', { ascending: false })
        .limit(20) as { data: any[] | null; error: any };

      if (predError) {
        console.error('Error fetching predictions:', predError);
        setIsLoading(false);
        return;
      }

      if (!predictions || predictions.length === 0) {
        setIsLoading(false);
        return;
      }

      // Fetch profiles for usernames
      const userIds = [...new Set(predictions.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.username]) || []);

      // Fetch bet_slips for total stake and type
      const betSlipIds = [...new Set(predictions.map(p => p.bet_slip_id).filter(Boolean))];
      let slipMap = new Map<string, { total_stake_tokens: number; type: string; leg_count: number }>();
      
      if (betSlipIds.length > 0) {
        const { data: slips } = await supabase
          .from('bet_slips')
          .select('id, total_stake_tokens, type, leg_count')
          .in('id', betSlipIds);

        if (slips) {
          slipMap = new Map(slips.map(s => [s.id, { total_stake_tokens: s.total_stake_tokens, type: s.type, leg_count: s.leg_count }]));
        }
      }

      const activitiesWithContext: ActivityItem[] = predictions.map(p => {
        const slip = p.bet_slip_id ? slipMap.get(p.bet_slip_id) : null;
        return {
          ...p,
          username: profileMap.get(p.user_id) || null,
          total_stake_tokens: slip?.total_stake_tokens ?? p.staked_tokens,
          bet_type: slip?.type ?? 'single',
          leg_count: slip?.leg_count ?? 1,
        };
      });

      setActivities(activitiesWithContext);
      setIsLoading(false);
    };

    fetchInitialActivities();
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('predictions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'predictions',
        },
        async (payload) => {
          const newPrediction = payload.new as any;
          
          // Fetch username and bet slip info in parallel
          const profilePromise = supabase
            .from('profiles')
            .select('username')
            .eq('id', newPrediction.user_id)
            .single();

          const slipPromise = newPrediction.bet_slip_id
            ? supabase
                .from('bet_slips')
                .select('total_stake_tokens, type, leg_count')
                .eq('id', newPrediction.bet_slip_id)
                .single()
            : Promise.resolve({ data: null });

          const [{ data: profile }, { data: slip }] = await Promise.all([profilePromise, slipPromise]);

          const newActivity: ActivityItem = {
            id: newPrediction.id,
            user_id: newPrediction.user_id,
            username: profile?.username || null,
            athlete_name: newPrediction.athlete_name,
            tournament_name: newPrediction.tournament_name,
            market_type: newPrediction.market_type,
            discipline: newPrediction.discipline,
            staked_tokens: newPrediction.staked_tokens,
            total_stake_tokens: (slip as any)?.total_stake_tokens ?? newPrediction.staked_tokens,
            decimal_odds: newPrediction.decimal_odds,
            status: newPrediction.status,
            created_at: newPrediction.created_at,
            bet_type: (slip as any)?.type ?? 'single',
            leg_count: (slip as any)?.leg_count ?? 1,
            isNew: true,
          };

          setActivities(prev => [newActivity, ...prev.slice(0, 19)]);

          setTimeout(() => {
            setActivities(prev => 
              prev.map(a => a.id === newActivity.id ? { ...a, isNew: false } : a)
            );
          }, 3000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'predictions',
        },
        (payload) => {
          const updatedPrediction = payload.new as any;
          
          setActivities(prev => 
            prev.map(a => 
              a.id === updatedPrediction.id 
                ? { ...a, status: updatedPrediction.status, isNew: true }
                : a
            )
          );

          setTimeout(() => {
            setActivities(prev => 
              prev.map(a => a.id === updatedPrediction.id ? { ...a, isNew: false } : a)
            );
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'WON': return 'default';
      case 'LOST': return 'destructive';
      case 'PENDING': return 'secondary';
      default: return 'outline';
    }
  };

  const getMarketTypeLabel = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Live Activity Feed</CardTitle>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">
              Loading activity...
            </div>
          ) : activities.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No recent activity
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`px-4 py-3 transition-colors duration-500 ${
                    activity.isNew ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {activity.username || 'Anonymous'}
                        </span>
                        <Badge variant={getStatusBadgeVariant(activity.status)} className="text-xs">
                          {activity.status}
                        </Badge>
                        {activity.bet_type === 'parlay' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Layers className="w-3 h-3" />
                            Parlay ({activity.leg_count})
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground">
                        Picked <span className="font-medium">{activity.athlete_name}</span> for{' '}
                        <span className="text-muted-foreground">{getMarketTypeLabel(activity.market_type)}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="truncate max-w-[140px]">{activity.tournament_name}</span>
                        <span>•</span>
                        <span className="capitalize">{activity.discipline}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <TrendingUp className="w-3.5 h-3.5 text-primary" />
                        {Number(activity.decimal_odds).toFixed(2)}x
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(activity.total_stake_tokens ?? activity.staked_tokens ?? 0).toLocaleString()} tokens
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
