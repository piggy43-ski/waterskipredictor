import { Selection } from '@/types';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp } from 'lucide-react';
import { decimalToAmerican } from '@/utils/oddsConverter';

interface SelectionCardProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
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

export const SelectionCard = ({ selection, onSelect }: SelectionCardProps) => {
  const americanOdds = decimalToAmerican(selection.decimal_odds);
  
  return (
    <Card className="p-4 hover:shadow-glow hover:border-primary/50 transition-all cursor-pointer group" onClick={() => onSelect(selection)}>
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">{selection.athlete.name}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <span className="text-xl">{getFlagEmoji(selection.athlete.country)}</span>
            {selection.athlete.country}
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-2xl font-bold text-primary">
              {americanOdds}
            </span>
          </div>
          <Button size="sm" variant="default" className="min-w-[80px]">
            Place Bet
          </Button>
        </div>
      </div>
    </Card>
  );
};
