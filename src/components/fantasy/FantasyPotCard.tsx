import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Coins, Trophy, Calendar, Lock } from 'lucide-react';

interface FantasyPot {
  id: string;
  name: string;
  pot_type: string;
  tournament_id: string | null;
  entry_fee_tokens: number;
  status: string;
  visibility: string;
  max_entrants: number | null;
  discipline_scope: string[];
  payout_structure: string;
  created_at: string;
  tournament?: {
    name: string;
    location: string;
    start_date: string;
  };
  entrant_count?: number;
}

interface FantasyPotCardProps {
  pot: FantasyPot;
  onJoin: () => void;
  walletBalance: number;
}

export const FantasyPotCard = ({ pot, onJoin, walletBalance }: FantasyPotCardProps) => {
  const canAfford = walletBalance >= pot.entry_fee_tokens;
  const isFull = pot.max_entrants ? (pot.entrant_count || 0) >= pot.max_entrants : false;
  const canJoin = canAfford && !isFull && pot.status === 'open';

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getPayoutLabel = (structure: string) => {
    switch (structure) {
      case 'winner_takes_all': return 'Winner Takes All';
      case 'top_3_split': return 'Top 3 Split';
      case 'top_5_split': return 'Top 5 Split';
      case 'top_10_split': return 'Top 10 Split';
      default: return structure;
    }
  };

  return (
    <Card className="p-4 bg-gradient-card border-border/50 hover:shadow-glow transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg">{pot.name}</h3>
          {pot.tournament && (
            <p className="text-sm text-muted-foreground">
              {pot.tournament.name}
            </p>
          )}
        </div>
        <Badge variant={pot.status === 'open' ? 'default' : 'secondary'}>
          {pot.status === 'open' ? 'Open' : pot.status}
        </Badge>
      </div>

      {/* Tournament Info */}
      {pot.tournament && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Calendar className="w-3.5 h-3.5" />
          <span>{formatDate(pot.tournament.start_date)} • {pot.tournament.location}</span>
        </div>
      )}

      {/* Disciplines */}
      <div className="flex flex-wrap gap-2 mb-4">
        {pot.discipline_scope.map((disc) => (
          <Badge key={disc} variant="outline" className="text-xs capitalize">
            {disc}
          </Badge>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-background/50 rounded-lg">
          <Coins className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">Entry</p>
          <p className="font-bold">{pot.entry_fee_tokens.toLocaleString()}</p>
        </div>
        <div className="text-center p-2 bg-background/50 rounded-lg">
          <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">Entrants</p>
          <p className="font-bold">
            {pot.entrant_count || 0}
            {pot.max_entrants && `/${pot.max_entrants}`}
          </p>
        </div>
        <div className="text-center p-2 bg-background/50 rounded-lg">
          <Trophy className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">Payout</p>
          <p className="font-bold text-xs">{getPayoutLabel(pot.payout_structure)}</p>
        </div>
      </div>

      {/* Prize Pool Estimate */}
      <div className="bg-primary/10 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Est. Prize Pool</span>
          <span className="font-bold text-primary">
            {((pot.entrant_count || 0) * pot.entry_fee_tokens * 0.9).toLocaleString()} tokens
          </span>
        </div>
      </div>

      {/* Join Button */}
      <Button 
        className="w-full" 
        onClick={onJoin}
        disabled={!canJoin}
      >
        {isFull ? (
          <>
            <Lock className="w-4 h-4 mr-2" />
            League Full
          </>
        ) : !canAfford ? (
          <>
            <Coins className="w-4 h-4 mr-2" />
            Insufficient Balance
          </>
        ) : (
          <>
            <Trophy className="w-4 h-4 mr-2" />
            Join League
          </>
        )}
      </Button>
    </Card>
  );
};
