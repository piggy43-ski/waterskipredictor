import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { usd } from '@/lib/vault';
import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';

interface GuessResults {
  closed: boolean;
  total?: number;
  final_price?: number;
  guesses?: number[];
  winner?: { handle: string; guess: number } | null;
}

/**
 * Guess the hammer price. Free, one per person, closes an hour before the lot does.
 * Prize pays in WSP tokens only — auction money never converts to tokens and tokens
 * are never spendable on a lot.
 */
export const GuessGame = ({ skiId, closesAt, now }: { skiId: string; closesAt: string | null; now: number }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const guessesClosed = closesAt ? new Date(closesAt).getTime() - now <= 60 * 60 * 1000 : false;

  const { data: mine } = useQuery({
    queryKey: ['vault-my-guess', skiId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vault_price_guesses')
        .select('guess')
        .eq('ski_id', skiId)
        .eq('user_id', user!.id)
        .maybeSingle();
      return data ? Number(data.guess) : null;
    },
    enabled: !!user,
  });

  const { data: results } = useQuery({
    queryKey: ['vault-guess-results', skiId],
    queryFn: async () => {
      const { data } = await supabase.rpc('vault_guess_results', { p_ski_id: skiId });
      return (data ?? { closed: false }) as unknown as GuessResults;
    },
    refetchInterval: 30000,
  });

  const histogram = useMemo(() => {
    const all = results?.guesses ?? [];
    if (!all.length) return [];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const buckets = 12;
    const span = Math.max(1, max - min);
    const counts = Array.from({ length: buckets }, () => 0);
    for (const g of all) counts[Math.min(buckets - 1, Math.floor(((g - min) / span) * buckets))] += 1;
    const peak = Math.max(...counts, 1);
    return counts.map((c, i) => ({ c, peak, from: min + (span / buckets) * i }));
  }, [results]);

  const submit = async () => {
    if (!user) {
      navigate('/auth?next=/vault');
      return;
    }
    const g = Number(value);
    if (!g || g <= 0) {
      toast({ title: 'Enter a dollar amount', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('vault_price_guesses').insert({ ski_id: skiId, user_id: user.id, guess: g });
    setBusy(false);
    if (error) {
      toast({
        title: error.message.includes('duplicate') ? 'You already guessed on this lot' : 'Guess not saved',
        description: error.message.includes('duplicate') ? undefined : 'Guessing closes one hour before the hammer.',
        variant: 'destructive',
      });
      return;
    }
    setValue('');
    qc.invalidateQueries({ queryKey: ['vault-my-guess', skiId, user.id] });
    qc.invalidateQueries({ queryKey: ['vault-guess-results', skiId] });
    toast({ title: `Guess locked at ${usd(g)}`, description: 'Closest guess wins WSP tokens.' });
  };

  return (
    <section className="border border-primary/40 bg-card p-5">
      <p className="vault-kicker text-[10px] text-primary">Guess the hammer price</p>
      <div className="vault-rule my-3 w-12" />
      <p className="text-sm text-muted-foreground">
        Free, no bid required, one guess each. Closest guess wins WSP tokens — the app&apos;s free-to-play
        currency. Tokens can never be spent on a ski, and nothing from the auction converts to tokens.
      </p>

      {results?.closed ? (
        <div className="mt-4">
          <p className="vault-kicker text-[9px] text-muted-foreground">
            {results.total ?? 0} guesses · hammer {usd(Number(results.final_price))}
          </p>
          <div className="mt-3 flex h-24 items-end gap-1">
            {histogram.map((b, i) => (
              <div key={i} className="flex-1" title={`${b.c} guesses near ${usd(Math.round(b.from))}`}>
                <div
                  className="w-full bg-primary/70"
                  style={{ height: `${Math.max(3, (b.c / b.peak) * 96)}px` }}
                />
              </div>
            ))}
          </div>
          {results.winner ? (
            <p className="mt-4 inline-flex items-center gap-2 border border-primary bg-primary/10 px-3 py-2 text-sm">
              <Trophy className="h-4 w-4 text-primary" />
              <span>
                <strong>{results.winner.handle}</strong> guessed {usd(Number(results.winner.guess))} — closest.
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No guesses were entered on this lot.</p>
          )}
          {mine ? <p className="mt-2 text-[11px] text-muted-foreground">Your guess: {usd(mine)}</p> : null}
        </div>
      ) : mine ? (
        <p className="mt-4 border border-border px-3 py-3 font-mono text-lg tabular-nums">
          Your guess: {usd(mine)}
        </p>
      ) : guessesClosed ? (
        <p className="mt-4 text-sm text-muted-foreground">Guessing closed for the final hour.</p>
      ) : (
        <div className={cn('mt-4 flex gap-2')}>
          <Input
            inputMode="decimal"
            placeholder="What will it sell for?"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
            className="font-mono"
            aria-label="Your hammer price guess in dollars"
          />
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Lock it in'}
          </Button>
        </div>
      )}

      <p className="mt-3 vault-kicker text-[9px] text-muted-foreground">
        {results?.total ?? 0} {results?.total === 1 ? 'guess' : 'guesses'} in
      </p>
    </section>
  );
};
