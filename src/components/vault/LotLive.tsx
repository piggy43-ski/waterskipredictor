import { useCallback, useEffect, useRef, useState } from 'react';
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
import { BidFeed, type FeedBid, type FeedEvent } from './BidFeed';
import { PriceSparkline } from './PriceSparkline';
import { MilestoneLadder, useMilestones, type Milestone } from './MilestoneLadder';
import { GuessGame } from './GuessGame';
import { SoundToggle } from './SoundToggle';
import { useVaultSound } from '@/hooks/useVaultSound';
import type { VaultLot } from './LotCard';
import { CONDITION_LABEL, lotLabel, minNextBid, usd, VAULT_ANTI_SNIPE_MINUTES } from '@/lib/vault';
import { cn } from '@/lib/utils';
import { Eye } from 'lucide-react';

interface Props {
  lot: VaultLot;
  now: number;
  closing: boolean;
  onWatchers?: (n: number) => void;
}

/** STATES 2 & 3 — the live screen. Everything here exists to drive the next bid. */
export const LotLive = ({ lot, now, closing, onWatchers }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sound = useVaultSound();
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [watchers, setWatchers] = useState(1);
  const [snipe, setSnipe] = useState(false);
  const [flashUnlock, setFlashUnlock] = useState(false);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [raising, setRaising] = useState(false);
  const lastClose = useRef(lot.closes_at);
  const lastCount = useRef(lot.bid_count);
  const wasWinning = useRef<boolean | null>(null);

  const { data: bids = [] } = useQuery({
    queryKey: ['vault-bid-history', lot.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vault_bid_history', { p_ski_id: lot.id });
      if (error) throw error;
      return (data ?? []) as FeedBid[];
    },
    refetchInterval: closing ? 5000 : 20000,
  });

  const { data: badgeRows = [] } = useQuery({
    queryKey: ['vault-lot-badges', lot.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('vault_lot_badges', { p_ski_id: lot.id });
      return (data ?? []) as { handle: string; badge: string }[];
    },
    refetchInterval: 60000,
  });

  const badges = badgeRows.reduce<Record<string, string[]>>((acc, r) => {
    (acc[r.handle] ??= []).push(r.badge);
    return acc;
  }, {});

  const { data: myBid } = useQuery({
    queryKey: ['vault-my-bids', lot.id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vault_bids')
        .select('max_bid')
        .eq('ski_id', lot.id)
        .eq('user_id', user!.id)
        .order('max_bid', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? Number(data.max_bid) : null;
    },
    enabled: !!user,
    refetchInterval: closing ? 5000 : 20000,
  });

  const price = Number(lot.bid_count ? lot.current_price : lot.start_price);
  const { data: milestones = [] } = useMilestones(lot.id, price);

  const onUnlock = useCallback(
    (m: Milestone) => {
      setEvents((e) => [
        { id: `ms-${m.id}`, label: `🔓 ${usd(m.threshold)} — ${m.label} unlocked`, created_at: new Date().toISOString() },
        ...e,
      ]);
      setFlashUnlock(true);
      sound.chime();
      setTimeout(() => setFlashUnlock(false), 2200);
    },
    [sound]
  );

  /* Realtime: new bids refresh price + feed instantly for everyone at once. */
  useEffect(() => {
    const channel = supabase
      .channel(`vault-live-${lot.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vault_bids', filter: `ski_id=eq.${lot.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['vault-bid-history', lot.id] });
          qc.invalidateQueries({ queryKey: ['vault-current-lot'] });
          qc.invalidateQueries({ queryKey: ['vault-milestones', lot.id] });
          qc.invalidateQueries({ queryKey: ['vault-my-bids', lot.id, user?.id] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lot.id, qc, user?.id]);

  /* Realtime presence: how many people are watching right now. */
  useEffect(() => {
    const channel = supabase.channel(`vault-presence-${lot.id}`, {
      config: { presence: { key: user?.id ?? `guest-${Math.random().toString(36).slice(2)}` } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const n = Math.max(1, Object.keys(channel.presenceState()).length);
        setWatchers(n);
        onWatchers?.(n);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lot.id, user?.id, onWatchers]);

  /* Anti-snipe extension — announce it immediately and loudly. */
  useEffect(() => {
    if (lot.closes_at && lastClose.current && lot.closes_at !== lastClose.current) {
      setSnipe(true);
      sound.alarm();
      setEvents((e) => [
        {
          id: `ext-${lot.closes_at}`,
          label: `+${VAULT_ANTI_SNIPE_MINUTES}:00 — SOMEONE JUST BID`,
          created_at: new Date().toISOString(),
        },
        ...e,
      ]);
      const t = setTimeout(() => setSnipe(false), 8000);
      lastClose.current = lot.closes_at;
      return () => clearTimeout(t);
    }
    lastClose.current = lot.closes_at;
  }, [lot.closes_at, sound]);

  const winning = !!user && lot.highest_bidder_id === user.id;
  const outbid = !!user && !winning && myBid !== null && myBid !== undefined;

  /* Sound cues: tick on any new bid, alarm the moment you lose the lead. */
  useEffect(() => {
    if (lot.bid_count > lastCount.current) sound.tick();
    lastCount.current = lot.bid_count;
  }, [lot.bid_count, sound]);

  useEffect(() => {
    if (wasWinning.current === true && !winning && outbid) {
      sound.alarm();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('You have been outbid', { body: `${lot.title} is now ${usd(Number(lot.current_price))}` });
      }
    }
    wasWinning.current = winning;
  }, [winning, outbid, sound, lot.title, lot.current_price]);

  /* Browser push opt-in — only ever after this user's first bid. */
  useEffect(() => {
    if (!myBid || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    const t = setTimeout(() => void Notification.requestPermission(), 1200);
    return () => clearTimeout(t);
  }, [myBid]);

  const nextBid = minNextBid(Number(lot.current_price), lot.bid_count, Number(lot.start_price));
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
    qc.invalidateQueries({ queryKey: ['vault-my-bids', lot.id, user?.id] });
  };

  return (
    <section
      className={cn(
        closing && 'animate-[pulse_2.6s_cubic-bezier(0.4,0,0.6,1)_infinite]',
        flashUnlock && 'ring-2 ring-primary'
      )}
    >
      {snipe && (
        <div className="mb-4 animate-scale-in border-2 border-destructive bg-destructive/20 px-4 py-4 text-center">
          <p className="vault-serif text-2xl uppercase tracking-[0.12em] text-destructive sm:text-3xl">
            +{VAULT_ANTI_SNIPE_MINUTES}:00 — someone just bid
          </p>
        </div>
      )}

      {/* Status banner — full width, unmissable. */}
      {user && (winning || outbid) && (
        <div
          className={cn(
            'sticky top-14 z-30 mb-4 flex flex-col items-center gap-3 border-2 px-4 py-4 sm:flex-row sm:justify-between',
            winning ? 'border-primary bg-primary/15' : 'border-destructive bg-destructive/20'
          )}
        >
          <div className="text-center sm:text-left">
            <p
              className={cn(
                'vault-serif text-2xl uppercase tracking-[0.12em]',
                winning ? 'text-primary' : 'text-destructive'
              )}
            >
              {winning ? "You're winning" : 'You have been outbid'}
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
              {winning
                ? `at ${usd(price)} · your max is ${usd(Number(myBid ?? price))}`
                : `your max was ${usd(Number(myBid ?? 0))}`}
            </p>
          </div>
          {!winning && (
            <Button size="lg" variant="destructive" disabled={raising} onClick={raiseMax} className="w-full sm:w-auto">
              {raising ? 'Raising…' : `Raise to ${usd(nextBid)}`}
            </Button>
          )}
        </div>
      )}

      {/* Price, centre stage. */}
      <div className={cn('border bg-card p-6 text-center', closing ? 'border-destructive' : 'border-border')}>
        <div className="flex items-center justify-center gap-3">
          <p className="vault-kicker text-[9px] text-muted-foreground">
            {lot.bid_count ? 'Current bid' : 'Opening bid'}
          </p>
          <SoundToggle on={sound.on} onToggle={sound.toggle} />
        </div>
        <AnimatedPrice value={price} className="mt-2 block text-6xl leading-none sm:text-8xl" />
        <p className="vault-kicker mt-3 text-[9px]">
          {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'} · {bidderCount} bidder{bidderCount === 1 ? '' : 's'} ·{' '}
          {lot.reserve_met ? (
            <span className="text-primary">Reserve met</span>
          ) : (
            <span className="text-muted-foreground">Reserve not yet met</span>
          )}
        </p>

        <div className="mt-5 flex flex-col items-center gap-2">
          <p className="vault-kicker text-[9px] text-muted-foreground">Closes in</p>
          <VaultCountdown
            closesAt={lot.closes_at ?? lot.drop_closes_at ?? null}
            now={now}
            className={closing ? 'text-4xl text-destructive sm:text-6xl' : 'text-2xl sm:text-3xl'}
          />
          <p className="inline-flex items-center gap-1 vault-kicker text-[9px] text-muted-foreground">
            <Eye className="h-3 w-3" /> {watchers} watching
          </p>
        </div>

        {comp ? (
          <div className="mt-5 border-t border-border pt-3">
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
          <div className="mt-5 border-t border-border pt-3">
            <PriceSparkline bids={bids} />
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <BidPanel
            lot={lot}
            now={now}
            onBidPlaced={() => {
              qc.invalidateQueries({ queryKey: ['vault-current-lot'] });
              qc.invalidateQueries({ queryKey: ['vault-bid-history', lot.id] });
              qc.invalidateQueries({ queryKey: ['vault-my-bids', lot.id, user?.id] });
            }}
          />

          <MilestoneLadder milestones={milestones} price={price} onUnlock={onUnlock} />

          <div className="border-t border-border pt-4">
            <p className="vault-kicker text-[9px] text-muted-foreground">Live bid feed</p>
            <BidFeed bids={bids} now={now} badges={badges} events={events} />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <p className="vault-kicker text-[10px] text-primary">{lotLabel(lot.lot_number)}</p>
            <h1 className="vault-serif mt-1 text-3xl uppercase leading-none tracking-[0.1em] sm:text-4xl">
              {lot.title}
            </h1>
            <p className="vault-kicker mt-2 text-[9px] text-muted-foreground">
              {lot.condition ? CONDITION_LABEL[lot.condition] : ''}
              {lot.size_cm ? ` · ${lot.size_cm}` : ''}
              {lot.year ? ` · ${lot.year}` : ''}
              {lot.sku ? ` · ${lot.sku}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="block aspect-[4/3] w-full overflow-hidden border border-border"
            aria-label="Open photo"
          >
            <VaultImage path={lot.image_urls?.[active]} alt={lot.title} className="h-full w-full" loading="eager" />
          </button>
          {lot.image_urls?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
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

          <GuessGame skiId={lot.id} closesAt={lot.closes_at ?? lot.drop_closes_at ?? null} now={now} />

          {lot.provenance ? (
            <section className="border-l-4 border-primary bg-card/70 px-5 py-5">
              <p className="vault-kicker text-[10px] tracking-[0.3em] text-primary">The Story</p>
              <div className="vault-rule my-3 w-12" />
              <p className="vault-serif whitespace-pre-line text-xl italic leading-relaxed sm:text-2xl">
                {lot.provenance}
              </p>
            </section>
          ) : null}

          {lot.description ? (
            <div>
              <p className="vault-kicker text-[9px] text-muted-foreground">Condition notes</p>
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                Lot notes are in the skier&apos;s own words.
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{lot.description}</p>
            </div>
          ) : null}
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
