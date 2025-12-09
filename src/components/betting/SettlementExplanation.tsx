import { Trophy, XCircle, RefreshCw, Medal, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface SettlementData {
  status: 'WON' | 'LOST' | 'VOID';
  explanation: string;
  actual_results?: {
    position_1st?: string;
    position_2nd?: string;
    position_3rd?: string;
    winner_score?: string;
    highest_scorer?: string;
    highest_score?: string;
  };
  your_pick?: {
    athlete_name?: string;
    market_type: string;
    podium_picks?: Array<{
      position: number;
      athlete: string;
    }>;
  };
  payout_details?: {
    stake: number;
    odds_decimal: number;
    payout: number;
    profit?: number;
  };
}

interface Props {
  settlement: SettlementData | null;
  className?: string;
}

export function SettlementExplanation({ settlement, className }: Props) {
  if (!settlement) return null;

  const statusConfig = {
    WON: {
      icon: Trophy,
      bgClass: 'bg-success/10 border-success/30',
      iconClass: 'text-success',
      label: 'You Won!'
    },
    LOST: {
      icon: XCircle,
      bgClass: 'bg-destructive/10 border-destructive/30',
      iconClass: 'text-destructive',
      label: 'You Lost'
    },
    VOID: {
      icon: RefreshCw,
      bgClass: 'bg-muted border-muted-foreground/30',
      iconClass: 'text-muted-foreground',
      label: 'Bet Voided'
    }
  };

  const config = statusConfig[settlement.status];
  const Icon = config.icon;

  return (
    <Card className={cn('p-3 border', config.bgClass, className)}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Icon className={cn('w-5 h-5', config.iconClass)} />
          <span className={cn('font-semibold', config.iconClass)}>{config.label}</span>
        </div>

        {/* Explanation */}
        <p className="text-sm text-foreground">{settlement.explanation}</p>

        {/* Actual Results */}
        {settlement.actual_results && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Actual Results
            </p>
            <div className="flex flex-wrap gap-2">
              {settlement.actual_results.position_1st && (
                <Badge variant="outline" className="gap-1">
                  <Medal className="w-3 h-3 text-yellow-500" />
                  1st: {settlement.actual_results.position_1st}
                </Badge>
              )}
              {settlement.actual_results.position_2nd && (
                <Badge variant="outline" className="gap-1">
                  <Medal className="w-3 h-3 text-gray-400" />
                  2nd: {settlement.actual_results.position_2nd}
                </Badge>
              )}
              {settlement.actual_results.position_3rd && (
                <Badge variant="outline" className="gap-1">
                  <Medal className="w-3 h-3 text-amber-600" />
                  3rd: {settlement.actual_results.position_3rd}
                </Badge>
              )}
              {settlement.actual_results.highest_scorer && (
                <Badge variant="outline" className="gap-1">
                  <Target className="w-3 h-3 text-primary" />
                  Highest: {settlement.actual_results.highest_scorer}
                  {settlement.actual_results.highest_score && ` (${settlement.actual_results.highest_score})`}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Payout details for wins */}
        {settlement.status === 'WON' && settlement.payout_details && (
          <div className="pt-2 border-t border-border/50 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stake × Odds</span>
              <span>
                {settlement.payout_details.stake} × {settlement.payout_details.odds_decimal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between font-semibold text-success">
              <span>Profit</span>
              <span>+{settlement.payout_details.profit?.toLocaleString() || 0} tokens</span>
            </div>
          </div>
        )}

        {/* Stake lost for losses */}
        {settlement.status === 'LOST' && settlement.payout_details && (
          <div className="pt-2 border-t border-border/50 text-sm">
            <div className="flex justify-between font-semibold text-destructive">
              <span>Stake Lost</span>
              <span>-{settlement.payout_details.stake.toLocaleString()} tokens</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
