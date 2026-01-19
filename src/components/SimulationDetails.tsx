import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface SimulationDetailsProps {
  impliedSum?: number | null;
  isAdmin?: boolean;
  className?: string;
}

export const SimulationDetails = ({ impliedSum, isAdmin = false, className = '' }: SimulationDetailsProps) => {
  return (
    <Alert className={`bg-muted/30 border-muted ${className}`}>
      <Info className="h-4 w-4" />
      <AlertTitle className="text-sm font-medium">Simulation Details</AlertTitle>
      <AlertDescription className="text-xs text-muted-foreground">
        <ul className="list-disc pl-4 mt-1 space-y-0.5">
          <li>Simulations run: 20,000</li>
          <li>Model: skill-based probability simulation</li>
          <li>Multipliers reflect difficulty, not guaranteed outcomes</li>
        </ul>
        {isAdmin && impliedSum !== undefined && impliedSum !== null && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="font-mono text-xs text-muted-foreground">
              implied_sum: {impliedSum.toFixed(3)}
            </span>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
