import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VaultLayout } from '@/components/vault/VaultLayout';
import type { VaultLot } from '@/components/vault/LotCard';
import { LotTeaser } from '@/components/vault/LotTeaser';
import { LotLive } from '@/components/vault/LotLive';
import { LotSold } from '@/components/vault/LotSold';
import { ManifestStrip } from '@/components/vault/ManifestStrip';
import { BigCountdown } from '@/components/vault/BigCountdown';
import { useVaultClock } from '@/hooks/useVaultClock';
import { lotStage, lotLabel } from '@/lib/vault';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * /vault — one ski at a time, one per weekend.
 * Teaser (Wed) → Live (Fri) → Closing (last 15 min) → Sold (Sun night → Wed).
 */
const VaultHome = () => {
  const { now } = useVaultClock();
  const qc = useQueryClient();

  const { data: lots, isLoading } = useQuery({
    queryKey: ['vault-current-lot'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_public_skis')
        .select('*')
        .order('lot_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VaultLot[];
    },
  });

  const { current, next } = useMemo(() => {
    const all = lots ?? [];
    const live = all.find((l) => ['live', 'closing'].includes(lotStage(l, now)));
    const teaser = all.find((l) => lotStage(l, now) === 'teaser');
    const closed = [...all].reverse().find((l) => lotStage(l, now) === 'sold');
    const cur = live ?? teaser ?? closed ?? null;
    const nxt = cur
      ? all.find((l) => (l.lot_number ?? 0) > (cur.lot_number ?? 0)) ?? null
      : all[0] ?? null;
    return { current: cur, next: nxt };
  }, [lots, now]);

  useEffect(() => {
    const poll = window.setInterval(() => qc.invalidateQueries({ queryKey: ['vault-current-lot'] }), 15000);
    return () => window.clearInterval(poll);
  }, [qc]);

  const stage = lotStage(current, now);

  return (
    <VaultLayout
      title="The Vault — One Water Ski, Every Weekend"
      description="One ski at a time. Teased Wednesday, live Friday, sold Sunday. Gear from touring athletes' personal racks, with the story behind every lot."
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="mx-auto h-16 w-64" />
          <Skeleton className="mx-auto aspect-[16/9] w-full max-w-3xl" />
        </div>
      ) : !current ? (
        <section className="border border-border p-12 text-center">
          <p className="vault-serif text-3xl uppercase tracking-[0.15em]">Vault sealed</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {next ? `${lotLabel(next.lot_number)} drops Wednesday.` : 'The next lot is being curated.'}
          </p>
          {next?.teaser_at ? <BigCountdown target={next.teaser_at} now={now} className="mt-6" /> : null}
        </section>
      ) : stage === 'teaser' ? (
        <LotTeaser lot={current} now={now} />
      ) : stage === 'sold' ? (
        <LotSold lot={current} next={next} now={now} />
      ) : (
        <LotLive lot={current} now={now} closing={stage === 'closing'} />
      )}

      <ManifestStrip />

      <section className="mt-12 border border-border p-6">
        <h2 className="vault-serif text-xl uppercase tracking-[0.14em]">What is The Vault?</h2>
        <div className="vault-rule my-3 w-16" />
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            One ski. One weekend. Teased Wednesday at noon, bidding opens Friday at 7pm, the hammer falls Sunday at
            8pm. Eleven lots, and when one is gone it is gone.
          </p>
          <p>
            The Vault is where gear from touring athletes' personal racks gets sold off. Sponsored skiers end up with far
            more equipment than they can ride — new skis from sponsor allotments, demo skis from brands courting them,
            one-off prototypes.
          </p>
        </div>
      </section>
    </VaultLayout>
  );
};

export default VaultHome;