import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { VaultImage } from './VaultImage';
import { BidPanel } from './BidPanel';
import { AnimatedPrice } from './AnimatedPrice';
import { BidFeed, type FeedBid, type FeedEvent } from './BidFeed';
import { PriceSparkline } from './PriceSparkline';
import { MilestoneLadder, useMilestones, type Milestone } from './MilestoneLadder';
import { GuessGame } from './GuessGame';
import { VaultBidderSetup } from './VaultBidderSetup';
import { useVaultSound } from '@/hooks/useVaultSound';
import type { VaultLot } from './LotCard';
import { minNextBid, timeLeftParts, usd, VAULT_ANTI_SNIPE_MINUTES } from '@/lib/vault';
import { cn } from '@/lib/utils';

interface Props {
  lot: VaultLot;
  now: number;
  closing: boolean;
  onWatchers?: (n: number) => void;
  sound?: ReturnType<typeof useVaultSound>;
}

const THUMB_LABELS = ['Base', 'Tail wear', 'Fin block', 'Serial'];

const pad = (n: number) => String(n).padStart(2, '0');

function closesLabel(iso: string | null): string {
  if (!iso) return 'Closing time to be confirmed';
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(d);
  return `Closes ${s.replace('EDT', 'ET').replace('EST', 'ET')}`;
}

/** STATES 2 & 3 — the live screen. Everything here exists to drive the next bid. */
export const LotLive = ({ lot, now, closing, onWatchers, sound: soundProp }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ownSound = useVaultSound();
  const sound = soundProp ?? ownSound;
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [snipe, setSnipe] = useState(false);
  const [flashUnlock, setFlashUnlock] = useState(false);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [raising, setRaising] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
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
        { id: `ms-${m.id}`, label: `${usd(m.threshold)} — ${m.label}`, created_at: new Date().toISOString() },
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
  const closesAt = lot.closes_at ?? lot.drop_closes_at ?? null;
  const t = timeLeftParts(closesAt, now);
  const highHandle = bids[0]?.handle ?? null;
  const photos = lot.image_urls ?? [];

  const raiseTo = async (value: number) => {
    if (!user) {
      window.location.href = '/auth';
      return;
    }
    setRaising(true);
    const { data, error } = await supabase.rpc('vault_place_bid', { p_ski_id: lot.id, p_max_bid: value });
    setRaising(false);
    const res = data as { error?: string } | null;
    if (error || res?.error) {
      const msg = res?.error ?? error?.message ?? '';
      if (msg.includes('PAYMENT_SETUP_REQUIRED')) {
        setSetupOpen(true);
        return;
      }
      toast({ title: 'Bid not accepted', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: `Your max is now ${usd(value)}` });
    qc.invalidateQueries({ queryKey: ['vault-current-lot'] });
    qc.invalidateQueries({ queryKey: ['vault-bid-history', lot.id] });
    qc.invalidateQueries({ queryKey: ['vault-my-bids', lot.id, user?.id] });
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['vault-current-lot'] });
    qc.invalidateQueries({ queryKey: ['vault-bid-history', lot.id] });
    qc.invalidateQueries({ queryKey: ['vault-my-bids', lot.id, user?.id] });
  };

  return (
    <section className={cn(closing && 'animate-[pulse_2.6s_cubic-bezier(0.4,0,0.6,1)_infinite]')}>
      {snipe && (
        <div className="mb-6 animate-scale-in border border-destructive bg-destructive/20 px-5 py-5 text-center">
          <p className="vault-mono text-2xl uppercase tracking-[0.12em] text-destructive sm:text-3xl">
            +{VAULT_ANTI_SNIPE_MINUTES}:00 — someone just bid
          </p>
        </div>
      )}

      {user && (winning || outbid) && (
        <div
          className={cn(
            'sticky top-[72px] z-30 mb-6 flex flex-col items-center gap-3 border px-5 py-4 sm:top-[96px] sm:flex-row sm:justify-between',
            winning ? 'border-primary bg-primary/10' : 'border-destructive bg-destructive/20'
          )}
        >
          <p className={cn('vault-mono text-base', winning ? 'text-primary-glow' : 'text-destructive')}>
            {winning
              ? `You're winning at ${usd(price)} · your max is ${usd(Number(myBid ?? price))}`
              : `You have been outbid · your max was ${usd(Number(myBid ?? 0))}`}
          </p>
          {!winning && (
            <button
              type="button"
              disabled={raising}
              onClick={() => void raiseTo(nextBid)}
              className="vault-display w-full bg-primary px-6 py-3 text-lg text-primary-foreground disabled:opacity-60 sm:w-auto"
            >
              {raising ? 'Raising…' : `Raise to ${usd(nextBid)}`}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-12 lg:grid-cols-[48fr_52fr]">
        {/* ── LEFT COLUMN ── */}
        <div className="order-2 space-y-8 lg:order-1">
          <button
            type="button"
            onClick={() => photos.length && setLightbox(true)}
            className="relative block aspect-square w-full border border-border bg-background"
            aria-label="Open photo"
          >
            {photos[active] ? (
              <VaultImage path={photos[active]} alt={lot.title} className="h-full w-full" loading="eager" />
            ) : (
              <span className="vault-mono absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#4A4A4A]">
                <span className="uppercase tracking-[0.18em] text-xs">Photo 01 — full ski, topsheet</span>
                <span className="text-xs">unedited, natural light</span>
              </span>
            )}
            <span className="vault-mono absolute bottom-px left-px border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-foreground">
              {[lot.title, lot.size_cm, lot.year].filter(Boolean).join(' · ')}
            </span>
          </button>

          <div className="grid grid-cols-4 gap-3">
            {THUMB_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => photos[i + 1] && setActive(i + 1)}
                className={cn(
                  'relative aspect-square border',
                  active === i + 1 ? 'border-primary' : 'border-border'
                )}
                aria-label={`View ${label} photo`}
              >
                {photos[i + 1] ? (
                  <VaultImage path={photos[i + 1]} alt={label} className="h-full w-full" />
                ) : (
                  <span className="vault-mono absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.18em] text-[#4A4A4A]">
                    {label}
                  </span>
                )}
              </button>
            ))}
          </div>

          {lot.description ? (
            <p className="vault-body-copy whitespace-pre-line text-[22px] leading-relaxed">{lot.description}</p>
          ) : null}

          <div className="space-y-3">
            <p className="vault-label inline-block border border-border px-4 py-3">
              Seller of record: Waterski Predictor
            </p>
            <p className="vault-label block w-fit border border-border px-4 py-3">Admins blocked from bidding</p>
          </div>

          <MilestoneLadder milestones={milestones} price={price} onUnlock={onUnlock} />

          {bids.length > 1 ? (
            <div className="vault-panel">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <p className="vault-label">Price over time</p>
                <p className="vault-mono text-sm text-foreground">
                  {usd(Number(lot.start_price))} → {usd(price)}
                </p>
              </div>
              <div className="px-2 py-4">
                <PriceSparkline bids={bids} />
              </div>
            </div>
          ) : null}

          <GuessGame skiId={lot.id} closesAt={closesAt} now={now} />
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="order-1 space-y-6 lg:order-2">
          <div className={cn('vault-panel px-5 py-6', closing && 'border-destructive')}>
            <div className="flex items-baseline justify-between">
              <p className="vault-label">{lot.bid_count ? 'Current bid' : 'Opening bid'}</p>
              <p className="vault-label">
                {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'}
              </p>
            </div>
            <AnimatedPrice
              value={price}
              className={cn(
                'vault-display mt-4 block leading-[0.85] text-foreground',
                flashUnlock && 'text-primary-glow',
                'text-[72px] sm:text-[110px] xl:text-[140px]'
              )}
            />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="vault-label border border-border px-3 py-2">
                {lot.reserve_met ? 'Reserve met' : 'Reserve not yet met'}
              </span>
              {highHandle ? (
                <span className="vault-label">
                  High bidder <span className="text-foreground">{highHandle}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="vault-panel flex flex-wrap items-center justify-between gap-4 px-5 py-5">
            <p className="vault-label">{closesLabel(closesAt)}</p>
            {t && !t.ended ? (
              <div className="text-right">
                <p className="vault-mono text-sm text-muted-foreground">{t.d}d</p>
                <p
                  className={cn(
                    'vault-mono whitespace-nowrap text-[44px] leading-none',
                    closing ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {pad(t.h)}:{pad(t.m)}:{pad(t.s)}
                </p>
              </div>
            ) : (
              <p className="vault-label">Closed</p>
            )}
          </div>

          <BidPanel lot={lot} now={now} onBidPlaced={refresh} />

          {comp ? (
            <div className="vault-panel px-5 py-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="vault-label">Comparable used market</p>
                <p className="vault-display text-[34px] leading-none text-foreground">{usd(comp)}</p>
              </div>
              {price < comp ? (
                <p className="vault-mono mt-3 text-sm text-primary-glow">
                  Currently {usd(comp - price)} below comparable market
                </p>
              ) : null}
              {lot.market_source ? (
                <p className="mt-2 text-[13px] text-muted-foreground">{lot.market_source}</p>
              ) : null}
            </div>
          ) : null}

          <BidFeed
            bids={bids}
            now={now}
            badges={badges}
            events={events}
            startPrice={Number(lot.start_price)}
          />
        </div>
      </div>

      {/* ── FAQ ── */}
      <div className="mt-16 grid gap-10 border-t border-border pt-10 md:grid-cols-2">
        <div className="space-y-10">
          <div>
            <p className="vault-label">How payment works</p>
            <p className="vault-body-copy mt-4 text-[21px] leading-relaxed">
              Your card is saved when you place your first bid — nothing is charged then. The winner is charged
              automatically at close: hammer price plus flat-zone shipping ($55 Southeast, $65 mid-Atlantic, $79
              central/northeast, $95 west, $0 local pickup). Shipping is free above the $300 milestone.
            </p>
          </div>
          <div>
            <p className="vault-label">Tokens</p>
            <p className="vault-body-copy mt-4 text-[21px] leading-relaxed">
              WSP tokens are free-to-play only. They cannot buy skis, and no auction money ever converts into them.
              Separate ledgers, no conversion in either direction.
            </p>
          </div>
        </div>
        <div>
          <p className="vault-label">Who can bid</p>
          <p className="vault-body-copy mt-4 text-[21px] leading-relaxed">
            Any signed-in Waterski Predictor account. Sellers and admins are blocked at the database level, not by
            policy. The reserve is held server-side and never sent to your browser.
          </p>
        </div>
      </div>

      {/* ── STICKY BOTTOM BAR ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3 sm:px-10">
          <div>
            <p className="vault-label">Current bid</p>
            <p className="vault-display text-[28px] leading-none text-foreground sm:text-[44px]">{usd(price)}</p>
          </div>
          <button
            type="button"
            disabled={raising}
            onClick={() => void raiseTo(nextBid)}
            className="vault-display min-h-[56px] bg-primary px-6 text-lg text-primary-foreground disabled:opacity-60 sm:px-10 sm:text-xl"
          >
            {raising ? 'Raising…' : `Raise to ${usd(nextBid)}`}
          </button>
        </div>
      </div>

      <VaultBidderSetup open={setupOpen} onOpenChange={setSetupOpen} onSaved={refresh} />

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-4xl border-border bg-background p-2">
          <VaultImage path={photos[active]} alt={lot.title} className="h-full w-full" loading="eager" />
        </DialogContent>
      </Dialog>
    </section>
  );
};
