import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Trophy, 
  Users, 
  Medal, 
  Calendar, 
  Lock, 
  Unlock,
  ArrowUpDown,
  Clock,
  TrendingUp,
  Coins
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  getSeasonLockStatus, 
  type TournamentInfo 
} from '@/utils/fantasyLockRules';
import { getTransferDeadlineCountdown } from '@/utils/transferWindowRules';
import { TransferWindow } from '@/components/fantasy/TransferWindow';
import { TransferHistory } from '@/components/fantasy/TransferHistory';
import { format } from 'date-fns';

interface SeasonPot {
  id: string;
  name: string;
  pot_type: string;
  status: string;
  entry_fee_tokens: number;
  team_budget: number;
  transfer_fee_percent: number;
  max_transfers_per_window: number | null;
  discipline_scope: string[];
  season_tournaments: string[] | null;
  payout_structure: string;
}

interface SeasonEntry {
  id: string;
  pot_id: string;
  user_id: string;
  team_name: string | null;
  total_points: number;
  total_team_value: number;
  remaining_budget: number;
  transfers_made: number;
  rank: number | null;
}

interface EntryAthlete {
  id: string;
  athlete_id: string;
  discipline: string;
  price_at_selection: number;
  points_earned: number;
  athlete: {
    id: string;
    name: string;
    country: string;
    country_code: string | null;
    fantasy_price_slalom?: number | null;
    fantasy_price_trick?: number | null;
    fantasy_price_jump?: number | null;
    gender: string;
  };
}

interface LeaderboardEntry {
  id: string;
  team_name: string | null;
  total_points: number;
  rank: number | null;
  user_id: string;
  profile?: {
    username: string;
  };
}

export default function FantasySeasonView() {
  const { potId, entryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch pot details
  const { data: pot, isLoading: potLoading } = useQuery({
    queryKey: ['season-pot', potId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fantasy_pots')
        .select('*')
        .eq('id', potId)
        .single();
      if (error) throw error;
      return data as SeasonPot;
    },
    enabled: !!potId
  });

  // Fetch season tournaments
  const { data: seasonTournaments, isLoading: tournamentsLoading } = useQuery({
    queryKey: ['season-tournaments', pot?.season_tournaments],
    queryFn: async () => {
      if (!pot?.season_tournaments?.length) {
        // For season pots without explicit list, get all tournaments
        const { data, error } = await supabase
          .from('tournaments')
          .select('id, name, start_datetime, end_datetime, start_date, end_date, status, location')
          .order('start_date', { ascending: true });
        if (error) throw error;
        return data as (TournamentInfo & { location: string })[];
      }
      
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, start_datetime, end_datetime, start_date, end_date, status, location')
        .in('id', pot.season_tournaments)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data as (TournamentInfo & { location: string })[];
    },
    enabled: !!pot
  });

  // Fetch user's entry
  const { data: entry, isLoading: entryLoading, refetch: refetchEntry } = useQuery({
    queryKey: ['season-entry', entryId, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fantasy_entries')
        .select('*')
        .eq('id', entryId)
        .single();
      if (error) throw error;
      return data as SeasonEntry;
    },
    enabled: !!entryId
  });

  // Fetch roster
  const { data: roster, isLoading: rosterLoading, refetch: refetchRoster } = useQuery({
    queryKey: ['season-roster', entryId, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fantasy_entry_athletes')
        .select(`
          *,
          athlete:athletes(id, name, country, country_code, gender, fantasy_price_slalom, fantasy_price_trick, fantasy_price_jump)
        `)
        .eq('entry_id', entryId);
      if (error) throw error;
      return data as EntryAthlete[];
    },
    enabled: !!entryId
  });

  // Fetch leaderboard
  const { data: leaderboard } = useQuery({
    queryKey: ['season-leaderboard', potId],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from('fantasy_entries')
        .select('id, team_name, total_points, rank, user_id')
        .eq('pot_id', potId)
        .order('total_points', { ascending: false })
        .limit(20);
      if (error) throw error;

      // Fetch usernames
      const userIds = (entries || []).map(e => e.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.username]));

      return entries.map(e => ({
        ...e,
        profile: { username: profileMap.get(e.user_id) || 'Unknown' }
      })) as LeaderboardEntry[];
    },
    enabled: !!potId
  });

  const handleTransferComplete = () => {
    setRefreshKey(k => k + 1);
    refetchEntry();
    refetchRoster();
  };

  if (potLoading || tournamentsLoading || entryLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Season League" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading season details...
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!pot || !entry) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Season League" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Season league not found.</p>
          <Button onClick={() => navigate('/fantasy')} className="mt-4">Back to Fantasy</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Calculate season progress
  const lockStatus = getSeasonLockStatus(
    { id: pot.id, status: pot.status, pot_type: pot.pot_type, season_tournaments: pot.season_tournaments },
    seasonTournaments
  );
  
  const finishedCount = seasonTournaments?.filter(t => {
    const status = t.status || 'upcoming';
    return status === 'finished';
  }).length || 0;
  
  const totalTournaments = seasonTournaments?.length || 1;
  const progressPercent = (finishedCount / totalTournaments) * 100;

  const deadlineCountdown = getTransferDeadlineCountdown(lockStatus.deadline);

  const isMyTeam = user?.id === entry.user_id;

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title={pot.name} showBack />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Season Stats Card */}
        <Card className="bg-gradient-water text-primary-foreground">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">{entry.team_name || 'My Team'}</h2>
                <Badge variant="secondary" className="bg-background/20 text-primary-foreground mt-1">
                  Season League
                </Badge>
              </div>
              {lockStatus.status === 'locked' ? (
                <Badge variant="secondary" className="bg-destructive/80 text-destructive-foreground gap-1">
                  <Lock className="w-3 h-3" />
                  Locked
                </Badge>
              ) : lockStatus.canTransfer ? (
                <Badge variant="secondary" className="bg-emerald-500/80 text-white gap-1">
                  <Unlock className="w-3 h-3" />
                  Open
                </Badge>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <Trophy className="w-5 h-5 mx-auto mb-1 opacity-90" />
                <p className="text-xl font-bold">{entry.total_points}</p>
                <p className="text-xs opacity-75">Points</p>
              </div>
              <div className="text-center">
                <Medal className="w-5 h-5 mx-auto mb-1 opacity-90" />
                <p className="text-xl font-bold">{entry.rank ? `#${entry.rank}` : '-'}</p>
                <p className="text-xs opacity-75">Rank</p>
              </div>
              <div className="text-center">
                <Coins className="w-5 h-5 mx-auto mb-1 opacity-90" />
                <p className="text-xl font-bold">{entry.remaining_budget.toLocaleString()}</p>
                <p className="text-xs opacity-75">Budget</p>
              </div>
            </div>

            {/* Season Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs opacity-90">
                <span>Season Progress</span>
                <span>{finishedCount}/{totalTournaments} events</span>
              </div>
              <Progress value={progressPercent} className="h-2 bg-background/30" />
            </div>
          </CardContent>
        </Card>

        {/* Transfer Window Status */}
        <Card className={`${
          lockStatus.status === 'locked' 
            ? 'border-destructive/50 bg-destructive/10' 
            : lockStatus.canTransfer 
              ? 'border-emerald-500/50 bg-emerald-500/10' 
              : 'border-muted'
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {lockStatus.status === 'locked' ? (
                  <Lock className="w-4 h-4 text-destructive" />
                ) : lockStatus.canTransfer ? (
                  <ArrowUpDown className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Clock className="w-4 h-4 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">{lockStatus.message}</p>
              </div>
              {deadlineCountdown && (
                <Badge variant="outline" className="text-xs">
                  {deadlineCountdown}
                </Badge>
              )}
            </div>
            {lockStatus.nextTournament && (
              <p className="text-xs text-muted-foreground mt-2">
                Next: {lockStatus.nextTournament.name}
              </p>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue={lockStatus.canTransfer && isMyTeam ? 'transfers' : 'roster'} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="transfers" disabled={!isMyTeam}>Transfers</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          {/* ROSTER TAB */}
          <TabsContent value="roster" className="mt-4 space-y-4">
            {!roster || roster.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No athletes on your roster yet.</p>
                {lockStatus.canTransfer && isMyTeam && (
                  <Button className="mt-4" onClick={() => {}}>
                    Build Your Team
                  </Button>
                )}
              </Card>
            ) : (
              ['slalom', 'trick', 'jump'].map(disc => {
                const discAthletes = roster.filter(r => r.discipline === disc);
                if (discAthletes.length === 0) return null;

                return (
                  <Card key={disc}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm capitalize flex items-center justify-between">
                        {disc}
                        <Badge variant="outline">{discAthletes.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {discAthletes.map(ra => (
                          <div key={ra.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div>
                              <p className="font-medium">{ra.athlete.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {ra.athlete.country_code || ra.athlete.country}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-primary">{ra.points_earned} pts</p>
                              <p className="text-xs text-muted-foreground">
                                {ra.price_at_selection.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}

            {/* Transfer History on Roster Tab */}
            {isMyTeam && <TransferHistory entryId={entry.id} />}
          </TabsContent>

          {/* TRANSFERS TAB */}
          <TabsContent value="transfers" className="mt-4">
            {!isMyTeam ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">You can only make transfers for your own team.</p>
              </Card>
            ) : !lockStatus.canTransfer ? (
              <Card className="p-8 text-center">
                <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium">{lockStatus.message}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Check back after the current tournament ends.
                </p>
              </Card>
            ) : (
              <TransferWindow
                entryId={entry.id}
                potId={pot.id}
                remainingBudget={entry.remaining_budget}
                transferFeePercent={pot.transfer_fee_percent}
                maxTransfersPerWindow={pot.max_transfers_per_window}
                transfersMade={entry.transfers_made}
                currentWindowTournamentId={lockStatus.lastFinishedTournament?.id}
                roster={roster || []}
                disciplineScope={pot.discipline_scope}
                onTransferComplete={handleTransferComplete}
              />
            )}
          </TabsContent>

          {/* STANDINGS TAB */}
          <TabsContent value="standings" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Season Standings
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {leaderboard?.map((lb, idx) => {
                      const isMe = lb.user_id === user?.id;
                      return (
                        <div 
                          key={lb.id} 
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            isMe ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-6 text-center font-bold ${
                              idx === 0 ? 'text-yellow-500' :
                              idx === 1 ? 'text-gray-400' :
                              idx === 2 ? 'text-amber-600' : 'text-muted-foreground'
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <p className="font-medium">{lb.team_name || lb.profile?.username}</p>
                              {lb.team_name && (
                                <p className="text-xs text-muted-foreground">{lb.profile?.username}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-primary">{lb.total_points}</p>
                            <p className="text-xs text-muted-foreground">points</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SCHEDULE TAB */}
          <TabsContent value="schedule" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Season Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {seasonTournaments?.map(t => {
                    const startDate = t.start_datetime || t.start_date;
                    const status = t.status || 'upcoming';
                    
                    return (
                      <div 
                        key={t.id} 
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          status === 'live' ? 'bg-emerald-500/10 border border-emerald-500/30' :
                          status === 'finished' ? 'bg-muted/50' : 'bg-background border'
                        }`}
                      >
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {startDate ? format(new Date(startDate), 'MMM d, yyyy') : 'TBD'}
                          </p>
                        </div>
                        <Badge 
                          variant={status === 'live' ? 'default' : 'outline'}
                          className={
                            status === 'live' ? 'bg-emerald-500' :
                            status === 'finished' ? 'bg-muted text-muted-foreground' : ''
                          }
                        >
                          {status === 'live' ? 'LIVE' : status === 'finished' ? 'Complete' : 'Upcoming'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      <BottomNav />
    </div>
  );
}
