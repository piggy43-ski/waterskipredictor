import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, TrendingUp, AlertCircle } from 'lucide-react';
import { Selection, Market } from '@/types';
import { decimalToAmerican, calculateParlayOdds } from '@/utils/oddsConverter';
import { PARLAY_CONFIG } from '@/utils/parlayConfig';

interface ParlayCartProps {
  selections: Selection[];
  markets: Market[];
  onRemove: (selection: Selection) => void;
  onPlaceParlay: () => void;
  onClear: () => void;
  onExitParlayMode?: () => void;
}

export const ParlayCart = ({ selections, markets, onRemove, onPlaceParlay, onClear, onExitParlayMode }: ParlayCartProps) => {
  if (selections.length === 0) return null;

  // Get market types for each selection
  const getMarketType = (selection: Selection) => {
    const market = markets.find(m => m.id === selection.market_id);
    return market?.market_type || 'WINNER';
  };

  // Calculate combined odds with 5% house edge
  const decimalOddsArray = selections.map(sel => sel.decimal_odds);
  const adjustedOdds = calculateParlayOdds(decimalOddsArray, PARLAY_CONFIG.HOUSE_EDGE);
  
  // Convert to American odds
  const americanOdds = decimalToAmerican(adjustedOdds);
  
  // Validation checks
  const hasMaxLegs = selections.length > PARLAY_CONFIG.MAX_LEGS;
  const hasMinLegs = selections.length >= PARLAY_CONFIG.MIN_LEGS;

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
            Parlay Prediction
            <Badge variant="secondary">{selections.length} Legs</Badge>
            {hasMaxLegs && (
              <Badge variant="destructive">Max {PARLAY_CONFIG.MAX_LEGS}</Badge>
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
        {selections.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            All {selections.length} legs must win. 5% house edge applied to combined odds.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Selected Predictions */}
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

        {/* Validation Warnings */}
        {hasMaxLegs && (
          <Alert variant="destructive" className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Maximum {PARLAY_CONFIG.MAX_LEGS} legs allowed. Remove {selections.length - PARLAY_CONFIG.MAX_LEGS} selection(s).
            </AlertDescription>
          </Alert>
        )}

        {/* Combined Odds */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Combined Odds:</div>
              <div className="text-xs text-muted-foreground">
                (5% house edge applied)
              </div>
            </div>
            <span className="text-xl font-bold text-primary">{americanOdds}</span>
          </div>
          <div className="flex gap-2">
            <Button 
              className="flex-1"
              onClick={onPlaceParlay}
              disabled={!hasMinLegs || hasMaxLegs}
            >
              Place Parlay Prediction
            </Button>
            {onExitParlayMode && (
              <Button 
                variant="outline"
                onClick={onExitParlayMode}
              >
                Exit
              </Button>
            )}
          </div>
          {!hasMinLegs && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Add at least {PARLAY_CONFIG.MIN_LEGS} selections to create a parlay
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
