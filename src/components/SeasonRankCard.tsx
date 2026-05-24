import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useUserLeaderboardPosition } from '@/hooks/useLeaderboard';
import { Skeleton } from '@/components/ui/skeleton';

const fmtSigned = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;

export const SeasonRankCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useUserLeaderboardPosition(user?.id);

  const goLeaderboard = () => {
    navigate('/leaderboard', { state: { scrollToUser: true } });
  };

  if (isLoading) {
    return (
      <Card className="p-5 bg-card border-border">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-14 w-24" />
      </Card>
    );
  }

  const ranked = !!data && data.total_predictions > 0;

  return (
    <button
      onClick={goLeaderboard}
      className="w-full text-left transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.98]"
    >
      <Card className="p-5 bg-card border-border">
        <div className="font-display uppercase tracking-wider text-xs text-muted-foreground mb-2">
          2026 Season Rank
        </div>

        {!ranked ? (
          <div className="font-display uppercase text-lg text-foreground/80 leading-tight">
            Unranked
            <div className="text-xs text-muted-foreground font-sans normal-case tracking-normal mt-1">
              Make your first prediction at Masters
            </div>
          </div>
        ) : (
          <>
            <div className="font-display text-primary text-6xl leading-none">
              #{data!.rank}
            </div>
            <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Net P&amp;L
                </div>
                <div
                  className={`font-display text-xl ${
                    data!.net_pnl >= 0 ? 'text-primary' : 'text-destructive'
                  }`}
                >
                  {fmtSigned(data!.net_pnl)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Predictions
                </div>
                <div className="font-display text-xl text-foreground">
                  {data!.total_predictions}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Accuracy
                </div>
                <div className="font-display text-xl text-foreground">
                  {data!.accuracy_pct ?? 0}%
                </div>
              </div>
            </div>
          </>
        )}
      </Card>
    </button>
  );
};