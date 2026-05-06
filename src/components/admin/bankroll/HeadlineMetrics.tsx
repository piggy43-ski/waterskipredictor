import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/utils/tokenConversion';

export type MetricTone = 'neutral' | 'green' | 'yellow' | 'red';

export interface HeadlineMetric {
  label: string;
  valueUsd: number;
  valueTokens: number;
  tone: MetricTone;
  deltaText: string;
  deltaTone: 'neutral' | 'green' | 'red';
}

const toneClasses: Record<MetricTone, string> = {
  neutral: 'border-border',
  green: 'border-emerald-500/50 bg-emerald-500/5',
  yellow: 'border-yellow-500/50 bg-yellow-500/5',
  red: 'border-destructive/50 bg-destructive/5',
};

const valueToneClasses: Record<MetricTone, string> = {
  neutral: 'text-foreground',
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-yellow-700 dark:text-yellow-400',
  red: 'text-destructive',
};

const deltaToneClasses = {
  neutral: 'text-muted-foreground',
  green: 'text-emerald-600 dark:text-emerald-400',
  red: 'text-destructive',
};

export const HeadlineMetrics = ({ metrics }: { metrics: HeadlineMetric[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {metrics.map((m) => (
      <Card key={m.label} className={cn('border-2', toneClasses[m.tone])}>
        <CardContent className="p-5 space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {m.label}
          </div>
          <div className={cn('text-3xl font-bold tabular-nums', valueToneClasses[m.tone])}>
            {formatUSD(m.valueUsd)}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {m.valueTokens.toLocaleString()} tokens
          </div>
          <div className={cn('text-xs pt-1 tabular-nums', deltaToneClasses[m.deltaTone])}>
            {m.deltaText}
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);
