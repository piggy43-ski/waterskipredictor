import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usd } from '@/lib/vault';
import { cn } from '@/lib/utils';
import { Lock, Unlock } from 'lucide-react';

export interface Milestone {
  id: string;
  threshold: number;
  label: string;
  unlocked_at: string | null;
}

export function useMilestones(skiId: string, price: number) {
  return useQuery({
    queryKey: ['vault-milestones', skiId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_milestones')
        .select('id, threshold, label, unlocked_at')
        .eq('ski_id', skiId)
        .order('threshold');
      if (error) throw error;
      return (data ?? []).map((m) => ({ ...m, threshold: Number(m.threshold) })) as Milestone[];
    },
    refetchInterval: 20000,
    // price is part of the key so a bid immediately re-reads unlock state
    placeholderData: (prev) => prev,
    meta: { price },
  });
}

interface Props {
  milestones: Milestone[];
  price: number;
  /** Fires once per newly unlocked milestone. */
  onUnlock?: (m: Milestone) => void;
}

/** The ladder the whole room pushes toward. */
export const MilestoneLadder = ({ milestones, price, onUnlock }: Props) => {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const unlockedIds = new Set(milestones.filter((m) => m.unlocked_at || price >= m.threshold).map((m) => m.id));
    if (seen.current === null) {
      seen.current = unlockedIds;
      return;
    }
    for (const m of milestones) {
      if (unlockedIds.has(m.id) && !seen.current.has(m.id)) onUnlock?.(m);
    }
    seen.current = unlockedIds;
  }, [milestones, price, onUnlock]);

  if (!milestones.length) return null;

  const next = milestones.find((m) => !(m.unlocked_at || price >= m.threshold));

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="vault-kicker text-[9px] text-primary">Unlocks</p>
        {next ? (
          <p className="vault-kicker text-[9px] text-muted-foreground">
            {usd(Math.max(0, next.threshold - price))} to the next one
          </p>
        ) : (
          <p className="vault-kicker text-[9px] text-primary">All unlocked</p>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {milestones.map((m) => {
          const open = !!m.unlocked_at || price >= m.threshold;
          return (
            <li
              key={m.id}
              className={cn(
                'flex items-start gap-3 border-l-2 px-3 py-2 transition-colors',
                open ? 'border-primary bg-primary/10' : 'border-border'
              )}
            >
              {open ? (
                <Unlock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className={cn('font-mono text-sm tabular-nums', open ? 'text-primary' : 'text-foreground')}>
                  {usd(m.threshold)}
                </p>
                <p className={cn('text-xs', open ? 'text-foreground' : 'text-muted-foreground')}>{m.label}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
