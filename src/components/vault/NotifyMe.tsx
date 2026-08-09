import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { BellRing, Check } from 'lucide-react';

/** Reminder capture for a teaser lot. One tap signed in, email capture otherwise. */
export const NotifyMe = ({ skiId }: { skiId: string }) => {
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
    toast({ title: "You're on the list for this lot" });
  };

  return (
    <div className="mx-auto w-full max-w-md">
      {done ? (
        <div className="flex items-center justify-center gap-2 border border-primary/60 bg-primary/10 px-4 py-3">
          <Check className="h-4 w-4 text-primary" />
          <span className="vault-kicker text-[10px] text-primary">You&apos;ll be told the moment it opens</span>
        </div>
      ) : user ? (
        <Button size="lg" className="w-full" disabled={busy} onClick={() => save(user.email ?? '')}>
          <BellRing className="mr-2 h-4 w-4" />
          Notify me when this opens
        </Button>
      ) : (
        <form
          className="flex gap-2"
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
            aria-label="Email for lot reminder"
          />
          <Button type="submit" disabled={busy}>
            Notify me
          </Button>
        </form>
      )}
      <p className="mt-3 text-center vault-kicker text-[10px] text-muted-foreground">
        {waiting} {waiting === 1 ? 'person is' : 'people are'} waiting on this lot
      </p>
    </div>
  );
};