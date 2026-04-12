import { useEffect, useState } from 'react';
import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { TournamentCard } from '@/components/TournamentCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, TrendingUp, Trophy, CheckCircle, XCircle, Calendar, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tournament } from '@/types';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { useWallet } from '@/hooks/useWallet';

interface UserPrediction {
  id: string;
  staked_tokens: number;
  decimal_odds: number;
  potential_payout: number;
  payout_tokens: number | null;
  athlete_name: string;
  tournament_name: string;
  status: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const [featuredTournament, setFeaturedTournament] = useState<Tournament | null>(null);
  const [userPredictions, setUserPredictions] = useState<UserPrediction[]>([]);
  const [settledPredictions, setSettledPredictions] = useState<UserPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayedBalance, setDisplayedBalance] = useState(0);

  // Animate balance counting up
  useEffect(() => {
    const targetBalance = wallet?.totalBalance ?? 0;
    if (targetBalance === 0) {
      setDisplayedBalance(0);
      return;
    }
    
    const duration = 1000; // 1 second animation
    const steps = 30;
    const increment = targetBalance / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= targetBalance) {
        setDisplayedBalance(targetBalance);
        clearInterval(timer);
      } else {
        setDisplayedBalance(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [wallet?.totalBalance]);

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

        // Fetch user's active predictions (only from non-cancelled bet slips)
        const { data: predictionsData } = await supabase
          .from('predictions')
          .select('*, bet_slips!inner(status)')
          .eq('user_id', user.id)
          .eq('status', 'PENDING')
          .eq('bet_slips.status', 'PENDING')
          .order('created_at', { ascending: false })
          .limit(5);

        if (predictionsData) {
          setUserPredictions(predictionsData.map(p => ({
            id: p.id,
            staked_tokens: p.staked_tokens,
            decimal_odds: parseFloat(p.decimal_odds.toString()),
            potential_payout: p.potential_payout,
            payout_tokens: p.payout_tokens,
            athlete_name: p.athlete_name,
            tournament_name: p.tournament_name,
            status: p.status
          })));
        }

        // Fetch user's recent settled entries (from bet_slips table)
        const { data: settledData } = await supabase
          .from('bet_slips')
          .select('id, status, total_stake_tokens, actual_payout_tokens, settled_at')
          .eq('user_id', user.id)
          .in('status', ['WON', 'LOST'])
          .order('settled_at', { ascending: false })
          .limit(10);

        if (settledData) {
          setSettledPredictions(settledData.map(s => ({
            id: s.id,
            staked_tokens: s.total_stake_tokens,
            decimal_odds: 0,
            potential_payout: 0,
            payout_tokens: s.actual_payout_tokens,
            athlete_name: '',
            tournament_name: '',
            status: s.status
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
        <PageHeader title={<>WaterSki <span className="text-primary">Predictor</span></>} showBalance={false} />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }

  // User is guaranteed to be authenticated here due to ProtectedRoute

  const activePredictions = userPredictions;

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title={<>WaterSki <span className="text-primary">Predictor</span></>} />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Big Token Balance */}
        <Card 
          id="token-balance"
          className="p-6 cursor-pointer hover:bg-accent/50 transition-colors rounded-2xl border-border/30 bg-gradient-card"
          onClick={() => navigate('/wallet')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Your Balance</p>
              <p className="text-4xl font-display font-bold">{displayedBalance.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">tokens</p>
            </div>
            <Button 
              id="buy-tokens-btn"
              size="icon"
              className="w-14 h-14 rounded-full bg-gradient-water shadow-[0_0_20px_hsl(var(--primary)/0.5)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.7)] hover:scale-105 transition-all duration-200"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/wallet');
              }}
            >
              <span className="text-2xl font-bold text-primary-foreground">+</span>
            </Button>
          </div>
        </Card>

        {/* Entries Section - Consolidated prediction info */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">ENTRIES</p>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-primary h-auto p-0"
              onClick={() => navigate('/predictions')}
            >
              View All
            </Button>
          </div>

          {/* Entries Summary */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="p-4 rounded-2xl border-border/30">
              <p className="text-xs text-muted-foreground mb-1">Active</p>
              <p className="text-2xl font-display font-bold">{activePredictions.length}</p>
            </Card>
            <Card className="p-4 rounded-2xl border-border/30">
              <p className="text-xs text-muted-foreground mb-1">Potential Rewards</p>
              <p className="text-2xl font-display font-bold text-primary">
                {activePredictions.reduce((sum, p) => sum + p.potential_payout, 0).toLocaleString()}
              </p>
            </Card>
          </div>

          {/* Active Entries - Horizontal Scroll */}
          {activePredictions.length > 0 ? (
            <div className="scroll-horizontal">
              {activePredictions.map((prediction) => (
                <Card key={prediction.id} className="p-4 bg-gradient-card border-border/30 rounded-2xl min-w-[280px] flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-display font-bold mb-1">
                        {prediction.athlete_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {prediction.tournament_name}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-display font-bold text-lg text-primary">
                        {prediction.potential_payout.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Entry: {prediction.staked_tokens}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center rounded-2xl border-border/30">
              <p className="text-sm text-muted-foreground mb-3">No active entries yet</p>
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-xl"
                onClick={() => navigate('/tournaments')}
              >
                Place Your First Entry
              </Button>
            </Card>
          )}
        </div>

        {/* Recent Results */}
        {settledPredictions.length > 0 && (
          <Card 
            className="p-4 cursor-pointer hover:bg-accent/50 transition-colors rounded-2xl border-border/30"
            onClick={() => navigate('/predictions')}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-display font-bold text-sm">Recent Results</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-bold text-success">
                    {settledPredictions.filter(p => p.status === 'WON').length} Correct
                  </p>
                  <p className="text-xs text-muted-foreground">
                    +{settledPredictions.filter(p => p.status === 'WON').reduce((sum, p) => sum + (p.payout_tokens || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-bold text-muted-foreground">
                    {settledPredictions.filter(p => p.status === 'LOST').length} Not Correct
                  </p>
                  <p className="text-xs text-muted-foreground">
                    -{settledPredictions.filter(p => p.status === 'LOST').reduce((sum, p) => sum + p.staked_tokens, 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Featured Event */}
        {featuredTournament && (
          <div>
            <p className="section-title mb-3">FEATURED EVENT</p>
            <TournamentCard tournament={featuredTournament} />
          </div>
        )}

        {/* Browse All Tournaments */}
        <div>
          <p className="section-title mb-3">BROWSE TOURNAMENTS</p>
          <Button 
            variant="outline" 
            className="w-full rounded-xl h-12 font-bold"
            onClick={() => navigate('/tournaments')}
          >
            <Trophy className="w-4 h-4 mr-2" />
            View All Tournaments
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Index;
