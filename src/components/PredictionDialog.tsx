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
import { Coins, TrendingUp, AlertCircle, AlertTriangle } from 'lucide-react';
import { decimalToAmerican, calculateParlayOdds } from '@/utils/oddsConverter';
import { PARLAY_CONFIG } from '@/utils/parlayConfig';
import { RISK_CONFIG, isPayoutOverMax } from '@/utils/riskConfig';

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
  
  // For parlay, calculate combined multiplier with platform edge
  const combinedOdds = isParlay 
    ? calculateParlayOdds(parlaySelections.map(s => s.decimal_odds), PARLAY_CONFIG.HOUSE_EDGE)
    : selection?.decimal_odds || 1;

  const stake = parseInt(stakeAmount) || 0;
  const potentialPayout = Math.floor(stake * combinedOdds);
  const potentialProfit = potentialPayout - stake;
  
  // Validation
  const exceedsMaxStake = stake > PARLAY_CONFIG.MAX_STAKE;
  const exceedsMaxPayout = isPayoutOverMax(stake, combinedOdds);
  const isValidStake = stake > 0 && stake <= walletBalance && !exceedsMaxStake && !exceedsMaxPayout;

  const handleConfirm = () => {
    if (isValidStake) {
      onConfirm(stake);
      setStakeAmount('100');
    }
  };

  const quickAmounts = [50, 100, 250, 500];

  if (!selection && !isParlay) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>
            {isParlay ? `Confirm Combo Entry` : 'Confirm Entry'}
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
          {/* Prediction Summary for single predictions */}
          {!isParlay && marketContext && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Contest Type</div>
              <div className="font-semibold">{marketContext.marketType}</div>
              {selection && (
                <>
                  <div className="text-xs text-muted-foreground mt-2">Selection</div>
                  <div className="font-semibold">{selection.athlete.name}</div>
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
                    {decimalToAmerican(sel.decimal_odds)}
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
                {combinedOdds.toFixed(2)}x
              </span>
            </div>
            {isParlay && (
              <div className="text-xs text-muted-foreground">
                5% platform fee applied to combined multiplier
              </div>
            )}
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
              id="stake"
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Enter entry amount"
              min="1"
              max={Math.min(walletBalance, PARLAY_CONFIG.MAX_STAKE)}
            />
            {exceedsMaxStake && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Maximum entry is {PARLAY_CONFIG.MAX_STAKE.toLocaleString()} tokens
                </AlertDescription>
              </Alert>
            )}
            {exceedsMaxPayout && !exceedsMaxStake && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Maximum payout is {RISK_CONFIG.MAX_PAYOUT.toLocaleString()} tokens. Reduce stake or pick different odds.
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
                <span className="font-bold text-lg">{potentialPayout.toLocaleString()}</span>
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
            onClick={handleConfirm}
            disabled={!isValidStake || isValidating}
            className="bg-primary hover:bg-primary/90"
          >
            {isValidating ? 'Validating...' : 'Confirm Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
