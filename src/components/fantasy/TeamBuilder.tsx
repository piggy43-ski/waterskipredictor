import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Search, User, Trophy } from 'lucide-react';
import { FANTASY_ROSTER_LIMITS_BY_GENDER } from '@/utils/fantasyConfig';
import { getFlagEmoji } from '@/utils/countryFlag';

interface Athlete {
  id: string;
  name: string;
  country: string;
  country_code: string | null;
  gender: string;
  disciplines: string[];
  fantasy_price_slalom: number | null;
  fantasy_price_trick: number | null;
  fantasy_price_jump: number | null;
  current_rank_slalom: number | null;
  current_rank_trick: number | null;
  current_rank_jump: number | null;
  current_rating_slalom: number | null;
  current_rating_trick: number | null;
  current_rating_jump: number | null;
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

type GenderKey = 'men' | 'women';

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
  const [activeGender, setActiveGender] = useState<'men' | 'women'>('men');

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

  const getRating = (athlete: Athlete, discipline: 'slalom' | 'trick' | 'jump'): number | null => {
    switch (discipline) {
      case 'slalom': return athlete.current_rating_slalom;
      case 'trick': return athlete.current_rating_trick;
      case 'jump': return athlete.current_rating_jump;
    }
  };

  const getRatingBadgeVariant = (rating: number | null): "default" | "secondary" | "outline" | "destructive" => {
    if (!rating) return "outline";
    if (rating >= 95) return "default"; // Elite - primary color
    if (rating >= 85) return "secondary"; // Strong
    return "outline"; // Average/budget
  };

  const getRatingColor = (rating: number | null): string => {
    if (!rating) return "text-muted-foreground";
    if (rating >= 95) return "text-green-500";
    if (rating >= 90) return "text-emerald-400";
    if (rating >= 85) return "text-yellow-500";
    if (rating >= 80) return "text-orange-400";
    return "text-muted-foreground";
  };

  const normalizeGender = (gender: string): GenderKey => {
    const g = gender.toLowerCase();
    if (g === 'male' || g === 'm' || g === 'men') return 'men';
    return 'women';
  };

  const filteredAthletes = athletes
    .filter(a => a.disciplines.includes(activeDiscipline))
    .filter(a => normalizeGender(a.gender) === activeGender)
    .filter(a => 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.country.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const rankA = getRank(a, activeDiscipline) || 999;
      const rankB = getRank(b, activeDiscipline) || 999;
      return rankA - rankB;
    });

  // Get roster counts by discipline and gender
  const getRosterCount = (discipline: 'slalom' | 'trick' | 'jump', gender: GenderKey) => {
    return roster.filter(r => 
      r.discipline === discipline && 
      normalizeGender(r.athlete.gender) === gender
    ).length;
  };

  const rosterByDisciplineAndGender = roster.filter(
    r => r.discipline === activeDiscipline && normalizeGender(r.athlete.gender) === activeGender
  );
  const rosterLimit = FANTASY_ROSTER_LIMITS_BY_GENDER[activeDiscipline][activeGender];

  const isInRoster = (athleteId: string, discipline: string) => 
    roster.some(r => r.athlete.id === athleteId && r.discipline === discipline);

  // Calculate total required and selected
  const getTotalRequired = () => {
    let total = 0;
    disciplines.forEach(d => {
      total += FANTASY_ROSTER_LIMITS_BY_GENDER[d].men + FANTASY_ROSTER_LIMITS_BY_GENDER[d].women;
    });
    return total;
  };

  const isRosterComplete = () => {
    for (const disc of disciplines) {
      const menCount = getRosterCount(disc, 'men');
      const womenCount = getRosterCount(disc, 'women');
      if (menCount < FANTASY_ROSTER_LIMITS_BY_GENDER[disc].men) return false;
      if (womenCount < FANTASY_ROSTER_LIMITS_BY_GENDER[disc].women) return false;
    }
    return true;
  };

  return (
    <div className="space-y-4">
      {/* Current Roster */}
      <Card className="p-4">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          Your Roster ({roster.length}/{getTotalRequired()})
          {isRosterComplete() && (
            <Badge variant="default" className="ml-2 bg-green-600">Complete</Badge>
          )}
        </h3>
        
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Select athletes from below to build your team
          </p>
        ) : (
          <div className="space-y-3">
            {disciplines.map(disc => {
              const menRoster = roster.filter(r => r.discipline === disc && normalizeGender(r.athlete.gender) === 'men');
              const womenRoster = roster.filter(r => r.discipline === disc && normalizeGender(r.athlete.gender) === 'women');
              
              if (menRoster.length === 0 && womenRoster.length === 0) return null;
              
              return (
                <div key={disc}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 border-b pb-1">
                    {disc}
                  </p>
                  
                  {/* Men */}
                  {menRoster.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-blue-500 font-medium mb-1">
                        Men ({menRoster.length}/{FANTASY_ROSTER_LIMITS_BY_GENDER[disc].men})
                      </p>
                      <div className="space-y-1">
                        {menRoster.map(r => (
                          <div 
                            key={`${r.athlete.id}-${r.discipline}`}
                            className="flex items-center justify-between p-2 bg-blue-500/10 rounded-lg"
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
                  )}
                  
                  {/* Women */}
                  {womenRoster.length > 0 && (
                    <div>
                      <p className="text-xs text-pink-500 font-medium mb-1">
                        Women ({womenRoster.length}/{FANTASY_ROSTER_LIMITS_BY_GENDER[disc].women})
                      </p>
                      <div className="space-y-1">
                        {womenRoster.map(r => (
                          <div 
                            key={`${r.athlete.id}-${r.discipline}`}
                            className="flex items-center justify-between p-2 bg-pink-500/10 rounded-lg"
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
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* Requirements Summary */}
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-2">Required Roster:</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {disciplines.map(disc => (
              <div key={disc} className="space-y-1">
                <p className="font-medium capitalize">{disc}</p>
                <p className={getRosterCount(disc, 'men') >= FANTASY_ROSTER_LIMITS_BY_GENDER[disc].men ? 'text-green-500' : 'text-muted-foreground'}>
                  Men: {getRosterCount(disc, 'men')}/{FANTASY_ROSTER_LIMITS_BY_GENDER[disc].men}
                </p>
                <p className={getRosterCount(disc, 'women') >= FANTASY_ROSTER_LIMITS_BY_GENDER[disc].women ? 'text-green-500' : 'text-muted-foreground'}>
                  Women: {getRosterCount(disc, 'women')}/{FANTASY_ROSTER_LIMITS_BY_GENDER[disc].women}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Gender Tabs */}
      <Tabs value={activeGender} onValueChange={(v) => setActiveGender(v as 'men' | 'women')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="men" className="flex items-center gap-2">
            Men
            <Badge variant="secondary" className="text-xs">
              {roster.filter(r => normalizeGender(r.athlete.gender) === 'men').length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="women" className="flex items-center gap-2">
            Women
            <Badge variant="secondary" className="text-xs">
              {roster.filter(r => normalizeGender(r.athlete.gender) === 'women').length}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Discipline Tabs */}
      <Tabs value={activeDiscipline} onValueChange={(v) => setActiveDiscipline(v as typeof activeDiscipline)}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${disciplines.length}, 1fr)` }}>
          {disciplines.map(disc => (
            <TabsTrigger key={disc} value={disc} className="capitalize">
              {disc}
              <Badge variant="secondary" className="ml-1 text-xs">
                {getRosterCount(disc, activeGender)}/{FANTASY_ROSTER_LIMITS_BY_GENDER[disc][activeGender]}
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
                placeholder={`Search ${activeGender} athletes...`}
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
                  const rosterFull = rosterByDisciplineAndGender.length >= rosterLimit;

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
                          {/* Rating Badge */}
                          {(() => {
                            const rating = getRating(athlete, disc as 'slalom' | 'trick' | 'jump');
                            return rating ? (
                              <Badge 
                                variant="outline" 
                                className={`text-xs font-bold ${getRatingColor(rating)} border-current`}
                              >
                                {rating}
                              </Badge>
                            ) : null;
                          })()}
                          
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
                  <div className="text-center py-8 space-y-2">
                    {athletes.length === 0 ? (
                      <>
                        <p className="text-muted-foreground font-medium">
                          No athletes available for this league
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Athletes haven't been entered for this tournament yet. 
                          Check back closer to the event or choose a different league.
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        No {activeGender} athletes found for {activeDiscipline}
                        {searchQuery && ` matching "${searchQuery}"`}
                      </p>
                    )}
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
