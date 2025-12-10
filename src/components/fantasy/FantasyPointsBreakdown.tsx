import { useState } from 'react';
import { ChevronDown, ChevronUp, Trophy, Target, Award, AlertTriangle, TrendingUp, Zap, XCircle, Medal } from 'lucide-react';
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

function getPositionEmoji(position: number): string {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return `#${position}`;
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
      <div className="relative">
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
              "font-bold text-sm px-2.5 py-1 cursor-pointer flex items-center gap-1",
              normalized.finalPoints >= 0 
                ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20" 
                : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
            )}
          >
            {normalized.finalPoints > 0 ? '+' : ''}{normalized.finalPoints}
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </Badge>
        </button>
        
        {expanded && (
          <>
            {/* Backdrop to close on click outside */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            />
            {/* Dropdown panel */}
            <div 
              className="absolute right-0 top-full mt-2 p-4 bg-card rounded-lg border border-border shadow-xl text-left text-sm space-y-2 w-72 z-50"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-foreground truncate pr-2">{athleteName}</h4>
                <button 
                  onClick={() => setExpanded(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              <BreakdownContent normalized={normalized} />
            </div>
          </>
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
        <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-2">
          <BreakdownContent normalized={normalized} />
        </div>
      )}
    </div>
  );
}

function BreakdownContent({ normalized }: { normalized: ReturnType<typeof normalizeBreakdown> }) {
  const hasNoShow = normalized.noShowPenalty < 0;
  const didNotMakeFinals = normalized.didNotMakeFinalsPenalty < 0;
  const madeFinalsWithPosition = normalized.finalPosition && normalized.finalPosition > 0;

  return (
    <>
      {/* Status header with icon */}
      <div className={cn(
        "flex items-center gap-2 pb-3 border-b",
        hasNoShow ? "text-destructive border-destructive/30" : 
        didNotMakeFinals ? "text-amber-600 border-amber-600/30" : 
        "text-primary border-primary/30"
      )}>
        {hasNoShow ? (
          <>
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">No Show / DNS</p>
              <p className="text-xs text-muted-foreground">Did not compete</p>
            </div>
          </>
        ) : didNotMakeFinals ? (
          <>
            <div className="w-8 h-8 rounded-full bg-amber-600/10 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">Did Not Make Finals</p>
              <p className="text-xs text-muted-foreground">
                {normalized.bestRoundRank ? `Best: ${normalized.bestRoundType || 'Semi'} #${normalized.bestRoundRank}` : 'Eliminated in earlier rounds'}
              </p>
            </div>
          </>
        ) : madeFinalsWithPosition ? (
          <>
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold",
              normalized.finalPosition === 1 ? "bg-yellow-500/20 text-yellow-600" :
              normalized.finalPosition === 2 ? "bg-gray-400/20 text-gray-500" :
              normalized.finalPosition === 3 ? "bg-amber-600/20 text-amber-600" :
              "bg-primary/10 text-primary"
            )}>
              {getPositionEmoji(normalized.finalPosition!)}
            </div>
            <div>
              <p className="font-semibold">
                {normalized.finalPosition === 1 ? '1st Place' :
                 normalized.finalPosition === 2 ? '2nd Place' :
                 normalized.finalPosition === 3 ? '3rd Place' :
                 `${normalized.finalPosition}th Place`}
              </p>
              <p className="text-xs text-muted-foreground">Made Finals</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Medal className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">Competed</p>
              <p className="text-xs text-muted-foreground">Results pending</p>
            </div>
          </>
        )}
      </div>

      {/* Best score if available */}
      {normalized.bestScore && (
        <div className="flex items-center justify-between py-1 text-muted-foreground">
          <span className="text-xs">Best Score</span>
          <span className="font-medium text-foreground text-sm">{normalized.bestScore}</span>
        </div>
      )}

      {/* Points breakdown */}
      <div className="space-y-1.5 pt-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Points Breakdown</p>
        
        {/* Position points */}
        {normalized.positionPoints > 0 && (
          <BreakdownRow 
            icon={<Trophy className="w-3.5 h-3.5" />}
            label={`Position Points (#${normalized.finalPosition})`}
            value={normalized.positionPoints}
            positive
          />
        )}

        {/* Made finals bonus */}
        {normalized.madeFinalsBonus > 0 && (
          <BreakdownRow 
            icon={<Target className="w-3.5 h-3.5" />}
            label="Made Finals Bonus"
            value={normalized.madeFinalsBonus}
            positive
          />
        )}

        {/* Podium bonus */}
        {normalized.podiumBonus > 0 && (
          <BreakdownRow 
            icon={<Award className="w-3.5 h-3.5" />}
            label={`Podium Bonus (${normalized.finalPosition === 1 ? '1st' : '2nd/3rd'})`}
            value={normalized.podiumBonus}
            positive
          />
        )}

        {/* Highest score bonus */}
        {normalized.highestScoreBonus > 0 && (
          <BreakdownRow 
            icon={<Zap className="w-3.5 h-3.5" />}
            label="Highest Score of Event"
            value={normalized.highestScoreBonus}
            positive
          />
        )}

        {/* Penalties */}
        {normalized.didNotMakeFinalsPenalty < 0 && (
          <BreakdownRow 
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Did Not Make Finals"
            value={normalized.didNotMakeFinalsPenalty}
          />
        )}

        {normalized.missedFirstPassPenalty < 0 && (
          <BreakdownRow 
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Missed First Pass"
            value={normalized.missedFirstPassPenalty}
          />
        )}

        {normalized.missedGatePenalty < 0 && (
          <BreakdownRow 
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Missed Gate"
            value={normalized.missedGatePenalty}
          />
        )}

        {normalized.noShowPenalty < 0 && (
          <BreakdownRow 
            icon={<XCircle className="w-3.5 h-3.5" />}
            label="No Show Penalty"
            value={normalized.noShowPenalty}
          />
        )}

        {/* Streak multiplier if applicable */}
        {normalized.streakMultiplier > 1 && (
          <>
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-muted-foreground text-xs">Subtotal</span>
              <span className="font-medium text-sm">{normalized.rawPoints}</span>
            </div>
            <BreakdownRow 
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label={`Streak Multiplier (×${normalized.streakMultiplier.toFixed(2)})`}
              value={normalized.finalPoints - normalized.rawPoints}
              positive
            />
          </>
        )}

        {/* Final Total */}
        <div className={cn(
          "flex items-center justify-between pt-2 mt-2 border-t-2 font-bold",
          normalized.finalPoints >= 0 ? "border-primary/30" : "border-destructive/30"
        )}>
          <span>Total Points</span>
          <span className={cn(
            "text-lg",
            normalized.finalPoints >= 0 ? "text-primary" : "text-destructive"
          )}>
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
    <div className="flex items-center justify-between py-0.5">
      <span className="flex items-center gap-2 text-muted-foreground text-sm">
        <span className={positive ? "text-green-600" : "text-destructive"}>
          {icon}
        </span>
        {label}
      </span>
      <span className={cn(
        "font-semibold text-sm",
        positive ? "text-green-600" : "text-destructive"
      )}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}