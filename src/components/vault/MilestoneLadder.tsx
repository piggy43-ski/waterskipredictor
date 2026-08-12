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

  return (
    <div className="vault-panel">
      <p className="vault-label border-b border-border px-5 py-4">Unlocked by the room</p>
      <ul>
        {milestones.map((m) => {
          const open = !!m.unlocked_at || price >= m.threshold;
          return (
            <li key={m.id} className="flex items-center gap-4 border-b px-5 py-4 vault-hairline last:border-b-0">
              <span
                className={cn('vault-mono shrink-0 text-[34px] leading-none', open ? 'text-primary-glow' : 'text-[#3A3A3A]')}
              >
                {usd(m.threshold)}
              </span>
              <span className={cn('min-w-0 text-base', open ? 'text-primary-glow' : 'text-[#555555]')}>{m.label}</span>
              <span className="vault-label ml-auto shrink-0">{open ? 'Unlocked' : 'Locked'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
