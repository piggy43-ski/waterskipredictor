import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Instagram } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EventShareCard, type EventShareCardProps } from './EventShareCard';
import { Skeleton } from '@/components/ui/skeleton';

interface EventShareModalProps extends EventShareCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl?: string;
}

export function EventShareModal({ open, onOpenChange, shareUrl, ...cardProps }: EventShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [actioning, setActioning] = useState<'download' | 'share' | null>(null);
  const { toast } = useToast();

  const canWebShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  useEffect(() => {
    if (!open) { setPreviewDataUrl(null); return; }
    let cancelled = false;
    setRendering(true);
    const t = setTimeout(async () => {
      try {
        if (!cardRef.current) return;
        const dataUrl = await toPng(cardRef.current, { width: 1080, height: 1920, pixelRatio: 1, cacheBust: true, backgroundColor: '#000000' });
        if (!cancelled) setPreviewDataUrl(dataUrl);
      } catch (err) {
        console.error('Failed to render event card', err);
        if (!cancelled) toast({ title: "Couldn't generate card", description: 'Please try again.', variant: 'destructive' });
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 90);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filename = `wsp-card-${Date.now()}.png`;

  const handleDownload = async () => {
    if (!previewDataUrl) return;
    setActioning('download');
    try {
      const a = document.createElement('a');
      a.href = previewDataUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      toast({ title: 'Saved', description: 'Post it to your story & tag @waterskipredictor 🏆' });
    } finally { setActioning(null); }
  };

  const handleNativeShare = async () => {
    if (!previewDataUrl) return;
    setActioning('share');
    try {
      const blob = await (await fetch(previewDataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });
      const data: ShareData = { files: [file], title: `My ${cardProps.tournamentName} card`, text: 'My full card on WaterSki Predictor — think you can beat it? waterskipredictor.com', url: shareUrl };
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share(data);
      else await navigator.share({ title: data.title, text: data.text, url: data.url });
    } catch (err: any) {
      if (err?.name !== 'AbortError') toast({ title: 'Share failed', variant: 'destructive' });
    } finally { setActioning(null); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-card border-border data-[state=open]:duration-300">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase tracking-wider">Share your card</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Your whole {cardProps.tournamentName} card in one post — tag <span className="text-primary font-semibold">@waterskipredictor</span> 🏆
            </DialogDescription>
          </DialogHeader>

          <div className="mx-auto mt-2 w-full max-w-[280px] aspect-[9/16] rounded-lg overflow-hidden border border-border bg-black animate-in fade-in duration-300">
            {rendering || !previewDataUrl ? <Skeleton className="w-full h-full" /> : <img src={previewDataUrl} alt="Event card preview" className="w-full h-full object-contain" />}
          </div>

          {canWebShare && (
            <Button onClick={handleNativeShare} disabled={!previewDataUrl || actioning !== null} className="mt-4 press-scale">
              {actioning === 'share' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Instagram className="w-4 h-4 mr-2" />}
              Share to story
            </Button>
          )}
          <Button variant="outline" onClick={handleDownload} disabled={!previewDataUrl || actioning !== null} className="mt-2 press-scale">
            {actioning === 'download' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {canWebShare ? 'Save image' : 'Save & post to IG'}
          </Button>
        </DialogContent>
      </Dialog>

      {open && (
        <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, width: 1080, height: 1920, pointerEvents: 'none', zIndex: -1 }}>
          <EventShareCard ref={cardRef} {...cardProps} />
        </div>
      )}
    </>
  );
}
