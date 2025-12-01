import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Trophy, Users, TrendingUp, Gift, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminCheck } from '@/hooks/useAdminCheck';

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/athletes', label: 'Athletes', icon: Users },
  { path: '/admin/rankings-sync', label: 'Rankings Auto-Sync', icon: TrendingUp },
  { path: '/admin/rankings-import', label: 'Manual Import', icon: TrendingUp },
  { path: '/admin/tournament-settlement', label: 'Results & Settlement', icon: FileCheck },
  { path: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
  { path: '/admin/markets', label: 'Markets', icon: TrendingUp },
  { path: '/admin/selections', label: 'Selections', icon: Trophy },
  { path: '/admin/rewards', label: 'Rewards', icon: Gift },
];

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const location = useLocation();
  const { isLoading } = useAdminCheck();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              Back to App
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          <aside className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
