import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { TournamentCard } from '@/components/TournamentCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, TrendingUp, Trophy, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tournament } from '@/types';
import { applyDynamicStatus } from '@/utils/tournamentStatus';

interface UserPrediction {
  id: string;
  staked_tokens: number;
  decimal_odds: number;
  potential_payout: number;
  athlete_name: string;
  tournament_name: string;
  status: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [walletBalance, setWalletBalance] = useState(0);
  const [featuredTournament, setFeaturedTournament] = useState<Tournament | null>(null);
  const [userPredictions, setUserPredictions] = useState<UserPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      // Fetch featured tournament - prioritize live, then upcoming
      let { data: tournamentData } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_date', { ascending: true });

      // Apply dynamic status to all tournaments
      const tournamentsWithStatus = (tournamentData || []).map(t => 
        applyDynamicStatus({
          id: t.id,
          name: t.name,
          location: t.location,
          start_date: t.start_date,
          end_date: t.end_date,
          start_datetime: t.start_datetime,
          end_datetime: t.end_datetime,
          settled_at: t.settled_at,
          disciplines: t.disciplines as Array<'slalom' | 'trick' | 'jump'>,
          status: t.status as 'upcoming' | 'live' | 'finished'
        })
      );

      // Prioritize live tournaments, then upcoming
      const liveTournament = tournamentsWithStatus.find(t => t.status === 'live');
      const upcomingTournament = tournamentsWithStatus.find(t => t.status === 'upcoming');
      
      setFeaturedTournament(liveTournament || upcomingTournament || null);

      if (user) {
        // Fetch wallet balance
        const { data: walletData } = await supabase
          .from('token_wallets')
          .select('purchased_tokens, earned_tokens')
          .eq('user_id', user.id)
          .maybeSingle();

        if (walletData) {
          setWalletBalance(walletData.purchased_tokens + walletData.earned_tokens);
        }

        // Fetch user's active predictions
        const { data: predictionsData } = await supabase
          .from('predictions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'PENDING')
          .order('created_at', { ascending: false })
          .limit(5);

        if (predictionsData) {
          setUserPredictions(predictionsData.map(p => ({
            id: p.id,
            staked_tokens: p.staked_tokens,
            decimal_odds: parseFloat(p.decimal_odds.toString()),
            potential_payout: p.potential_payout,
            athlete_name: p.athlete_name,
            tournament_name: p.tournament_name,
            status: p.status
          })));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="WaterSki Predictor" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="WaterSki Predictor" />
        
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Welcome Card */}
          <Card className="p-6 bg-gradient-water text-primary-foreground shadow-premium">
            <h2 className="text-2xl font-bold mb-2">Welcome to WaterSki Predictor</h2>
            <p className="opacity-90 mb-4">
              Predict tournament outcomes, earn tokens, and win exclusive rewards from top waterski brands and events.
            </p>
            <Button 
              onClick={() => navigate('/auth')}
              className="w-full bg-background text-primary hover:bg-background/90"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Get Started
            </Button>
          </Card>

          {/* Featured Tournament Preview */}
          {featuredTournament && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  Upcoming Event
                </h2>
              </div>
              <TournamentCard tournament={featuredTournament} />
            </div>
          )}
        </div>

        <BottomNav />
      </div>
    );
  }

  const activePredictions = userPredictions;

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="WaterSki Predictor" />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Token Balance Card */}
        <Card className="p-6 bg-gradient-water text-primary-foreground shadow-premium">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm opacity-90 mb-1">Your Balance</p>
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6" />
                <span className="text-3xl font-bold">
                  {walletBalance.toLocaleString()}
                </span>
              </div>
            </div>
            <Button 
              variant="secondary" 
              onClick={() => navigate('/wallet')}
              className="bg-background/20 hover:bg-background/30 text-primary-foreground border-primary-foreground/20"
            >
              Add Tokens
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary-foreground/20">
            <div>
              <p className="text-xs opacity-75 mb-1">Active Bets</p>
              <p className="text-xl font-bold">{activePredictions.length}</p>
            </div>
            <div>
              <p className="text-xs opacity-75 mb-1">Potential Win</p>
              <p className="text-xl font-bold flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                {activePredictions.reduce((sum, p) => 
                  sum + p.potential_payout, 0
                ).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        {/* Featured Tournament */}
        {featuredTournament && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                Featured Event
              </h2>
            </div>
            <TournamentCard tournament={featuredTournament} />
          </div>
        )}

        {/* Active Predictions */}
        {activePredictions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Your Active Predictions</h2>
            </div>
            <div className="space-y-3">
              {activePredictions.map((prediction) => (
                <Card key={prediction.id} className="p-4 bg-gradient-card border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold mb-1">
                        {prediction.athlete_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {prediction.tournament_name}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-bold text-lg">
                        {prediction.potential_payout.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Staked: {prediction.staked_tokens}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Upcoming Events</h2>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/tournaments')}
            >
              View All
            </Button>
          </div>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate('/tournaments')}
          >
            Browse All Tournaments
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Index;
