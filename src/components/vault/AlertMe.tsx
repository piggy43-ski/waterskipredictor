import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { BellRing, Check } from 'lucide-react';

/**
 * The single most valuable element on the pre-open screen: the alert list.
 * One tap when signed in, email capture otherwise.
 */
export const AlertMe = ({ skiId }: { skiId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const { data: waiting = 0 } = useQuery({
    queryKey: ['vault-reminder-count', skiId],
    queryFn: async () => {
      const { data } = await supabase.rpc('vault_reminder_count', { p_ski_id: skiId });
      return Number(data ?? 0);
    },
    refetchInterval: 30000,
  });

  const save = async (addr: string) => {
    if (!addr || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      toast({ title: 'Enter a valid email', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('vault_lot_reminders')
      .insert({ ski_id: skiId, user_id: user?.id ?? null, email: addr });
    setBusy(false);
    if (error && !error.message.includes('duplicate')) {
      toast({ title: 'Could not save that', description: error.message, variant: 'destructive' });
      return;
    }
    setDone(true);
    qc.invalidateQueries({ queryKey: ['vault-reminder-count', skiId] });
    toast({ title: "You're on the list" });
  };

  return (
    <div className="mx-auto w-full max-w-xl border border-primary/50 bg-primary/5 p-6 text-center">
      {done ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <Check className="h-5 w-5 text-primary" />
          <span className="vault-kicker text-[11px] text-primary">
            You&apos;ll be told the second bidding opens
          </span>
        </div>
      ) : (
        <>
          <p className="vault-serif text-2xl uppercase leading-tight tracking-[0.1em] sm:text-3xl">
            Alert me when it opens
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            One ski, one weekend. We&apos;ll message you the moment bidding is live — and once more before
            the hammer.
          </p>
          {user ? (
            <Button size="lg" className="mt-5 h-14 w-full text-base" disabled={busy} onClick={() => save(user.email ?? '')}>
              <BellRing className="mr-2 h-5 w-5" />
              Alert me when it opens
            </Button>
          ) : (
            <form
              className="mt-5 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                save(email.trim());
              }}
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="h-14 text-base"
                aria-label="Email for the open alert"
              />
              <Button type="submit" size="lg" className="h-14 px-8 text-base" disabled={busy}>
                Alert me
              </Button>
            </form>
          )}
        </>
      )}
      <p className="mt-4 vault-kicker text-[10px] text-muted-foreground">
        {waiting} {waiting === 1 ? 'person is' : 'people are'} waiting on this lot
      </p>
    </div>
  );
};
