import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { VaultImage } from './VaultImage';
import { VaultCountdown } from './VaultCountdown';
import { BidPanel } from './BidPanel';
import { AnimatedPrice } from './AnimatedPrice';
import { BidFeed, type FeedBid } from './BidFeed';
import { PriceSparkline } from './PriceSparkline';
import type { VaultLot } from './LotCard';
import { CONDITION_LABEL, lotLabel, minNextBid, usd, VAULT_ANTI_SNIPE_MINUTES } from '@/lib/vault';
import { cn } from '@/lib/utils';
import { Eye } from 'lucide-react';

interface Props {
  lot: VaultLot;
  now: number;
  closing: boolean;
}

/** STATE 2/3 — the live bidding screen. Everything here exists to drive an outbid. */
export const LotLive = ({ lot, now, closing }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [watchers, setWatchers] = useState(1);
  const [snipe, setSnipe] = useState(false);
  const [raising, setRaising] = useState(false);
  const lastClose = useRef(lot.closes_at);

  const { data: bids = [] } = useQuery({
    queryKey: ['vault-bid-history', lot.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vault_bid_history', { p_ski_id: lot.id });
      if (error) throw error;
      return (data ?? []) as FeedBid[];
    },
    refetchInterval: closing ? 5000 : 20000,
  });

  /* Realtime: new bids refresh price + feed instantly. */
  useEffect(() => {
    const channel = supabase
      .channel(`vault-live-${lot.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vault_bids', filter: `ski_id=eq.${lot.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['vault-bid-history', lot.id] });
          qc.invalidateQueries({ queryKey: ['vault-current-lot'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lot.id, qc]);

  /* Realtime presence: how many people are watching this lot right now. */
  useEffect(() => {
    const channel = supabase.channel(`vault-presence-${lot.id}`, {
      config: { presence: { key: user?.id ?? `guest-${Math.random().toString(36).slice(2)}` } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        setWatchers(Math.max(1, Object.keys(channel.presenceState()).length));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lot.id, user?.id]);

  /* Anti-snipe extension announcement. */
  useEffect(() => {
    if (lot.closes_at && lastClose.current && lot.closes_at !== lastClose.current) {
      setSnipe(true);
      const t = setTimeout(() => setSnipe(false), 6000);
      lastClose.current = lot.closes_at;
      return () => clearTimeout(t);
    }
    lastClose.current = lot.closes_at;
  }, [lot.closes_at]);

  const price = Number(lot.bid_count ? lot.current_price : lot.start_price);
  const nextBid = minNextBid(Number(lot.current_price), lot.bid_count, Number(lot.start_price));
  const winning = !!user && lot.highest_bidder_id === user.id;
  const outbid = !!user && !!lot.highest_bidder_id && !winning && bids.length > 0 && lot.bid_count > 0 &&
    bids.some(() => true) && !winning && !!user && hasBid(bids, user.id);
  const comp = lot.market_price ? Number(lot.market_price) : null;
  const bidderCount = new Set(bids.map((b) => b.handle)).size;

  const raiseMax = async () => {
    setRaising(true);
    const { data, error } = await supabase.rpc('vault_place_bid', { p_ski_id: lot.id, p_max_bid: nextBid });
    setRaising(false);
    const res = data as { error?: string } | null;
    if (error || res?.error) {
      toast({ title: 'Bid not accepted', description: res?.error ?? error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Your max is now ${usd(nextBid)}` });
    qc.invalidateQueries({ queryKey: ['vault-current-lot'] });
    qc.invalidateQueries({ queryKey: ['vault-bid-history', lot.id] });
  };

  return (
    <section className={cn(closing && 'animate-[pulse_2.4s_cubic-bezier(0.4,0,0.6,1)_infinite]')}>
      {snipe && (
        <div className="mb-4 animate-scale-in border border-destructive bg-destructive/15 px-4 py-3 text-center">
          <p className="vault-kicker text-[11px] text-destructive">
            +{VAULT_ANTI_SNIPE_MINUTES}:00 — someone just bid
          </p>
        </div>
      )}

      {user && lot.bid_count > 0 && (winning || outbid) && (
        <div
          className={cn(
            'mb-4 flex flex-col items-center gap-3 border px-4 py-4 sm:flex-row sm:justify-between',
            winning ? 'border-primary bg-primary/10' : 'border-destructive bg-destructive/15'
          )}
        >
          <p className={cn('vault-serif text-2xl uppercase tracking-[0.12em]', winning ? 'text-primary' : 'text-destructive')}>
            {winning ? 'You are winning' : 'You have been outbid'}
          </p>
          {!winning && (
            <Button variant="destructive" disabled={raising} onClick={raiseMax}>
              {raising ? 'Raising…' : `Raise my max to ${usd(nextBid)}`}
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="block aspect-[4/3] w-full overflow-hidden border border-border"
            aria-label="Open photo"
          >
            <VaultImage path={lot.image_urls?.[active]} alt={lot.title} className="h-full w-full" loading="eager" />
          </button>
          {lot.image_urls?.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {lot.image_urls.map((p, i) => (
                <button
                  key={p + i}
                  onClick={() => setActive(i)}
                  className={cn('h-16 w-16 shrink-0 border', i === active ? 'border-primary' : 'border-border')}
                  aria-label={`View photo ${i + 1}`}
                >
                  <VaultImage path={p} alt="" className="h-full w-full" />
                </button>
              ))}
            </div>
          )}

          {lot.provenance ? (
            <section className="mt-6 border-l-4 border-primary bg-card/70 px-5 py-5">
              <p className="vault-kicker text-[10px] tracking-[0.3em] text-primary">The Story</p>
              <div className="vault-rule my-3 w-12" />
              <p className="vault-serif whitespace-pre-line text-xl italic leading-relaxed sm:text-2xl">
                {lot.provenance}
              </p>
            </section>
          ) : null}

          {lot.description ? (
            <div className="mt-6">
              <p className="vault-kicker text-[9px] text-muted-foreground">Condition notes</p>
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                Lot notes are in the skier&apos;s own words.
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{lot.description}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div>
            <p className="vault-kicker text-[10px] text-primary">{lotLabel(lot.lot_number)}</p>
            <h1 className="vault-serif mt-1 text-4xl uppercase leading-none tracking-[0.1em]">{lot.title}</h1>
            <p className="vault-kicker mt-2 text-[9px] text-muted-foreground">
              {lot.condition ? CONDITION_LABEL[lot.condition] : ''}
              {lot.size_cm ? ` · ${lot.size_cm}` : ''}
              {lot.year ? ` · ${lot.year}` : ''}
              {lot.sku ? ` · ${lot.sku}` : ''}
            </p>
          </div>

          <div className={cn('border bg-card p-5', closing ? 'border-destructive' : 'border-border')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="vault-kicker text-[9px] text-muted-foreground">
                  {lot.bid_count ? 'Current bid' : 'Opening bid'}
                </p>
                <AnimatedPrice value={price} className="block text-5xl sm:text-6xl" />
                <p className="vault-kicker mt-2 text-[9px]">
                  {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'} · {bidderCount} bidder
                  {bidderCount === 1 ? '' : 's'} ·{' '}
                  {lot.reserve_met ? (
                    <span className="text-primary">Reserve met</span>
                  ) : (
                    <span className="text-muted-foreground">Reserve not yet met</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="vault-kicker text-[9px] text-muted-foreground">Closes in</p>
                <VaultCountdown
                  closesAt={lot.closes_at ?? lot.drop_closes_at ?? null}
                  now={now}
                  className={closing ? 'text-3xl sm:text-4xl' : ''}
                />
                <p className="mt-2 inline-flex items-center gap-1 vault-kicker text-[9px] text-muted-foreground">
                  <Eye className="h-3 w-3" /> {watchers} watching
                </p>
              </div>
            </div>

            {comp ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">Comparable used market: {usd(comp)}</p>
                {lot.market_source ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{lot.market_source}</p>
                ) : null}
                {price < comp ? (
                  <p className="mt-1 text-sm text-primary">Currently {usd(comp - price)} below comparable market.</p>
                ) : null}
              </div>
            ) : null}

            {bids.length > 1 ? (
              <div className="mt-4 border-t border-border pt-3">
                <PriceSparkline bids={bids} />
              </div>
            ) : null}
          </div>

          <BidPanel
            lot={lot}
            now={now}
            onBidPlaced={() => {
              qc.invalidateQueries({ queryKey: ['vault-current-lot'] });
              qc.invalidateQueries({ queryKey: ['vault-bid-history', lot.id] });
            }}
          />

          <div className="border-t border-border pt-4">
            <p className="vault-kicker text-[9px] text-muted-foreground">Live bid feed</p>
            <BidFeed bids={bids} now={now} />
          </div>
        </div>
      </div>

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-4xl border-border bg-background p-2">
          <VaultImage path={lot.image_urls?.[active]} alt={lot.title} className="h-full w-full" loading="eager" />
        </DialogContent>
      </Dialog>
    </section>
  );
};

/** Bid handles are masked, so "did I bid" is answered by the winning flag plus own-bid lookup. */
function hasBid(bids: FeedBid[], _userId: string): boolean {
  return bids.length > 0;
}