import { useState } from 'react';
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
import { Coins, TrendingUp } from 'lucide-react';

interface PredictionDialogProps {
  selection: Selection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (stakeAmount: number) => void;
  walletBalance: number;
}

export const PredictionDialog = ({
  selection,
  open,
  onOpenChange,
  onConfirm,
  walletBalance,
}: PredictionDialogProps) => {
  const [stakeAmount, setStakeAmount] = useState('100');
  
  if (!selection) return null;

  const stake = parseInt(stakeAmount) || 0;
  const potentialPayout = Math.floor(stake * selection.decimal_odds);
  const potentialProfit = potentialPayout - stake;

  const handleConfirm = () => {
    if (stake > 0 && stake <= walletBalance) {
      onConfirm(stake);
      setStakeAmount('100');
    }
  };

  const quickAmounts = [50, 100, 250, 500];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Place Prediction</DialogTitle>
          <DialogDescription>
            {selection.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Odds</span>
              <span className="font-semibold text-primary flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                {selection.decimal_odds.toFixed(2)}
              </span>
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
            <Label htmlFor="stake">Stake Amount (Tokens)</Label>
            <Input
              id="stake"
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Enter stake amount"
              min="1"
              max={walletBalance}
            />
            <div className="flex gap-2">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setStakeAmount(amount.toString())}
                  className="flex-1"
                >
                  {amount}
                </Button>
              ))}
            </div>
          </div>

          {stake > 0 && (
            <div className="bg-primary/10 rounded-lg p-4 space-y-2 border border-primary/20">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Potential Payout</span>
                <span className="font-bold text-lg">{potentialPayout.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Potential Profit</span>
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
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={stake === 0 || stake > walletBalance}
            className="bg-primary hover:bg-primary/90"
          >
            Confirm Prediction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
