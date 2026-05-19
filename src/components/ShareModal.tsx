import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Link2, Share2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ShareCard, type ShareCardProps } from './ShareCard';
import { Skeleton } from '@/components/ui/skeleton';

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
  const { toast } = useToast();

  const canWebShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  // Render to PNG once when opened.
  useEffect(() => {
    if (!open) {
      setPreviewDataUrl(null);
      return;
    }
    let cancelled = false;
    setRendering(true);
    // Give the offscreen DOM a tick to lay out.
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
        if (!cancelled) {
          toast({
            title: "Couldn't generate card",
            description: 'Please try again.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filename = `wsp-${cardProps.type}-${Date.now()}.png`;

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
    } finally {
      setActioning(null);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
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
        text: 'My WSP prediction',
        url: shareUrl,
      };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(data);
      } else {
        await navigator.share({ title: data.title, text: data.text, url: data.url });
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast({ title: 'Share failed', variant: 'destructive' });
      }
    } finally {
      setActioning(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-card border-border data-[state=open]:duration-300">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase tracking-wider">
              Share your prediction
            </DialogTitle>
          </DialogHeader>

          {/* Preview — scaled down 1080x1920 */}
          <div className="mx-auto mt-2 w-full max-w-[280px] aspect-[9/16] rounded-lg overflow-hidden border border-border bg-black animate-in fade-in duration-300">
            {rendering || !previewDataUrl ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <img
                src={previewDataUrl}
                alt="Share card preview"
                className="w-full h-full object-contain"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button
              onClick={handleDownload}
              disabled={!previewDataUrl || actioning !== null}
              className="press-scale"
            >
              {actioning === 'download' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Download
            </Button>
            <Button
              variant="outline"
              onClick={handleCopyLink}
              disabled={!shareUrl}
              className="press-scale"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Copy link
            </Button>
          </div>

          {canWebShare && (
            <Button
              variant="secondary"
              onClick={handleNativeShare}
              disabled={!previewDataUrl || actioning !== null}
              className="mt-2 press-scale"
            >
              {actioning === 'share' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4 mr-2" />
              )}
              Share…
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Offscreen render target — must be in the DOM (not display:none) for html-to-image to measure. */}
      {open && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: -100000,
            top: 0,
            width: 1080,
            height: 1920,
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <ShareCard ref={cardRef} {...cardProps} />
        </div>
      )}
    </>
  );
}
