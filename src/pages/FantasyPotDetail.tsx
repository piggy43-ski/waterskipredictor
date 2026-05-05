import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { TeamBuilder } from '@/components/fantasy/TeamBuilder';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, Users, Coins, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FANTASY_TEAM_BUDGET, FANTASY_ROSTER_LIMITS_BY_GENDER, getTotalRosterSize } from '@/utils/fantasyConfig';

interface FantasyPot {
  id: string;
  name: string;
  pot_type: string;
  tournament_id: string | null;
  entry_fee_tokens: number;
  status: string;
  max_entrants: number | null;
  discipline_scope: string[];
  payout_structure: string;
  team_budget: number;
  tournament?: {
    id: string;
    name: string;
    location: string;
    start_date: string;
    disciplines: string[];
  };
}

interface Athlete {
  id: string;
  name: string;
  country: string;
  country_code: string | null;
  gender: string;
  disciplines: string[];
  fantasy_price_slalom: number | null;
  fantasy_price_trick: number | null;
  fantasy_price_jump: number | null;
  current_rank_slalom: number | null;
  current_rank_trick: number | null;
  current_rank_jump: number | null;
  current_rating_slalom: number | null;
  current_rating_trick: number | null;
  current_rating_jump: number | null;
}

interface RosterSelection {
  athlete: Athlete;
  discipline: 'slalom' | 'trick' | 'jump';
  price: number;
}

const FantasyPotDetail = () => {
  const { potId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pot, setPot] = useState<FantasyPot | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [roster, setRoster] = useState<RosterSelection[]>([]);
  const [teamName, setTeamName] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [hasExistingEntry, setHasExistingEntry] = useState(false);
  const [entrantCount, setEntrantCount] = useState(0);

  const budget = pot?.team_budget || FANTASY_TEAM_BUDGET;
  const usedBudget = roster.reduce((sum, r) => sum + r.price, 0);
  const remainingBudget = budget - usedBudget;

  useEffect(() => {
    if (user && potId) {
      fetchData();
    }
  }, [user, potId]);

  const fetchData = async () => {
    try {
      // Fetch pot details with hint for tournament_id FK
      const { data: potData, error: potError } = await supabase
        .from('fantasy_pots')
        .select(`
          *,
          tournament:tournaments!tournament_id(id, name, location, start_date, disciplines)
        `)
        .eq('id', potId)
        .single();

      if (potError) throw potError;
      setPot({
        ...potData,
        tournament: potData.tournament as FantasyPot['tournament']
      });

      // Check for existing entry
      const { data: existingEntry } = await supabase
        .from('fantasy_entries')
        .select('id')
        .eq('pot_id', potId)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (existingEntry) {
        setHasExistingEntry(true);
        toast({
          title: 'Already Entered',
          description: 'You already have a team in this league',
        });
        navigate(`/fantasy/${potId}/team/${existingEntry.id}`);
        return;
      }

      // Fetch entrant count
      const { count } = await supabase
        .from('fantasy_entries')
        .select('*', { count: 'exact', head: true })
        .eq('pot_id', potId);
      
      setEntrantCount(count || 0);

      // Fetch wallet balance
      const { data: walletData } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (walletData) {
        setWalletBalance(walletData.purchased_tokens + walletData.earned_tokens);
      }

      // Fetch athletes for the tournament/disciplines
      const disciplines = potData.discipline_scope || ['slalom', 'trick', 'jump'];
      
      let athleteIds: string[] = [];
      let tournamentEntryDisciplines: Map<string, Set<string>> = new Map();
      
      // If pot is linked to a tournament, only show athletes entered in that tournament
      if (potData.tournament_id) {
        const { data: entriesData } = await supabase
          .from('tournament_entries')
          .select('athlete_id, discipline')
          .eq('tournament_id', potData.tournament_id);
        
        for (const e of (entriesData || [])) {
          if (!tournamentEntryDisciplines.has(e.athlete_id)) {
            tournamentEntryDisciplines.set(e.athlete_id, new Set());
          }
          tournamentEntryDisciplines.get(e.athlete_id)!.add(e.discipline);
        }
        
        athleteIds = [...tournamentEntryDisciplines.keys()];
        
        if (athleteIds.length === 0) {
          setAthletes([]);
          return;
        }
      }
      
      // Build query for athletes
      let athleteQuery = supabase
        .from('athletes')
        .select('id, name, country, country_code, gender, disciplines, fantasy_price_slalom, fantasy_price_trick, fantasy_price_jump, current_rank_slalom, current_rank_trick, current_rank_jump, current_rating_slalom, current_rating_trick, current_rating_jump')
        .order('name');
      
      // If tournament linked, filter by entered athletes
      if (athleteIds.length > 0) {
        athleteQuery = athleteQuery.in('id', athleteIds);
      }
      
      const { data: athletesData, error: athletesError } = await athleteQuery;

      if (athletesError) throw athletesError;

      // Filter athletes by disciplines - use tournament entry disciplines if available, else athlete.disciplines
      const filteredAthletes = (athletesData || []).filter(athlete => {
        const entryDiscs = tournamentEntryDisciplines.get(athlete.id);
        const athleteDiscs = entryDiscs ? [...entryDiscs] : athlete.disciplines;
        return athleteDiscs.some(d => disciplines.includes(d));
      });

      setAthletes(filteredAthletes);

    } catch (error) {
      console.error('Error fetching pot data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load league details',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const addToRoster = (athlete: Athlete, discipline: 'slalom' | 'trick' | 'jump') => {
    const price = discipline === 'slalom' 
      ? (athlete.fantasy_price_slalom || 5000)
      : discipline === 'trick'
        ? (athlete.fantasy_price_trick || 5000)
        : (athlete.fantasy_price_jump || 5000);

    // Normalize gender
    const gender = athlete.gender.toLowerCase() === 'male' || athlete.gender.toLowerCase() === 'm' ? 'men' : 'women';
    
    // Check if already in roster for this discipline and gender
    const existingInDisciplineGender = roster.filter(r => 
      r.discipline === discipline && 
      (r.athlete.gender.toLowerCase() === 'male' || r.athlete.gender.toLowerCase() === 'm' ? 'men' : 'women') === gender
    );
    const limit = FANTASY_ROSTER_LIMITS_BY_GENDER[discipline][gender];
    
    if (existingInDisciplineGender.length >= limit) {
      toast({
        title: 'Roster Full',
        description: `Maximum ${limit} ${gender} athletes for ${discipline}`,
        variant: 'destructive'
      });
      return;
    }

    // Check if athlete already in roster for same discipline
    if (roster.some(r => r.athlete.id === athlete.id && r.discipline === discipline)) {
      toast({
        title: 'Already Selected',
        description: `${athlete.name} is already in your ${discipline} roster`,
        variant: 'destructive'
      });
      return;
    }

    // Check budget
    if (price > remainingBudget) {
      toast({
        title: 'Over Budget',
        description: 'Not enough budget remaining',
        variant: 'destructive'
      });
      return;
    }

    setRoster([...roster, { athlete, discipline, price }]);
  };

  const removeFromRoster = (athleteId: string, discipline: string) => {
    setRoster(roster.filter(r => !(r.athlete.id === athleteId && r.discipline === discipline)));
  };

  const submitEntry = async () => {
    if (!pot || !user) return;

    if (roster.length === 0) {
      toast({
        title: 'Empty Roster',
        description: 'Please select at least one athlete',
        variant: 'destructive'
      });
      return;
    }

    if (walletBalance < pot.entry_fee_tokens) {
      toast({
        title: 'Insufficient Balance',
        description: 'Not enough tokens to enter this league',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);

    try {
      // Fetch current wallet state for correct deduction
      const { data: walletData, error: walletFetchError } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletFetchError) throw walletFetchError;
      if (!walletData) throw new Error('Wallet not found');

      // Deduct from purchased first, then earned (correct accounting)
      const entryFee = pot.entry_fee_tokens;
      const newPurchasedTokens = Math.max(0, walletData.purchased_tokens - entryFee);
      const remaining = entryFee - walletData.purchased_tokens;
      const newEarnedTokens = remaining > 0 
        ? walletData.earned_tokens - remaining 
        : walletData.earned_tokens;

      const { error: walletError } = await supabase
        .from('token_wallets')
        .update({
          purchased_tokens: newPurchasedTokens,
          earned_tokens: Math.max(0, newEarnedTokens)
        })
        .eq('user_id', user.id);

      if (walletError) throw walletError;

      const newBalance = newPurchasedTokens + Math.max(0, newEarnedTokens);

      // Create entry
      const { data: entryData, error: entryError } = await supabase
        .from('fantasy_entries')
        .insert({
          pot_id: pot.id,
          user_id: user.id,
          team_name: teamName || 'My Team',
          total_team_value: usedBudget,
          total_points: 0
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Add roster athletes
      const rosterInserts = roster.map(r => ({
        entry_id: entryData.id,
        athlete_id: r.athlete.id,
        discipline: r.discipline,
        price_at_selection: r.price,
        points_earned: 0
      }));

      const { error: rosterError } = await supabase
        .from('fantasy_entry_athletes')
        .insert(rosterInserts);

      if (rosterError) throw rosterError;

      // Log transaction with metadata
      await supabase
        .from('token_transactions')
        .insert({
          user_id: user.id,
          type: 'entry_placed',
          amount: -pot.entry_fee_tokens,
          balance_after: newBalance,
          description: `Fantasy entry: ${pot.name}`,
          reference_id: entryData.id,
          reference_type: 'fantasy_entry',
          metadata: {
            pot_name: pot.name,
            team_name: teamName || 'My Team',
            roster_size: roster.length,
            team_value: usedBudget
          }
        });

      toast({
        title: 'Team Submitted!',
        description: 'Your fantasy team has been entered',
      });

      navigate(`/fantasy/${pot.id}/team/${entryData.id}`);

    } catch (error) {
      console.error('Error submitting entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit entry. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Fantasy League" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Please sign in to join this league.</p>
          <Button onClick={() => navigate('/auth')} className="mt-4">Sign In</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Fantasy League" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading league details...
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!pot) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Fantasy League" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">League not found.</p>
          <Button onClick={() => navigate('/fantasy')} className="mt-4">Back to Fantasy</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title={pot.name} showBack />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* League Info Card */}
        <Card className="p-4 bg-gradient-card border-border/50">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-bold text-lg">{pot.name}</h2>
              {pot.tournament && (
                <p className="text-sm text-muted-foreground">
                  {pot.tournament.name} • {pot.tournament.location}
                </p>
              )}
            </div>
            <Badge>{pot.status}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 bg-background/50 rounded-lg">
              <Coins className="w-4 h-4 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Entry Fee</p>
              <p className="font-bold">{pot.entry_fee_tokens.toLocaleString()}</p>
            </div>
            <div className="text-center p-2 bg-background/50 rounded-lg">
              <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Entrants</p>
              <p className="font-bold">{entrantCount}{pot.max_entrants && `/${pot.max_entrants}`}</p>
            </div>
            <div className="text-center p-2 bg-background/50 rounded-lg">
              <Trophy className="w-4 h-4 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Prize Pool</p>
              <p className="font-bold">{(entrantCount * pot.entry_fee_tokens * 0.9).toLocaleString()}</p>
            </div>
          </div>
        </Card>

        {/* Budget Tracker */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Team Budget</span>
            <span className={`font-bold ${remainingBudget < 0 ? 'text-destructive' : 'text-primary'}`}>
              {remainingBudget.toLocaleString()} / {budget.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, (usedBudget / budget) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Used: {usedBudget.toLocaleString()}</span>
            <span>Roster: {roster.length}/{getTotalRosterSize()}</span>
          </div>
        </Card>

        {/* Team Name Input */}
        <div>
          <Label htmlFor="teamName">Team Name</Label>
          <Input
            id="teamName"
            placeholder="Enter your team name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="mt-1"
          />
        </div>

        {/* Team Builder */}
        {athletes.length === 0 ? (
          <Card className="p-6 text-center">
            <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold mb-2">No Athletes Available</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Athletes haven't been entered for this tournament yet. 
              The tournament organizer needs to add participants before you can build a team.
            </p>
            <Button variant="outline" onClick={() => navigate('/fantasy')}>
              Browse Other Leagues
            </Button>
          </Card>
        ) : (
          <TeamBuilder
            athletes={athletes}
            roster={roster}
            disciplines={pot.discipline_scope as ('slalom' | 'trick' | 'jump')[]}
            remainingBudget={remainingBudget}
            onAddAthlete={addToRoster}
            onRemoveAthlete={removeFromRoster}
          />
        )}

        {/* Submit Button */}
        <Card className="p-4 bg-primary/10 border-primary/30">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium">Entry Fee</p>
              <p className="text-2xl font-bold">{pot.entry_fee_tokens.toLocaleString()} tokens</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Your Balance</p>
              <p className="font-bold">{walletBalance.toLocaleString()}</p>
            </div>
          </div>
          
          <Button 
            className="w-full" 
            size="lg"
            onClick={submitEntry}
            disabled={submitting || roster.length === 0 || walletBalance < pot.entry_fee_tokens}
          >
            {submitting ? (
              'Submitting...'
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Submit Team ({roster.length} athletes)
              </>
            )}
          </Button>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default FantasyPotDetail;