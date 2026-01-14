import { Selection, Discipline } from '@/types';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { TrendingUp, Medal, Check } from 'lucide-react';
import { decimalToAmerican } from '@/utils/oddsConverter';

interface SelectionCardProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  discipline?: Discipline;
  mode?: 'single' | 'parlay';
  onAddToParlay?: (selection: Selection) => void;
  isInParlay?: boolean;
  highlighted?: boolean;
}

const getFlagEmoji = (countryCode: string): string => {
  // Map common country names to flag emojis
  const countryFlags: { [key: string]: string } = {
    'USA': '🇺🇸',
    'CAN': '🇨🇦',
    'FRA': '🇫🇷',
    'GBR': '🇬🇧',
    'AUS': '🇦🇺',
    'ITA': '🇮🇹',
    'ESP': '🇪🇸',
    'GER': '🇩🇪',
    'BRA': '🇧🇷',
    'ARG': '🇦🇷',
    'MEX': '🇲🇽',
    'JPN': '🇯🇵',
    'CHN': '🇨🇳',
    'RUS': '🇷🇺',
    'NZL': '🇳🇿',
  };
  
  return countryFlags[countryCode] || '🏴';
};

export const SelectionCard = ({ selection, onSelect, discipline, mode = 'single', onAddToParlay, isInParlay, highlighted }: SelectionCardProps) => {
  const americanOdds = decimalToAmerican(selection.decimal_odds);
  
  // Get the appropriate rank based on discipline
  const getRank = () => {
    if (!discipline) return null;
    switch (discipline) {
      case 'slalom':
        return selection.athlete.current_rank_slalom;
      case 'trick':
        return selection.athlete.current_rank_trick;
      case 'jump':
        return selection.athlete.current_rank_jump;
      default:
        return null;
    }
  };

  const rank = getRank();
  
  // Determine badge color based on rank
  const getRankVariant = () => {
    if (!rank) return 'secondary';
    if (rank === 1) return 'default'; // Gold/primary for #1
    if (rank <= 3) return 'default'; // Top 3
    if (rank <= 10) return 'secondary'; // Top 10
    return 'outline'; // Others
  };
  
  return (
    <Card className={`p-4 hover:shadow-glow transition-all ${isInParlay && mode === 'parlay' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'} ${highlighted ? 'ring-2 ring-primary ring-offset-2 bg-primary/10' : ''}`}>
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{selection.athlete.name}</h3>
            {rank && (
              <Badge variant={getRankVariant()} className="flex items-center gap-1">
                {rank <= 3 && <Medal className="w-3 h-3" />}
                #{rank}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <span className="text-xl">{getFlagEmoji(selection.athlete.country)}</span>
            {selection.athlete.country}
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <div id="multiplier-display" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-2xl font-bold text-primary">
              {americanOdds}
            </span>
          </div>
          
          {/* Single Mode - Show only Place Prediction */}
          {mode === 'single' && (
            <Button 
              size="sm" 
              variant="default" 
              className="min-w-[100px]"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(selection);
              }}
            >
              Place Prediction
            </Button>
          )}
          
          {/* Parlay Mode - Show only Select/Selected */}
          {mode === 'parlay' && onAddToParlay && (
            <Button 
              size="sm" 
              variant={isInParlay ? "default" : "outline"}
              className="min-w-[100px]"
              onClick={(e) => {
                e.stopPropagation();
                onAddToParlay(selection);
              }}
            >
              {isInParlay ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Selected
                </>
              ) : (
                'Select'
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
