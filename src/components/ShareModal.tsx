import { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Share2, Loader2, Instagram } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ShareCard, type ShareCardProps } from './ShareCard';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ShareModalProps extends ShareCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl?: string;
}

export function ShareModal({ open, onOpenChange, shareUrl, ...cardProps }: ShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [actioning, setActioning] = useState<'download' | 'share' | null>(null);
  // 'full' = whole slip; a number = share that single pick on its own card.
  const [mode, setMode] = useState<'full' | number>('full');
  const { toast } = useToast();

  const sels = cardProps.selections;
  const isMulti = sels.length > 1;

  const canWebShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  // Card props for the currently selected mode.
  const activeCard: ShareCardProps = useMemo(() => {
    if (mode === 'full' || !isMulti) return cardProps;
    const one = sels[mode];
    return { ...cardProps, selections: one ? [one] : sels, combinedMultiplier: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardProps, mode, isMulti]);

  // Reset to full slip each time the modal opens.
  useEffect(() => {
    if (open) setMode('full');
  }, [open]);

  // Render to PNG whenever opened or the mode changes.
  useEffect(() => {
    if (!open) {
      setPreviewDataUrl(null);
      return;
    }
    let cancelled = false;
    setRendering(true);
    const t = setTimeout(async () => {
      try {
        if (!cardRef.current) return;
        const dataUrl = await toPng(cardRef.current, {
          width: 1080,
          height: 1920,
          pixelRatio: 1,
          cacheBust: true,
          backgroundColor: '#000000',
        });
        if (!cancelled) setPreviewDataUrl(dataUrl);
      } catch (err) {
        console.error('Failed to render share card', err);
        if (!cancelled) toast({ title: "Couldn't generate card", description: 'Please try again.', variant: 'destructive' });
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 90);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const filename = `wsp-${mode === 'full' ? 'slip' : 'pick'}-${Date.now()}.png`;

  const handleDownload = async () => {
    if (!previewDataUrl) return;
    setActioning('download');
    try {
      const a = document.createElement('a');
      a.href = previewDataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast({ title: 'Saved', description: 'Now post it to your story & tag @waterskipredictor 🏆' });
    } finally {
      setActioning(null);
    }
  };

  const handleNativeShare = async () => {
    if (!previewDataUrl) return;
    setActioning('share');
    try {
      const blob = await (await fetch(previewDataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });
      const data: ShareData = {
        files: [file],
        title: cardProps.tournamentName,
        text: 'My picks on WaterSki Predictor — think you can call it? waterskipredictor.com',
        url: shareUrl,
      };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(data);
      } else {
        await navigator.share({ title: data.title, text: data.text, url: data.url });
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') toast({ title: 'Share failed', variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-card border-border data-[state=open]:duration-300">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase tracking-wider">Share your picks</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Post it to your story and tag <span className="text-primary font-semibold">@waterskipredictor</span> 🏆
            </DialogDescription>
          </DialogHeader>

          {/* Full slip / individual pick toggle */}
          {isMulti && (
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                onClick={() => setMode('full')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border transition-colors',
                  mode === 'full' ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border'
                )}
              >
                Full slip
              </button>
              {sels.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setMode(i)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border transition-colors max-w-[140px] truncate',
                    mode === i ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border'
                  )}
                >
                  {s.name.split(/\s+/)[0]}
                </button>
              ))}
            </div>
          )}

          {/* Preview */}
          <div className="mx-auto mt-2 w-full max-w-[280px] aspect-[9/16] rounded-lg overflow-hidden border border-border bg-black animate-in fade-in duration-300">
            {rendering || !previewDataUrl ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <img src={previewDataUrl} alt="Share card preview" className="w-full h-full object-contain" />
            )}
          </div>

          {canWebShare ? (
            <Button onClick={handleNativeShare} disabled={!previewDataUrl || actioning !== null} className="mt-4 press-scale">
              {actioning === 'share' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Instagram className="w-4 h-4 mr-2" />}
              Share to story
            </Button>
          ) : null}

          <Button variant="outline" onClick={handleDownload} disabled={!previewDataUrl || actioning !== null} className="mt-2 press-scale">
            {actioning === 'download' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {canWebShare ? 'Save image' : 'Save & post to IG'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Offscreen render target */}
      {open && (
        <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, width: 1080, height: 1920, pointerEvents: 'none', zIndex: -1 }}>
          <ShareCard ref={cardRef} {...activeCard} />
        </div>
      )}
    </>
  );
}
