import { useState } from 'react';
import { ChevronDown, ChevronUp, Trophy, Target, Award, AlertTriangle, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PointsBreakdownData {
  position_points: number;
  made_finals_bonus: number;
  highest_score_bonus: number;
  podium_bonus: number;
  missed_first_pass_penalty: number;
  missed_gate_penalty: number;
  did_not_make_finals_penalty: number;
  no_show_penalty: number;
  streak_multiplier: number;
  raw_points: number;
  final_points: number;
  final_position?: number;
  best_score?: string;
  made_finals?: boolean;
  highest_score_event?: boolean;
}

interface Props {
  athleteName: string;
  breakdown: PointsBreakdownData | null;
  totalPoints: number;
  compact?: boolean;
}

export function FantasyPointsBreakdown({ athleteName, breakdown, totalPoints, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!breakdown) {
    return (
      <div className="text-right">
        <p className={cn("font-bold", totalPoints >= 0 ? "text-primary" : "text-destructive")}>
          {totalPoints}
        </p>
        <p className="text-xs text-muted-foreground">pts</p>
      </div>
    );
  }

  const hasPositiveItems = breakdown.position_points > 0 || 
    breakdown.made_finals_bonus > 0 || 
    breakdown.highest_score_bonus > 0 || 
    breakdown.podium_bonus > 0;

  const hasNegativeItems = breakdown.missed_first_pass_penalty < 0 || 
    breakdown.missed_gate_penalty < 0 || 
    breakdown.did_not_make_finals_penalty < 0 ||
    breakdown.no_show_penalty < 0;

  const hasStreak = breakdown.streak_multiplier > 1;

  if (compact) {
    return (
      <button 
        onClick={() => setExpanded(!expanded)}
        className="text-right focus:outline-none w-full"
      >
        <div className="flex items-center justify-end gap-1">
          <p className={cn("font-bold", breakdown.final_points >= 0 ? "text-primary" : "text-destructive")}>
            {breakdown.final_points}
          </p>
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">pts</p>
        
        {expanded && (
          <div className="mt-2 p-2 bg-background rounded border text-left text-xs space-y-1" onClick={e => e.stopPropagation()}>
            <BreakdownContent breakdown={breakdown} />
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-bold text-lg",
            breakdown.final_points >= 0 ? "text-primary" : "text-destructive"
          )}>
            {breakdown.final_points} pts
          </span>
          {hasStreak && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <TrendingUp className="w-3 h-3" />
              ×{breakdown.streak_multiplier.toFixed(2)}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
          <BreakdownContent breakdown={breakdown} />
        </div>
      )}
    </div>
  );
}

function BreakdownContent({ breakdown }: { breakdown: PointsBreakdownData }) {
  return (
    <>
      {/* Position info */}
      {breakdown.final_position && (
        <div className="flex items-center justify-between text-muted-foreground pb-1 border-b border-border/50">
          <span className="flex items-center gap-1">
            <Trophy className="w-3 h-3" />
            Final Position
          </span>
          <span className="font-medium text-foreground">
            {breakdown.final_position === 1 ? '🥇' : breakdown.final_position === 2 ? '🥈' : breakdown.final_position === 3 ? '🥉' : `#${breakdown.final_position}`}
          </span>
        </div>
      )}

      {/* Base Points */}
      {breakdown.position_points !== 0 && (
        <BreakdownRow 
          icon={<Trophy className="w-3 h-3" />}
          label="Position points"
          value={breakdown.position_points}
          positive
        />
      )}

      {/* Bonuses */}
      {breakdown.made_finals_bonus > 0 && (
        <BreakdownRow 
          icon={<Target className="w-3 h-3" />}
          label="Made finals"
          value={breakdown.made_finals_bonus}
          positive
        />
      )}

      {breakdown.highest_score_bonus > 0 && (
        <BreakdownRow 
          icon={<Award className="w-3 h-3" />}
          label="Highest score of event"
          value={breakdown.highest_score_bonus}
          positive
        />
      )}

      {breakdown.podium_bonus > 0 && (
        <BreakdownRow 
          icon={<Award className="w-3 h-3" />}
          label="Podium bonus"
          value={breakdown.podium_bonus}
          positive
        />
      )}

      {/* Penalties */}
      {breakdown.did_not_make_finals_penalty < 0 && (
        <BreakdownRow 
          icon={<AlertTriangle className="w-3 h-3" />}
          label="Did not make finals"
          value={breakdown.did_not_make_finals_penalty}
        />
      )}

      {breakdown.missed_first_pass_penalty < 0 && (
        <BreakdownRow 
          icon={<AlertTriangle className="w-3 h-3" />}
          label="Missed first pass"
          value={breakdown.missed_first_pass_penalty}
        />
      )}

      {breakdown.missed_gate_penalty < 0 && (
        <BreakdownRow 
          icon={<AlertTriangle className="w-3 h-3" />}
          label="Missed gate"
          value={breakdown.missed_gate_penalty}
        />
      )}

      {breakdown.no_show_penalty < 0 && (
        <BreakdownRow 
          icon={<AlertTriangle className="w-3 h-3" />}
          label="No show"
          value={breakdown.no_show_penalty}
        />
      )}

      {/* Subtotal before streak */}
      {breakdown.streak_multiplier > 1 && (
        <>
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{breakdown.raw_points}</span>
          </div>
          <BreakdownRow 
            icon={<TrendingUp className="w-3 h-3" />}
            label={`Streak bonus (×${breakdown.streak_multiplier.toFixed(2)})`}
            value={breakdown.final_points - breakdown.raw_points}
            positive
          />
        </>
      )}

      {/* Final Total */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50 font-bold">
        <span>Total</span>
        <span className={breakdown.final_points >= 0 ? "text-primary" : "text-destructive"}>
          {breakdown.final_points}
        </span>
      </div>
    </>
  );
}

function BreakdownRow({ 
  icon, 
  label, 
  value, 
  positive = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn("font-medium", positive ? "text-green-600" : "text-destructive")}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}
