import { useState, useEffect } from 'react';
import { Selection } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Coins, TrendingUp, AlertCircle, Flame, Rocket } from 'lucide-react';
import { calculateCombinedMultiplier, formatMultiplier } from '@/utils/multiplierUtils';
import { PARLAY_CONFIG } from '@/utils/parlayConfig';
import { getRiskTierFromMultiplier, isUnderdog, getUnderdogMotivation, getRewardFraming } from '@/utils/riskTiers';

interface PredictionDialogProps {
  selection: Selection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (stakeAmount: number) => void;
  walletBalance: number;
  parlaySelections?: Selection[];
  marketContext?: {
    tournamentName: string;
    discipline: string;
    gender: string;
    marketType: string;
  };
  isValidating?: boolean;
}

export const PredictionDialog = ({
  selection,
  open,
  onOpenChange,
  onConfirm,
  walletBalance,
  parlaySelections = [],
  marketContext,
  isValidating = false,
}: PredictionDialogProps) => {
  const [stakeAmount, setStakeAmount] = useState('100');
  
  const isParlay = parlaySelections.length >= 2;
  
  // Risk tier for single selection
  const riskTier = selection ? getRiskTierFromMultiplier(selection.decimal_odds) : null;
  const isUnderdogPick = selection ? isUnderdog(selection.decimal_odds) : false;
  
  // For parlay, calculate combined multiplier with platform edge
  const combinedMultiplier = isParlay 
    ? calculateCombinedMultiplier(parlaySelections.map(s => s.decimal_odds), PARLAY_CONFIG.HOUSE_EDGE)
    : selection?.decimal_odds || 1;

  const stake = parseInt(stakeAmount) || 0;
  const projectedRewards = Math.floor(stake * combinedMultiplier);
  const potentialProfit = projectedRewards - stake;
  
  // Validation — only minimum stake and wallet balance gate entries.
  // Per-pick stake/payout caps removed for beta launch.
  const belowMinStake = stake < 100;
  const isValidStake = stake >= 100 && stake <= walletBalance;

  const handleConfirm = () => {
    if (isValidStake) {
      onConfirm(stake);
      setStakeAmount('100');
    }
  };

  const quickAmounts = [100, 250, 500, 1000];

  if (!selection && !isParlay) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-md bg-card border-border ${isUnderdogPick ? 'border-orange-500/50' : ''}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUnderdogPick && riskTier && (
              <span className="text-lg">{riskTier.emoji}</span>
            )}
            {isParlay 
              ? `Confirm Combo Entry` 
              : isUnderdogPick 
                ? `${riskTier?.label} Entry`
                : 'Confirm Entry'}
          </DialogTitle>
          <DialogDescription>
            {marketContext && (
              <span className="block mb-2">
                {marketContext.tournamentName} • {marketContext.discipline.charAt(0).toUpperCase() + marketContext.discipline.slice(1)} • {marketContext.gender === 'men' ? 'Men' : 'Women'}
              </span>
            )}
            {isParlay 
              ? `${parlaySelections.length}-pick combo - All selections must be correct`
              : selection?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Underdog Motivation Banner */}
          {!isParlay && isUnderdogPick && riskTier && (
            <div className={`rounded-lg p-3 border ${riskTier.tier === 'longshot' 
              ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' 
              : 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800'}`}>
              <div className="flex items-start gap-2">
                {riskTier.tier === 'longshot' ? (
                  <Rocket className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                ) : (
                  <Flame className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${riskTier.tier === 'longshot' 
                    ? 'text-red-800 dark:text-red-300' 
                    : 'text-orange-800 dark:text-orange-300'}`}>
                    {getUnderdogMotivation(riskTier.tier)}
                  </p>
                  {stake > 0 && (
                    <p className={`text-xs mt-1 ${riskTier.tier === 'longshot' 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-orange-600 dark:text-orange-400'}`}>
                      {getRewardFraming(combinedMultiplier, stake)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Prediction Summary for single predictions */}
          {!isParlay && marketContext && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Prediction Type</div>
              <div className="font-semibold">{marketContext.marketType}</div>
              {selection && (
                <>
                  <div className="text-xs text-muted-foreground mt-2">Selection</div>
                  <div className="font-semibold flex items-center gap-2">
                    {selection.athlete.name}
                    {riskTier && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${riskTier.colorClass}`}
                      >
                        {riskTier.emoji} {riskTier.label}
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {/* Show combo picks if it's a combo entry */}
          {isParlay && (
            <div className="space-y-2 mb-4">
              <Label className="text-sm font-semibold">Combo Picks:</Label>
              {parlaySelections.map((sel, idx) => (
                <div key={sel.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <span className="text-sm">{idx + 1}. {sel.athlete.name}</span>
                  <span className="text-sm font-semibold text-primary">
                    {formatMultiplier(sel.decimal_odds)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {isParlay ? 'Combined Multiplier' : 'Multiplier'}
              </span>
              <span className="font-semibold text-primary flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                {formatMultiplier(combinedMultiplier)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {isParlay 
                ? '5% platform fee applied. Higher multipliers = lower probability.'
                : 'Higher multipliers mean lower probability. Multipliers reflect difficulty, not guaranteed outcomes.'}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Balance</span>
              <span className="font-semibold flex items-center gap-1">
                <Coins className="w-4 h-4" />
                {walletBalance.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stake">Entry Amount (Tokens)</Label>
            <Input
              id="entry-amount-input"
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Enter entry amount"
              min="1"
              max={walletBalance}
            />
            <p className="text-xs text-muted-foreground">
              Entry amount × multiplier = projected rewards (if correct)
            </p>
            {belowMinStake && stake > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Minimum entry is 100 tokens.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setStakeAmount(amount.toString())}
                  className="flex-1"
                  disabled={amount > walletBalance}
                >
                  {amount}
                </Button>
              ))}
            </div>
          </div>

          {stake > 0 && (
            <div className="bg-primary/10 rounded-lg p-4 space-y-2 border border-primary/20">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Projected Rewards</span>
                <span className="font-bold text-lg">{projectedRewards.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Potential Rewards</span>
                <span className="font-semibold text-primary">
                  +{potentialProfit.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isValidating}
          >
            Cancel
          </Button>
          <Button
            id="confirm-entry-btn"
            onClick={handleConfirm}
            disabled={!isValidStake || isValidating}
            className={isUnderdogPick && riskTier?.tier === 'longshot' 
              ? "bg-red-600 hover:bg-red-700 text-white" 
              : isUnderdogPick 
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-primary hover:bg-primary/90"}
          >
            {isValidating 
              ? 'Validating...' 
              : isUnderdogPick && riskTier
                ? `${riskTier.emoji} Confirm ${riskTier.label}`
                : 'Confirm Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
