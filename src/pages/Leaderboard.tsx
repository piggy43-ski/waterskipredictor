import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import {
  useLeaderboardTop,
  useUserLeaderboardPosition,
  LeaderboardRow,
} from '@/hooks/useLeaderboard';

const fmtSigned = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const PressRow = ({
  children,
  isCurrent,
  innerRef,
}: {
  children: React.ReactNode;
  isCurrent?: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
}) => (
  <div
    ref={innerRef}
    className={`transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.98] ${
      isCurrent ? 'border-l-2 border-primary bg-card/60 pl-3' : ''
    }`}
  >
    {children}
  </div>
);

const StatsLine = ({ row }: { row: LeaderboardRow }) => (
  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
    {row.total_predictions} predictions · {row.accuracy_pct ?? 0}% accuracy
  </div>
);

const PodiumCard = ({
  row,
  isCurrent,
  innerRef,
}: {
  row: LeaderboardRow;
  isCurrent?: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
}) => (
  <PressRow isCurrent={isCurrent} innerRef={innerRef}>
    <div className="p-4 bg-card border border-border rounded-md flex flex-col items-center text-center gap-2">
      <div className="font-display text-primary text-2xl">#{row.rank}</div>
      <Avatar className="w-14 h-14 border border-border">
        <AvatarImage src={row.avatar_url ?? undefined} />
        <AvatarFallback>{initials(row.username)}</AvatarFallback>
      </Avatar>
      <div className="font-display uppercase tracking-wide text-foreground text-lg leading-tight">
        {row.username}
      </div>
      <div
        className={`font-display text-2xl ${
          row.net_pnl >= 0 ? 'text-primary' : 'text-destructive'
        }`}
      >
        {fmtSigned(row.net_pnl)} <span className="text-xs">TOKENS</span>
      </div>
      <StatsLine row={row} />
    </div>
  </PressRow>
);

const DenseRow = ({
  row,
  isCurrent,
  innerRef,
}: {
  row: LeaderboardRow;
  isCurrent?: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
}) => (
  <PressRow isCurrent={isCurrent} innerRef={innerRef}>
    <div className="flex items-center gap-3 py-3 px-1 border-b border-border">
      <div className="font-display text-muted-foreground text-lg w-10 shrink-0">
        #{row.rank}
      </div>
      <Avatar className="w-10 h-10 border border-border shrink-0">
        <AvatarImage src={row.avatar_url ?? undefined} />
        <AvatarFallback className="text-xs">{initials(row.username)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="font-display uppercase tracking-wide text-foreground truncate">
          {row.username}
        </div>
        <StatsLine row={row} />
      </div>
      <div
        className={`font-display text-xl shrink-0 ${
          row.net_pnl >= 0 ? 'text-primary' : 'text-destructive'
        }`}
      >
        {fmtSigned(row.net_pnl)}
      </div>
    </div>
  </PressRow>
);

const Leaderboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: rows, isLoading } = useLeaderboardTop(10);
  const { data: userPos } = useUserLeaderboardPosition(user?.id);

  const top10 = rows ?? [];
  const userInTop10 = !!user && top10.some((r) => r.user_id === user.id);
  const userRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (location.state && (location.state as any).scrollToUser && user) {
      setTimeout(() => {
        userRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [location.state, user, top10.length]);

  const podium = top10.slice(0, 3);
  const rest = top10.slice(3, 10);

  return (
    <div className="min-h-screen bg-background pb-24">
      <SEO title="2026 Season Leaderboard" description="Ranked by net token P&L across 2026 events." />
      <PageHeader title="Leaderboard" showBack />

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-6">
        <div>
          <h1 className="font-display uppercase tracking-wider text-3xl text-foreground">
            2026 Season Leaderboard
          </h1>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
            Ranked by net token P&amp;L
          </div>
          <div className="h-px bg-border mt-3" />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : top10.length === 0 ? (
          <div className="py-16 text-center font-display uppercase tracking-wider text-foreground/80">
            No rankings yet
            <div className="text-xs text-muted-foreground mt-2">
              Be the first to predict at Masters
            </div>
          </div>
        ) : (
          <>
            {podium.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {podium.map((r) => (
                  <PodiumCard
                    key={r.user_id}
                    row={r}
                    isCurrent={r.user_id === user?.id}
                    innerRef={r.user_id === user?.id ? userRef : undefined}
                  />
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <div>
                {rest.map((r) => (
                  <DenseRow
                    key={r.user_id}
                    row={r}
                    isCurrent={r.user_id === user?.id}
                    innerRef={r.user_id === user?.id ? userRef : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky "Your Rank" footer when user is not in top 10 */}
      {user && userPos && !userInTop10 && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4">
          <div className="max-w-2xl mx-auto bg-card/95 backdrop-blur border border-border rounded-md shadow-lg border-l-2 border-l-primary px-3">
            <div className="flex items-center gap-3 py-3">
              <div className="font-display text-primary text-lg w-10 shrink-0">
                #{userPos.rank}
              </div>
              <Avatar className="w-10 h-10 border border-border shrink-0">
                <AvatarImage src={userPos.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">
                  {initials(userPos.username)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-display uppercase tracking-wide text-foreground truncate">
                  {userPos.username} <span className="text-xs text-muted-foreground">(you)</span>
                </div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {userPos.total_predictions} predictions · {userPos.accuracy_pct ?? 0}% accuracy
                </div>
              </div>
              <div
                className={`font-display text-xl shrink-0 ${
                  userPos.net_pnl >= 0 ? 'text-primary' : 'text-destructive'
                }`}
              >
                {fmtSigned(userPos.net_pnl)}
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Leaderboard;