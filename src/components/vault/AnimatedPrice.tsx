import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { usd } from '@/lib/vault';

/** Counts up to the new price and flashes the accent when it changes. */
export const AnimatedPrice = ({ value, className }: { value: number; className?: string }) => {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(false);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setFlash(true);
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (value - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        from.current = value;
        setTimeout(() => setFlash(false), 400);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span
      className={cn(
        'font-mono tabular-nums transition-colors duration-300',
        flash ? 'text-primary' : 'text-foreground',
        className
      )}
    >
      {usd(display)}
    </span>
  );
};