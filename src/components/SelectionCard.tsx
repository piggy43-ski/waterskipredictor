import { Selection, Discipline } from '@/types';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { TrendingUp, Medal, Check } from 'lucide-react';
import { getRiskTierFromMultiplier } from '@/utils/riskTiers';
interface SelectionCardProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  discipline?: Discipline;
  mode?: 'single' | 'parlay';
  onAddToParlay?: (selection: Selection) => void;
  isInParlay?: boolean;
  highlighted?: boolean;
  /** Option A: Athlete has reached max exposure cap */
  isAtCapacity?: boolean;
  /** Option A: Remaining tokens before cap is reached */
  remainingCapacity?: number;
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

export const SelectionCard = ({ 
  selection, 
  onSelect, 
  discipline, 
  mode = 'single', 
  onAddToParlay, 
  isInParlay, 
  highlighted,
  isAtCapacity = false,
  remainingCapacity
}: SelectionCardProps) => {
  const multiplierDisplay = `${selection.decimal_odds.toFixed(2)}×`;
  const riskTier = getRiskTierFromMultiplier(selection.decimal_odds);
  
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
              {multiplierDisplay}
            </span>
          </div>
          
          {/* Risk tier description for underdogs */}
          {(riskTier.tier === 'bold_pick' || riskTier.tier === 'longshot') && (
            <span className="text-xs text-muted-foreground max-w-[140px] text-right">
              {riskTier.description}
            </span>
          )}
          
          {/* Option A: Show capacity warning */}
          {isAtCapacity && (
            <Badge variant="outline" className="text-muted-foreground bg-muted text-xs">
              Max entries reached
            </Badge>
          )}
          
          {/* Single Mode - Show only Enter Prediction */}
          {mode === 'single' && (
            <Button 
              size="sm" 
              variant={isAtCapacity ? "outline" : "default"}
              className="min-w-[100px]"
              disabled={isAtCapacity}
              onClick={(e) => {
                e.stopPropagation();
                if (!isAtCapacity) {
                  onSelect(selection);
                }
              }}
            >
              {isAtCapacity ? 'Unavailable' : 'Enter Prediction'}
            </Button>
          )}
          
          {/* Parlay Mode - Show only Select/Selected */}
          {mode === 'parlay' && onAddToParlay && (
            <Button 
              size="sm" 
              variant={isInParlay ? "default" : "outline"}
              className="min-w-[100px]"
              disabled={isAtCapacity && !isInParlay}
              onClick={(e) => {
                e.stopPropagation();
                if (!isAtCapacity || isInParlay) {
                  onAddToParlay(selection);
                }
              }}
            >
              {isInParlay ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Selected
                </>
              ) : isAtCapacity ? (
                'Unavailable'
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
