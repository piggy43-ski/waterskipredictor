import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, TrendingUp } from 'lucide-react';
import { Selection } from '@/types';
import { decimalToAmerican } from '@/utils/oddsConverter';

interface ParlayCartProps {
  selections: Selection[];
  onRemove: (selection: Selection) => void;
  onPlaceParlay: () => void;
  onClear: () => void;
}

export const ParlayCart = ({ selections, onRemove, onPlaceParlay, onClear }: ParlayCartProps) => {
  if (selections.length === 0) return null;

  // Calculate combined odds (multiply all decimal odds)
  const combinedOdds = selections.reduce((acc, sel) => acc * sel.decimal_odds, 1);
  
  // Convert to American odds
  const americanOdds = combinedOdds >= 2 
    ? `+${Math.round((combinedOdds - 1) * 100)}`
    : `${Math.round(-100 / (combinedOdds - 1))}`;

  return (
    <Card className="border-primary/50 bg-primary/5 sticky bottom-24">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Parlay Bet
            <Badge variant="secondary">{selections.length} Legs</Badge>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onClear}
          >
            Clear All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Selected Bets */}
        <div className="space-y-2">
          {selections.map((selection) => (
            <div 
              key={selection.id}
              className="flex items-center justify-between p-2 bg-background rounded-lg"
            >
              <div className="flex-1 min-w-0">
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
          ))}
        </div>

        {/* Combined Odds */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Combined Odds:</span>
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
