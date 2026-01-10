import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { MapPin, Calendar, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tournament } from '@/types';
import { getBettingWindowStatus, formatCountdown } from '@/utils/bettingWindows';
import { cn } from '@/lib/utils';

interface PromoBannerCarouselProps {
  tournaments: Tournament[];
  autoplayDelay?: number;
}

export const PromoBannerCarousel = ({ 
  tournaments, 
  autoplayDelay = 5000 
}: PromoBannerCarouselProps) => {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [bettingWindows, setBettingWindows] = useState<Record<string, ReturnType<typeof getBettingWindowStatus>>>({});

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: tournaments.length > 1 },
    tournaments.length > 1 ? [Autoplay({ delay: autoplayDelay, stopOnInteraction: false })] : []
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Update betting windows every second
  useEffect(() => {
    const updateWindows = () => {
      const windows: Record<string, ReturnType<typeof getBettingWindowStatus>> = {};
      tournaments.forEach(t => {
        windows[t.id] = getBettingWindowStatus(t.start_datetime, t.end_datetime, t.settled_at);
      });
      setBettingWindows(windows);
    };
    
    updateWindows();
    const interval = setInterval(updateWindows, 1000);
    return () => clearInterval(interval);
  }, [tournaments]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDateRange = (tournament: Tournament) => {
    const start = formatDate(tournament.start_datetime || tournament.start_date);
    const end = formatDate(tournament.end_datetime || tournament.end_date);
    if (start === end) return start;
    return `${start} - ${end}`;
  };

  if (tournaments.length === 0) return null;

  return (
    <div className="w-full overflow-hidden rounded-2xl">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {tournaments.map((tournament, index) => {
            const bettingWindow = bettingWindows[tournament.id];
            const isLive = tournament.status === 'live';
            
            return (
              <div 
                key={tournament.id} 
                className="flex-[0_0_100%] min-w-0"
              >
                <div 
                  className={cn(
                    "relative p-6 min-h-[220px] flex flex-col justify-between",
                    "bg-gradient-to-br from-primary via-primary/90 to-primary/70",
                    "overflow-hidden"
                  )}
                >
                  {/* Background pattern */}
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-white/20" />
                    <div className="absolute -left-10 -bottom-10 w-60 h-60 rounded-full bg-white/10" />
                  </div>

                  {/* Content */}
                  <div className="relative z-10">
                    {/* Top labels */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary-foreground/80">
                        {isLive ? '🔴 LIVE NOW' : 'NEXT UP'}
                      </span>
                      <span className="text-xs font-medium text-primary-foreground/80 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {getDateRange(tournament)}
                      </span>
                    </div>

                    {/* Tournament name */}
                    <h2 className="font-display text-2xl font-bold text-primary-foreground mb-2 leading-tight">
                      {tournament.name}
                    </h2>

                    {/* Location */}
                    <div className="flex items-center gap-1 text-primary-foreground/80 mb-4">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">{tournament.location}</span>
                    </div>

                    {/* Disciplines */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {tournament.disciplines.map((discipline) => (
                        <Badge 
                          key={discipline} 
                          variant="secondary"
                          className="bg-white/20 text-primary-foreground border-0 text-xs capitalize"
                        >
                          {discipline}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Bottom section */}
                  <div className="relative z-10 flex items-center justify-between">
                    {/* Betting window status */}
                    <div className="text-sm text-primary-foreground/90">
                      {bettingWindow?.status === 'open' ? (
                        <span className="font-semibold">✓ Betting Open</span>
                      ) : bettingWindow?.countdown ? (
                        <span>Opens in {formatCountdown(bettingWindow.countdown)}</span>
                      ) : (
                        <span>{bettingWindow?.message}</span>
                      )}
                    </div>

                    {/* CTA Button */}
                    <Button
                      onClick={() => navigate(`/tournaments/${tournament.id}`)}
                      size="sm"
                      className="bg-white text-primary hover:bg-white/90 font-semibold"
                    >
                      {bettingWindow?.canBet ? 'Place Bet' : 'View Event'}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dot indicators */}
      {tournaments.length > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          {tournaments.map((_, index) => (
            <button
              key={index}
              onClick={() => emblaApi?.scrollTo(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-200",
                selectedIndex === index 
                  ? "bg-primary w-6" 
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
