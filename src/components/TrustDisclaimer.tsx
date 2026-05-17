import { Shield } from 'lucide-react';

interface TrustDisclaimerProps {
  className?: string;
  compact?: boolean;
}

export const TrustDisclaimer = ({ className = '', compact = false }: TrustDisclaimerProps) => {
  if (compact) {
    return (
      <div className={`text-xs text-muted-foreground text-center p-3 ${className}`}>
        <p>This is a skill-based prediction game. Tokens have no cash value and cannot be withdrawn.</p>
      </div>
    );
  }

  return (
    <div className={`text-xs text-muted-foreground text-center space-y-1.5 p-4 border-t border-border/50 ${className}`}>
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <Shield className="w-3.5 h-3.5" />
        <span className="font-medium">Skill-Based Prediction Game</span>
      </div>
      <p>Tokens are used to enter predictions and redeem rewards.</p>
      <p>Tokens have no cash value and cannot be withdrawn.</p>
      <p>Results are based on official competition outcomes.</p>
    </div>
  );
};
