import { Selection } from '@/types';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp } from 'lucide-react';

interface SelectionCardProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

export const SelectionCard = ({ selection, onSelect }: SelectionCardProps) => {
  return (
    <Card className="p-4 hover:shadow-glow transition-all duration-300 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div>
              <h4 className="font-semibold">{selection.athlete.name}</h4>
              <p className="text-xs text-muted-foreground">
                {selection.athlete.country} • {selection.athlete.federation}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center gap-1 text-primary">
              <TrendingUp className="w-4 h-4" />
              <span className="text-2xl font-bold">{selection.decimal_odds.toFixed(2)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Decimal Odds</p>
          </div>
          
          <Button
            onClick={() => onSelect(selection)}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Bet
          </Button>
        </div>
      </div>
    </Card>
  );
};
