import { relativeTime, usd } from '@/lib/vault';

export interface FeedBid {
  id: string;
  handle: string;
  amount: number;
  is_auto: boolean;
  created_at: string;
}

export interface FeedEvent {
  id: string;
  label: string;
  created_at: string;
}

export const BADGE_LABEL: Record<string, string> = {
  first_bidder: 'First bidder',
  held_lead_longest: 'Held the lead longest',
  sniped: 'Sniped',
  winner: 'Winner',
};

interface Props {
  bids: FeedBid[];
  now: number;
  /** masked handle → badge keys */
  badges?: Record<string, string[]>;
  /** milestone unlocks and other room-wide events, newest first */
  events?: FeedEvent[];
}

export const BidFeed = ({ bids, now, badges = {}, events = [] }: Props) => {
  if (!bids.length && !events.length) {
    return <p className="mt-2 text-sm text-muted-foreground">No bids yet. Be the first.</p>;
  }

  const rows = [
    ...events.map((e) => ({ kind: 'event' as const, at: e.created_at, e })),
    ...bids.map((b) => ({ kind: 'bid' as const, at: b.created_at, b })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <ul className="mt-2 space-y-1">
      {rows.map((row, i) =>
        row.kind === 'event' ? (
          <li
            key={row.e.id}
            className="animate-slide-in-right border-b border-primary/40 bg-primary/10 px-2 py-1.5 text-sm text-primary"
          >
            {row.e.label}
          </li>
        ) : (
          <li
            key={row.b.id}
            className="flex items-baseline justify-between border-b border-border/60 py-1.5 text-sm animate-slide-in-right"
            style={{ animationDelay: `${Math.min(i, 5) * 30}ms` }}
          >
            <span className="min-w-0 text-muted-foreground">
              {row.b.handle}
              {row.b.is_auto ? <span className="ml-1 vault-kicker text-[9px] text-primary">auto-bid</span> : null}
              {(badges[row.b.handle] ?? []).map((k) => (
                <span key={k} className="ml-1 border border-primary/50 px-1 vault-kicker text-[8px] text-primary">
                  {BADGE_LABEL[k] ?? k}
                </span>
              ))}
            </span>
            <span className="flex shrink-0 items-baseline gap-3">
              <span className="text-[11px] text-muted-foreground">{relativeTime(row.b.created_at, now)}</span>
              <span className="font-mono tabular-nums">{usd(Number(row.b.amount))}</span>
            </span>
          </li>
        )
      )}
    </ul>
  );
};
