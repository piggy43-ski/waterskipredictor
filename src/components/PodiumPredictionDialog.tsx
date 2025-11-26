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
import { Coins, Medal } from 'lucide-react';
import { decimalToAmerican } from '@/utils/oddsConverter';

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
  const americanOdds = decimalToAmerican(combinedOdds);

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
          {/* Selected Athletes with Positions */}
          <div className="space-y-2">
            <Label>Your Predicted Podium:</Label>
            {selections.map((selection, index) => {
              const medals = ['🥇', '🥈', '🥉'];
              const positions = ['1st Place', '2nd Place', '3rd Place'];
              return (
                <div key={selection.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <span className="text-2xl">{medals[index]}</span>
                  <div className="flex-1">
                    <div className="font-bold">{selection.athlete.name}</div>
                    <div className="text-xs text-muted-foreground">{positions[index]}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Combined Odds */}
          <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
            <span className="text-sm font-medium">Combined Odds:</span>
            <span className="text-lg font-bold text-primary">
              {americanOdds}
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
