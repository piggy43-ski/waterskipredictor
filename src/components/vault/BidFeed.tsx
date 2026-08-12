import { relativeTime, usd } from '@/lib/vault';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

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
  /** opening price, shown in the empty state */
  startPrice?: number;
}

export const BidFeed = ({ bids, now, badges = {}, events = [], startPrice }: Props) => {
  const rows = [
    ...events.map((e) => ({ kind: 'event' as const, at: e.created_at, e })),
    ...bids.map((b) => ({ kind: 'bid' as const, at: b.created_at, b })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="vault-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="vault-label">Bid feed</p>
        <p className="vault-label">Newest first</p>
      </div>

      {!rows.length ? (
        <p className="vault-label px-5 py-8 text-center">
          No bids yet — opens at {usd(startPrice ?? 0)}
        </p>
      ) : (
        <ul>
          {rows.map((row, i) =>
            row.kind === 'event' ? (
              <li
                key={row.e.id}
                className="flex animate-slide-in-right items-center gap-3 border-b px-5 py-4 vault-feed-highlight vault-hairline"
              >
                <Lock className="h-4 w-4 shrink-0 text-primary-glow" />
                <span className="vault-mono text-sm text-primary-glow">{row.e.label}</span>
              </li>
            ) : (
              <li
                key={row.b.id}
                className={cn(
                  'flex animate-slide-in-right items-center gap-3 border-b px-5 py-4 vault-hairline',
                  i === 0 && 'vault-feed-highlight'
                )}
                style={{ animationDelay: `${Math.min(i, 5) * 30}ms` }}
              >
                <span className="vault-mono min-w-0 shrink-0 text-sm text-foreground">{row.b.handle}</span>
                {row.b.is_auto ? <span className="vault-label shrink-0 text-[11px]">Auto-bid</span> : null}
                {(badges[row.b.handle] ?? []).map((k) => (
                  <span key={k} className="vault-label shrink-0 border border-border px-1.5 py-0.5 text-[10px]">
                    {BADGE_LABEL[k] ?? k}
                  </span>
                ))}
                <span className="vault-display ml-auto shrink-0 text-lg text-foreground">
                  {usd(Number(row.b.amount))}
                </span>
                <span className="vault-mono shrink-0 text-[12px] text-muted-foreground">
                  {relativeTime(row.b.created_at, now)}
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
};
