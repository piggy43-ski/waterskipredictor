import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Trophy, Users, TrendingUp, Gift, FileCheck, Database, DollarSign, UserCog, Crown, FlaskConical, ClipboardList, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/house-ledger', label: 'Platform Ledger', icon: DollarSign },
  { path: '/admin/users', label: 'Users', icon: UserCog },
  { path: '/admin/athletes', label: 'Athletes', icon: Users },
  { path: '/admin/rankings-sync', label: 'Rankings Auto-Sync', icon: TrendingUp },
  { path: '/admin/rankings-import', label: 'Manual Import', icon: TrendingUp },
  { path: '/admin/tournament-settlement', label: 'Results Processing', icon: FileCheck },
  { path: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
  { path: '/admin/fantasy-pots', label: 'Fantasy Leagues', icon: Crown },
  { path: '/admin/markets', label: 'Contests', icon: TrendingUp },
  { path: '/admin/contest-entries', label: 'Contest Entries', icon: Users },
  { path: '/admin/market-results', label: 'Contest Results', icon: Trophy },
  { path: '/admin/odds-review', label: 'Multiplier Review', icon: TrendingUp },
  { path: '/admin/monte-carlo-test', label: 'Monte Carlo Test', icon: FlaskConical },
  { path: '/admin/selections', label: 'Selections', icon: Trophy },
  { path: '/admin/rewards', label: 'Rewards', icon: Gift },
  { path: '/admin/liabilities', label: 'Reward Liabilities', icon: ClipboardList },
  { path: '/admin/data-integrity', label: 'Data Integrity', icon: Database },
  { path: '/admin/settlement-test', label: 'Results Test', icon: FlaskConical },
];

const NavItemsList = ({ onItemClick }: { onItemClick?: () => void }) => {
  const location = useLocation();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onItemClick}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const location = useLocation();
  const { isLoading } = useAdminCheck();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isMobile && (
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0">
                      <Menu className="h-5 w-5" />
                      <span className="sr-only">Toggle menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 p-0">
                    <div className="flex flex-col h-full">
                      <div className="p-4 border-b border-border">
                        <h2 className="text-lg font-semibold text-foreground">Admin Menu</h2>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2">
                        <NavItemsList onItemClick={() => setMenuOpen(false)} />
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              )}
              <h1 className="text-xl md:text-2xl font-bold text-foreground">Admin Panel</h1>
            </div>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              Back to App
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 md:py-6">
        <div className="flex gap-6">
          {/* Desktop Sidebar */}
          {!isMobile && (
            <aside className="w-64 flex-shrink-0">
              <NavItemsList />
            </aside>
          )}

          {/* Main Content - Full width on mobile */}
          <main className="flex-1 min-w-0 w-full">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
