import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, TrendingUp, Clock, User } from 'lucide-react';
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
  decimal_odds: number;
  status: string;
  created_at: string;
  isNew?: boolean;
}

export function RealtimeActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial activities
  useEffect(() => {
    const fetchInitialActivities = async () => {
      const { data: predictions, error: predError } = await supabase
        .from('predictions')
        .select('id, user_id, athlete_name, tournament_name, market_type, discipline, staked_tokens, decimal_odds, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

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

      const activitiesWithUsernames: ActivityItem[] = predictions.map(p => ({
        ...p,
        username: profileMap.get(p.user_id) || null,
      }));

      setActivities(activitiesWithUsernames);
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
          
          // Fetch username for new prediction
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', newPrediction.user_id)
            .single();

          const newActivity: ActivityItem = {
            id: newPrediction.id,
            user_id: newPrediction.user_id,
            username: profile?.username || null,
            athlete_name: newPrediction.athlete_name,
            tournament_name: newPrediction.tournament_name,
            market_type: newPrediction.market_type,
            discipline: newPrediction.discipline,
            staked_tokens: newPrediction.staked_tokens,
            decimal_odds: newPrediction.decimal_odds,
            status: newPrediction.status,
            created_at: newPrediction.created_at,
            isNew: true,
          };

          setActivities(prev => [newActivity, ...prev.slice(0, 19)]);

          // Remove the "new" highlight after 3 seconds
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

          // Remove highlight after 3 seconds
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
                        {activity.staked_tokens.toLocaleString()} tokens
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
