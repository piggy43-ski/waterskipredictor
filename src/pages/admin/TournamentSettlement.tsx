import { useState, useMemo, useCallback } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SettlementConfirmDialog } from '@/components/SettlementConfirmDialog';
import { AlertCircle, CheckCircle, TrendingUp, Users, Coins, Trophy, Search, Sparkles, X, Eye, AlertTriangle } from 'lucide-react';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { compareScores, isValidSlalomScore, normalizeSlalomScore } from '@/utils/waterskiScoring';
import { BatchImageUploader, type UploadedFile } from '@/components/admin/BatchImageUploader';
import type { Discipline, Category } from '@/types';

type ResultEntry = {
  athlete_id: string;
  position?: number;
  score: string;
  made_finals: boolean;
  missed_first_pass: boolean;
  missed_gate: boolean;
  notes?: string;
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

type ParsedAthlete = {
  name: string;
  score: string;
  position?: number;
  made_finals: boolean;
  missed_first_pass: boolean;
  missed_gate: boolean;
  notes?: string;
  matched_athlete_id?: string;
  match_confidence?: number;
};

type AIParseResponse = {
  athletes: ParsedAthlete[];
  discipline?: string;
  gender?: string;
  confidence: number;
  raw_text?: string;
  source_file?: string;
};

const emptyResultEntry = (): ResultEntry => ({
  athlete_id: '',
  score: '',
  made_finals: true,
  missed_first_pass: false,
  missed_gate: false,
});

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
  
  // AI parsing state - batch processing
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isAIParsing, setIsAIParsing] = useState(false);
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [allParsedResults, setAllParsedResults] = useState<AIParseResponse[]>([]);
  const [aiParseGender, setAiParseGender] = useState<'male' | 'female'>('male');
  
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

      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*, tournament_entries(*, athlete:athletes(*))')
        .eq('id', selectedTournament);

      if (tournamentError) throw tournamentError;

      const { data: existingResults, error: resultsError } = await supabase
        .from('athlete_results')
        .select('*, athlete:athletes(name)')
        .eq('tournament_id', selectedTournament);

      if (resultsError) throw resultsError;

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
            made_finals: result.made_finals ?? true,
            missed_first_pass: result.missed_first_pass ?? false,
            missed_gate: result.missed_gate ?? false,
          });
        }

        setResults(newResults);
      }

      return { tournament: tournament[0], existingResults, markets };
    },
    enabled: !!selectedTournament,
  });

  // Get all athletes for a discipline/gender for matching
  const getAllAthletes = (discipline: Discipline, gender: 'male' | 'female') => {
    if (!tournamentData?.tournament?.tournament_entries) return [];
    
    const genderValue = gender === 'male' ? 'male' : 'female';
    
    return tournamentData.tournament.tournament_entries
      .filter((entry: any) => 
        entry.discipline === discipline &&
        entry.athlete?.gender === genderValue
      )
      .map((entry: any) => entry.athlete)
      .filter(Boolean);
  };

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

  const calculatePositions = (discipline: Discipline, gender: string, entries: ResultEntry[]): ResultEntry[] => {
    const validEntries = entries.filter(e => e.athlete_id && e.score);
    const invalidEntries = entries.filter(e => !e.athlete_id || !e.score);

    const sorted = [...validEntries].sort((a, b) => 
      compareScores(b.score, a.score, discipline)
    );

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
        [gender]: [...prev[discipline][gender], emptyResultEntry()],
      },
    }));
  };

  const updateResultRow = (
    discipline: Discipline,
    gender: string,
    index: number,
    field: keyof ResultEntry,
    value: string | number | boolean
  ) => {
    setResults(prev => {
      const updated = [...prev[discipline][gender]];
      updated[index] = { ...updated[index], [field]: value };
      
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

  // Fuzzy match athlete name to database
  const matchAthleteByName = (name: string, athletes: any[]): { id: string; confidence: number } | null => {
    if (!name || !athletes.length) return null;
    
    const normalizedName = name.toLowerCase().trim();
    
    // Exact match
    const exactMatch = athletes.find(a => a.name.toLowerCase() === normalizedName);
    if (exactMatch) return { id: exactMatch.id, confidence: 1 };
    
    // Partial match (name contains or is contained)
    const partialMatch = athletes.find(a => 
      a.name.toLowerCase().includes(normalizedName) || 
      normalizedName.includes(a.name.toLowerCase())
    );
    if (partialMatch) return { id: partialMatch.id, confidence: 0.8 };
    
    // Word-based match
    const nameWords = normalizedName.split(/\s+/);
    for (const athlete of athletes) {
      const athleteWords = athlete.name.toLowerCase().split(/\s+/);
      const matchedWords = nameWords.filter(w => athleteWords.some(aw => aw.includes(w) || w.includes(aw)));
      if (matchedWords.length >= Math.min(2, nameWords.length)) {
        return { id: athlete.id, confidence: 0.6 };
      }
    }
    
    return null;
  };

  // Batch parse all files with AI
  const parseAllFiles = useCallback(async () => {
    if (!selectedTournament || !selectedDiscipline) {
      toast({ title: 'Please select a tournament and discipline first', variant: 'destructive' });
      return;
    }

    const pendingFiles = uploadedFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsAIParsing(true);
    const results: AIParseResponse[] = [];
    const athletes = getAllAthletes(selectedDiscipline, aiParseGender);

    for (const file of pendingFiles) {
      // Update file status to parsing
      setUploadedFiles(prev => 
        prev.map(f => f.id === file.id ? { ...f, status: 'parsing' as const } : f)
      );

      try {
        const { data, error } = await supabase.functions.invoke('parse-tournament-scores', {
          body: {
            image_base64: file.base64,
            discipline: selectedDiscipline,
            gender: aiParseGender,
            is_pdf: file.type === 'pdf',
          },
        });

        if (error) throw error;

        // Match athletes to database
        const matchedAthletes = data.athletes.map((parsed: ParsedAthlete) => {
          const match = matchAthleteByName(parsed.name, athletes);
          return {
            ...parsed,
            matched_athlete_id: match?.id || undefined,
            match_confidence: match?.confidence || 0,
          };
        });

        results.push({ ...data, athletes: matchedAthletes, source_file: file.name });
        
        // Update file status to done
        setUploadedFiles(prev => 
          prev.map(f => f.id === file.id ? { ...f, status: 'done' as const } : f)
        );
      } catch (err: any) {
        console.error(`AI parsing error for ${file.name}:`, err);
        
        // Update file status to error
        setUploadedFiles(prev => 
          prev.map(f => f.id === file.id ? { ...f, status: 'error' as const, error: err.message } : f)
        );
      }
    }

    setIsAIParsing(false);

    if (results.length > 0) {
      setAllParsedResults(results);
      setAiPreviewOpen(true);
      
      const totalAthletes = results.reduce((sum, r) => sum + r.athletes.length, 0);
      toast({ 
        title: 'Parsing complete',
        description: `Extracted ${totalAthletes} athletes from ${results.length} file(s)`
      });
    }
  }, [selectedTournament, selectedDiscipline, uploadedFiles, aiParseGender, toast]);

  // Apply all AI results to form
  const applyAIResults = () => {
    if (allParsedResults.length === 0) return;

    // Combine all athletes from all parsed results
    const allAthletes = allParsedResults.flatMap(r => r.athletes);
    
    // Dedupe by athlete_id (keep first occurrence)
    const seenIds = new Set<string>();
    const newEntries: ResultEntry[] = allAthletes
      .filter(a => {
        if (!a.matched_athlete_id || seenIds.has(a.matched_athlete_id)) return false;
        seenIds.add(a.matched_athlete_id);
        return true;
      })
      .map(a => ({
        athlete_id: a.matched_athlete_id!,
        score: a.score,
        made_finals: a.made_finals,
        missed_first_pass: a.missed_first_pass,
        missed_gate: a.missed_gate,
        notes: a.notes,
      }));

    const withPositions = calculatePositions(selectedDiscipline, aiParseGender, newEntries);

    setResults(prev => ({
      ...prev,
      [selectedDiscipline]: {
        ...prev[selectedDiscipline],
        [aiParseGender]: withPositions,
      },
    }));

    setAiPreviewOpen(false);
    setAllParsedResults([]);
    setUploadedFiles([]);
    
    toast({ 
      title: 'Results applied',
      description: `Added ${newEntries.length} entries. You can now review and modify them.`
    });
  };

  const validateResults = (): boolean => {
    let hasErrors = false;

    for (const [discipline, genderData] of Object.entries(results)) {
      for (const [gender, entries] of Object.entries(genderData)) {
        for (const entry of entries) {
          if (entry.athlete_id && entry.score) {
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

      const validResults = disciplineResults.filter(r => r.athlete_id && r.score);

      let winningSelectionIds: string[] = [];
      let winningAthleteNames: string[] = [];

      if (market.market_type === 'WINNER') {
        const winner = validResults.find(r => r.position === 1);
        if (winner) {
          const selection = market.selections?.find(s => s.athlete_id === winner.athlete_id);
          if (selection) {
            winningSelectionIds = [selection.id];
            winningAthleteNames = [selection.athlete?.name || ''];
          }
        }
      } else if (market.market_type === 'PODIUM') {
        const podiumFinishers = validResults.filter(r => r.position >= 1 && r.position <= 3);
        for (const finisher of podiumFinishers) {
          const selection = market.selections?.find(s => s.athlete_id === finisher.athlete_id);
          if (selection) {
            winningSelectionIds.push(selection.id);
            winningAthleteNames.push(selection.athlete?.name || '');
          }
        }
      } else if (market.market_type === 'HIGHEST_SCORE') {
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
              const score = discipline === 'slalom'
                ? normalizeSlalomScore(entry.score)
                : entry.score;

              allResults.push({
                tournament_id: selectedTournament,
                athlete_id: entry.athlete_id,
                discipline,
                gender,
                position: entry.position || 0,
                score_raw: score,
                made_finals: entry.made_finals,
                missed_first_pass: entry.missed_first_pass,
                missed_gate: entry.missed_gate,
              });
            }
          }
        }
      }

      await supabase
        .from('athlete_results')
        .delete()
        .eq('tournament_id', selectedTournament);

      const { error } = await supabase.from('athlete_results').insert(allResults);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      toast({ title: 'Results saved successfully' });
      calculateSettlementPreview();
      
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
      const selections = settlementPreviews
        .flatMap(preview => 
          preview.winning_selection_ids.map(id => ({
            selection_id: id,
            result: 'won' as const,
          }))
        )
        .filter(s => s.selection_id);

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
      
      try {
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
            {/* AI Image Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  AI Score Parser
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload images or PDFs of tournament results. You can drag & drop multiple files, paste from clipboard, or click to browse.
                </p>
                
                <div className="flex gap-4 items-end mb-4">
                  <div className="flex-1 max-w-xs">
                    <Label>Gender Category</Label>
                    <Select value={aiParseGender} onValueChange={(v) => setAiParseGender(v as 'male' | 'female')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Open Men</SelectItem>
                        <SelectItem value="female">Open Women</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <BatchImageUploader
                  files={uploadedFiles}
                  onFilesChange={setUploadedFiles}
                  onParseAll={parseAllFiles}
                  isParsing={isAIParsing}
                  disabled={!selectedTournament || !selectedDiscipline}
                />
              </CardContent>
            </Card>

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
                                <div key={index} className="border rounded-lg p-4 space-y-3">
                                  <div className="grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-4">
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

                                    <div className="col-span-3">
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

                                    <div className="col-span-2"></div>

                                    <div className="col-span-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeResultRow(discipline, gender, index)}
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Performance Flags */}
                                  <div className="flex items-center gap-6 pt-2 border-t">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        id={`finals-${index}`}
                                        checked={entry.made_finals}
                                        onCheckedChange={(v) => updateResultRow(discipline, gender, index, 'made_finals', v)}
                                      />
                                      <Label htmlFor={`finals-${index}`} className="text-sm cursor-pointer">
                                        Made Finals
                                      </Label>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        id={`firstpass-${index}`}
                                        checked={entry.missed_first_pass}
                                        onCheckedChange={(v) => updateResultRow(discipline, gender, index, 'missed_first_pass', v)}
                                      />
                                      <Label htmlFor={`firstpass-${index}`} className="text-sm cursor-pointer text-destructive">
                                        Missed 1st Pass
                                      </Label>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        id={`gate-${index}`}
                                        checked={entry.missed_gate}
                                        onCheckedChange={(v) => updateResultRow(discipline, gender, index, 'missed_gate', v)}
                                      />
                                      <Label htmlFor={`gate-${index}`} className="text-sm cursor-pointer text-destructive">
                                        Missed Gate
                                      </Label>
                                    </div>

                                    {/* Show warning badges */}
                                    {!entry.made_finals && (
                                      <Badge variant="outline" className="text-warning border-warning">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        No Finals
                                      </Badge>
                                    )}
                                    {entry.missed_first_pass && (
                                      <Badge variant="destructive">
                                        0 First Pass
                                      </Badge>
                                    )}
                                    {entry.missed_gate && (
                                      <Badge variant="destructive">
                                        Gate Miss
                                      </Badge>
                                    )}
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

      {/* AI Preview Dialog */}
      <Dialog open={aiPreviewOpen} onOpenChange={setAiPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Parsed Results
            </DialogTitle>
            <DialogDescription>
              Review the extracted results below. Athletes highlighted in yellow need manual matching.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh]">
            {allParsedResults.length > 0 && (
              <div className="space-y-6">
                {allParsedResults.map((result, fileIndex) => (
                  <div key={fileIndex} className="space-y-4">
                    {allParsedResults.length > 1 && (
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Badge variant="secondary">{result.source_file || `File ${fileIndex + 1}`}</Badge>
                        <Badge variant={result.confidence > 0.8 ? 'default' : 'secondary'}>
                          {Math.round(result.confidence * 100)}% confidence
                        </Badge>
                      </div>
                    )}
                    
                    <div className="flex gap-4 text-sm">
                      <Badge variant="outline">Discipline: {result.discipline || selectedDiscipline}</Badge>
                      <Badge variant="outline">Gender: {result.gender || aiParseGender}</Badge>
                    </div>

                    <div className="space-y-2">
                      {result.athletes.map((athlete, index) => (
                        <div 
                          key={index}
                          className={`p-3 rounded-lg border ${
                            athlete.matched_athlete_id 
                              ? athlete.match_confidence === 1 ? 'bg-green-500/10 border-green-500/30' 
                                : 'bg-yellow-500/10 border-yellow-500/30'
                              : 'bg-destructive/10 border-destructive/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{athlete.name}</span>
                              <span className="text-muted-foreground ml-2">Score: {athlete.score}</span>
                              {athlete.position && <Badge variant="outline" className="ml-2">#{athlete.position}</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              {athlete.matched_athlete_id ? (
                                <Badge variant="outline" className="text-green-600">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Matched ({Math.round((athlete.match_confidence || 0) * 100)}%)
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  No Match
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-3 mt-2 text-xs">
                            {!athlete.made_finals && <Badge variant="outline">No Finals</Badge>}
                            {athlete.missed_first_pass && <Badge variant="destructive">Missed 1st Pass</Badge>}
                            {athlete.missed_gate && <Badge variant="destructive">Missed Gate</Badge>}
                            {athlete.notes && <span className="text-muted-foreground">{athlete.notes}</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {result.raw_text && (
                      <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                        <strong>Raw text:</strong> {result.raw_text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiPreviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyAIResults}>
              Apply {allParsedResults.flatMap(r => r.athletes).filter(a => a.matched_athlete_id).length} Matched Results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
