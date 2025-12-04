import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SettlementConfirmDialog } from '@/components/SettlementConfirmDialog';
import { AlertCircle, CheckCircle, TrendingUp, Users, Coins, Trophy, Search } from 'lucide-react';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { compareScores, isValidSlalomScore, normalizeSlalomScore } from '@/utils/waterskiScoring';
import type { Discipline, Category } from '@/types';

type ResultEntry = {
  athlete_id: string;
  position?: number; // Auto-calculated from score
  score: string;
};

type DisciplineResults = {
  [gender: string]: ResultEntry[];
};

type SettlementPreview = {
  market_id: string;
  market_name: string;
  market_type: string;
  discipline: Discipline;
  category: Category;
  winning_selection_ids: string[];
  winning_athlete_names: string[];
  total_wagered: number;
  total_payout: number;
  affected_predictions: number;
};

export default function TournamentSettlement() {
  const [selectedTournament, setSelectedTournament] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>('slalom');
  const [athleteSearch, setAthleteSearch] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<Discipline, DisciplineResults>>({
    slalom: { male: [], female: [] },
    trick: { male: [], female: [] },
    jump: { male: [], female: [] },
  });
  const [settlementPreviews, setSettlementPreviews] = useState<SettlementPreview[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournaments } = useQuery({
    queryKey: ['settlement-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_datetime', { ascending: false, nullsFirst: false });
      
      if (error) throw error;
      return data.map(applyDynamicStatus).filter(t => t.status === 'finished');
    },
  });

  const { data: tournamentData } = useQuery({
    queryKey: ['tournament-settlement-data', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) return null;

      // Fetch tournament with entries
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*, tournament_entries(*, athlete:athletes(*))')
        .eq('id', selectedTournament);

      if (tournamentError) throw tournamentError;

      // Fetch existing results
      const { data: existingResults, error: resultsError } = await supabase
        .from('athlete_results')
        .select('*, athlete:athletes(name)')
        .eq('tournament_id', selectedTournament);

      if (resultsError) throw resultsError;

      // Fetch markets and selections
      const { data: markets, error: marketsError } = await supabase
        .from('markets')
        .select('*, selections(*, athlete:athletes(name))')
        .eq('tournament_id', selectedTournament);

      if (marketsError) throw marketsError;

      // Pre-populate results from existing data
      if (existingResults && existingResults.length > 0) {
        const newResults: Record<Discipline, DisciplineResults> = {
          slalom: { male: [], female: [] },
          trick: { male: [], female: [] },
          jump: { male: [], female: [] },
        };

          for (const result of existingResults) {
          const discipline = result.discipline as Discipline;
          const genderKey = result.gender === 'male' ? 'male' : 'female';
          
          newResults[discipline][genderKey].push({
            athlete_id: result.athlete_id,
            score: result.score_raw?.toString() || '',
            // Position will be auto-calculated
          });
        }

        setResults(newResults);
      }

      return { tournament: tournament[0], existingResults, markets };
    },
    enabled: !!selectedTournament,
  });

  // Get filtered athletes for a specific discipline and gender
  const getFilteredAthletes = (discipline: Discipline, gender: 'male' | 'female') => {
    if (!tournamentData?.tournament?.tournament_entries) return [];
    
    const genderValue = gender === 'male' ? 'male' : 'female';
    const searchKey = `${discipline}-${gender}`;
    const searchTerm = athleteSearch[searchKey]?.toLowerCase() || '';
    
    return tournamentData.tournament.tournament_entries
      .filter((entry: any) => 
        entry.discipline === discipline &&
        entry.athlete?.gender === genderValue &&
        (!searchTerm || entry.athlete?.name?.toLowerCase().includes(searchTerm))
      )
      .map((entry: any) => entry.athlete)
      .filter(Boolean);
  };

  // Auto-calculate positions based on scores
  const calculatePositions = (discipline: Discipline, gender: string, entries: ResultEntry[]): ResultEntry[] => {
    // Filter entries with valid scores
    const validEntries = entries.filter(e => e.athlete_id && e.score);
    const invalidEntries = entries.filter(e => !e.athlete_id || !e.score);

    // Sort by score (highest to lowest)
    const sorted = [...validEntries].sort((a, b) => 
      compareScores(b.score, a.score, discipline)
    );

    // Assign positions
    const withPositions = sorted.map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));

    return [...withPositions, ...invalidEntries];
  };

  const addResultRow = (discipline: Discipline, gender: string) => {
    setResults(prev => ({
      ...prev,
      [discipline]: {
        ...prev[discipline],
        [gender]: [...prev[discipline][gender], { athlete_id: '', score: '' }],
      },
    }));
  };

  const updateResultRow = (
    discipline: Discipline,
    gender: string,
    index: number,
    field: keyof ResultEntry,
    value: string | number
  ) => {
    setResults(prev => {
      const updated = [...prev[discipline][gender]];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-calculate positions after update
      const withPositions = calculatePositions(discipline, gender, updated);
      
      return {
        ...prev,
        [discipline]: {
          ...prev[discipline],
          [gender]: withPositions,
        },
      };
    });
  };

  const removeResultRow = (discipline: Discipline, gender: string, index: number) => {
    setResults(prev => ({
      ...prev,
      [discipline]: {
        ...prev[discipline],
        [gender]: prev[discipline][gender].filter((_, i) => i !== index),
      },
    }));
  };

  const validateResults = (): boolean => {
    let hasErrors = false;

      for (const [discipline, genderData] of Object.entries(results)) {
      for (const [gender, entries] of Object.entries(genderData)) {
        for (const entry of entries) {
          if (entry.athlete_id && entry.score) {
            // Validate slalom scores
            if (discipline === 'slalom' && !isValidSlalomScore(entry.score)) {
              toast({
                title: 'Invalid slalom score',
                description: `Score "${entry.score}" is not valid. Use format: buoy@rope (e.g., 2@43, 3.5@41)`,
                variant: 'destructive',
              });
              hasErrors = true;
            }
          }
        }
      }
    }

    return !hasErrors;
  };

  const calculateSettlementPreview = async () => {
    if (!selectedTournament || !tournamentData?.markets) {
      toast({ title: 'Please select a tournament and enter results', variant: 'destructive' });
      return;
    }

    if (!validateResults()) return;

    const previews: SettlementPreview[] = [];

    for (const market of tournamentData.markets) {
      const discipline = market.discipline as Discipline;
      const genderKey = market.category.includes('men') ? 'male' : 'female';
      const disciplineResults = results[discipline]?.[genderKey] || [];

      if (disciplineResults.length === 0) continue;

      // Filter valid results (position is auto-calculated, so we only check for athlete and score)
      const validResults = disciplineResults.filter(r => r.athlete_id && r.score);

      let winningSelectionIds: string[] = [];
      let winningAthleteNames: string[] = [];

      // Determine winners based on market type
      if (market.market_type === 'WINNER') {
        // Find athlete in position 1
        const winner = validResults.find(r => r.position === 1);
        if (winner) {
          const selection = market.selections?.find(s => s.athlete_id === winner.athlete_id);
          if (selection) {
            winningSelectionIds = [selection.id];
            winningAthleteNames = [selection.athlete?.name || ''];
          }
        }
      } else if (market.market_type === 'PODIUM') {
        // Find athletes in positions 1, 2, 3
        const podiumFinishers = validResults.filter(r => r.position >= 1 && r.position <= 3);
        for (const finisher of podiumFinishers) {
          const selection = market.selections?.find(s => s.athlete_id === finisher.athlete_id);
          if (selection) {
            winningSelectionIds.push(selection.id);
            winningAthleteNames.push(selection.athlete?.name || '');
          }
        }
      } else if (market.market_type === 'HIGHEST_SCORE') {
        // Sort by score using discipline-specific comparison
        const sortedByScore = [...validResults].sort((a, b) => 
          compareScores(b.score, a.score, discipline)
        );
        
        if (sortedByScore.length > 0) {
          const highestScorer = sortedByScore[0];
          const selection = market.selections?.find(s => s.athlete_id === highestScorer.athlete_id);
          if (selection) {
            winningSelectionIds = [selection.id];
            winningAthleteNames = [selection.athlete?.name || ''];
          }
        }
      }

      // Fetch predictions to calculate totals
      const { data: predictions } = await supabase
        .from('predictions')
        .select('selection_id, staked_tokens, potential_payout')
        .eq('status', 'PENDING')
        .in('selection_id', market.selections?.map(s => s.id) || []);

      const totalWagered = predictions?.reduce((sum, p) => sum + p.staked_tokens, 0) || 0;
      const totalPayout = predictions
        ?.filter(p => winningSelectionIds.includes(p.selection_id))
        .reduce((sum, p) => sum + p.potential_payout, 0) || 0;

      previews.push({
        market_id: market.id,
        market_name: market.name,
        market_type: market.market_type,
        discipline: market.discipline as Discipline,
        category: market.category as Category,
        winning_selection_ids: winningSelectionIds,
        winning_athlete_names: winningAthleteNames,
        total_wagered: totalWagered,
        total_payout: totalPayout,
        affected_predictions: predictions?.length || 0,
      });
    }

    setSettlementPreviews(previews);
  };

  const saveResultsMutation = useMutation({
    mutationFn: async () => {
      const allResults: any[] = [];

      for (const [discipline, genderData] of Object.entries(results)) {
        for (const [gender, entries] of Object.entries(genderData)) {
          for (const entry of entries) {
            if (entry.athlete_id && entry.score) {
              // Normalize slalom scores
              const score = discipline === 'slalom'
                ? normalizeSlalomScore(entry.score)
                : entry.score;

              allResults.push({
                tournament_id: selectedTournament,
                athlete_id: entry.athlete_id,
                discipline,
                gender,
                position: entry.position || 0, // Use auto-calculated position
                score_raw: score,
              });
            }
          }
        }
      }

      // Delete existing results for this tournament first
      await supabase
        .from('athlete_results')
        .delete()
        .eq('tournament_id', selectedTournament);

      // Insert new results
      const { error } = await supabase.from('athlete_results').insert(allResults);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      toast({ title: 'Results saved successfully' });
      calculateSettlementPreview();
      
      // Auto-trigger fantasy scoring
      try {
        console.log('Triggering fantasy scoring for tournament:', selectedTournament);
        const { data, error } = await supabase.functions.invoke('score-fantasy', {
          body: { tournament_id: selectedTournament }
        });
        
        if (error) {
          console.error('Fantasy scoring error:', error);
          toast({ 
            title: 'Fantasy scoring failed', 
            description: error.message,
            variant: 'destructive' 
          });
        } else {
          console.log('Fantasy scoring result:', data);
          toast({ 
            title: 'Fantasy scores updated',
            description: `Scored ${data?.entries_scored || 0} entries with ${data?.scoring_events || 0} events`
          });
        }
      } catch (err) {
        console.error('Error invoking score-fantasy:', err);
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving results', description: error.message, variant: 'destructive' });
    },
  });

  const settleMutation = useMutation({
    mutationFn: async () => {
      // Build settlement payload
      const selections = settlementPreviews
        .flatMap(preview => 
          preview.winning_selection_ids.map(id => ({
            selection_id: id,
            result: 'won' as const,
          }))
        )
        .filter(s => s.selection_id);

      // Mark all other selections as lost
      const allSelections = tournamentData?.markets.flatMap(m => m.selections || []) || [];
      const winningIds = selections.map(s => s.selection_id);
      const losingSelections = allSelections
        .filter(s => !winningIds.includes(s.id))
        .map(s => ({ selection_id: s.id, result: 'lost' as const }));

      const allSettlements = [...selections, ...losingSelections];

      const response = await supabase.functions.invoke('settle-predictions', {
        body: { selections: allSettlements },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      queryClient.invalidateQueries({ queryKey: ['settlement-tournaments'] });
      
      // Show detailed results
      console.log('Settlement results:', data);
      
      if (data.settled_predictions === 0 && data.debug_info) {
        toast({
          title: 'Settlement completed with issues',
          description: `Found ${data.debug_info.predictions_found} predictions but settled 0. Check console for details.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Settlement completed successfully',
          description: `Settled ${data.settled_predictions} predictions, paid out ${data.total_payout.toLocaleString()} tokens to ${data.affected_users} users`,
        });
      }
      
      // Auto-settle fantasy pots linked to this tournament
      try {
        // Find fantasy pots linked to this tournament
        const { data: fantasyPots, error: potsError } = await supabase
          .from('fantasy_pots')
          .select('id, name, status')
          .eq('status', 'open')
          .or(`tournament_id.eq.${selectedTournament},season_tournaments.cs.{${selectedTournament}}`);
        
        if (potsError) {
          console.error('Error finding fantasy pots:', potsError);
        } else if (fantasyPots && fantasyPots.length > 0) {
          console.log(`Found ${fantasyPots.length} fantasy pots to settle`);
          
          for (const pot of fantasyPots) {
            console.log(`Settling fantasy pot: ${pot.name} (${pot.id})`);
            const { data: settleData, error: settleError } = await supabase.functions.invoke('settle-fantasy-pot', {
              body: { pot_id: pot.id }
            });
            
            if (settleError) {
              console.error(`Error settling pot ${pot.id}:`, settleError);
              toast({
                title: `Fantasy pot "${pot.name}" settlement failed`,
                description: settleError.message,
                variant: 'destructive'
              });
            } else {
              console.log(`Pot ${pot.id} settled:`, settleData);
              toast({
                title: `Fantasy pot "${pot.name}" settled`,
                description: `Prize pool: ${settleData?.net_prize_pool?.toLocaleString() || 0} tokens`
              });
            }
          }
        }
      } catch (err) {
        console.error('Error settling fantasy pots:', err);
      }
      
      setSelectedTournament('');
      setResults({
        slalom: { male: [], female: [] },
        trick: { male: [], female: [] },
        jump: { male: [], female: [] },
      });
      setSettlementPreviews([]);
    },
    onError: (error: Error) => {
      toast({ title: 'Settlement failed', description: error.message, variant: 'destructive' });
    },
  });

  const totalHouseProfit = settlementPreviews.reduce(
    (sum, p) => sum + (p.total_wagered - p.total_payout),
    0
  );

  // Not needed anymore - we'll settle all at once

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Tournament Settlement</h2>
          <p className="text-muted-foreground mt-1">
            Enter results and settle all predictions for a tournament
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Tournament</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTournament} onValueChange={setSelectedTournament}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a finished tournament" />
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

        {selectedTournament && settlementPreviews.length === 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Enter Results by Discipline</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Positions are auto-calculated</strong> - Just enter the athlete and their score. The system will automatically rank them based on their performance.
                  </AlertDescription>
                </Alert>
                <Tabs value={selectedDiscipline} onValueChange={(v) => setSelectedDiscipline(v as Discipline)}>
                  <TabsList className="grid grid-cols-3 w-full">
                    {tournamentData?.tournament?.disciplines.map((discipline: Discipline) => (
                      <TabsTrigger key={discipline} value={discipline} className="capitalize">
                        {discipline}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {tournamentData?.tournament?.disciplines.map((discipline: Discipline) => (
                    <TabsContent key={discipline} value={discipline} className="space-y-6 mt-6">
                      {(['male', 'female'] as const).map((gender) => {
                        const athletes = getFilteredAthletes(discipline, gender);
                        const searchKey = `${discipline}-${gender}`;
                        
                        return (
                          <div key={gender} className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-lg font-semibold">
                                {gender === 'male' ? 'Open Men' : 'Open Women'}
                              </h3>
                              <Button size="sm" onClick={() => addResultRow(discipline, gender)}>
                                Add Result
                              </Button>
                            </div>

                            {athletes.length === 0 && (
                              <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                  No athletes entered for this discipline and gender. Add tournament entries first.
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="space-y-3">
                              {results[discipline]?.[gender]?.map((entry, index) => (
                                <div key={index} className="grid grid-cols-12 gap-3 items-end">
                                  <div className="col-span-5">
                                    <Label>Athlete</Label>
                                    <div className="relative">
                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                      <Select
                                        value={entry.athlete_id}
                                        onValueChange={(v) => updateResultRow(discipline, gender, index, 'athlete_id', v)}
                                      >
                                        <SelectTrigger className="pl-9">
                                          <SelectValue placeholder="Select athlete" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <div className="p-2">
                                            <Input
                                              placeholder="Search athletes..."
                                              value={athleteSearch[searchKey] || ''}
                                              onChange={(e) => setAthleteSearch(prev => ({
                                                ...prev,
                                                [searchKey]: e.target.value
                                              }))}
                                              className="mb-2"
                                            />
                                          </div>
                                          {athletes.map((athlete: any) => (
                                            <SelectItem key={athlete.id} value={athlete.id}>
                                              {athlete.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="col-span-2">
                                    <Label>Position <span className="text-xs text-muted-foreground">(auto)</span></Label>
                                    <div className="h-10 flex items-center justify-center bg-muted rounded-md border border-input">
                                      <Badge variant={entry.position === 1 ? 'default' : entry.position && entry.position <= 3 ? 'secondary' : 'outline'}>
                                        {entry.position ? `#${entry.position}` : '-'}
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="col-span-4">
                                    <Label>
                                      Score 
                                      {discipline === 'slalom' && <span className="text-xs text-muted-foreground ml-1">(e.g., 2@43)</span>}
                                    </Label>
                                    <Input
                                      value={entry.score}
                                      onChange={(e) => updateResultRow(discipline, gender, index, 'score', e.target.value)}
                                      placeholder={
                                        discipline === 'slalom' ? '2@43' : 
                                        discipline === 'trick' ? '10500' : 
                                        '67.2'
                                      }
                                    />
                                  </div>

                                  <div className="col-span-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeResultRow(discipline, gender, index)}
                                    >
                                      ×
                                    </Button>
                                  </div>
                                </div>
                              ))}

                              {results[discipline]?.[gender]?.length === 0 && (
                                <p className="text-sm text-muted-foreground">No results entered yet</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => saveResultsMutation.mutate()} disabled={saveResultsMutation.isPending}>
                {saveResultsMutation.isPending ? 'Saving...' : 'Save Results'}
              </Button>
              <Button onClick={calculateSettlementPreview} disabled={saveResultsMutation.isPending}>
                Preview Settlement
              </Button>
            </div>
          </>
        )}

        {settlementPreviews.length > 0 && (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Review settlement details below. Once confirmed, all predictions will be settled and payouts processed.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Settlement Summary</span>
                  <div className="flex gap-4 text-sm font-normal">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      <span>Wagered: {settlementPreviews.reduce((s, p) => s + p.total_wagered, 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      <span>Payout: {settlementPreviews.reduce((s, p) => s + p.total_payout, 0).toLocaleString()}</span>
                    </div>
                    <div className={`flex items-center gap-2 ${totalHouseProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      <Trophy className="w-4 h-4" />
                      <span>House: {totalHouseProfit >= 0 ? '+' : ''}{totalHouseProfit.toLocaleString()}</span>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {settlementPreviews.map((preview) => (
                  <div key={preview.market_id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{preview.market_name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="capitalize">{preview.discipline}</Badge>
                          <Badge variant="outline">{preview.market_type.replace('_', ' ')}</Badge>
                        </div>
                      </div>
                      {preview.winning_athlete_names.length > 0 ? (
                        <Badge className="bg-success text-success-foreground">
                          Winners: {preview.winning_athlete_names.join(', ')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No Winner</Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-3 border-t">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <Users className="w-4 h-4" />
                          <span className="text-xs">Predictions</span>
                        </div>
                        <p className="text-lg font-bold">{preview.affected_predictions}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <Coins className="w-4 h-4" />
                          <span className="text-xs">Wagered</span>
                        </div>
                        <p className="text-lg font-bold">{preview.total_wagered.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-success mb-1">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs">Payout</span>
                        </div>
                        <p className="text-lg font-bold text-success">{preview.total_payout.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSettlementPreviews([])}>
                Back to Results
              </Button>
              <Button 
                onClick={() => settleMutation.mutate()} 
                disabled={settleMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {settleMutation.isPending ? 'Processing...' : 'Confirm & Settle All Markets'}
              </Button>
            </div>
          </>
        )}
      </div>

    </AdminLayout>
  );
}
