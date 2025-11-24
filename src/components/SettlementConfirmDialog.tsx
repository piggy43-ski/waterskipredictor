import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Coins, Users, TrendingUp } from 'lucide-react';

interface SettlementPreview {
  pending_predictions: number;
  potential_payout: number;
  affected_users: number;
  selection_description: string;
  result: 'won' | 'lost' | 'void';
}

interface SettlementConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: SettlementPreview | null;
  isProcessing: boolean;
  onConfirm: () => void;
}

export const SettlementConfirmDialog = ({
  open,
  onOpenChange,
  preview,
  isProcessing,
  onConfirm,
}: SettlementConfirmDialogProps) => {
  if (!preview) return null;

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'won':
        return <Badge className="bg-success text-success-foreground">Won</Badge>;
      case 'lost':
        return <Badge variant="destructive">Lost</Badge>;
      case 'void':
        return <Badge variant="secondary">Void</Badge>;
      default:
        return null;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            Confirm Settlement
            {getResultBadge(preview.result)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action will settle all pending predictions for this selection and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="font-medium">{preview.selection_description}</p>
            
            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs">Predictions</span>
                </div>
                <p className="text-lg font-bold">{preview.pending_predictions}</p>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-xs">Users</span>
                </div>
                <p className="text-lg font-bold">{preview.affected_users}</p>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Coins className="w-4 h-4" />
                  <span className="text-xs">
                    {preview.result === 'won' ? 'Payout' : preview.result === 'void' ? 'Refund' : 'Staked'}
                  </span>
                </div>
                <p className={`text-lg font-bold ${
                  preview.result === 'won' ? 'text-success' : 
                  preview.result === 'lost' ? 'text-destructive' : 
                  'text-muted-foreground'
                }`}>
                  {preview.potential_payout.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {preview.result === 'won' && (
            <p className="text-sm text-muted-foreground">
              ✓ {preview.pending_predictions} prediction(s) will be marked as WON
              <br />
              ✓ {preview.potential_payout.toLocaleString()} tokens will be credited to user wallets
            </p>
          )}
          
          {preview.result === 'lost' && (
            <p className="text-sm text-muted-foreground">
              ✓ {preview.pending_predictions} prediction(s) will be marked as LOST
              <br />
              ✓ No wallet changes (stakes already deducted)
            </p>
          )}
          
          {preview.result === 'void' && (
            <p className="text-sm text-muted-foreground">
              ✓ {preview.pending_predictions} prediction(s) will be marked as VOID
              <br />
              ✓ {preview.potential_payout.toLocaleString()} tokens will be refunded to user wallets
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isProcessing}
            className="bg-primary hover:bg-primary/90"
          >
            {isProcessing ? 'Processing...' : 'Confirm Settlement'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
