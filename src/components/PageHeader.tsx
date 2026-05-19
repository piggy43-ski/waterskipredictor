import { ReactNode } from 'react';
import { ChevronLeft, User, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from './NotificationBell';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: string;
  showBack?: boolean;
  action?: ReactNode;
  showBalance?: boolean;
}

export const PageHeader = ({
  title,
  subtitle,
  showBack = false,
  action,
  showBalance = true
}: PageHeaderProps) => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 glass-header border-b border-border">
      <div className="max-w-lg mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBack && (
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 -ml-2 hover:bg-secondary">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <div>
              <h1 className="font-display text-2xl leading-none uppercase text-foreground">{title}</h1>
              {subtitle && <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {user && showBalance && wallet && (
              <div 
                className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-md cursor-pointer hover:bg-primary/20 transition-colors border border-primary/30 press-scale"
                onClick={() => navigate('/wallet')}
              >
                <Coins className="w-3.5 h-3.5" />
                <span className="text-sm font-condensed font-extrabold tabular-nums">{(wallet.totalBalance ?? 0).toLocaleString()}</span>
              </div>
            )}
            {user && <NotificationBell />}
            {action}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/profile')} 
              className="shrink-0 w-9 h-9 rounded-full border border-border hover:bg-secondary"
            >
              <User className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
