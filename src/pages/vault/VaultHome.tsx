import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VaultLayout } from '@/components/vault/VaultLayout';
import type { VaultLot } from '@/components/vault/LotCard';
import { LotBefore } from '@/components/vault/LotBefore';
import { LotLive } from '@/components/vault/LotLive';
import { LotSold } from '@/components/vault/LotSold';
import { useVaultClock } from '@/hooks/useVaultClock';
import { lotLabel, lotStage } from '@/lib/vault';
import { useVaultSound } from '@/hooks/useVaultSound';
import { SoundToggle } from '@/components/vault/SoundToggle';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * /vault — one ski. Four states off server time:
 * before → live → closing (final 15 min) → sold.
 */
const VaultHome = () => {
  const { now } = useVaultClock();
  const qc = useQueryClient();
  const [peak, setPeak] = useState(0);
  const [watchers, setWatchers] = useState(1);
  const sound = useVaultSound();

  const { data: lots, isLoading } = useQuery({
    queryKey: ['vault-current-lot'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_public_skis')
        .select('*')
        .not('drop_id', 'is', null)
        .order('lot_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VaultLot[];
    },
  });

  const { current, next } = useMemo(() => {
    const all = lots ?? [];
    const open = all.find((l) => ['live', 'closing'].includes(lotStage(l, now)));
    const upcoming = all.find((l) => lotStage(l, now) === 'before');
    const closed = [...all].reverse().find((l) => lotStage(l, now) === 'sold');
    const cur = open ?? upcoming ?? closed ?? null;
    const nxt = cur ? all.find((l) => (l.lot_number ?? 0) > (cur.lot_number ?? 0)) ?? null : all[0] ?? null;
    return { current: cur, next: nxt };
  }, [lots, now]);

  useEffect(() => {
    const poll = window.setInterval(() => qc.invalidateQueries({ queryKey: ['vault-current-lot'] }), 15000);
    return () => window.clearInterval(poll);
  }, [qc]);

  const stage = lotStage(current, now);
  const isLive = stage === 'live' || stage === 'closing';

  return (
    <VaultLayout
      title="The Vault — One Water Ski, One Live Auction"
      description="One ski, one live auction. Real-time bidding, milestone unlocks and a free guess-the-hammer game — gear from touring athletes' personal racks."
      lotLabel={current ? lotLabel(current.lot_number) : undefined}
      headerRight={
        <div className="flex items-center gap-4">
          {isLive ? (
            <span className="vault-label inline-flex items-center gap-2">
              <span className="live-dot inline-block h-2 w-2 bg-destructive" />
              {watchers} watching
            </span>
          ) : null}
          <SoundToggle on={sound.on} onToggle={sound.toggle} />
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="mx-auto h-16 w-64" />
          <Skeleton className="mx-auto aspect-[16/9] w-full max-w-3xl" />
        </div>
      ) : !current ? (
        <section className="border border-border p-12 text-center">
          <p className="vault-serif text-3xl uppercase tracking-[0.15em]">Vault sealed</p>
          <p className="mt-2 text-sm text-muted-foreground">The next ski is being curated.</p>
        </section>
      ) : stage === 'before' ? (
        <LotBefore lot={current} now={now} />
      ) : stage === 'sold' ? (
        <LotSold lot={current} next={next} now={now} peakWatchers={peak} />
      ) : (
        <LotLive
          lot={current}
          now={now}
          closing={stage === 'closing'}
          sound={sound}
          onWatchers={(n) => {
            setWatchers(n);
            setPeak((p) => Math.max(p, n));
          }}
        />
      )}

      <section className="mt-12 border border-border p-6">
        <h2 className="vault-serif text-xl uppercase tracking-[0.14em]">What is The Vault?</h2>
        <div className="vault-rule my-3 w-16" />
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            One ski, one live auction. Bidding is proxy-based — you set your maximum and we bid for you only as
            high as needed. Any bid in the final minutes extends the clock, so nothing is won by a stopwatch.
          </p>
          <p>
            The Vault is where gear from touring athletes&apos; personal racks gets sold off. Sponsored skiers end
            up with far more equipment than they can ride — new skis from sponsor allotments, demo skis from
            brands courting them, one-off prototypes.
          </p>
          <p>
            Guessing the hammer price is free and open to everyone. Prizes pay in WSP tokens, the free-to-play
            currency. Tokens are never spendable on a ski and no auction money ever becomes tokens.
          </p>
        </div>
      </section>
    </VaultLayout>
  );
};

export default VaultHome;
