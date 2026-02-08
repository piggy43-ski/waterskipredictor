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
        return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'upcoming':
        return 'bg-primary/20 text-primary border-primary/30';
      case 'finished':
        return 'bg-muted/20 text-muted-foreground border-muted/30';
    }
  };

  return (
    <Card 
      className="p-4 cursor-pointer hover:shadow-glow transition-all duration-300 bg-gradient-card border-border/50"
      onClick={() => navigate(`/tournaments/${tournament.id}`)}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1">{tournament.name}</h3>
          <p className="text-xs text-muted-foreground mb-1">Make a skill-based prediction. Rewards only.</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            <span>{tournament.location}</span>
          </div>
        </div>
        <Badge className={getStatusColor(tournament.status)}>
          {tournament.status === 'live' && '● LIVE'}
          {tournament.status === 'upcoming' && 'Upcoming'}
          {tournament.status === 'finished' && 'Finished'}
        </Badge>
      </div>
      
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="w-3.5 h-3.5" />
        <span>
          {formatDate(startTime)} - {formatDate(endTime)}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        {tournament.disciplines.map((disc) => (
          <Badge key={disc} variant="outline" className="text-xs capitalize">
            {disc}
          </Badge>
        ))}
      </div>

      {/* Prediction Window Status */}
      <div className="mt-4 pt-3 border-t border-border/50">
        {(() => {
          const getStatusDisplay = () => {
            if (predictionWindow.status === 'finished') {
              return { badge: 'SETTLED', color: 'text-muted-foreground', bgColor: 'bg-muted/50' };
            }
            if (predictionWindow.status === 'closed') {
              return { badge: '🔒 LOCKED', color: 'text-destructive', bgColor: 'bg-destructive/10' };
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
