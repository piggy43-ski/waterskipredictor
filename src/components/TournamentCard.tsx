import { Tournament } from '@/types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getBettingWindowStatus } from '@/utils/bettingWindows';
import { useState, useEffect } from 'react';

interface TournamentCardProps {
  tournament: Tournament;
}

export const TournamentCard = ({ tournament }: TournamentCardProps) => {
  const navigate = useNavigate();
  const startTime = tournament.start_datetime || tournament.start_date;
  const endTime = tournament.end_datetime || tournament.end_date;
  
  const [bettingWindow, setBettingWindow] = useState(getBettingWindowStatus(startTime, endTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setBettingWindow(getBettingWindowStatus(startTime, endTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime]);
  
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
          {formatDate(tournament.start_date)} - {formatDate(tournament.end_date)}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        {tournament.disciplines.map((disc) => (
          <Badge key={disc} variant="outline" className="text-xs capitalize">
            {disc}
          </Badge>
        ))}
      </div>

      {/* Betting Window Status */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className={`text-sm font-medium ${
            bettingWindow.canBet 
              ? 'text-primary' 
              : bettingWindow.status === 'upcoming' 
                ? 'text-muted-foreground' 
                : 'text-destructive'
          }`}>
            {bettingWindow.message}
          </span>
        </div>
      </div>
    </Card>
  );
};
