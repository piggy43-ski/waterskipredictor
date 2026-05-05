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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Users, Coins, Plus, Crown, Lock, CheckCircle, Link as LinkIcon, Copy } from 'lucide-react';
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
  created_by: string;
  invite_code?: string | null;
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
  const [myPrivatePots, setMyPrivatePots] = useState<FantasyPot[]>([]);
  const [userEntries, setUserEntries] = useState<UserEntry[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [creating, setCreating] = useState(false);
  
  const [inviteCode, setInviteCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);

  // Controlled form state for Create League
  const [formName, setFormName] = useState('');
  const [formTournamentId, setFormTournamentId] = useState('');
  const [formEntryFee, setFormEntryFee] = useState('100');
  const [formMaxEntrants, setFormMaxEntrants] = useState('');
  const [formPayoutStructure, setFormPayoutStructure] = useState('top_3_split');
  const [formVisibility, setFormVisibility] = useState('private');
  const [formDisciplines, setFormDisciplines] = useState<string[]>(['slalom', 'trick', 'jump']);

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

      // Fetch available PUBLIC pots (open status)
      const { data: potsData, error: potsError } = await supabase
        .from('fantasy_pots')
        .select(`
          *,
          tournament:tournaments!tournament_id(name, location, start_date, start_datetime, end_datetime)
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

      // Fetch private pots I created OR was invited to
      const { data: myPrivatePotsData } = await supabase
        .from('fantasy_pots')
        .select(`
          *,
          tournament:tournaments!tournament_id(name, location, start_date, start_datetime, end_datetime)
        `)
        .eq('visibility', 'private')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false });

      // Fetch pots I was invited to and accepted
      const { data: invitedPots } = await supabase
        .from('fantasy_invites')
        .select(`
          pot:fantasy_pots!pot_id(
            *,
            tournament:tournaments!tournament_id(name, location, start_date, start_datetime, end_datetime)
          )
        `)
        .eq('invited_user_id', user!.id)
        .eq('status', 'accepted');

      const allPrivatePots = [
        ...(myPrivatePotsData || []).map(p => ({ ...p, tournament: p.tournament as FantasyPot['tournament'] })),
        ...(invitedPots || []).map(i => ({ ...(i.pot as any), tournament: (i.pot as any)?.tournament as FantasyPot['tournament'] }))
      ].filter((pot, index, self) => pot && self.findIndex(p => p?.id === pot.id) === index);

      // Get entrant counts for private pots
      const privatePotsWithCounts = await Promise.all(
        allPrivatePots.map(async (pot) => {
          const { count } = await supabase
            .from('fantasy_entries')
            .select('*', { count: 'exact', head: true })
            .eq('pot_id', pot.id);
          return { ...pot, entrant_count: count || 0 };
        })
      );

      setMyPrivatePots(privatePotsWithCounts);

      // Fetch user's entries
      const { data: entriesData, error: entriesError } = await supabase
        .from('fantasy_entries')
        .select(`
          *,
          pot:fantasy_pots!pot_id(
            *,
            tournament:tournaments!tournament_id(name, location, start_date, start_datetime, end_datetime)
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

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const toggleDiscipline = (disc: string) => {
    setFormDisciplines(prev => 
      prev.includes(disc) 
        ? prev.filter(d => d !== disc)
        : [...prev, disc]
    );
  };

  const resetForm = () => {
    setFormName('');
    setFormTournamentId('');
    setFormEntryFee('1000');
    setFormMaxEntrants('');
    setFormPayoutStructure('top_3_split');
    setFormVisibility('private');
    setFormDisciplines(['slalom', 'trick', 'jump']);
  };

  const handleCreatePot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setCreating(true);

    try {
      if (formDisciplines.length === 0) {
        throw new Error('Please select at least one discipline');
      }

      const inviteCodeValue = formVisibility === 'private' ? generateInviteCode() : null;

      const pot = {
        name: formName,
        pot_type: 'tournament',
        tournament_id: formTournamentId || null,
        entry_fee_tokens: parseInt(formEntryFee) || 100,
        max_entrants: formMaxEntrants ? parseInt(formMaxEntrants) : null,
        team_budget: FANTASY_TEAM_BUDGET,
        payout_structure: formPayoutStructure,
        visibility: formVisibility,
        discipline_scope: formDisciplines,
        created_by: user.id,
        status: 'open',
        invite_code: inviteCodeValue
      };

      const { data, error } = await supabase
        .from('fantasy_pots')
        .insert(pot)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'League Created!',
        description: formVisibility === 'private' 
          ? `Your private league has been created. Share code: ${inviteCodeValue}`
          : 'Your fantasy league has been created successfully'
      });

      // Reset form ONLY after successful submit
      resetForm();

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

  const handleJoinByCode = async () => {
    if (!inviteCode.trim() || !user) return;
    
    setJoiningByCode(true);
    try {
      // Find the pot with this invite code
      const { data: pot, error: potError } = await supabase
        .from('fantasy_pots')
        .select('id, name, status, invite_code')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .maybeSingle();

      if (potError) throw potError;
      if (!pot) {
        toast({ title: 'Invalid Code', description: 'No league found with that code', variant: 'destructive' });
        return;
      }

      if (pot.status !== 'open') {
        toast({ title: 'League Closed', description: 'This league is no longer accepting entries', variant: 'destructive' });
        return;
      }

      // Check if already has an entry
      const { data: existingEntry } = await supabase
        .from('fantasy_entries')
        .select('id')
        .eq('pot_id', pot.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingEntry) {
        navigate(`/fantasy/${pot.id}/team/${existingEntry.id}`);
        return;
      }

      // Create/update invite record
      await supabase
        .from('fantasy_invites')
        .upsert({
          pot_id: pot.id,
          invited_by: user.id, // Self-invited via code
          invited_user_id: user.id,
          invite_code: inviteCode.trim().toUpperCase(),
          status: 'accepted',
          accepted_at: new Date().toISOString()
        }, { onConflict: 'pot_id,invited_user_id' });

      toast({ title: 'Code Accepted!', description: `You can now join ${pot.name}` });
      setInviteCode('');
      
      // Navigate to pot
      navigate(`/fantasy/${pot.id}`);

    } catch (error: any) {
      console.error('Error joining by code:', error);
      toast({ title: 'Error', description: error.message || 'Failed to join league', variant: 'destructive' });
    } finally {
      setJoiningByCode(false);
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

        {/* Join by Code Card - Prominent CTA */}
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Join Private League</h3>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="flex-1 font-mono text-center tracking-widest"
            />
            <Button 
              onClick={handleJoinByCode}
              disabled={joiningByCode || inviteCode.length < 4}
            >
              {joiningByCode ? 'Joining...' : 'Join'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Got an invite code? Enter it above to join a friend's league
          </p>
        </Card>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="browse">Public</TabsTrigger>
            <TabsTrigger value="private">Private ({myPrivatePots.length})</TabsTrigger>
            <TabsTrigger value="my-teams">Teams ({userEntries.length})</TabsTrigger>
            <TabsTrigger value="create">Create</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4 mt-4">
            {availablePots.length === 0 ? (
              <Card className="p-8 text-center">
                <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Public Leagues</h3>
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

          <TabsContent value="private" className="space-y-4 mt-4">
            {myPrivatePots.length === 0 ? (
              <Card className="p-8 text-center">
                <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Private Leagues</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a private league or join one with an invite code!
                </p>
              </Card>
            ) : (
              myPrivatePots.map((pot) => {
                const hasEntry = userEntries.some(entry => entry.pot_id === pot.id);
                
                return (
                  <Card 
                    key={pot.id} 
                    className="p-4 bg-gradient-card border-border/50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold">{pot.name}</h3>
                        {pot.tournament && (
                          <p className="text-sm text-muted-foreground">{pot.tournament.name}</p>
                        )}
                      </div>
                      <Badge variant="secondary">
                        <Lock className="w-3 h-3 mr-1" />
                        Private
                      </Badge>
                    </div>
                    
                    {pot.invite_code && pot.created_by === user?.id && (
                      <div className="flex items-center gap-2 mt-2 p-2 bg-muted/50 rounded">
                        <span className="text-xs text-muted-foreground">Code:</span>
                        <span className="font-mono font-bold">{pot.invite_code}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(pot.invite_code!);
                            toast({ title: 'Copied!', description: 'Invite code copied to clipboard' });
                          }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    
                    <div className="flex gap-4 mt-3 text-sm">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        {pot.entrant_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Coins className="w-4 h-4 text-muted-foreground" />
                        {pot.entry_fee_tokens.toLocaleString()}
                      </span>
                    </div>
                    
                    {/* Explicit Action Button */}
                    <Button 
                      className="w-full mt-4"
                      variant={hasEntry ? "outline" : "default"}
                      onClick={() => navigate(`/fantasy/${pot.id}`)}
                    >
                      {hasEntry ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          View Team
                        </>
                      ) : (
                        <>
                          <Trophy className="w-4 h-4 mr-2" />
                          Join League
                        </>
                      )}
                    </Button>
                  </Card>
                );
              })
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
              </Card>
            ) : (
              userEntries.map((entry) => {
                const isLocked = getEntryLockStatus(entry);
                const isSeasonPot = entry.pot.pot_type === 'season';
                const teamViewPath = isSeasonPot 
                  ? `/fantasy/season/${entry.pot_id}/team/${entry.id}`
                  : `/fantasy/${entry.pot_id}/team/${entry.id}`;
                return (
                  <Card 
                    key={entry.id} 
                    className="p-4 cursor-pointer hover:shadow-glow transition-all bg-gradient-card border-border/50"
                    onClick={() => navigate(teamViewPath)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold">{entry.team_name || 'My Team'}</h3>
                          {isSeasonPot && (
                            <Badge variant="outline" className="text-xs">Season</Badge>
                          )}
                        </div>
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
              <p className="text-sm text-muted-foreground mb-4">
                Player-created leagues are private by default. Share the invite code with friends!
              </p>
              <form onSubmit={handleCreatePot} className="space-y-4">
                <div>
                  <Label htmlFor="name">League Name</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="My Fantasy League"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="tournament_id">Tournament</Label>
                  <Select value={formTournamentId} onValueChange={setFormTournamentId}>
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
                    type="number"
                    min="100"
                    value={formEntryFee}
                    onChange={(e) => setFormEntryFee(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="max_entrants">Max Entrants (optional)</Label>
                  <Input
                    id="max_entrants"
                    type="number"
                    min="2"
                    value={formMaxEntrants}
                    onChange={(e) => setFormMaxEntrants(e.target.value)}
                    placeholder="Unlimited"
                  />
                </div>

                <div>
                  <Label htmlFor="payout_structure">Prize Structure</Label>
                  <Select value={formPayoutStructure} onValueChange={setFormPayoutStructure}>
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
                  <Select value={formVisibility} onValueChange={setFormVisibility}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private (Invite Only)</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Private leagues require an invite code to join
                  </p>
                </div>

                <div>
                  <Label>Disciplines</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['slalom', 'trick', 'jump'].map((disc) => (
                      <label key={disc} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formDisciplines.includes(disc)}
                          onChange={() => toggleDiscipline(disc)}
                          className="rounded border-border"
                        />
                        <span className="capitalize">{disc}</span>
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