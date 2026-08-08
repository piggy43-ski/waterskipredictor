import { timeLeftParts } from '@/lib/vault';
import { cn } from '@/lib/utils';

interface Props {
  closesAt: string | null;
  now: number;
  className?: string;
  compact?: boolean;
}

export const VaultCountdown = ({ closesAt, now, className, compact }: Props) => {
  const t = timeLeftParts(closesAt, now);
  if (!t) return null;
  if (t.ended) {
    return <span className={cn('vault-kicker text-[11px] text-muted-foreground', className)}>Closed</span>;
  }

  const urgent = t.diff < 5 * 60 * 1000;
  const pad = (n: number) => String(n).padStart(2, '0');
  const label = t.d > 0 ? `${t.d}d ${pad(t.h)}h ${pad(t.m)}m` : `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;

  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        compact ? 'text-xs' : 'text-base',
        urgent ? 'text-destructive animate-pulse' : 'text-foreground',
        className
      )}
    >
      {label}
    </span>
  );
};