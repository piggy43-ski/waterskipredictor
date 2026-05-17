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
import { calculatePodiumCombinedMultiplier } from '@/utils/podiumMultipliers';

interface PodiumPredictionDialogProps {
  selections: Selection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (stakeAmount: number) => void;
  walletBalance: number;
  tournamentName: string;
  discipline: string;
  gender: string;
}

export const PodiumPredictionDialog = ({
  selections,
  open,
  onOpenChange,
  onConfirm,
  walletBalance,
  tournamentName,
  discipline,
  gender,
}: PodiumPredictionDialogProps) => {
  const [stakeAmount, setStakeAmount] = useState<string>('10');

  if (selections.length !== 3) return null;

  // Calculate combined multiplier using Sum × 2 formula for podium difficulty bonus
  const combinedOdds = calculatePodiumCombinedMultiplier(
    selections[0].decimal_odds,
    selections[1].decimal_odds,
    selections[2].decimal_odds
  );
  const potentialPayout = Math.floor(Number(stakeAmount) * combinedOdds);
  const multiplierDisplay = `${combinedOdds.toFixed(2)}x`;

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
          <DialogTitle>Confirm Podium Entry</DialogTitle>
          <DialogDescription>
            {tournamentName} • {discipline.charAt(0).toUpperCase() + discipline.slice(1)} • {gender === 'men' ? 'Men' : 'Women'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Entry Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="text-xs text-muted-foreground">Prediction Type</div>
            <div className="font-semibold">Podium Finish (Exact Order)</div>
          </div>
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

          {/* Combined Multiplier */}
          <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
            <span className="text-sm font-medium">Combined Multiplier:</span>
            <span className="text-lg font-bold text-primary">
              {multiplierDisplay}
            </span>
          </div>

          {/* Entry Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="stake">Entry Amount</Label>
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
              placeholder="Enter entry amount"
            />
          </div>

          {/* Projected Rewards */}
          <div className="flex items-center justify-between p-3 bg-accent rounded-lg">
            <span className="text-sm font-medium">Projected Rewards:</span>
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
            disabled={!stakeAmount || Number(stakeAmount) < 100 || Number(stakeAmount) > walletBalance}
            className="flex-1"
          >
            Place Entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
