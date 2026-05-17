import { Info } from 'lucide-react';

interface TokenDisclaimerProps {
  className?: string;
}

export const TokenDisclaimer = ({ className = '' }: TokenDisclaimerProps) => {
  return (
    <div className={`text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5 ${className}`}>
      <Info className="w-3 h-3 flex-shrink-0" />
      <span>Tokens are used for prediction entries and reward redemptions. Tokens have no cash value and cannot be withdrawn.</span>
    </div>
  );
};
