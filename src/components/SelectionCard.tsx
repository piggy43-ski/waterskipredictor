import { Selection, Discipline } from '@/types';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
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

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
  const isTopThree = !!rank && rank <= 3;
  const isDefendingChamp = !!(discipline && selection.athlete.defending_champion_disciplines?.includes(discipline));
  const isInjured = !!selection.athlete.injury_flag;

  const handleClick = () => {
    if (isAtCapacity && !(mode === 'parlay' && isInParlay)) return;
    if (mode === 'parlay' && onAddToParlay) {
      onAddToParlay(selection);
    } else {
      onSelect(selection);
    }
  };

  const selected = mode === 'parlay' && isInParlay;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isAtCapacity && !selected}
      className={cn(
        'group press-scale relative flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'border-border hover:border-primary/40',
        selected && 'border-primary/60 bg-primary/[0.06]',
        highlighted && 'border-primary/60 ring-1 ring-primary/40',
        isTopThree && 'border-l-2 border-l-primary',
        isAtCapacity && !selected && 'opacity-50',
      )}
    >
      {/* Rank chip */}
      <div className="flex w-8 shrink-0 flex-col items-center">
        <span
          className={cn(
            'font-condensed text-sm font-extrabold tabular-nums leading-none',
            isTopThree ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {rank ? `#${rank}` : '—'}
        </span>
      </div>

      {/* Avatar */}
      <div className="relative h-10 w-10 shrink-0">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full border bg-secondary text-[11px] font-bold uppercase tracking-wider text-foreground/80',
            isTopThree ? 'border-primary/40' : 'border-border',
          )}
        >
          {getInitials(selection.athlete.name)}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 text-base leading-none">
          {getFlagEmoji(selection.athlete.country)}
        </span>
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {selection.athlete.name}
          </h3>
          {isDefendingChamp && (
            <span title="Defending champion" className="text-[11px] leading-none">🏆</span>
          )}
          {isInjured && (
            <span title="Injury flag" className="text-[11px] leading-none">🏥</span>
          )}
        </div>
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {selection.athlete.country}
          {isAtCapacity && !selected && <span className="ml-2 text-muted-foreground/70">· Unavailable</span>}
        </p>
      </div>

      {/* Multiplier */}
      <div className="flex shrink-0 items-center gap-2 pl-2">
        {selected && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
        <span
          className={cn(
            'font-display text-2xl leading-none tabular-nums transition-colors',
            isTopThree || selected ? 'text-primary' : 'text-foreground',
          )}
        >
          {multiplierDisplay}
        </span>
      </div>
    </button>
  );
};
