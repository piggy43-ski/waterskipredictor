import { Home, Trophy, Wallet, Gift, Crown } from 'lucide-react';
import { NavLink } from './NavLink';

const navItemClass =
  "group relative flex flex-col items-center gap-1 py-2 px-3 rounded-md transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] text-muted-foreground active:scale-95";
const activeClass = "!text-primary";

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-header border-t border-border">
      <div className="max-w-lg mx-auto px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-around items-center">
          <NavLink to="/" className={navItemClass} activeClassName={activeClass}>
            <Home className="w-5 h-5 transition-[stroke-width] group-[.active]:[stroke-width:2.5]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary opacity-0 transition-opacity group-[.active]:opacity-100" />
          </NavLink>

          <NavLink to="/tournaments" id="nav-events" className={navItemClass} activeClassName={activeClass}>
            <Trophy className="w-5 h-5 transition-[stroke-width] group-[.active]:[stroke-width:2.5]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Events</span>
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary opacity-0 transition-opacity group-[.active]:opacity-100" />
          </NavLink>

          <NavLink to="/fantasy" className={navItemClass} activeClassName={activeClass}>
            <Crown className="w-5 h-5 transition-[stroke-width] group-[.active]:[stroke-width:2.5]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Fantasy</span>
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary opacity-0 transition-opacity group-[.active]:opacity-100" />
          </NavLink>

          <NavLink to="/wallet" className={navItemClass} activeClassName={activeClass}>
            <Wallet className="w-5 h-5 transition-[stroke-width] group-[.active]:[stroke-width:2.5]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Tokens</span>
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary opacity-0 transition-opacity group-[.active]:opacity-100" />
          </NavLink>

          <NavLink to="/rewards" id="nav-rewards" className={navItemClass} activeClassName={activeClass}>
            <Gift className="w-5 h-5 transition-[stroke-width] group-[.active]:[stroke-width:2.5]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Rewards</span>
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary opacity-0 transition-opacity group-[.active]:opacity-100" />
          </NavLink>
        </div>
      </div>
    </nav>
  );
};
