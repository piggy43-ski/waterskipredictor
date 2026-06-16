import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Crown, Users, Trophy, ArrowRight, Gift } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';

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
        </Card>

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
                  <div className="flex items-center justify-end mt-2 text-primary text-sm font-medium">
                    Build your team <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Fantasy;
