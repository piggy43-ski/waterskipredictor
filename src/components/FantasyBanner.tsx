import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export function FantasyBanner() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [eventName, setEventName] = useState('');
  const [dismissKey, setDismissKey] = useState('wsp_fantasy_banner_dismissed');

  useEffect(() => {
    let active = true;
    (async () => {
      // Banner tracks whichever tournament's fantasy pot is currently open,
      // so it auto-updates every new event — no hardcoded tournament name.
      const { data } = await supabase
        .from('fantasy_pots')
        .select('id, status, tournaments(name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);
      const pot: any = data && data[0];
      if (!active || !pot || !pot.tournaments) return;
      const name = (pot.tournaments.name || '').replace(/\s*ProAm$/i, '').trim();
      const key = `wsp_fantasy_banner_dismissed_${pot.id}`;
      if (localStorage.getItem(key) === '1') return;
      setEventName(name);
      setDismissKey(key);
      setVisible(true);
    })();
    return () => { active = false; };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black"
            style={{ backgroundColor: '#f0a23c' }}
          >
            FREE
          </span>
          <div className="min-w-0">
            <p className="text-foreground font-semibold">Fantasy is live</p>
            <p className="text-xs text-muted-foreground truncate">
              Draft your {eventName} team — top 3 win tokens
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => navigate('/fantasy')}>
            Play
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleDismiss}
            aria-label="Dismiss fantasy announcement"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
