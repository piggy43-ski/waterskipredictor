import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Selection } from '@/types';
import { Medal } from 'lucide-react';

interface PodiumPositionAssignerProps {
  athletes: Selection[];
  onAssignPositions: (positions: { first: Selection; second: Selection; third: Selection }) => void;
  onCancel: () => void;
}

export const PodiumPositionAssigner = ({ 
  athletes, 
  onAssignPositions, 
  onCancel 
}: PodiumPositionAssignerProps) => {
  const [first, setFirst] = useState<Selection | null>(null);
  const [second, setSecond] = useState<Selection | null>(null);
  const [third, setThird] = useState<Selection | null>(null);

  const handleAthleteClick = (athlete: Selection) => {
    // If athlete is already assigned, remove them
    if (first?.id === athlete.id) {
      setFirst(null);
      return;
    }
    if (second?.id === athlete.id) {
      setSecond(null);
      return;
    }
    if (third?.id === athlete.id) {
      setThird(null);
      return;
    }

    // Assign to first empty position
    if (!first) {
      setFirst(athlete);
    } else if (!second) {
      setSecond(athlete);
    } else if (!third) {
      setThird(athlete);
    }
  };

  const handleClearAll = () => {
    setFirst(null);
    setSecond(null);
    setThird(null);
  };

  const handleConfirm = () => {
    if (first && second && third) {
      onAssignPositions({ first, second, third });
    }
  };

  const isAssigned = (athleteId: string) => {
    return first?.id === athleteId || second?.id === athleteId || third?.id === athleteId;
  };

  const getPosition = (athleteId: string) => {
    if (first?.id === athleteId) return '1st';
    if (second?.id === athleteId) return '2nd';
    if (third?.id === athleteId) return '3rd';
    return null;
  };

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Assign Podium Positions</span>
          <Button variant="ghost" size="sm" onClick={handleClearAll}>
            Clear All
          </Button>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Tap athletes in the order you predict they'll finish (1st, 2nd, 3rd)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Podium Positions Visual */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center">
            <div className={`p-4 rounded-lg border-2 ${first ? 'border-yellow-500 bg-yellow-500/10' : 'border-dashed border-muted'} transition-colors`}>
              <Medal className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
              <div className="font-bold text-sm mb-1">1st Place</div>
              {first ? (
                <div className="text-xs font-medium truncate">{first.athlete.name}</div>
              ) : (
                <div className="text-xs text-muted-foreground">Tap athlete</div>
              )}
            </div>
          </div>
          
          <div className="text-center">
            <div className={`p-4 rounded-lg border-2 ${second ? 'border-gray-400 bg-gray-400/10' : 'border-dashed border-muted'} transition-colors`}>
              <Medal className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <div className="font-bold text-sm mb-1">2nd Place</div>
              {second ? (
                <div className="text-xs font-medium truncate">{second.athlete.name}</div>
              ) : (
                <div className="text-xs text-muted-foreground">Tap athlete</div>
              )}
            </div>
          </div>
          
          <div className="text-center">
            <div className={`p-4 rounded-lg border-2 ${third ? 'border-amber-600 bg-amber-600/10' : 'border-dashed border-muted'} transition-colors`}>
              <Medal className="w-8 h-8 mx-auto mb-2 text-amber-600" />
              <div className="font-bold text-sm mb-1">3rd Place</div>
              {third ? (
                <div className="text-xs font-medium truncate">{third.athlete.name}</div>
              ) : (
                <div className="text-xs text-muted-foreground">Tap athlete</div>
              )}
            </div>
          </div>
        </div>

        {/* Athletes List */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Select Athletes:</h4>
          {athletes.map((athlete) => {
            const position = getPosition(athlete.id);
            const assigned = isAssigned(athlete.id);
            
            return (
              <button
                key={athlete.id}
                onClick={() => handleAthleteClick(athlete)}
                className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                  assigned 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{athlete.athlete.name}</span>
                  {position && (
                    <Badge variant="default" className="ml-2">
                      {position}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!first || !second || !third}
            className="flex-1"
          >
            Continue to Bet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
