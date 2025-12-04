import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Users, Coins, Medal, TrendingUp, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  };
}

interface FantasyEntry {
  id: string;
  pot_id: string;
  team_name: string | null;
  total_points: number;
  total_team_value: number;
  rank: number | null;
  pot: {
    id: string;
    name: string;
    status: string;
    entry_fee_tokens: number;
    payout_structure: string;
    tournament?: {
      name: string;
      location: string;
      start_date: string;
    };
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

const FantasyTeamView = () => {
  const { potId, entryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<FantasyEntry | null>(null);
  const [athletes, setAthletes] = useState<EntryAthlete[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (entryId) {
      fetchData();
    }
  }, [entryId]);

  const fetchData = async () => {
    try {
      // Fetch entry details
      const { data: entryData, error: entryError } = await supabase
        .from('fantasy_entries')
        .select(`
          *,
          pot:fantasy_pots(
            id, name, status, entry_fee_tokens, payout_structure,
            tournament:tournaments(name, location, start_date)
          )
        `)
        .eq('id', entryId)
        .single();

      if (entryError) throw entryError;

      setEntry({
        ...entryData,
        pot: {
          ...entryData.pot,
          tournament: entryData.pot?.tournament as FantasyEntry['pot']['tournament']
        }
      });

      // Fetch roster athletes
      const { data: athletesData, error: athletesError } = await supabase
        .from('fantasy_entry_athletes')
        .select(`
          *,
          athlete:athletes(id, name, country, country_code)
        `)
        .eq('entry_id', entryId);

      if (athletesError) throw athletesError;

      setAthletes(
        (athletesData || []).map(a => ({
          ...a,
          athlete: a.athlete as EntryAthlete['athlete']
        }))
      );

      // Fetch leaderboard
      const { data: leaderboardData, error: leaderboardError } = await supabase
        .from('fantasy_entries')
        .select(`
          id, team_name, total_points, rank, user_id
        `)
        .eq('pot_id', entryData.pot_id)
        .order('total_points', { ascending: false })
        .limit(20);

      if (leaderboardError) throw leaderboardError;

      setLeaderboard(leaderboardData || []);

    } catch (error) {
      console.error('Error fetching team data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team details',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="My Team" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading team...
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="My Team" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Team not found.</p>
          <Button onClick={() => navigate('/fantasy')} className="mt-4">Back to Fantasy</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const athletesByDiscipline = {
    slalom: athletes.filter(a => a.discipline === 'slalom'),
    trick: athletes.filter(a => a.discipline === 'trick'),
    jump: athletes.filter(a => a.discipline === 'jump'),
  };

  const isMyTeam = user?.id === entry.pot?.id; // TODO: Fix this check with actual user_id

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title={entry.team_name || 'My Team'} showBack />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Team Stats Card */}
        <Card className="p-4 bg-gradient-water text-primary-foreground">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">{entry.team_name || 'My Team'}</h2>
              <p className="text-sm opacity-90">{entry.pot.name}</p>
            </div>
            <Badge variant="secondary" className="bg-background/20 text-primary-foreground">
              {entry.pot.status}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <Trophy className="w-6 h-6 mx-auto mb-1 opacity-90" />
              <p className="text-2xl font-bold">{entry.total_points}</p>
              <p className="text-xs opacity-75">Points</p>
            </div>
            <div className="text-center">
              <Medal className="w-6 h-6 mx-auto mb-1 opacity-90" />
              <p className="text-2xl font-bold">{entry.rank ? `#${entry.rank}` : '-'}</p>
              <p className="text-xs opacity-75">Rank</p>
            </div>
            <div className="text-center">
              <Users className="w-6 h-6 mx-auto mb-1 opacity-90" />
              <p className="text-2xl font-bold">{athletes.length}</p>
              <p className="text-xs opacity-75">Athletes</p>
            </div>
          </div>
        </Card>

        {/* Tournament Info */}
        {entry.pot.tournament && (
          <Card className="p-3 bg-muted/50">
            <p className="text-sm">
              <span className="font-medium">{entry.pot.tournament.name}</span>
              <span className="text-muted-foreground"> • {entry.pot.tournament.location}</span>
            </p>
          </Card>
        )}

        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="roster">My Roster</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="roster" className="mt-4 space-y-4">
            {(['slalom', 'trick', 'jump'] as const).map(disc => {
              const discAthletes = athletesByDiscipline[disc];
              if (discAthletes.length === 0) return null;

              return (
                <Card key={disc} className="p-4">
                  <h3 className="font-bold capitalize mb-3 flex items-center gap-2">
                    {disc}
                    <Badge variant="outline">{discAthletes.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {discAthletes.map(a => (
                      <div 
                        key={a.id}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-background rounded-full flex items-center justify-center">
                            {a.athlete.country_code ? (
                              <span>{getFlagEmoji(a.athlete.country_code)}</span>
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{a.athlete.name}</p>
                            <p className="text-xs text-muted-foreground">{a.athlete.country}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{a.points_earned}</p>
                          <p className="text-xs text-muted-foreground">pts</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}

            <Card className="p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Team Value</span>
                <span className="font-bold">{entry.total_team_value.toLocaleString()} tokens</span>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-4">
            <Card className="p-4">
              <div className="space-y-2">
                {leaderboard.map((lb, index) => (
                  <div 
                    key={lb.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      lb.id === entry.id ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                        index === 1 ? 'bg-gray-400/20 text-gray-400' :
                        index === 2 ? 'bg-amber-600/20 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {lb.team_name || 'Team'}
                          {lb.id === entry.id && <span className="text-primary ml-1">(You)</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{lb.total_points}</p>
                      <p className="text-xs text-muted-foreground">pts</p>
                    </div>
                  </div>
                ))}

                {leaderboard.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No entries yet
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

// Helper function to convert country code to flag emoji
function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export default FantasyTeamView;
