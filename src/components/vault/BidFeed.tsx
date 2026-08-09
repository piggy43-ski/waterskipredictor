import { relativeTime, usd } from '@/lib/vault';

export interface FeedBid {
  id: string;
  handle: string;
  amount: number;
  is_auto: boolean;
  created_at: string;
}

export const BidFeed = ({ bids, now }: { bids: FeedBid[]; now: number }) => {
  if (!bids.length) {
    return <p className="mt-2 text-sm text-muted-foreground">No bids yet. Be the first.</p>;
  }
  return (
    <ul className="mt-2 space-y-1">
      {bids.map((b, i) => (
        <li
          key={b.id}
          className="flex items-baseline justify-between border-b border-border/60 py-1.5 text-sm animate-slide-in-right"
          style={{ animationDelay: `${Math.min(i, 5) * 30}ms` }}
        >
          <span className="text-muted-foreground">
            {b.handle}
            {b.is_auto ? <span className="ml-1 vault-kicker text-[9px] text-primary">auto-bid</span> : null}
          </span>
          <span className="flex items-baseline gap-3">
            <span className="text-[11px] text-muted-foreground">{relativeTime(b.created_at, now)}</span>
            <span className="font-mono tabular-nums">{usd(Number(b.amount))}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};