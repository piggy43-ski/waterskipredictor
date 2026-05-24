import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLeaderboardTop } from '@/hooks/useLeaderboard';
import { ChevronRight } from 'lucide-react';

const fmtSigned = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;

const initials = (n: string) =>
  n.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();

export const HomeLeaderboardPreview = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useLeaderboardTop(5);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display uppercase tracking-wider text-xl text-foreground">
          Season Leaderboard
        </h2>
        <div className="h-px flex-1 bg-border mx-3" />
      </div>

      <div>
        {data.map((row) => (
          <button
            key={row.user_id}
            onClick={() => navigate('/leaderboard')}
            className="w-full text-left transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.98]"
          >
            <div className="flex items-center gap-3 py-3 px-1 border-b border-border">
              <div className="font-display text-muted-foreground text-lg w-10 shrink-0">
                #{row.rank}
              </div>
              <Avatar className="w-10 h-10 border border-border shrink-0">
                <AvatarImage src={row.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">
                  {initials(row.username)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-display uppercase tracking-wide text-foreground truncate">
                  {row.username}
                </div>
              </div>
              <div
                className={`font-display text-xl shrink-0 ${
                  row.net_pnl >= 0 ? 'text-primary' : 'text-destructive'
                }`}
              >
                {fmtSigned(row.net_pnl)}
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate('/leaderboard')}
        className="mt-3 w-full text-center font-display uppercase tracking-wider text-sm text-primary py-2 transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.98] flex items-center justify-center gap-1"
      >
        See full leaderboard <ChevronRight className="w-4 h-4" />
      </button>
    </section>
  );
};