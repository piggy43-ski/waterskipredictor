import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * PIGOSKI sponsor mark. Renders /pigoski-logo.png if present (drop the file in
 * public/), otherwise falls back to a clean wordmark so it always shows.
 */
export function PigoskiMark({ className, prefix = true }: { className?: string; prefix?: boolean }) {
  const [imgOk, setImgOk] = useState(false);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {prefix && <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Sponsored by</span>}
      <img
        src="/pigoski-logo.png"
        alt="PIGOSKI"
        className="h-5 w-auto"
        style={{ display: imgOk ? 'inline-block' : 'none' }}
        onLoad={() => setImgOk(true)}
        onError={() => setImgOk(false)}
      />
      {!imgOk && (
        <span className="font-display font-bold tracking-[0.22em] text-primary text-sm leading-none">PIGOSKI</span>
      )}
    </span>
  );
}
