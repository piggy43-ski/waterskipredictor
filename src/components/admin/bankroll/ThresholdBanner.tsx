import { AlertTriangle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export interface BannerTrigger {
  level: 'warning' | 'critical';
  message: string;
}

export const ThresholdBanner = ({ triggers }: { triggers: BannerTrigger[] }) => {
  if (triggers.length === 0) return null;
  return (
    <div className="space-y-2">
      {triggers.map((t, i) => {
        const Icon = t.level === 'critical' ? AlertCircle : AlertTriangle;
        return (
          <Alert
            key={i}
            className={cn(
              t.level === 'critical'
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
            )}
          >
            <Icon className="h-4 w-4" />
            <AlertDescription className="font-medium">{t.message}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
};