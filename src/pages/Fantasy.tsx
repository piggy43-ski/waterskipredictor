import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { FantasyPotCard } from '@/components/fantasy/FantasyPotCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Users, Coins, Plus, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

const Fantasy = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [availablePots, setAvailablePots] = useState<FantasyPot[]>([]);
  const [userEntries, setUserEntries] = useState<UserEntry[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

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
          tournament:tournaments(name, location, start_date)
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
            tournament:tournaments(name, location, start_date)
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="browse">Browse Leagues</TabsTrigger>
            <TabsTrigger value="my-teams">My Teams ({userEntries.length})</TabsTrigger>
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
              userEntries.map((entry) => (
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
                    <Badge variant={entry.pot.status === 'open' ? 'default' : 'secondary'}>
                      {entry.pot.status}
                    </Badge>
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
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

export default Fantasy;
