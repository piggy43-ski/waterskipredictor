import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, TrendingUp, Zap } from 'lucide-react';
import { Selection, Market } from '@/types';
import { decimalToAmerican } from '@/utils/oddsConverter';

interface ParlayCartProps {
  selections: Selection[];
  markets: Market[];
  onRemove: (selection: Selection) => void;
  onPlaceParlay: () => void;
  onClear: () => void;
}

export const ParlayCart = ({ selections, markets, onRemove, onPlaceParlay, onClear }: ParlayCartProps) => {
  if (selections.length === 0) return null;

  // Get market types for each selection
  const getMarketType = (selection: Selection) => {
    const market = markets.find(m => m.id === selection.market_id);
    return market?.market_type || 'WINNER';
  };

  // Count unique market types
  const uniqueMarketTypes = new Set(selections.map(getMarketType));
  const multiMarketCount = uniqueMarketTypes.size;

  // Calculate base combined odds
  const combinedOdds = selections.reduce((acc, sel) => acc * sel.decimal_odds, 1);
  
  // Apply multi-market bonus
  let bonusMultiplier = 1;
  if (multiMarketCount === 2) bonusMultiplier = 5;
  if (multiMarketCount === 3) bonusMultiplier = 10;
  
  const finalOdds = combinedOdds * bonusMultiplier;
  
  // Convert to American odds
  const americanOdds = decimalToAmerican(finalOdds);

  const getMarketBadge = (marketType: string) => {
    const colors: Record<string, string> = {
      'WINNER': 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
      'PODIUM': 'bg-blue-500/20 text-blue-700 border-blue-500/30',
      'HIGHEST_SCORE': 'bg-purple-500/20 text-purple-700 border-purple-500/30',
    };
    const labels: Record<string, string> = {
      'WINNER': 'Winner',
      'PODIUM': 'Podium',
      'HIGHEST_SCORE': 'Score',
    };
    return { color: colors[marketType] || 'bg-muted', label: labels[marketType] || marketType };
  };

  return (
    <Card className="border-primary/50 bg-primary/5 sticky bottom-24">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Parlay Bet
            <Badge variant="secondary">{selections.length} Legs</Badge>
            {multiMarketCount > 1 && (
              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-0">
                <Zap className="w-3 h-3 mr-1" />
                x{bonusMultiplier} Bonus
              </Badge>
            )}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onClear}
          >
            Clear All
          </Button>
        </div>
        {multiMarketCount > 1 && (
          <p className="text-xs text-muted-foreground mt-2">
            🎯 Multi-Market Parlay: {multiMarketCount === 3 ? 'x10' : 'x5'} bonus applied! All legs must win.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Selected Bets */}
        <div className="space-y-2">
          {selections.map((selection) => {
            const marketType = getMarketType(selection);
            const badge = getMarketBadge(marketType);
            
            return (
              <div 
                key={selection.id}
                className="flex items-center justify-between p-2 bg-background rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-xs ${badge.color}`}>
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="font-medium text-sm truncate">
                    {selection.athlete.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selection.description}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-primary">
                    {decimalToAmerican(selection.decimal_odds)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onRemove(selection)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Combined Odds */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Combined Odds:</div>
              {bonusMultiplier > 1 && (
                <div className="text-xs text-primary font-medium">
                  Includes x{bonusMultiplier} multi-market bonus
                </div>
              )}
            </div>
            <span className="text-xl font-bold text-primary">{americanOdds}</span>
          </div>
          <Button 
            className="w-full"
            onClick={onPlaceParlay}
            disabled={selections.length < 2}
          >
            Place Parlay Bet
          </Button>
          {selections.length < 2 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Add at least 2 selections to create a parlay
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
