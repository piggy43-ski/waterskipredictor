import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Search, User, Trophy } from 'lucide-react';
import { FANTASY_ROSTER_LIMITS } from '@/utils/fantasyConfig';

interface Athlete {
  id: string;
  name: string;
  country: string;
  country_code: string | null;
  disciplines: string[];
  fantasy_price_slalom: number | null;
  fantasy_price_trick: number | null;
  fantasy_price_jump: number | null;
  current_rank_slalom: number | null;
  current_rank_trick: number | null;
  current_rank_jump: number | null;
}

interface RosterSelection {
  athlete: Athlete;
  discipline: 'slalom' | 'trick' | 'jump';
  price: number;
}

interface TeamBuilderProps {
  athletes: Athlete[];
  roster: RosterSelection[];
  disciplines: ('slalom' | 'trick' | 'jump')[];
  remainingBudget: number;
  onAddAthlete: (athlete: Athlete, discipline: 'slalom' | 'trick' | 'jump') => void;
  onRemoveAthlete: (athleteId: string, discipline: string) => void;
}

export const TeamBuilder = ({
  athletes,
  roster,
  disciplines,
  remainingBudget,
  onAddAthlete,
  onRemoveAthlete
}: TeamBuilderProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDiscipline, setActiveDiscipline] = useState<'slalom' | 'trick' | 'jump'>(disciplines[0]);

  const getPrice = (athlete: Athlete, discipline: 'slalom' | 'trick' | 'jump'): number => {
    switch (discipline) {
      case 'slalom': return athlete.fantasy_price_slalom || 5000;
      case 'trick': return athlete.fantasy_price_trick || 5000;
      case 'jump': return athlete.fantasy_price_jump || 5000;
    }
  };

  const getRank = (athlete: Athlete, discipline: 'slalom' | 'trick' | 'jump'): number | null => {
    switch (discipline) {
      case 'slalom': return athlete.current_rank_slalom;
      case 'trick': return athlete.current_rank_trick;
      case 'jump': return athlete.current_rank_jump;
    }
  };

  const filteredAthletes = athletes
    .filter(a => a.disciplines.includes(activeDiscipline))
    .filter(a => 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.country.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const rankA = getRank(a, activeDiscipline) || 999;
      const rankB = getRank(b, activeDiscipline) || 999;
      return rankA - rankB;
    });

  const rosterByDiscipline = roster.filter(r => r.discipline === activeDiscipline);
  const rosterLimit = FANTASY_ROSTER_LIMITS[activeDiscipline];

  const isInRoster = (athleteId: string, discipline: string) => 
    roster.some(r => r.athlete.id === athleteId && r.discipline === discipline);

  return (
    <div className="space-y-4">
      {/* Current Roster */}
      <Card className="p-4">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          Your Roster ({roster.length})
        </h3>
        
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Select athletes from below to build your team
          </p>
        ) : (
          <div className="space-y-2">
            {disciplines.map(disc => {
              const discRoster = roster.filter(r => r.discipline === disc);
              if (discRoster.length === 0) return null;
              
              return (
                <div key={disc}>
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    {disc} ({discRoster.length}/{FANTASY_ROSTER_LIMITS[disc]})
                  </p>
                  <div className="space-y-1">
                    {discRoster.map(r => (
                      <div 
                        key={`${r.athlete.id}-${r.discipline}`}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{r.athlete.country_code ? getFlagEmoji(r.athlete.country_code) : '🏳️'}</span>
                          <span className="font-medium text-sm">{r.athlete.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {r.price.toLocaleString()}
                          </span>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6"
                            onClick={() => onRemoveAthlete(r.athlete.id, r.discipline)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Discipline Tabs */}
      <Tabs value={activeDiscipline} onValueChange={(v) => setActiveDiscipline(v as typeof activeDiscipline)}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${disciplines.length}, 1fr)` }}>
          {disciplines.map(disc => (
            <TabsTrigger key={disc} value={disc} className="capitalize">
              {disc}
              <Badge variant="secondary" className="ml-1 text-xs">
                {roster.filter(r => r.discipline === disc).length}/{FANTASY_ROSTER_LIMITS[disc]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {disciplines.map(disc => (
          <TabsContent key={disc} value={disc} className="mt-4">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search athletes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Athletes List */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredAthletes.map(athlete => {
                  const price = getPrice(athlete, disc as 'slalom' | 'trick' | 'jump');
                  const rank = getRank(athlete, disc as 'slalom' | 'trick' | 'jump');
                  const inRoster = isInRoster(athlete.id, disc);
                  const canAfford = price <= remainingBudget;
                  const rosterFull = rosterByDiscipline.length >= rosterLimit;

                  return (
                    <Card 
                      key={athlete.id}
                      className={`p-3 ${inRoster ? 'bg-primary/10 border-primary/30' : 'bg-gradient-card'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                            {athlete.country_code ? (
                              <span className="text-xl">{getFlagEmoji(athlete.country_code)}</span>
                            ) : (
                              <User className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{athlete.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{athlete.country}</span>
                              {rank && (
                                <Badge variant="outline" className="text-xs">
                                  #{rank}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`font-bold ${!canAfford && !inRoster ? 'text-destructive' : ''}`}>
                              {price.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">tokens</p>
                          </div>
                          
                          {inRoster ? (
                            <Button 
                              size="icon" 
                              variant="destructive"
                              className="h-8 w-8"
                              onClick={() => onRemoveAthlete(athlete.id, disc)}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button 
                              size="icon"
                              className="h-8 w-8"
                              disabled={!canAfford || rosterFull}
                              onClick={() => onAddAthlete(athlete, disc as 'slalom' | 'trick' | 'jump')}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {filteredAthletes.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No athletes found
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

// Helper function to convert country code to flag emoji
function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
