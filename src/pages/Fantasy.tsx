import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { FantasyPotCard } from '@/components/fantasy/FantasyPotCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Users, Coins, Plus, Crown, Lock, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FANTASY_TEAM_BUDGET, PAYOUT_STRUCTURES } from '@/utils/fantasyConfig';
import { isFantasyPotLocked, type TournamentInfo } from '@/utils/fantasyLockRules';

interface FantasyPot {
  id: string;
  name: string;
  pot_type: string;
  tournament_id: string | null;
  entry_fee_tokens: number;
  status: string;
  visibility: string;
  max_entrants: number | null;
  discipline_scope: string[];
  payout_structure: string;
  created_at: string;
  tournament?: {
    name: string;
    location: string;
    start_date: string;
    start_datetime?: string;
    end_datetime?: string;
  };
  entrant_count?: number;
}

interface UserEntry {
  id: string;
  pot_id: string;
  total_points: number;
  rank: number | null;
  team_name: string | null;
  pot: FantasyPot;
}

interface Tournament {
  id: string;
  name: string;
  location: string;
  start_date: string;
  disciplines: string[];
}

const Fantasy = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [availablePots, setAvailablePots] = useState<FantasyPot[]>([]);
  const [userEntries, setUserEntries] = useState<UserEntry[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchData = async () => {
    try {
      // Fetch wallet balance
      const { data: walletData } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (walletData) {
        setWalletBalance(walletData.purchased_tokens + walletData.earned_tokens);
      }

      // Fetch available pots (open status, public visibility)
      const { data: potsData, error: potsError } = await supabase
        .from('fantasy_pots')
        .select(`
          *,
          tournament:tournaments(name, location, start_date, start_datetime, end_datetime)
        `)
        .eq('status', 'open')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      if (potsError) throw potsError;

      // Get entrant counts for each pot
      const potsWithCounts = await Promise.all(
        (potsData || []).map(async (pot) => {
          const { count } = await supabase
            .from('fantasy_entries')
            .select('*', { count: 'exact', head: true })
            .eq('pot_id', pot.id);
          
          return {
            ...pot,
            entrant_count: count || 0,
            tournament: pot.tournament as FantasyPot['tournament']
          };
        })
      );

      setAvailablePots(potsWithCounts);

      // Fetch user's entries
      const { data: entriesData, error: entriesError } = await supabase
        .from('fantasy_entries')
        .select(`
          *,
          pot:fantasy_pots(
            *,
            tournament:tournaments(name, location, start_date, start_datetime, end_datetime)
          )
        `)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (entriesError) throw entriesError;

      setUserEntries(
        (entriesData || []).map((entry) => ({
          ...entry,
          pot: {
            ...entry.pot,
            tournament: entry.pot?.tournament as FantasyPot['tournament']
          } as FantasyPot
        }))
      );

      // Fetch upcoming tournaments for create pot feature
      const { data: tournamentsData } = await supabase
        .from('tournaments')
        .select('id, name, location, start_date, disciplines')
        .order('start_date', { ascending: true });

      setTournaments(tournamentsData || []);

    } catch (error) {
      console.error('Error fetching fantasy data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load fantasy data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setCreating(true);
    const formData = new FormData(e.currentTarget);

    try {
      const disciplineScope = formData.getAll('disciplines') as string[];
      if (disciplineScope.length === 0) {
        throw new Error('Please select at least one discipline');
      }

      const pot = {
        name: formData.get('name') as string,
        pot_type: 'tournament',
        tournament_id: (formData.get('tournament_id') as string) || null,
        entry_fee_tokens: parseInt(formData.get('entry_fee_tokens') as string) || 1000,
        max_entrants: parseInt(formData.get('max_entrants') as string) || null,
        team_budget: FANTASY_TEAM_BUDGET,
        payout_structure: formData.get('payout_structure') as string || 'top_3_split',
        visibility: formData.get('visibility') as string || 'public',
        discipline_scope: disciplineScope,
        created_by: user.id,
        status: 'open'
      };

      const { data, error } = await supabase
        .from('fantasy_pots')
        .insert(pot)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'League Created!',
        description: 'Your fantasy league has been created successfully'
      });

      // Refresh data
      fetchData();

      // Navigate to the new pot
      navigate(`/fantasy/${data.id}`);

    } catch (error: any) {
      console.error('Error creating pot:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create league',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  const getEntryLockStatus = (entry: UserEntry) => {
    const tournamentInfo: TournamentInfo | null = entry.pot.tournament ? {
      id: entry.pot.tournament_id || '',
      start_datetime: entry.pot.tournament.start_datetime,
      end_datetime: entry.pot.tournament.end_datetime,
      start_date: entry.pot.tournament.start_date
    } : null;

    return isFantasyPotLocked(
      { id: entry.pot.id, status: entry.pot.status, pot_type: entry.pot.pot_type, tournament_id: entry.pot.tournament_id },
      tournamentInfo
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Fantasy" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <Crown className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Fantasy Leagues</h2>
          <p className="text-muted-foreground mb-6">
            Build your dream waterski team and compete for prizes!
          </p>
          <Button onClick={() => navigate('/auth')}>Sign In to Play</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Fantasy" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading fantasy leagues...
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Fantasy" showBack />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Balance Card */}
        <Card className="p-4 bg-gradient-water text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Available Balance</p>
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                <span className="text-2xl font-bold">{walletBalance.toLocaleString()}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90">Active Teams</p>
              <span className="text-2xl font-bold">{userEntries.length}</span>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="my-teams">My Teams ({userEntries.length})</TabsTrigger>
            <TabsTrigger value="create">Create</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4 mt-4">
            {availablePots.length === 0 ? (
              <Card className="p-8 text-center">
                <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Leagues Available</h3>
                <p className="text-sm text-muted-foreground">
                  Check back soon for new fantasy leagues to join!
                </p>
              </Card>
            ) : (
              availablePots.map((pot) => (
                <FantasyPotCard 
                  key={pot.id} 
                  pot={pot}
                  onJoin={() => navigate(`/fantasy/${pot.id}`)}
                  walletBalance={walletBalance}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="my-teams" className="space-y-4 mt-4">
            {userEntries.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Teams Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Join a league and build your first fantasy team!
                </p>
                <Button variant="outline" onClick={() => {}}>
                  Browse Leagues
                </Button>
              </Card>
            ) : (
              userEntries.map((entry) => {
                const isLocked = getEntryLockStatus(entry);
                return (
                  <Card 
                    key={entry.id} 
                    className="p-4 cursor-pointer hover:shadow-glow transition-all bg-gradient-card border-border/50"
                    onClick={() => navigate(`/fantasy/${entry.pot_id}/team/${entry.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold">{entry.team_name || 'My Team'}</h3>
                        <p className="text-sm text-muted-foreground">
                          {entry.pot.name}
                        </p>
                      </div>
                      {isLocked ? (
                        <Badge variant="destructive" className="gap-1">
                          <Lock className="w-3 h-3" />
                          Locked
                        </Badge>
                      ) : entry.pot.status === 'open' ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Open
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{entry.pot.status}</Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Points</p>
                        <p className="font-bold text-lg">{entry.total_points}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Rank</p>
                        <p className="font-bold text-lg">
                          {entry.rank ? `#${entry.rank}` : '-'}
                        </p>
                      </div>
                    </div>

                    {entry.pot.tournament && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">
                          {entry.pot.tournament.name} • {entry.pot.tournament.location}
                        </p>
                      </div>
                    )}

                    {!isLocked && (
                      <p className="text-xs text-primary mt-2">
                        You can still edit your team
                      </p>
                    )}
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="create" className="mt-4">
            <Card className="p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create Tournament League
              </h3>
              <form onSubmit={handleCreatePot} className="space-y-4">
                <div>
                  <Label htmlFor="name">League Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="My Fantasy League"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="tournament_id">Tournament</Label>
                  <Select name="tournament_id">
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tournament" />
                    </SelectTrigger>
                    <SelectContent>
                      {tournaments.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.location})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="entry_fee_tokens">Entry Fee (tokens)</Label>
                  <Input
                    id="entry_fee_tokens"
                    name="entry_fee_tokens"
                    type="number"
                    min="100"
                    defaultValue="1000"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="max_entrants">Max Entrants (optional)</Label>
                  <Input
                    id="max_entrants"
                    name="max_entrants"
                    type="number"
                    min="2"
                    placeholder="Unlimited"
                  />
                </div>

                <div>
                  <Label htmlFor="payout_structure">Payout Structure</Label>
                  <Select name="payout_structure" defaultValue="top_3_split">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="winner_takes_all">Winner Takes All</SelectItem>
                      <SelectItem value="top_3_split">Top 3 Split (50/30/20)</SelectItem>
                      <SelectItem value="top_5_split">Top 5 Split</SelectItem>
                      <SelectItem value="top_10_split">Top 10 Split</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="visibility">Visibility</Label>
                  <Select name="visibility" defaultValue="public">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private (Invite Only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Disciplines</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['slalom', 'trick', 'jump'].map((disc) => (
                      <label key={disc} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="disciplines"
                          value={disc}
                          defaultChecked
                          className="rounded border-border"
                        />
                        <span className="capitalize text-sm">{disc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? 'Creating...' : 'Create League'}
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

export default Fantasy;
