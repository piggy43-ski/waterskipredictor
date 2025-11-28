import { useState } from 'react';
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
import { AlertCircle, CheckCircle, TrendingUp, Users, Coins, Trophy } from 'lucide-react';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import type { Discipline, Category } from '@/types';

type ResultEntry = {
  athlete_id: string;
  position: number;
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
  winning_selection_id?: string;
  winning_athlete_name?: string;
  total_wagered: number;
  total_payout: number;
  affected_predictions: number;
};

export default function TournamentSettlement() {
  const [selectedTournament, setSelectedTournament] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>('slalom');
  const [results, setResults] = useState<Record<Discipline, DisciplineResults>>({
    slalom: { male: [], female: [] },
    trick: { male: [], female: [] },
    jump: { male: [], female: [] },
  });
  const [settlementPreviews, setSettlementPreviews] = useState<SettlementPreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournaments } = useQuery({
    queryKey: ['settlement-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_date', { ascending: false });
      
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
        .eq('id', selectedTournament)
        .single();

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

      return { tournament, existingResults, markets };
    },
    enabled: !!selectedTournament,
  });

  const addResultRow = (discipline: Discipline, gender: string) => {
    setResults(prev => ({
      ...prev,
      [discipline]: {
        ...prev[discipline],
        [gender]: [...prev[discipline][gender], { athlete_id: '', position: 0, score: '' }],
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
      return {
        ...prev,
        [discipline]: {
          ...prev[discipline],
          [gender]: updated,
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

  const calculateSettlementPreview = async () => {
    if (!selectedTournament || !tournamentData?.markets) {
      toast({ title: 'Please select a tournament and enter results', variant: 'destructive' });
      return;
    }

    const previews: SettlementPreview[] = [];

    for (const market of tournamentData.markets) {
      const discipline = market.discipline as Discipline;
      const genderKey = market.category.includes('men') ? 'male' : 'female';
      const disciplineResults = results[discipline]?.[genderKey] || [];

      if (disciplineResults.length === 0) continue;

      // Sort by position
      const sortedResults = [...disciplineResults]
        .filter(r => r.athlete_id && r.position > 0)
        .sort((a, b) => a.position - b.position);

      let winningSelectionId: string | undefined;
      let winningAthleteName: string | undefined;

      // Determine winner based on market type
      if (market.market_type === 'WINNER' && sortedResults.length > 0) {
        const winner = sortedResults[0];
        const selection = market.selections?.find(s => s.athlete_id === winner.athlete_id);
        if (selection) {
          winningSelectionId = selection.id;
          winningAthleteName = selection.athlete?.name;
        }
      } else if (market.market_type === 'HIGHEST_SCORE' && sortedResults.length > 0) {
        // Find athlete with highest score (assuming score is numeric for now)
        const highestScorer = sortedResults.reduce((max, curr) => {
          const currScore = parseFloat(curr.score) || 0;
          const maxScore = parseFloat(max.score) || 0;
          return currScore > maxScore ? curr : max;
        }, sortedResults[0]);
        
        const selection = market.selections?.find(s => s.athlete_id === highestScorer.athlete_id);
        if (selection) {
          winningSelectionId = selection.id;
          winningAthleteName = selection.athlete?.name;
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
        ?.filter(p => p.selection_id === winningSelectionId)
        .reduce((sum, p) => sum + p.potential_payout, 0) || 0;

      previews.push({
        market_id: market.id,
        market_name: market.name,
        market_type: market.market_type,
        discipline: market.discipline as Discipline,
        category: market.category as Category,
        winning_selection_id: winningSelectionId,
        winning_athlete_name: winningAthleteName,
        total_wagered: totalWagered,
        total_payout: totalPayout,
        affected_predictions: predictions?.length || 0,
      });
    }

    setSettlementPreviews(previews);
    setShowPreview(true);
  };

  const saveResultsMutation = useMutation({
    mutationFn: async () => {
      const allResults: any[] = [];

      for (const [discipline, genderData] of Object.entries(results)) {
        for (const [gender, entries] of Object.entries(genderData)) {
          for (const entry of entries) {
            if (entry.athlete_id && entry.position > 0) {
              allResults.push({
                tournament_id: selectedTournament,
                athlete_id: entry.athlete_id,
                discipline,
                gender,
                position: entry.position,
                score_raw: parseFloat(entry.score) || null,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      toast({ title: 'Results saved successfully' });
      calculateSettlementPreview();
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving results', description: error.message, variant: 'destructive' });
    },
  });

  const settleMutation = useMutation({
    mutationFn: async () => {
      // Build settlement payload
      const selections = settlementPreviews
        .map(preview => ({
          selection_id: preview.winning_selection_id!,
          result: 'won' as const,
        }))
        .filter(s => s.selection_id);

      // Mark all other selections as lost
      const allSelections = tournamentData?.markets.flatMap(m => m.selections || []) || [];
      const losingSelections = allSelections
        .filter(s => !selections.find(winning => winning.selection_id === s.id))
        .map(s => ({ selection_id: s.id, result: 'lost' as const }));

      const allSettlements = [...selections, ...losingSelections];

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('settle-predictions', {
        body: { selections: allSettlements },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      queryClient.invalidateQueries({ queryKey: ['settlement-tournaments'] });
      toast({
        title: 'Settlement completed',
        description: `Settled ${data.settled_predictions} predictions, paid out ${data.total_payout.toLocaleString()} tokens`,
      });
      setShowPreview(false);
      setSelectedTournament('');
      setResults({
        slalom: { male: [], female: [] },
        trick: { male: [], female: [] },
        jump: { male: [], female: [] },
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Settlement failed', description: error.message, variant: 'destructive' });
    },
  });

  const athletes = tournamentData?.tournament?.tournament_entries
    ?.map(entry => entry.athlete)
    .filter(Boolean) || [];

  const totalHouseProfit = settlementPreviews.reduce(
    (sum, p) => sum + (p.total_wagered - p.total_payout),
    0
  );

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

        {selectedTournament && !showPreview && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Enter Results by Discipline</CardTitle>
              </CardHeader>
              <CardContent>
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
                      {['male', 'female'].map((gender) => (
                        <div key={gender} className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">
                              {gender === 'male' ? 'Open Men' : 'Open Women'}
                            </h3>
                            <Button size="sm" onClick={() => addResultRow(discipline, gender)}>
                              Add Athlete
                            </Button>
                          </div>

                          <div className="space-y-3">
                            {results[discipline]?.[gender]?.map((entry, index) => (
                              <div key={index} className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-5">
                                  <Label>Athlete</Label>
                                  <Select
                                    value={entry.athlete_id}
                                    onValueChange={(v) => updateResultRow(discipline, gender, index, 'athlete_id', v)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select athlete" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {athletes.map((athlete: any) => (
                                        <SelectItem key={athlete.id} value={athlete.id}>
                                          {athlete.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="col-span-2">
                                  <Label>Position</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={entry.position || ''}
                                    onChange={(e) => updateResultRow(discipline, gender, index, 'position', parseInt(e.target.value) || 0)}
                                    placeholder="1, 2, 3..."
                                  />
                                </div>

                                <div className="col-span-4">
                                  <Label>Score</Label>
                                  <Input
                                    value={entry.score}
                                    onChange={(e) => updateResultRow(discipline, gender, index, 'score', e.target.value)}
                                    placeholder={discipline === 'slalom' ? '1@43' : discipline === 'trick' ? '10500' : '67.2'}
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
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => saveResultsMutation.mutate()}>
                Save Results
              </Button>
              <Button onClick={calculateSettlementPreview} disabled={saveResultsMutation.isPending}>
                Preview Settlement
              </Button>
            </div>
          </>
        )}

        {showPreview && settlementPreviews.length > 0 && (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Review the settlement details below. Once confirmed, all predictions will be settled and user wallets will be updated. This action cannot be undone.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>Settlement Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                      <Coins className="w-5 h-5" />
                      <span className="text-sm">Total Wagered</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {settlementPreviews.reduce((sum, p) => sum + p.total_wagered, 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="text-center p-4 rounded-lg bg-success/5 border border-success/10">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                      <TrendingUp className="w-5 h-5" />
                      <span className="text-sm">Total Payout</span>
                    </div>
                    <p className="text-2xl font-bold text-success">
                      {settlementPreviews.reduce((sum, p) => sum + p.total_payout, 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="text-center p-4 rounded-lg bg-secondary/5 border border-secondary/10">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                      <Trophy className="w-5 h-5" />
                      <span className="text-sm">House P/L</span>
                    </div>
                    <p className={`text-2xl font-bold ${totalHouseProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {totalHouseProfit >= 0 ? '+' : ''}{totalHouseProfit.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {settlementPreviews.map((preview) => (
                    <Card key={preview.market_id} className="border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold">{preview.market_name}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {preview.discipline} • {preview.category.replace('_', ' ')}
                            </p>
                          </div>
                          {preview.winning_athlete_name && (
                            <Badge className="bg-success text-success-foreground">
                              Winner: {preview.winning_athlete_name}
                            </Badge>
                          )}
                        </div>

                        <div className="flex gap-6 text-sm">
                          <div>
                            <span className="text-muted-foreground">Wagered:</span>
                            <span className="ml-2 font-medium">{preview.total_wagered.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Payout:</span>
                            <span className="ml-2 font-medium text-success">{preview.total_payout.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Predictions:</span>
                            <span className="ml-2 font-medium">{preview.affected_predictions}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Back to Results
              </Button>
              <Button
                onClick={() => settleMutation.mutate()}
                disabled={settleMutation.isPending}
                className="bg-success hover:bg-success/90"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {settleMutation.isPending ? 'Settling...' : 'Confirm Settlement'}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
