import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'wsp_fantasy_banner_dismissed';

export function FantasyBanner() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === '1';
    setVisible(!dismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
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
              Draft your Botaski team — top 3 win tokens
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
