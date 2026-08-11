import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SoundToggle = ({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    aria-label={on ? 'Mute bid sounds' : 'Unmute bid sounds'}
    className={cn(
      'inline-flex items-center gap-1.5 border border-border px-2.5 py-1 vault-kicker text-[9px] transition-colors',
      on ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
      className
    )}
  >
    {on ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
    {on ? 'Sound on' : 'Sound off'}
  </button>
);
