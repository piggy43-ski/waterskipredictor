import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Crown, Users, Trophy, ArrowRight, Gift } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PigoskiMark } from '@/components/PigoskiMark';
import { Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface FantasyPotRow {
  id: string;
  name: string;
  status: string;
  pot_type: string;
  entry_fee_tokens: number;
  payout_split: any;
  tournament_id: string | null;
  tournaments?: { name: string; start_date: string | null; location: string | null } | null;
}

interface StandingRow {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  points: number;
  events: number;
  wins: number;
  delta: number;
}

const initials = (name: string) =>
  (name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();

function prizeLine(p: FantasyPotRow): string {
  const split = p.payout_split;
  if (split && typeof split === 'object') {
    const vals = Object.keys(split)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => Number(split[k]))
      .filter((n) => n > 0);
    if (vals.length) return vals.map((v) => v.toLocaleString()).join(' / ') + ' tokens';
  }
  return 'Prediction tokens for the top finishers';
}

const Fantasy = () => {
  const { data: pots = [], isLoading } = useQuery({
    queryKey: ['fantasy-pots-open'],
    queryFn: async (): Promise<FantasyPotRow[]> => {
      const { data, error } = await supabase
        .from('fantasy_pots')
        .select('id, name, status, pot_type, entry_fee_tokens, payout_split, tournament_id, tournaments:tournaments!tournament_id(name, start_date, location)')
        .in('status', ['open', 'live', 'upcoming'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any as FantasyPotRow[];
    },
  });

  const { user } = useAuth();
  const season = String(new Date().getFullYear());
  const { data: standings = [], isLoading: standingsLoading } = useQuery({
    queryKey: ['fantasy-season-standings', season],
    queryFn: async (): Promise<StandingRow[]> => {
      const { data: rows, error } = await supabase
        .from('v_fantasy_season_leaderboard' as any)
        .select('user_id, championship_points, events_played, event_wins, rank_delta')
        .eq('season', season)
        .order('championship_points', { ascending: false })
        .limit(25);
      if (error) return [];
      const list = (rows ?? []) as any[];
      if (list.length === 0) return [];
      const ids = list.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ids);
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((r, i) => ({
        rank: i + 1,
        user_id: r.user_id,
        username: pmap.get(r.user_id)?.username ?? 'Manager',
        avatar_url: pmap.get(r.user_id)?.avatar_url ?? null,
        points: Number(r.championship_points) || 0,
        events: r.events_played || 0,
        wins: r.event_wins || 0,
        delta: Number(r.rank_delta) || 0,
      }));
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24 flex flex-col">
      <SEO title="Fantasy — Free to Play" description="Build your waterski fantasy team for free. Pick the pros, climb the standings, win prediction tokens." path="/fantasy" />
      <PageHeader title="Fantasy" />

      <main className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto">
        {/* intro */}
        <Card className="p-5 mb-5 border-primary/30 bg-primary/[0.05]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full border border-primary/40 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-xl uppercase tracking-wide">Free fantasy</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Build a salary-cap team of the pros, lock it before first start, and score off real results. <span className="text-foreground font-medium">Free to play</span> — top finishers win prediction tokens. Beat your friends.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border/60 grid gap-1.5">
            {['Entry is free — no tokens needed', 'Pick a salary-cap team, lock before first start', 'Top 3 win prediction tokens'].map((r) => (
              <div key={r} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-primary shrink-0" /> {r}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-center">
            <PigoskiMark />
          </div>
        </Card>

        <Tabs defaultValue="leagues" className="mb-5">
          <TabsList className="grid grid-cols-2 w-full bg-card border border-border rounded-xl p-1 mb-5">
            <TabsTrigger
              value="leagues"
              className="w-full rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Leagues
            </TabsTrigger>
            <TabsTrigger
              value="season"
              className="w-full rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Season
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leagues">
            {isLoading ? (
              <p className="text-muted-foreground text-sm px-1">Loading leagues…</p>
            ) : pots.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="mx-auto w-14 h-14 rounded-full border border-primary/30 flex items-center justify-center mb-4">
                  <Trophy className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display text-2xl uppercase tracking-wide">No leagues open yet</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                  The first free league drops for the next pro stop. Build your team, climb the standings, and win prediction tokens — watch this space.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {pots.map((p) => (
                  <Link key={p.id} to={`/fantasy/${p.id}`}>
                    <Card className="p-4 press-scale hover:border-primary/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">{p.name}</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">
                          {p.status}
                        </span>
                      </div>
                      {p.tournaments?.name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.tournaments.name}
                          {p.tournaments.start_date ? ` · ${new Date(p.tournaments.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <span className="flex items-center gap-1.5 font-semibold text-primary">
                          {p.entry_fee_tokens === 0 ? 'FREE' : `${p.entry_fee_tokens.toLocaleString()} tokens`}
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Gift className="w-4 h-4" /> {prizeLine(p)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        {p.entry_fee_tokens === 0 ? <PigoskiMark /> : <span />}
                        <span className="flex items-center text-primary text-sm font-medium">
                          Build your team <ArrowRight className="w-4 h-4 ml-1" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="season">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-display text-xl uppercase tracking-wide flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" /> Season Championship
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">
                  {season}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Earn championship points by your finish at every stop. Most points when the season ends wins the grand prize.
              </p>

              {standingsLoading ? (
                <p className="text-muted-foreground text-sm mt-4">Loading standings…</p>
              ) : standings.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-border/60 p-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    Standings open after the first event. Win events to climb the championship.
                  </p>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-border/50">
                  {standings.map((row) => (
                    <div
                      key={row.user_id}
                      className={cn(
                        'flex items-center gap-3 py-2',
                        row.user_id === user?.id && 'border-l-2 border-primary pl-2'
                      )}
                    >
                      <div className="w-6 flex flex-col items-center leading-none">
                        <span className={cn('font-display text-lg', row.rank <= 3 ? 'text-primary' : 'text-muted-foreground')}>{row.rank}</span>
                        {row.delta !== 0 && (
                          <span className={cn('text-[9px] font-bold', row.delta > 0 ? 'text-green-500' : 'text-red-500')}>
                            {row.delta > 0 ? '▲' + row.delta : '▼' + Math.abs(row.delta)}
                          </span>
                        )}
                      </div>
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={row.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">{initials(row.username)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {row.username}
                          {row.user_id === user?.id && <span className="text-xs text-muted-foreground"> (you)</span>}
                        </p>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {row.events} event{row.events === 1 ? '' : 's'}
                          {row.wins > 0 ? ` · ${row.wins} win${row.wins === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <span className="font-display text-lg text-primary">
                        {row.points % 1 === 0 ? row.points : row.points.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <details className="mt-4 pt-3 border-t border-border/60">
                <summary className="cursor-pointer text-sm font-medium text-primary list-none">How the championship works</summary>
                <div className="mt-2 text-sm text-muted-foreground space-y-2">
                  <p>Every event you enter, you earn championship points by where your team finishes against the other managers:</p>
                  <p className="text-xs text-foreground/80">1st 25 · 2nd 18 · 3rd 15 · 4th 12 · 5th 10 · 6th 8 · 7th 6 · 8th 4 · 9th 2 · 10th 1 — plus +1 just for entering.</p>
                  <p>Your team scores off real results: finishing-position points, +5 top score, +3 made final, podium +5/+3/+1, minus penalties for missed passes and no-shows. Ties split points evenly.</p>
                </div>
              </details>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <BottomNav />
    </div>
  );
};

export default Fantasy;
