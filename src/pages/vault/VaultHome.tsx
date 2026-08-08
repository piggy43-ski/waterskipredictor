import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VaultLayout } from '@/components/vault/VaultLayout';
import { LotCard, type VaultLot } from '@/components/vault/LotCard';
import { VaultCountdown } from '@/components/vault/VaultCountdown';
import { useVaultClock } from '@/hooks/useVaultClock';
import { Skeleton } from '@/components/ui/skeleton';

const VaultHome = () => {
  const { now } = useVaultClock();
  const qc = useQueryClient();

  const { data: drop } = useQuery({
    queryKey: ['vault-current-drop'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_drops')
        .select('*')
        .in('status', ['live', 'scheduled'])
        .order('opens_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lots, isLoading } = useQuery({
    queryKey: ['vault-lots', drop?.id ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('vault_public_skis')
        .select('*')
        .neq('status', 'cancelled')
        .order('sort_order', { ascending: true });
      if (drop?.id) q = q.eq('drop_id', drop.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VaultLot[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('vault-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vault_skis' }, () => {
        qc.invalidateQueries({ queryKey: ['vault-lots'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <VaultLayout
      title="The Vault — Curated Water Ski Gear Auctions"
      description="Weekly drops of curated new and pre-owned water skis. Timed auctions, hidden reserves, anti-snipe bidding. Presented by Pigoski."
    >
      <section className="mb-10 text-center">
        <p className="vault-kicker text-[10px] text-primary">
          {drop ? `Drop ${String(drop.drop_number).padStart(3, '0')}` : 'The Vault'}
        </p>
        <h1 className="vault-serif mt-2 text-4xl uppercase tracking-[0.14em] sm:text-6xl">
          {drop?.name ?? 'The Vault'}
        </h1>
        <div className="vault-rule mx-auto my-4 w-32" />
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          {drop?.description ??
            'A short, curated release of skis worth owning. When the clock hits zero, the vault shuts.'}
        </p>
        {drop?.closes_at && (
          <div className="mt-5 inline-flex flex-col items-center border border-border px-6 py-3">
            <span className="vault-kicker text-[9px] text-muted-foreground">
              {drop.status === 'live' ? 'Drop closes in' : 'Drop opens'}
            </span>
            <VaultCountdown closesAt={drop.status === 'live' ? drop.closes_at : drop.opens_at} now={now} />
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-[4/6] w-full" />
          ))}
        </div>
      ) : lots?.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {lots.map((lot, i) => (
            <LotCard key={lot.id} lot={lot} now={now} index={i} />
          ))}
        </div>
      ) : (
        <div className="border border-border p-12 text-center">
          <p className="vault-serif text-2xl uppercase tracking-[0.15em]">Vault sealed</p>
          <p className="mt-2 text-sm text-muted-foreground">The next drop is being curated. Check back soon.</p>
        </div>
      )}
    </VaultLayout>
  );
};

export default VaultHome;