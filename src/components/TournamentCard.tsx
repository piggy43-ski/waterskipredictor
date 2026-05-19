import { Tournament } from '@/types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Calendar, MapPin, Clock, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPredictionWindowStatus } from '@/utils/predictionWindows';
import { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface TournamentCardProps {
  tournament: Tournament;
}

export const TournamentCard = ({ tournament }: TournamentCardProps) => {
  const navigate = useNavigate();
  const startTime = tournament.start_datetime || tournament.start_date;
  const endTime = tournament.end_datetime || tournament.end_date;
  
  const [predictionWindow, setPredictionWindow] = useState(getPredictionWindowStatus(startTime, endTime, tournament.settled_at));

  useEffect(() => {
    const interval = setInterval(() => {
      setPredictionWindow(getPredictionWindowStatus(startTime, endTime, tournament.settled_at));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime, tournament.settled_at]);
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusColor = (status: Tournament['status']) => {
    switch (status) {
      case 'live':
        return 'bg-destructive text-destructive-foreground border-destructive uppercase tracking-wider text-[10px] font-bold';
      case 'upcoming':
        return 'bg-primary/15 text-primary border-primary/40 uppercase tracking-wider text-[10px] font-bold';
      case 'finished':
        return 'bg-secondary text-muted-foreground border-border uppercase tracking-wider text-[10px] font-bold';
    }
  };

  return (
    <Card 
      className="relative overflow-hidden p-4 cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] bg-gradient-card border-border hover:border-foreground/20 active:scale-[0.98] rounded-hero"
      onClick={() => navigate(`/tournaments/${tournament.id}`)}
    >
      {/* Subtle accent bar */}
      {tournament.status === 'live' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-destructive" />
      )}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-display text-2xl uppercase leading-none mb-2 text-foreground">{tournament.name}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5" />
            <span>{tournament.location}</span>
          </div>
        </div>
        <Badge className={getStatusColor(tournament.status)}>
          {tournament.status === 'live' && (<><span className="live-dot mr-1">●</span> LIVE</>)}
          {tournament.status === 'upcoming' && 'Upcoming'}
          {tournament.status === 'finished' && 'Finished'}
        </Badge>
      </div>
      
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-condensed font-semibold uppercase tracking-wider">
        <Calendar className="w-3.5 h-3.5" />
        <span>
          {formatDate(startTime)} - {formatDate(endTime)}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        {tournament.disciplines.map((disc) => (
          <Badge 
            key={disc} 
            variant="outline" 
            className="text-[10px] uppercase tracking-wider font-bold cursor-pointer hover:bg-primary/10 hover:border-primary/40 border-border"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/tournaments/${tournament.id}?discipline=${disc}`);
            }}
          >
            {disc}
          </Badge>
        ))}
      </div>

      {/* Prediction Window Status */}
      <div className="mt-4 pt-3 border-t border-border">
        {(() => {
          const getStatusDisplay = () => {
            if (predictionWindow.status === 'finished') {
              return { badge: 'SETTLED', color: 'text-muted-foreground', bgColor: 'bg-muted/50' };
            }
            if (predictionWindow.status === 'locked') {
              return { badge: '🔒 LOCKED', color: 'text-destructive', bgColor: 'bg-destructive/10' };
            }
            if (predictionWindow.status === 'preview') {
              return { badge: 'PREVIEW', color: 'text-primary', bgColor: 'bg-primary/10' };
            }
            if (predictionWindow.canPredict) {
              return { badge: '✓ OPEN', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-500/10' };
            }
            return { badge: 'UNAVAILABLE', color: 'text-muted-foreground', bgColor: 'bg-muted/50' };
          };
          const status = getStatusDisplay();
          return (
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${status.bgColor}`}>
                <Clock className="w-3.5 h-3.5" />
                <span className={`text-xs font-bold uppercase tracking-wide ${status.color}`}>
                  {status.badge}
                </span>
              </div>
              <span className="text-xs text-muted-foreground flex-1">
                {predictionWindow.message}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Info className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-center">
                    <p className="text-xs">Predictions are open now and lock when the tournament starts.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })()}
      </div>
    </Card>
  );
};
