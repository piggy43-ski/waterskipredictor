import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, TrendingDown, Trophy } from 'lucide-react';

interface UserPrediction {
  id: string;
  athlete_name: string;
  discipline: string;
  category: string;
  market_type: string;
  staked_tokens: number;
  decimal_odds: number;
  potential_payout: number;
  payout_tokens: number | null;
  status: string;
}

interface UserTournamentResultsProps {
  predictions: UserPrediction[];
}

export const UserTournamentResults = ({ predictions }: UserTournamentResultsProps) => {
  if (predictions.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No predictions placed for this tournament</p>
        </div>
      </Card>
    );
  }

  const totalStaked = predictions.reduce((sum, p) => sum + p.staked_tokens, 0);
  const totalWon = predictions
    .filter(p => p.status === 'WON')
    .reduce((sum, p) => sum + (p.payout_tokens || 0), 0);
  const netProfit = totalWon - totalStaked;

  const wonCount = predictions.filter(p => p.status === 'WON').length;
  const lostCount = predictions.filter(p => p.status === 'LOST').length;
  const voidCount = predictions.filter(p => p.status === 'VOID').length;

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Your Tournament Results
        </h2>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Staked</p>
            <p className="text-lg font-bold flex items-center gap-1">
              <Coins className="w-4 h-4" />
              {totalStaked.toLocaleString()}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Won</p>
            <p className="text-lg font-bold text-success flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              {totalWon.toLocaleString()}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Net Profit</p>
            <p className={`text-lg font-bold flex items-center gap-1 ${
              netProfit >= 0 ? 'text-success' : 'text-destructive'
            }`}>
              {netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {netProfit >= 0 ? '+' : ''}{netProfit.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Win/Loss Summary */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            {wonCount} Won
          </Badge>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
            {lostCount} Lost
          </Badge>
          {voidCount > 0 && (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {voidCount} Void
            </Badge>
          )}
        </div>
      </div>

      {/* Predictions List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">Your Predictions</h3>
        {predictions.map((prediction) => (
          <div
            key={prediction.id}
            className={`p-4 rounded-lg border ${
              prediction.status === 'WON'
                ? 'border-success/30 bg-success/5'
                : prediction.status === 'LOST'
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-border bg-muted/30'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <p className="font-semibold">{prediction.athlete_name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {prediction.discipline} • {prediction.market_type.replace('_', ' ')}
                </p>
              </div>
              <Badge
                variant={
                  prediction.status === 'WON'
                    ? 'default'
                    : prediction.status === 'LOST'
                    ? 'destructive'
                    : 'outline'
                }
                className={
                  prediction.status === 'WON'
                    ? 'bg-success hover:bg-success/90'
                    : ''
                }
              >
                {prediction.status}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Stake</p>
                <p className="font-semibold">{prediction.staked_tokens}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Odds</p>
                <p className="font-semibold">{prediction.decimal_odds.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {prediction.status === 'WON' ? 'Won' : prediction.status === 'VOID' ? 'Refund' : 'Could Win'}
                </p>
                <p className={`font-semibold ${
                  prediction.status === 'WON' ? 'text-success' : ''
                }`}>
                  {prediction.status === 'WON' || prediction.status === 'VOID'
                    ? prediction.payout_tokens || 0
                    : prediction.potential_payout}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
