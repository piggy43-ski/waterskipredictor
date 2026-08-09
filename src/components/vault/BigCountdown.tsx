import { timeLeftParts } from '@/lib/vault';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');

/** Days / hours / minutes / seconds, always all four units. */
export const BigCountdown = ({
  target,
  now,
  urgent,
  className,
}: {
  target: string | null;
  now: number;
  urgent?: boolean;
  className?: string;
}) => {
  const t = timeLeftParts(target, now);
  if (!t || t.ended) return null;
  const units: [number, string][] = [
    [t.d, 'days'],
    [t.h, 'hrs'],
    [t.m, 'min'],
    [t.s, 'sec'],
  ];
  return (
    <div className={cn('flex items-end justify-center gap-4', className)}>
      {units.map(([v, l]) => (
        <div key={l} className="text-center">
          <div
            className={cn(
              'font-mono tabular-nums leading-none',
              urgent ? 'text-5xl text-destructive sm:text-7xl' : 'text-3xl sm:text-5xl'
            )}
          >
            {pad(v)}
          </div>
          <div className="vault-kicker mt-1 text-[9px] text-muted-foreground">{l}</div>
        </div>
      ))}
    </div>
  );
};