import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Square outline toggle — muted by default. */
export const SoundToggle = ({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    aria-label={on ? 'Mute bid sounds' : 'Unmute bid sounds'}
    className={cn(
      'inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-border transition-colors',
      on ? 'text-primary-glow' : 'text-muted-foreground hover:text-foreground',
      className
    )}
  >
    {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
  </button>
);
