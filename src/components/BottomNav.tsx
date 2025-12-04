import { Home, Trophy, Wallet, Gift, Crown } from 'lucide-react';
import { NavLink } from './NavLink';

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="max-w-lg mx-auto px-2 py-2">
        <div className="flex justify-around items-center">
          <NavLink
            to="/"
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-all text-muted-foreground"
            activeClassName="!text-primary"
          >
            <Home className="w-5 h-5" />
            <span className="text-xs font-medium">Home</span>
          </NavLink>
          
          <NavLink
            to="/tournaments"
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-all text-muted-foreground"
            activeClassName="!text-primary"
          >
            <Trophy className="w-5 h-5" />
            <span className="text-xs font-medium">Events</span>
          </NavLink>
          
          <NavLink
            to="/fantasy"
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-all text-muted-foreground"
            activeClassName="!text-primary"
          >
            <Crown className="w-5 h-5" />
            <span className="text-xs font-medium">Fantasy</span>
          </NavLink>
          
          <NavLink
            to="/wallet"
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-all text-muted-foreground"
            activeClassName="!text-primary"
          >
            <Wallet className="w-5 h-5" />
            <span className="text-xs font-medium">Wallet</span>
          </NavLink>
          
          <NavLink
            to="/rewards"
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-all text-muted-foreground"
            activeClassName="!text-primary"
          >
            <Gift className="w-5 h-5" />
            <span className="text-xs font-medium">Rewards</span>
          </NavLink>
        </div>
      </div>
    </nav>
  );
};
