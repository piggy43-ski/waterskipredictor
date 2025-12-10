import { useState } from 'react';
import { ChevronDown, ChevronUp, Trophy, Target, Award, AlertTriangle, TrendingUp, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PointsBreakdownData {
  // New format from edge function
  position_points?: number;
  made_finals_bonus?: number;
  highest_score_bonus?: number;
  podium_bonus?: number;
  missed_first_pass_penalty?: number;
  missed_gate_penalty?: number;
  did_not_make_finals_penalty?: number;
  no_show_penalty?: number;
  streak_multiplier?: number;
  raw_points?: number;
  final_points?: number;
  final_position?: number;
  best_score?: number | string;
  made_finals?: boolean | number;
  best_round_rank?: number;
  best_round_type?: string;
  reason?: string;
  // Legacy format support
  position?: number;
  podium?: number;
  highest_score?: number;
  missed_first_pass?: number;
  missed_gate?: number;
  did_not_make_finals?: number;
  no_show?: number;
  raw_total?: number;
}

interface Props {
  athleteName: string;
  breakdown: PointsBreakdownData | null;
  totalPoints: number;
  compact?: boolean;
}

// Normalize breakdown data to handle both old and new formats
function normalizeBreakdown(breakdown: PointsBreakdownData): {
  positionPoints: number;
  madeFinalsBonus: number;
  highestScoreBonus: number;
  podiumBonus: number;
  missedFirstPassPenalty: number;
  missedGatePenalty: number;
  didNotMakeFinalsPenalty: number;
  noShowPenalty: number;
  streakMultiplier: number;
  rawPoints: number;
  finalPoints: number;
  finalPosition: number | null;
  bestScore: string | null;
  madeFinalsFlag: boolean;
  bestRoundRank: number | null;
  bestRoundType: string | null;
  reason: string | null;
} {
  return {
    positionPoints: breakdown.position_points ?? breakdown.position ?? 0,
    madeFinalsBonus: breakdown.made_finals_bonus ?? (typeof breakdown.made_finals === 'number' ? breakdown.made_finals : 0),
    highestScoreBonus: breakdown.highest_score_bonus ?? breakdown.highest_score ?? 0,
    podiumBonus: breakdown.podium_bonus ?? breakdown.podium ?? 0,
    missedFirstPassPenalty: breakdown.missed_first_pass_penalty ?? breakdown.missed_first_pass ?? 0,
    missedGatePenalty: breakdown.missed_gate_penalty ?? breakdown.missed_gate ?? 0,
    didNotMakeFinalsPenalty: breakdown.did_not_make_finals_penalty ?? breakdown.did_not_make_finals ?? 0,
    noShowPenalty: breakdown.no_show_penalty ?? breakdown.no_show ?? 0,
    streakMultiplier: breakdown.streak_multiplier ?? 1,
    rawPoints: breakdown.raw_points ?? breakdown.raw_total ?? 0,
    finalPoints: breakdown.final_points ?? breakdown.raw_points ?? breakdown.raw_total ?? 0,
    finalPosition: breakdown.final_position ?? null,
    bestScore: breakdown.best_score ? String(breakdown.best_score) : null,
    madeFinalsFlag: breakdown.made_finals === true || (typeof breakdown.made_finals === 'number' && breakdown.made_finals > 0),
    bestRoundRank: breakdown.best_round_rank ?? null,
    bestRoundType: breakdown.best_round_type ?? null,
    reason: breakdown.reason ?? null,
  };
}

export function FantasyPointsBreakdown({ athleteName, breakdown, totalPoints, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!breakdown) {
    return (
      <div className="text-right">
        <Badge 
          variant="outline" 
          className={cn(
            "font-bold text-sm px-2 py-1",
            totalPoints >= 0 ? "bg-primary/10 text-primary border-primary/30" : "bg-destructive/10 text-destructive border-destructive/30"
          )}
        >
          {totalPoints > 0 ? '+' : ''}{totalPoints} pts
        </Badge>
      </div>
    );
  }

  const normalized = normalizeBreakdown(breakdown);

  if (compact) {
    return (
      <div className="flex flex-col items-end">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="flex items-center gap-1.5 focus:outline-none hover:opacity-80 transition-opacity"
        >
          <Badge 
            variant="outline" 
            className={cn(
              "font-bold text-sm px-2 py-1 cursor-pointer",
              normalized.finalPoints >= 0 
                ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20" 
                : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
            )}
          >
            {normalized.finalPoints > 0 ? '+' : ''}{normalized.finalPoints}
            {expanded ? (
              <ChevronUp className="w-3 h-3 ml-1 inline" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-1 inline" />
            )}
          </Badge>
        </button>
        
        {expanded && (
          <div 
            className="mt-2 p-3 bg-card rounded-lg border shadow-lg text-left text-xs space-y-1.5 w-64 absolute right-0 z-10"
            onClick={e => e.stopPropagation()}
          >
            <BreakdownContent normalized={normalized} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={cn(
              "font-bold text-base px-3 py-1.5",
              normalized.finalPoints >= 0 
                ? "bg-primary/10 text-primary border-primary/30" 
                : "bg-destructive/10 text-destructive border-destructive/30"
            )}
          >
            {normalized.finalPoints > 0 ? '+' : ''}{normalized.finalPoints} pts
          </Badge>
          {normalized.streakMultiplier > 1 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <TrendingUp className="w-3 h-3" />
              ×{normalized.streakMultiplier.toFixed(2)}
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
          <BreakdownContent normalized={normalized} />
        </div>
      )}
    </div>
  );
}

function BreakdownContent({ normalized }: { normalized: ReturnType<typeof normalizeBreakdown> }) {
  const hasNoShow = normalized.noShowPenalty < 0;
  const didNotMakeFinals = normalized.didNotMakeFinalsPenalty < 0;

  return (
    <>
      {/* Status header */}
      {hasNoShow ? (
        <div className="flex items-center gap-2 pb-2 border-b border-border/50 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">No Show / DNS / DNF</span>
        </div>
      ) : didNotMakeFinals ? (
        <div className="flex items-center gap-2 pb-2 border-b border-border/50 text-amber-600">
          <Target className="w-4 h-4" />
          <span className="font-medium">Did Not Make Finals</span>
        </div>
      ) : normalized.finalPosition ? (
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Trophy className="w-4 h-4" />
            Final Position
          </span>
          <span className="font-bold text-foreground">
            {normalized.finalPosition === 1 ? '🥇 1st' : 
             normalized.finalPosition === 2 ? '🥈 2nd' : 
             normalized.finalPosition === 3 ? '🥉 3rd' : 
             `#${normalized.finalPosition}`}
          </span>
        </div>
      ) : null}

      {/* Best round info for non-finalists */}
      {didNotMakeFinals && normalized.bestRoundRank && (
        <div className="flex items-center justify-between text-muted-foreground text-xs pb-1">
          <span>Best: {normalized.bestRoundType} round</span>
          <span>#{normalized.bestRoundRank}</span>
        </div>
      )}

      {/* Best score */}
      {normalized.bestScore && (
        <div className="flex items-center justify-between text-muted-foreground text-xs pb-1">
          <span>Best Score</span>
          <span className="font-medium text-foreground">{normalized.bestScore}</span>
        </div>
      )}

      {/* Reason if present */}
      {normalized.reason && (
        <div className="text-xs text-muted-foreground italic pb-1">
          {normalized.reason}
        </div>
      )}

      <div className="pt-1 space-y-1">
        {/* Base Points */}
        {normalized.positionPoints !== 0 && (
          <BreakdownRow 
            icon={<Trophy className="w-3 h-3" />}
            label="Position points"
            value={normalized.positionPoints}
            positive
          />
        )}

        {/* Bonuses */}
        {normalized.madeFinalsBonus > 0 && (
          <BreakdownRow 
            icon={<Target className="w-3 h-3" />}
            label="Made finals"
            value={normalized.madeFinalsBonus}
            positive
          />
        )}

        {normalized.highestScoreBonus > 0 && (
          <BreakdownRow 
            icon={<Zap className="w-3 h-3" />}
            label="Highest score of event"
            value={normalized.highestScoreBonus}
            positive
          />
        )}

        {normalized.podiumBonus > 0 && (
          <BreakdownRow 
            icon={<Award className="w-3 h-3" />}
            label="Podium bonus"
            value={normalized.podiumBonus}
            positive
          />
        )}

        {/* Penalties */}
        {normalized.didNotMakeFinalsPenalty < 0 && (
          <BreakdownRow 
            icon={<AlertTriangle className="w-3 h-3" />}
            label="Did not make finals"
            value={normalized.didNotMakeFinalsPenalty}
          />
        )}

        {normalized.missedFirstPassPenalty < 0 && (
          <BreakdownRow 
            icon={<AlertTriangle className="w-3 h-3" />}
            label="Missed first pass"
            value={normalized.missedFirstPassPenalty}
          />
        )}

        {normalized.missedGatePenalty < 0 && (
          <BreakdownRow 
            icon={<AlertTriangle className="w-3 h-3" />}
            label="Missed gate"
            value={normalized.missedGatePenalty}
          />
        )}

        {normalized.noShowPenalty < 0 && (
          <BreakdownRow 
            icon={<AlertTriangle className="w-3 h-3" />}
            label="No show penalty"
            value={normalized.noShowPenalty}
          />
        )}

        {/* Subtotal before streak */}
        {normalized.streakMultiplier > 1 && (
          <>
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{normalized.rawPoints}</span>
            </div>
            <BreakdownRow 
              icon={<TrendingUp className="w-3 h-3" />}
              label={`Streak bonus (×${normalized.streakMultiplier.toFixed(2)})`}
              value={normalized.finalPoints - normalized.rawPoints}
              positive
            />
          </>
        )}

        {/* Final Total */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 font-bold">
          <span>Total</span>
          <span className={normalized.finalPoints >= 0 ? "text-primary" : "text-destructive"}>
            {normalized.finalPoints > 0 ? '+' : ''}{normalized.finalPoints}
          </span>
        </div>
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
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn("font-medium", positive ? "text-green-600" : "text-destructive")}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}