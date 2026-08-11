import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VaultImage } from './VaultImage';
import { BigCountdown } from './BigCountdown';
import { GuessGame } from './GuessGame';
import { BADGE_LABEL, type FeedBid } from './BidFeed';
import type { VaultLot } from './LotCard';
import { lotLabel, usd } from '@/lib/vault';

interface Props {
  lot: VaultLot;
  next?: VaultLot | null;
  now: number;
  peakWatchers?: number;
}

/** STATE 4 — sold. Loud final number, the game results, then the next thing to wait for. */
export const LotSold = ({ lot, next, now, peakWatchers }: Props) => {
  const { data: bids = [] } = useQuery({
    queryKey: ['vault-bid-history', lot.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('vault_bid_history', { p_ski_id: lot.id });
      return (data ?? []) as FeedBid[];
    },
  });

  const { data: badgeRows = [] } = useQuery({
    queryKey: ['vault-lot-badges', lot.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('vault_lot_badges', { p_ski_id: lot.id });
      return (data ?? []) as { handle: string; badge: string }[];
    },
  });

  const winner = bids[0]?.handle ?? '—';
  const bidders = new Set(bids.map((b) => b.handle)).size;
  const sold = lot.status === 'sold' || lot.status === 'ended_met' || !!lot.reserve_met;

  return (
    <section className="text-center">
      <p className="vault-kicker text-[10px] text-primary">{lotLabel(lot.lot_number)} — closed</p>
      <h1 className="vault-serif mt-2 text-4xl uppercase tracking-[0.1em] sm:text-5xl">{lot.title}</h1>

      <div className="mx-auto mt-6 aspect-[16/9] w-full max-w-3xl overflow-hidden border border-border">
        <VaultImage path={lot.image_urls?.[0]} alt={lot.title} className="h-full w-full" loading="eager" />
      </div>

      <div className="mx-auto mt-8 max-w-xl border border-border bg-card p-6">
        <p className="vault-kicker text-[9px] text-muted-foreground">
          {sold ? 'Hammered at' : 'Highest bid — reserve not met'}
        </p>
        <p className="font-mono text-6xl tabular-nums leading-none sm:text-8xl">{usd(Number(lot.current_price))}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          {sold ? `Won by ${winner}` : 'No sale'} · {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'} · {bidders}{' '}
          bidder{bidders === 1 ? '' : 's'}
          {peakWatchers ? ` · peak ${peakWatchers} watching` : ''}
        </p>
        {lot.market_price ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Comparable used market: {usd(Number(lot.market_price))}
          </p>
        ) : null}
      </div>

      {badgeRows.length ? (
        <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {badgeRows.map((b) => (
            <span key={`${b.handle}-${b.badge}`} className="border border-primary/50 px-2 py-1 vault-kicker text-[9px] text-primary">
              {BADGE_LABEL[b.badge] ?? b.badge} — {b.handle}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mx-auto mt-10 max-w-xl text-left">
        <GuessGame skiId={lot.id} closesAt={lot.closes_at ?? lot.drop_closes_at ?? null} now={now} />
      </div>

      {next ? (
        <div className="mx-auto mt-12 max-w-lg border border-border p-6">
          <p className="vault-serif text-2xl uppercase tracking-[0.12em]">{lotLabel(next.lot_number)} is next</p>
          <div className="vault-rule mx-auto my-4 w-16" />
          <BigCountdown target={next.drop_opens_at ?? next.teaser_at ?? null} now={now} />
        </div>
      ) : (
        <div className="mx-auto mt-12 max-w-lg border border-border p-6">
          <p className="vault-serif text-2xl uppercase tracking-[0.12em]">The next ski is being curated</p>
          <p className="mt-2 text-sm text-muted-foreground">
            One ski at a time. Get on the list and you&apos;ll know before anyone else.
          </p>
        </div>
      )}
    </section>
  );
};
