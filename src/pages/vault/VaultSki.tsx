import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VaultLayout } from '@/components/vault/VaultLayout';
import { VaultImage } from '@/components/vault/VaultImage';
import { VaultCountdown } from '@/components/vault/VaultCountdown';
import { BidPanel } from '@/components/vault/BidPanel';
import type { VaultLot } from '@/components/vault/LotCard';
import { useVaultClock } from '@/hooks/useVaultClock';
import { CONDITION_LABEL, usd, VAULT_PICKUP_LOCATION } from '@/lib/vault';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Heart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const VaultSki = () => {
  const { id } = useParams<{ id: string }>();
  const { now } = useVaultClock();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [active, setActive] = useState(0);

  const { data: lot, isLoading } = useQuery({
    queryKey: ['vault-lot', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('vault_public_skis').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as VaultLot | null;
    },
    enabled: !!id,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['vault-bid-history', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vault_bid_history', { p_ski_id: id! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: zones = [] } = useQuery({
    queryKey: ['vault-zones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vault_shipping_zones').select('*').order('zone');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: watching } = useQuery({
    queryKey: ['vault-watch', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vault_watchlist')
        .select('id')
        .eq('ski_id', id!)
        .eq('user_id', user!.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!id && !!user,
  });

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`vault-lot-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vault_bids', filter: `ski_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ['vault-bid-history', id] });
        qc.invalidateQueries({ queryKey: ['vault-lot', id] });
      })
      .subscribe();
    const poll = window.setInterval(() => qc.invalidateQueries({ queryKey: ['vault-lot', id] }), 15000);
    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const toggleWatch = async () => {
    if (!user || !id) return;
    if (watching) {
      await supabase.from('vault_watchlist').delete().eq('ski_id', id).eq('user_id', user.id);
    } else {
      await supabase.from('vault_watchlist').insert({ ski_id: id, user_id: user.id });
      toast({ title: 'Added to your watchlist' });
    }
    qc.invalidateQueries({ queryKey: ['vault-watch', id, user.id] });
  };

  if (isLoading) {
    return (
      <VaultLayout title="Loading lot" description="The Vault lot detail.">
        <Skeleton className="aspect-[4/3] w-full" />
      </VaultLayout>
    );
  }

  if (!lot) {
    return (
      <VaultLayout title="Lot not found" description="This Vault lot is no longer available.">
        <div className="py-20 text-center">
          <p className="vault-serif text-3xl uppercase tracking-[0.15em]">Lot not found</p>
          <Link to="/vault" className="mt-4 inline-block vault-kicker text-[10px] text-primary">
            Back to the drop
          </Link>
        </div>
      </VaultLayout>
    );
  }

  const isAuction = lot.listing_type === 'auction';
  const shipMin = Math.min(...zones.filter((z: never) => (z as { price: number }).price > 0).map((z: never) => (z as { price: number }).price));
  const shipMax = Math.max(...zones.map((z: never) => (z as { price: number }).price));

  return (
    <VaultLayout
      title={`${lot.title} — The Vault`}
      description={`${CONDITION_LABEL[lot.condition]} ${lot.brand} ${lot.model}${lot.size_cm ? ` ${lot.size_cm}` : ''} — bid now in The Vault weekly water ski drop.`}
    >
      <Link to="/vault" className="vault-kicker mb-4 inline-block text-[10px] text-muted-foreground hover:text-primary">
        ← Back to drop
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="aspect-square w-full overflow-hidden border border-border">
            <VaultImage path={lot.image_urls?.[active]} alt={`${lot.brand} ${lot.model}`} className="h-full w-full" loading="eager" />
          </div>
          {lot.image_urls?.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {lot.image_urls.map((p, i) => (
                <button
                  key={p + i}
                  onClick={() => setActive(i)}
                  className={`h-16 w-16 shrink-0 border ${i === active ? 'border-primary' : 'border-border'}`}
                  aria-label={`View photo ${i + 1}`}
                >
                  <VaultImage path={p} alt="" className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <p className="vault-kicker text-[9px] text-muted-foreground">
              {CONDITION_LABEL[lot.condition]}
              {lot.size_cm ? ` · ${lot.size_cm}` : ''}
              {lot.year ? ` · ${lot.year}` : ''}
            </p>
            <h1 className="vault-serif mt-1 text-3xl uppercase tracking-[0.1em]">{lot.title}</h1>
            {lot.retail_price ? (
              <p className="mt-1 text-xs text-muted-foreground">Retail when new: {usd(Number(lot.retail_price))}</p>
            ) : null}
          </div>

          <div className="border border-border bg-card p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="vault-kicker text-[9px] text-muted-foreground">
                  {isAuction ? (lot.bid_count ? 'Current bid' : 'Opening bid') : 'Buy it now'}
                </p>
                <p className="font-mono text-3xl tabular-nums">
                  {usd(Number(isAuction ? (lot.bid_count ? lot.current_price : lot.start_price) : lot.buy_now_price))}
                </p>
                {isAuction && (
                  <p className="vault-kicker mt-1 text-[9px]">
                    {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'} ·{' '}
                    {lot.reserve_met ? (
                      <span className="text-primary">Reserve met</span>
                    ) : (
                      <span className="text-muted-foreground">Reserve not met</span>
                    )}
                  </p>
                )}
              </div>
              {isAuction && lot.status === 'live' && (
                <div className="text-right">
                  <p className="vault-kicker text-[9px] text-muted-foreground">Closes in</p>
                  <VaultCountdown closesAt={lot.closes_at} now={now} />
                </div>
              )}
            </div>
          </div>

          {isAuction ? (
            <BidPanel lot={lot} now={now} onBidPlaced={() => qc.invalidateQueries({ queryKey: ['vault-lot', id] })} />
          ) : (
            <div className="border border-border bg-card p-4">
              <Button
                className="w-full"
                disabled={buying || lot.status !== 'live'}
                onClick={async () => {
                  if (!user) return navigate('/auth');
                  setBuying(true);
                  const { data, error } = await supabase.functions.invoke('vault-buy-now', { body: { ski_id: id } });
                  setBuying(false);
                  const res = data as { url?: string; error?: string };
                  if (error || res?.error || !res?.url) {
                    toast({
                      title: 'Could not start checkout',
                      description: res?.error ?? error?.message,
                      variant: 'destructive',
                    });
                    return;
                  }
                  window.open(res.url, '_blank');
                }}
              >
                {lot.status !== 'live' ? 'Sold' : buying ? 'Opening checkout…' : `Buy it now — ${usd(Number(lot.buy_now_price))}`}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Shipping is added at checkout. One of one — first to pay takes it.
              </p>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={toggleWatch} disabled={!user}>
            <Heart className={`mr-2 h-4 w-4 ${watching ? 'fill-current text-primary' : ''}`} />
            {watching ? 'Watching' : 'Watch this lot'}
          </Button>

          {lot.description && (
            <div>
              <p className="vault-kicker text-[9px] text-muted-foreground">Condition notes</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{lot.description}</p>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <p className="vault-kicker text-[9px] text-muted-foreground">Shipping</p>
            <p className="mt-1 text-sm">
              {Number.isFinite(shipMin) ? `${usd(shipMin)}–${usd(shipMax)} by zone` : 'Calculated at checkout'} · Free local
              pickup in {VAULT_PICKUP_LOCATION}.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="vault-kicker text-[9px] text-muted-foreground">Bid history</p>
            {history.length ? (
              <ul className="mt-2 space-y-1">
                {(history as { id: string; handle: string; amount: number; is_auto: boolean; created_at: string }[]).map(
                  (b) => (
                    <li key={b.id} className="flex justify-between border-b border-border/60 py-1 text-sm">
                      <span className="text-muted-foreground">
                        {b.handle}
                        {b.is_auto ? ' · auto' : ''}
                      </span>
                      <span className="font-mono tabular-nums">{usd(Number(b.amount))}</span>
                    </li>
                  )
                )}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No bids yet. Be the first.</p>
            )}
          </div>
        </div>
      </div>
    </VaultLayout>
  );
};

export default VaultSki;