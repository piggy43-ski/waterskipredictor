import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Medal } from 'lucide-react';
import { Selection, Discipline } from '@/types';
import { decimalToAmerican } from '@/utils/oddsConverter';

interface PodiumSelectionCardProps {
  athletes: Selection[];
  selectedAthletes: Selection[];
  onToggleAthlete: (athlete: Selection) => void;
  maxSelections?: number;
  discipline?: Discipline;
}

export const PodiumSelectionCard = ({ 
  athletes, 
  selectedAthletes, 
  onToggleAthlete,
  maxSelections = 3,
  discipline 
}: PodiumSelectionCardProps) => {
  const getFlagEmoji = (countryCode: string): string => {
    const countryFlags: { [key: string]: string } = {
      'USA': '🇺🇸', 'United States': '🇺🇸',
      'CAN': '🇨🇦', 'Canada': '🇨🇦',
      'AUS': '🇦🇺', 'Australia': '🇦🇺',
      'GBR': '🇬🇧', 'United Kingdom': '🇬🇧',
      'FRA': '🇫🇷', 'France': '🇫🇷',
      'GER': '🇩🇪', 'Germany': '🇩🇪',
      'ITA': '🇮🇹', 'Italy': '🇮🇹',
      'ESP': '🇪🇸', 'Spain': '🇪🇸',
      'SWE': '🇸🇪', 'Sweden': '🇸🇪',
      'NOR': '🇳🇴', 'Norway': '🇳🇴',
      'DEN': '🇩🇰', 'Denmark': '🇩🇰',
      'CHI': '🇨🇱', 'Chile': '🇨🇱',
      'PRI': '🇵🇷', 'Puerto Rico': '🇵🇷',
    };
    return countryFlags[countryCode] || '🏳️';
  };

  const isSelected = (athlete: Selection) => {
    return selectedAthletes.some(a => a.id === athlete.id);
  };

  const canSelect = selectedAthletes.length < maxSelections;

  // Get the appropriate rank based on discipline
  const getRank = (athlete: Selection) => {
    if (!discipline) return null;
    switch (discipline) {
      case 'slalom':
        return athlete.athlete.current_rank_slalom;
      case 'trick':
        return athlete.athlete.current_rank_trick;
      case 'jump':
        return athlete.athlete.current_rank_jump;
      default:
        return null;
    }
  };

  // Determine badge color based on rank
  const getRankVariant = (rank: number | null) => {
    if (!rank) return 'secondary';
    if (rank <= 3) return 'default';
    if (rank <= 10) return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-muted-foreground">
          Select {maxSelections} Athletes for Podium
        </h3>
        <Badge variant={selectedAthletes.length === maxSelections ? "default" : "secondary"}>
          {selectedAthletes.length}/{maxSelections} Selected
        </Badge>
      </div>
      
      {athletes.map((athlete) => {
        const selected = isSelected(athlete);
        const disabled = !selected && !canSelect;
        const rank = getRank(athlete);
        
        return (
          <Card 
            key={athlete.id} 
            className={`transition-all cursor-pointer ${
              selected 
                ? 'border-primary bg-primary/5' 
                : disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:border-primary/50'
            }`}
            onClick={() => !disabled && onToggleAthlete(athlete)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    {selected ? <Check className="w-5 h-5" /> : getFlagEmoji(athlete.athlete.country)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{athlete.athlete.name}</div>
                      {rank && (
                        <Badge variant={getRankVariant(rank)} className="flex items-center gap-1 text-xs">
                          {rank <= 3 && <Medal className="w-3 h-3" />}
                          #{rank}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {getFlagEmoji(athlete.athlete.country)} {athlete.athlete.country}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-primary">
                    {decimalToAmerican(athlete.decimal_odds)}
                  </div>
                  <div className="text-xs text-muted-foreground">odds</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
