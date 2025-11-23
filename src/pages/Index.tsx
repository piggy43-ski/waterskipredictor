import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { TournamentCard } from '@/components/TournamentCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { mockTournaments, mockPredictions, mockTokenWallet } from '@/lib/mockData';
import { Coins, TrendingUp, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const navigate = useNavigate();
  const featuredTournament = mockTournaments[0];
  const activePredictions = mockPredictions.filter(p => p.status === 'PENDING');

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
                  {mockTokenWallet.balance.toLocaleString()}
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
                  sum + (p.staked_tokens * p.selection.decimal_odds), 0
                ).toFixed(0)}
              </p>
            </div>
          </div>
        </Card>

        {/* Featured Tournament */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Featured Event
            </h2>
          </div>
          <TournamentCard tournament={featuredTournament} />
        </div>

        {/* Active Predictions */}
        {activePredictions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Your Active Predictions</h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/predictions')}
              >
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {activePredictions.map((prediction) => (
                <Card key={prediction.id} className="p-4 bg-gradient-card border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold mb-1">
                        {prediction.selection.athlete.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {prediction.selection.description}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-bold text-lg">
                        {(prediction.staked_tokens * prediction.selection.decimal_odds).toFixed(0)}
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
          <div className="space-y-3">
            {mockTournaments.slice(1).map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Index;
