import { ReactNode } from 'react';
import { ChevronLeft, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  action?: ReactNode;
}

export const PageHeader = ({ title, subtitle, showBack = false, action }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {action}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/profile')}
              className="shrink-0"
            >
              <User className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
