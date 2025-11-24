import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Selection } from '@/types';
import { Coins } from 'lucide-react';

interface PodiumPredictionDialogProps {
  selections: Selection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (stakeAmount: number) => void;
  walletBalance: number;
}

export const PodiumPredictionDialog = ({
  selections,
  open,
  onOpenChange,
  onConfirm,
  walletBalance,
}: PodiumPredictionDialogProps) => {
  const [stakeAmount, setStakeAmount] = useState<string>('10');

  if (selections.length !== 3) return null;

  // Calculate combined odds for podium (lower odds since it's easier to win)
  const combinedOdds = selections.reduce((acc, sel) => acc * sel.decimal_odds, 1) * 0.3;
  const potentialPayout = Math.floor(Number(stakeAmount) * combinedOdds);

  const handleConfirm = () => {
    const amount = Number(stakeAmount);
    if (amount > 0 && amount <= walletBalance) {
      onConfirm(amount);
      setStakeAmount('10');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Podium Prediction</DialogTitle>
          <DialogDescription>
            Predict these 3 athletes to finish in the top 3 (in any order)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selected Athletes */}
          <div className="space-y-2">
            <Label>Selected Athletes:</Label>
            {selections.map((selection, index) => (
              <div key={selection.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                <span className="font-semibold text-primary">{index + 1}.</span>
                <span className="font-medium">{selection.athlete.name}</span>
              </div>
            ))}
          </div>

          {/* Combined Odds */}
          <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
            <span className="text-sm font-medium">Combined Odds:</span>
            <span className="text-lg font-bold text-primary">
              {combinedOdds.toFixed(2)}x
            </span>
          </div>

          {/* Stake Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="stake">Stake Amount</Label>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Coins className="w-4 h-4" />
                <span>Balance: {walletBalance}</span>
              </div>
            </div>
            <Input
              id="stake"
              type="number"
              min="1"
              max={walletBalance}
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Enter stake amount"
            />
          </div>

          {/* Potential Payout */}
          <div className="flex items-center justify-between p-3 bg-accent rounded-lg">
            <span className="text-sm font-medium">Potential Payout:</span>
            <span className="text-xl font-bold">{potentialPayout} tokens</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!stakeAmount || Number(stakeAmount) <= 0 || Number(stakeAmount) > walletBalance}
            className="flex-1"
          >
            Place Bet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
