import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Activity, TrendingUp, Clock, User, Layers, ChevronDown } from 'lucide-react';
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
  bet_slip_id: string | null;
  leg_count: number;
  combined_odds: number;
  isNew?: boolean;
}

interface GroupedActivity {
  type: 'single' | 'parlay';
  key: string;
  bet_slip_id: string | null;
  username: string | null;
  user_id: string;
  status: string;
  total_stake_tokens: number;
  combined_odds: number;
  leg_count: number;
  created_at: string;
  tournament_name: string;
  isNew: boolean;
  legs: ActivityItem[];
}

function groupActivities(activities: ActivityItem[]): GroupedActivity[] {
  const groups: GroupedActivity[] = [];
  const parlayMap = new Map<string, ActivityItem[]>();
  const singles: ActivityItem[] = [];

  for (const a of activities) {
    if (a.bet_type === 'parlay' && a.bet_slip_id) {
      const existing = parlayMap.get(a.bet_slip_id);
      if (existing) existing.push(a);
      else parlayMap.set(a.bet_slip_id, [a]);
    } else {
      singles.push(a);
    }
  }

  // Convert parlays to grouped entries
  for (const [slipId, legs] of parlayMap) {
    const first = legs[0];
    groups.push({
      type: 'parlay',
      key: slipId,
      bet_slip_id: slipId,
      username: first.username,
      user_id: first.user_id,
      status: first.status,
      total_stake_tokens: first.total_stake_tokens,
      combined_odds: first.combined_odds,
      leg_count: first.leg_count,
      created_at: first.created_at,
      tournament_name: first.tournament_name,
      isNew: legs.some(l => !!l.isNew),
      legs,
    });
  }

  // Convert singles
  for (const s of singles) {
    groups.push({
      type: 'single',
      key: s.id,
      bet_slip_id: s.bet_slip_id,
      username: s.username,
      user_id: s.user_id,
      status: s.status,
      total_stake_tokens: s.total_stake_tokens,
      combined_odds: s.decimal_odds,
      leg_count: 1,
      created_at: s.created_at,
      tournament_name: s.tournament_name,
      isNew: !!s.isNew,
      legs: [s],
    });
  }

  // Sort by most recent
  groups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return groups;
}

export function RealtimeActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const grouped = useMemo(() => groupActivities(activities), [activities]);

  // Fetch initial activities
  useEffect(() => {
    const fetchInitialActivities = async () => {
      const { data: predictions, error: predError } = await supabase
        .from('predictions' as any)
        .select('id, user_id, athlete_name, tournament_name, market_type, discipline, staked_tokens, decimal_odds, status, created_at, bet_slip_id')
        .order('created_at', { ascending: false })
        .limit(40) as { data: any[] | null; error: any };

      if (predError) {
        console.error('Error fetching predictions:', predError);
        setIsLoading(false);
        return;
      }

      if (!predictions || predictions.length === 0) {
        setIsLoading(false);
        return;
      }

      const userIds = [...new Set(predictions.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.username]) || []);

      const betSlipIds = [...new Set(predictions.map(p => p.bet_slip_id).filter(Boolean))];
      let slipMap = new Map<string, { total_stake_tokens: number; type: string; leg_count: number; total_odds_decimal: number }>();

      if (betSlipIds.length > 0) {
        const { data: slips } = await supabase
          .from('bet_slips')
          .select('id, total_stake_tokens, type, leg_count, total_odds_decimal')
          .in('id', betSlipIds);

        if (slips) {
          slipMap = new Map(slips.map(s => [s.id, {
            total_stake_tokens: s.total_stake_tokens,
            type: s.type,
            leg_count: s.leg_count,
            total_odds_decimal: s.total_odds_decimal,
          }]));
        }
      }

      const activitiesWithContext: ActivityItem[] = predictions.map(p => {
        const slip = p.bet_slip_id ? slipMap.get(p.bet_slip_id) : null;
        return {
          ...p,
          username: profileMap.get(p.user_id) || null,
          total_stake_tokens: slip?.total_stake_tokens ?? p.staked_tokens,
          bet_type: slip?.type ?? 'single',
          bet_slip_id: p.bet_slip_id ?? null,
          leg_count: slip?.leg_count ?? 1,
          combined_odds: slip?.total_odds_decimal ?? p.decimal_odds,
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
        { event: 'INSERT', schema: 'public', table: 'predictions' },
        async (payload) => {
          const newPrediction = payload.new as any;

          const profilePromise = supabase
            .from('profiles')
            .select('username')
            .eq('id', newPrediction.user_id)
            .single();

          const slipPromise = newPrediction.bet_slip_id
            ? supabase
                .from('bet_slips')
                .select('total_stake_tokens, type, leg_count, total_odds_decimal')
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
            bet_slip_id: newPrediction.bet_slip_id ?? null,
            leg_count: (slip as any)?.leg_count ?? 1,
            combined_odds: (slip as any)?.total_odds_decimal ?? newPrediction.decimal_odds,
            isNew: true,
          };

          setActivities(prev => [newActivity, ...prev.slice(0, 39)]);

          setTimeout(() => {
            setActivities(prev =>
              prev.map(a => a.id === newActivity.id ? { ...a, isNew: false } : a)
            );
          }, 3000);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'predictions' },
        (payload) => {
          const updated = payload.new as any;
          setActivities(prev =>
            prev.map(a =>
              a.id === updated.id ? { ...a, status: updated.status, isNew: true } : a
            )
          );
          setTimeout(() => {
            setActivities(prev =>
              prev.map(a => a.id === updated.id ? { ...a, isNew: false } : a)
            );
          }, 3000);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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
            <div className="p-6 text-center text-muted-foreground">Loading activity...</div>
          ) : grouped.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No recent activity</div>
          ) : (
            <div className="divide-y divide-border">
              {grouped.map((group) =>
                group.type === 'parlay' ? (
                  <ParlayGroupCard key={group.key} group={group} />
                ) : (
                  <SingleActivityRow key={group.key} activity={group.legs[0]} />
                )
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ── Single bet row ── */
function SingleActivityRow({ activity }: { activity: ActivityItem }) {
  return (
    <div className={`px-4 py-3 transition-colors duration-500 ${activity.isNew ? 'bg-primary/10' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">{activity.username || 'Anonymous'}</span>
            <StatusBadge status={activity.status} />
          </div>
          <p className="text-sm text-foreground">
            Picked <span className="font-medium">{activity.athlete_name}</span> for{' '}
            <span className="text-muted-foreground">{activity.market_type.replace(/_/g, ' ')}</span>
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
  );
}

/* ── Parlay collapsible card ── */
function ParlayGroupCard({ group }: { group: GroupedActivity }) {
  return (
    <Collapsible>
      <div className={`transition-colors duration-500 ${group.isNew ? 'bg-primary/10' : ''}`}>
        <CollapsibleTrigger className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm truncate">{group.username || 'Anonymous'}</span>
                <StatusBadge status={group.status} />
                <Badge variant="outline" className="text-xs gap-1 bg-accent/50">
                  <Layers className="w-3 h-3" />
                  Parlay ({group.leg_count} legs)
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {group.legs.length} pick{group.legs.length !== 1 ? 's' : ''} across{' '}
                {[...new Set(group.legs.map(l => l.discipline))].join(', ')}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="truncate max-w-[140px]">{group.tournament_name}</span>
                <ChevronDown className="w-3 h-3 transition-transform [[data-state=open]_&]:rotate-180" />
                <span className="text-xs">expand</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1 text-sm font-medium">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                {Number(group.combined_odds).toFixed(2)}x
              </div>
              <div className="text-xs font-medium text-foreground">
                {(group.total_stake_tokens ?? 0).toLocaleString()} tokens
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(group.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border bg-muted/30">
            {group.legs.map((leg, i) => (
              <div key={leg.id} className="px-6 py-2 flex items-center justify-between text-sm border-b border-border/50 last:border-b-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground w-5">L{i + 1}</span>
                  <span className="font-medium truncate">{leg.athlete_name}</span>
                  <span className="text-muted-foreground text-xs">{leg.market_type.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground text-xs capitalize">• {leg.discipline}</span>
                </div>
                <span className="text-xs font-medium flex-shrink-0">{Number(leg.decimal_odds).toFixed(2)}x</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ── Status badge helper ── */
function StatusBadge({ status }: { status: string }) {
  const variant = status === 'WON' ? 'default' : status === 'LOST' ? 'destructive' : status === 'PENDING' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="text-xs">{status}</Badge>;
}
