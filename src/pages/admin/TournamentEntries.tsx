import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Trash2, Search } from 'lucide-react';
import type { Discipline } from '@/types';
import { decimalToAmerican } from '@/utils/oddsConverter';

export default function TournamentEntries() {
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline | ''>('');
  const [selectedGender, setSelectedGender] = useState<'male' | 'female' | ''>('');
  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [customOdds, setCustomOdds] = useState<Record<string, string>>({});
  const [athleteSearch, setAthleteSearch] = useState('');

  const queryClient = useQueryClient();

  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_date', { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: athletes } = useQuery({
    queryKey: ['athletes-for-tournament', selectedDiscipline, selectedGender, selectedTournamentId],
    queryFn: async () => {
      let query = supabase
        .from('athletes')
        .select('*')
        .contains('disciplines', [selectedDiscipline]);
      
      if (selectedGender) {
        query = query.eq('gender', selectedGender);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Filter out athletes already in this tournament for this discipline
      if (selectedTournamentId && data) {
        const existingEntryIds = entries?.filter(e => e.discipline === selectedDiscipline).map(e => e.athlete_id) || [];
        return data.filter(athlete => !existingEntryIds.includes(athlete.id));
      }
      
      return data;
    },
    enabled: !!selectedDiscipline,
  });

  const { data: entries } = useQuery({
    queryKey: ['tournament-entries', selectedTournamentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_entries')
        .select('*, athlete:athletes(*)')
        .eq('tournament_id', selectedTournamentId);
      if (error) throw error;
      return (data || []);
    },
    enabled: !!selectedTournamentId,
  });

  const calculateDefaultOdds = (athlete: any, discipline: string) => {
    const rankField = `current_rank_${discipline}` as keyof typeof athlete;
    const rank = athlete[rankField] as number | undefined;
    if (!rank) return 2.5;
    return 1.5 + (rank / 10);
  };

  const addEntriesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDiscipline) return;

      const entriesToAdd = Array.from(selectedAthletes).map(athleteId => {
        const athlete = athletes?.find(a => a.id === athleteId);
        const customOddsValue = customOdds[athleteId];
        const calculatedOdds = customOddsValue 
          ? parseFloat(customOddsValue) 
          : calculateDefaultOdds(athlete, selectedDiscipline);

        return {
          tournament_id: selectedTournamentId,
          athlete_id: athleteId,
          discipline: selectedDiscipline,
          custom_odds: calculatedOdds,
        };
      });

      const { error } = await supabase
        .from('tournament_entries')
        .insert(entriesToAdd);
      
      if (error) throw error;

      // Auto-generate markets and selections
      const tournament = tournaments?.find(t => t.id === selectedTournamentId);
      if (!tournament) return;

      const genders = [...new Set(athletes?.filter(a => 
        entriesToAdd.some(e => e.athlete_id === a.id)
      ).map(a => a.gender))];

      for (const gender of genders) {
        const category = gender === 'male' ? 'open_men' : 'open_women';
        
        // Create WINNER market
        const { data: winnerMarket, error: marketError } = await supabase
          .from('markets')
          .insert({
            tournament_id: selectedTournamentId,
            discipline: selectedDiscipline,
            category,
            market_type: 'WINNER',
            name: `${selectedDiscipline} ${category} Winner`,
          })
          .select()
          .single();

        if (marketError) throw marketError;

        // Create PODIUM market
        const { data: podiumMarket, error: podiumError } = await supabase
          .from('markets')
          .insert({
            tournament_id: selectedTournamentId,
            discipline: selectedDiscipline,
            category,
            market_type: 'PODIUM',
            name: `${selectedDiscipline} ${category} Podium`,
          })
          .select()
          .single();

        if (podiumError) throw podiumError;

        // Create HIGHEST_SCORE market
        const { data: scoreMarket, error: scoreError } = await supabase
          .from('markets')
          .insert({
            tournament_id: selectedTournamentId,
            discipline: selectedDiscipline,
            category,
            market_type: 'HIGHEST_SCORE',
            name: `${selectedDiscipline} ${category} Highest Score`,
          })
          .select()
          .single();

        if (scoreError) throw scoreError;

        // Create selections for all markets
        const relevantEntries = entriesToAdd.filter(e => {
          const athlete = athletes?.find(a => a.id === e.athlete_id);
          return athlete?.gender === gender;
        });

        for (const entry of relevantEntries) {
          const athlete = athletes?.find(a => a.id === entry.athlete_id);
          if (!athlete) continue;

          const selections = [
            {
              market_id: winnerMarket.id,
              athlete_id: entry.athlete_id,
              description: `${athlete.name} to win`,
              decimal_odds: entry.custom_odds,
            },
            {
              market_id: podiumMarket.id,
              athlete_id: entry.athlete_id,
              description: `${athlete.name} podium finish`,
              decimal_odds: entry.custom_odds * 0.7,
            },
            {
              market_id: scoreMarket.id,
              athlete_id: entry.athlete_id,
              description: `${athlete.name} highest score`,
              decimal_odds: entry.custom_odds,
            },
          ];

          const { error: selectionsError } = await supabase
            .from('selections')
            .insert(selections);

          if (selectionsError) throw selectionsError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-entries'] });
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['selections'] });
      toast.success('Athletes added and markets created');
      setSelectedAthletes(new Set());
      setCustomOdds({});
    },
    onError: (error: Error) => {
      toast.error(`Failed to add athletes: ${error.message}`);
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase
        .from('tournament_entries')
        .delete()
        .eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-entries'] });
      toast.success('Entry removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove entry: ${error.message}`);
    },
  });

  const handleAddEntries = () => {
    if (!selectedTournamentId || selectedAthletes.size === 0 || !selectedDiscipline) {
      toast.error('Please select tournament, athletes, and discipline');
      return;
    }
    addEntriesMutation.mutate();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Tournament Entries</h1>
          <p className="text-muted-foreground">Add athletes to tournaments and manage entries</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Tournament</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTournamentId} onValueChange={setSelectedTournamentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a tournament" />
              </SelectTrigger>
              <SelectContent>
                {tournaments?.map((tournament) => (
                  <SelectItem key={tournament.id} value={tournament.id}>
                    {tournament.name} - {tournament.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedTournamentId && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Current Entries ({entries?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {entries && entries.length > 0 ? (
                  <div className="space-y-2">
                    {entries.map((entry: any) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{entry.athlete?.name}</span>
                          <Badge variant="outline" className="capitalize">{entry.discipline}</Badge>
                          <div className="text-sm text-muted-foreground">
                            {entry.athlete?.current_rank_slalom && <span className="mr-2">S: {entry.athlete.current_rank_slalom}</span>}
                            {entry.athlete?.current_rank_trick && <span className="mr-2">T: {entry.athlete.current_rank_trick}</span>}
                            {entry.athlete?.current_rank_jump && <span className="mr-2">J: {entry.athlete.current_rank_jump}</span>}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            Odds: {decimalToAmerican(entry.custom_odds || 2.5)}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteEntryMutation.mutate(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No entries yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Athletes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Discipline</Label>
                    <Select value={selectedDiscipline} onValueChange={(v) => setSelectedDiscipline(v as Discipline)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select discipline" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slalom">Slalom</SelectItem>
                        <SelectItem value="trick">Trick</SelectItem>
                        <SelectItem value="jump">Jump</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <Select value={selectedGender} onValueChange={(v) => setSelectedGender(v as 'male' | 'female')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {athletes && athletes.length > 0 && (
                  <>
                    <div>
                      <Label>Search Athletes</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Type to search athletes..."
                          value={athleteSearch}
                          onChange={(e) => setAthleteSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      Showing {athletes.filter((a: any) => 
                        !athleteSearch || a.name.toLowerCase().includes(athleteSearch.toLowerCase())
                      ).length} of {athletes.length} available athletes
                      {entries && entries.filter(e => e.discipline === selectedDiscipline).length > 0 && 
                        ` (${entries.filter(e => e.discipline === selectedDiscipline).length} already entered)`
                      }
                    </div>
                    <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                      {athletes
                        .filter((athlete: any) => 
                          !athleteSearch || athlete.name.toLowerCase().includes(athleteSearch.toLowerCase())
                        )
                        .map((athlete: any) => {
                        const rank = athlete[`current_rank_${selectedDiscipline}`];
                        const oddsValue = customOdds[athlete.id] ? parseFloat(customOdds[athlete.id]) : calculateDefaultOdds(athlete, selectedDiscipline);
                        
                        return (
                          <div key={athlete.id} className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <Checkbox
                                checked={selectedAthletes.has(athlete.id)}
                                onCheckedChange={(checked) => {
                                  const newSelected = new Set(selectedAthletes);
                                  if (checked) {
                                    newSelected.add(athlete.id);
                                  } else {
                                    newSelected.delete(athlete.id);
                                  }
                                  setSelectedAthletes(newSelected);
                                }}
                              />
                              <div className="flex-1">
                                <div className="font-medium">{athlete.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {athlete.country} • Rank: {rank || 'N/A'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder={`Auto: ${decimalToAmerican(oddsValue)}`}
                                  value={customOdds[athlete.id] || ''}
                                  onChange={(e) => setCustomOdds(prev => ({
                                    ...prev,
                                    [athlete.id]: e.target.value
                                  }))}
                                  className="w-24"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <Button
                      onClick={handleAddEntries}
                      disabled={selectedAthletes.size === 0 || addEntriesMutation.isPending}
                      className="w-full"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add {selectedAthletes.size} Athlete{selectedAthletes.size !== 1 ? 's' : ''} & Generate Markets
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
