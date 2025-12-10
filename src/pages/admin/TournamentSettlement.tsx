import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { AlertCircle, CheckCircle, TrendingUp, Users, Coins, Trophy, Search, Sparkles, X, AlertTriangle } from 'lucide-react';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { compareScores, isValidSlalomScore, normalizeSlalomScore, parseSlalomScore } from '@/utils/waterskiScoring';
import { BatchImageUploader, type UploadedFile } from '@/components/admin/BatchImageUploader';
import type { Discipline, Category } from '@/types';

type RoundType = 'qual' | 'semi' | 'final';

type ResultEntry = {
  athlete_id: string;
  round_rank?: number;
  final_overall_rank?: number;
  score: string;
  raw_score: number;
  made_finals: boolean;
  advanced_to_next_round: boolean;
  stood_both_passes: boolean; // For trick
  missed_first_pass: boolean;
  missed_gate: boolean;
  no_score: boolean;
};

type DisciplineResults = {
  [gender: string]: ResultEntry[];
};

type RoundResults = {
  [roundType in RoundType]: {
    [discipline in Discipline]: DisciplineResults;
  };
};

type SettlementPreview = {
  market_id: string;
  market_name: string;
  market_type: string;
  discipline: Discipline;
  category: Category;
  winning_selection_ids: string[];
  winning_athlete_names: string[];
  winning_prediction_ids: string[];
  losing_prediction_ids: string[];
  total_wagered: number;
  total_payout: number;
  affected_predictions: number;
};

type ParsedAthlete = {
  name: string;
  score: string;
  gender: 'male' | 'female';
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
  confidence: number;
  raw_text?: string;
  source_file?: string;
};

const emptyResultEntry = (): ResultEntry => ({
  athlete_id: '',
  score: '',
  raw_score: 0,
  made_finals: false,
  advanced_to_next_round: false,
  stood_both_passes: true,
  missed_first_pass: false,
  missed_gate: false,
  no_score: false,
});

const initializeRoundResults = (): RoundResults => ({
  qual: {
    slalom: { male: [], female: [] },
    trick: { male: [], female: [] },
    jump: { male: [], female: [] },
  },
  semi: {
    slalom: { male: [], female: [] },
    trick: { male: [], female: [] },
    jump: { male: [], female: [] },
  },
  final: {
    slalom: { male: [], female: [] },
    trick: { male: [], female: [] },
    jump: { male: [], female: [] },
  },
});

// Parse score and calculate raw_score for sorting
const parseAndCalculateScore = (scoreStr: string, discipline: Discipline): { display: string; raw: number } => {
  if (!scoreStr) return { display: '', raw: 0 };
  
  if (discipline === 'slalom') {
    const parsed = parseSlalomScore(scoreStr);
    if (parsed) {
      return { display: normalizeSlalomScore(scoreStr), raw: parsed.value };
    }
    return { display: scoreStr, raw: 0 };
  }
  
  // For trick and jump, score is just a number
  const raw = parseFloat(scoreStr) || 0;
  return { display: scoreStr, raw };
};

export default function TournamentSettlement() {
  const [selectedTournament, setSelectedTournament] = useState('');
  const [selectedRound, setSelectedRound] = useState<RoundType>('final');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>('slalom');
  const [athleteSearch, setAthleteSearch] = useState<Record<string, string>>({});
  const [results, setResults] = useState<RoundResults>(initializeRoundResults());
  const [settlementPreviews, setSettlementPreviews] = useState<SettlementPreview[]>([]);
  
  // AI parsing state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isAIParsing, setIsAIParsing] = useState(false);
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [allParsedResults, setAllParsedResults] = useState<AIParseResponse[]>([]);
  
  // Track if we've loaded initial data for this tournament
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  
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

      // Fetch existing tournament_results
      const { data: existingResults, error: resultsError } = await supabase
        .from('tournament_results')
        .select('*, athlete:athletes(name)')
        .eq('tournament_id', selectedTournament);

      if (resultsError) throw resultsError;

      const { data: markets, error: marketsError } = await supabase
        .from('markets')
        .select('*, selections(*, athlete:athletes(name))')
        .eq('tournament_id', selectedTournament);

      if (marketsError) throw marketsError;

      return { tournament: tournament[0], existingResults, markets };
    },
    enabled: !!selectedTournament,
    staleTime: 5 * 60 * 1000, // 5 minutes - prevents refetching while working
    refetchOnWindowFocus: false, // Prevent refetch when switching tabs
  });

  // Reset flag and results when tournament changes
  useEffect(() => {
    setHasLoadedInitialData(false);
    setResults(initializeRoundResults());
  }, [selectedTournament]);

  // Load existing results only once per tournament
  useEffect(() => {
    if (!tournamentData?.existingResults || hasLoadedInitialData) return;
    
    if (tournamentData.existingResults.length > 0) {
      const newResults = initializeRoundResults();

      for (const result of tournamentData.existingResults) {
        const roundType = result.round_type as RoundType;
        const discipline = result.discipline as Discipline;
        const genderKey = result.gender === 'male' ? 'male' : 'female';
        
        if (!newResults[roundType]) continue;
        
        newResults[roundType][discipline][genderKey].push({
          athlete_id: result.athlete_id,
          score: result.score_display || result.raw_score?.toString() || '',
          raw_score: result.raw_score || 0,
          round_rank: result.round_rank || undefined,
          final_overall_rank: result.final_overall_rank || undefined,
          made_finals: result.made_finals ?? false,
          advanced_to_next_round: result.advanced_to_next_round ?? false,
          stood_both_passes: result.stood_both_passes ?? true,
          missed_first_pass: result.missed_first_pass ?? false,
          missed_gate: result.missed_gate ?? false,
          no_score: result.no_score ?? false,
        });
      }

      setResults(newResults);
    }
    setHasLoadedInitialData(true);
  }, [tournamentData?.existingResults, hasLoadedInitialData]);

  const getAllAthletes = (discipline: Discipline, gender: 'male' | 'female') => {
    if (!tournamentData?.tournament?.tournament_entries) return [];
    
    return tournamentData.tournament.tournament_entries
      .filter((entry: any) => 
        entry.discipline === discipline &&
        entry.athlete?.gender === gender
      )
      .map((entry: any) => entry.athlete)
      .filter(Boolean);
  };

  const getFilteredAthletes = (discipline: Discipline, gender: 'male' | 'female') => {
    if (!tournamentData?.tournament?.tournament_entries) return [];
    
    const searchKey = `${selectedRound}-${discipline}-${gender}`;
    const searchTerm = athleteSearch[searchKey]?.toLowerCase() || '';
    
    return tournamentData.tournament.tournament_entries
      .filter((entry: any) => 
        entry.discipline === discipline &&
        entry.athlete?.gender === gender &&
        (!searchTerm || entry.athlete?.name?.toLowerCase().includes(searchTerm))
      )
      .map((entry: any) => entry.athlete)
      .filter(Boolean);
  };

  // Calculate rankings based on score
  const calculateRankings = (entries: ResultEntry[], discipline: Discipline, isFinal: boolean): ResultEntry[] => {
    const validEntries = entries.filter(e => e.athlete_id && e.raw_score > 0);
    const zeroScoreEntries = entries.filter(e => e.athlete_id && e.raw_score === 0);
    const emptyEntries = entries.filter(e => !e.athlete_id);

    // Sort by raw_score (higher is better for all disciplines)
    const sorted = [...validEntries].sort((a, b) => b.raw_score - a.raw_score);

    const withRanks = sorted.map((entry, index) => ({
      ...entry,
      round_rank: index + 1,
      final_overall_rank: isFinal ? index + 1 : undefined,
      made_finals: isFinal,
      no_score: false,
    }));

    // Mark zero score entries as no_score
    const zeroWithFlags = zeroScoreEntries.map(entry => ({
      ...entry,
      no_score: true,
      round_rank: undefined,
      final_overall_rank: undefined,
    }));

    return [...withRanks, ...zeroWithFlags, ...emptyEntries];
  };

  // Count entries per round for visual indicators
  const getRoundEntryCount = (roundType: RoundType): number => {
    let count = 0;
    const disciplines: Discipline[] = ['slalom', 'trick', 'jump'];
    const genders: ('male' | 'female')[] = ['male', 'female'];
    
    for (const discipline of disciplines) {
      for (const gender of genders) {
        count += results[roundType][discipline][gender]
          .filter(e => e.athlete_id).length;
      }
    }
    return count;
  };

  const addResultRow = (roundType: RoundType, discipline: Discipline, gender: string) => {
    setResults(prev => ({
      ...prev,
      [roundType]: {
        ...prev[roundType],
        [discipline]: {
          ...prev[roundType][discipline],
          [gender]: [...prev[roundType][discipline][gender], emptyResultEntry()],
        },
      },
    }));
  };

  const updateResultRow = (
    roundType: RoundType,
    discipline: Discipline,
    gender: string,
    index: number,
    field: keyof ResultEntry,
    value: string | number | boolean
  ) => {
    setResults(prev => {
      const updated = [...prev[roundType][discipline][gender]];
      
      if (field === 'score') {
        const parsed = parseAndCalculateScore(value as string, discipline);
        updated[index] = { 
          ...updated[index], 
          score: parsed.display || (value as string),
          raw_score: parsed.raw,
          no_score: parsed.raw === 0, // Auto-set no_score when raw_score is 0
        };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      
      // Recalculate rankings
      const isFinal = roundType === 'final';
      const withRanks = calculateRankings(updated, discipline, isFinal);
      
      return {
        ...prev,
        [roundType]: {
          ...prev[roundType],
          [discipline]: {
            ...prev[roundType][discipline],
            [gender]: withRanks,
          },
        },
      };
    });
  };

  const removeResultRow = (roundType: RoundType, discipline: Discipline, gender: string, index: number) => {
    setResults(prev => ({
      ...prev,
      [roundType]: {
        ...prev[roundType],
        [discipline]: {
          ...prev[roundType][discipline],
          [gender]: prev[roundType][discipline][gender].filter((_, i) => i !== index),
        },
      },
    }));
  };

  const clearRound = (roundType: RoundType) => {
    setResults(prev => ({
      ...prev,
      [roundType]: {
        slalom: { male: [], female: [] },
        trick: { male: [], female: [] },
        jump: { male: [], female: [] },
      },
    }));
    toast({ title: `${roundLabels[roundType]} round cleared` });
  };

  // Fuzzy match athlete name
  const matchAthleteByName = (name: string, athletes: any[]): { id: string; confidence: number } | null => {
    if (!name || !athletes.length) return null;
    
    const normalizedName = name.toLowerCase().trim();
    
    const exactMatch = athletes.find(a => a.name.toLowerCase() === normalizedName);
    if (exactMatch) return { id: exactMatch.id, confidence: 1 };
    
    const partialMatch = athletes.find(a => 
      a.name.toLowerCase().includes(normalizedName) || 
      normalizedName.includes(a.name.toLowerCase())
    );
    if (partialMatch) return { id: partialMatch.id, confidence: 0.8 };
    
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

  const parseAllFiles = useCallback(async () => {
    if (!selectedTournament || !selectedDiscipline) {
      toast({ title: 'Please select a tournament and discipline first', variant: 'destructive' });
      return;
    }

    const pendingFiles = uploadedFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsAIParsing(true);
    const parseResults: AIParseResponse[] = [];
    
    const maleAthletes = getAllAthletes(selectedDiscipline, 'male');
    const femaleAthletes = getAllAthletes(selectedDiscipline, 'female');

    for (const file of pendingFiles) {
      setUploadedFiles(prev => 
        prev.map(f => f.id === file.id ? { ...f, status: 'parsing' as const } : f)
      );

      try {
        const requestBody: Record<string, any> = { discipline: selectedDiscipline };

        if (file.type === 'url' && file.url) {
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
          const isImageUrl = imageExtensions.some(ext => file.url!.toLowerCase().includes(ext));
          
          if (isImageUrl) {
            requestBody.image_url = file.url;
          } else {
            requestBody.webpage_url = file.url;
          }
        } else {
          requestBody.image_base64 = file.base64;
          requestBody.is_pdf = file.type === 'pdf';
        }

        const { data, error } = await supabase.functions.invoke('parse-tournament-scores', {
          body: requestBody,
        });

        if (error) throw error;

        const matchedAthletes = data.athletes.map((parsed: ParsedAthlete) => {
          const athletePool = parsed.gender === 'female' ? femaleAthletes : maleAthletes;
          const match = matchAthleteByName(parsed.name, athletePool);
          return {
            ...parsed,
            matched_athlete_id: match?.id || undefined,
            match_confidence: match?.confidence || 0,
          };
        });

        parseResults.push({ ...data, athletes: matchedAthletes, source_file: file.name });
        
        setUploadedFiles(prev => 
          prev.map(f => f.id === file.id ? { ...f, status: 'done' as const } : f)
        );
      } catch (err: any) {
        console.error(`AI parsing error for ${file.name}:`, err);
        setUploadedFiles(prev => 
          prev.map(f => f.id === file.id ? { ...f, status: 'error' as const, error: err.message } : f)
        );
      }
    }

    setIsAIParsing(false);

    if (parseResults.length > 0) {
      setAllParsedResults(parseResults);
      setAiPreviewOpen(true);
      
      const totalAthletes = parseResults.reduce((sum, r) => sum + r.athletes.length, 0);
      toast({ 
        title: 'Parsing complete',
        description: `Extracted ${totalAthletes} athletes from ${parseResults.length} file(s)`
      });
    }
  }, [selectedTournament, selectedDiscipline, uploadedFiles, toast]);

  const applyAIResults = () => {
    if (allParsedResults.length === 0) return;

    const allAthletes = allParsedResults.flatMap(r => r.athletes);
    const maleAthletes = allAthletes.filter(a => a.gender === 'male');
    const femaleAthletes = allAthletes.filter(a => a.gender === 'female');
    
    const createEntries = (athletes: ParsedAthlete[]): ResultEntry[] => {
      const seenIds = new Set<string>();
      return athletes
        .filter(a => {
          if (!a.matched_athlete_id || seenIds.has(a.matched_athlete_id)) return false;
          seenIds.add(a.matched_athlete_id);
          return true;
        })
        .map(a => {
          const parsed = parseAndCalculateScore(a.score, selectedDiscipline);
          return {
            athlete_id: a.matched_athlete_id!,
            score: a.score,
            raw_score: parsed.raw,
            made_finals: a.made_finals,
            advanced_to_next_round: false,
            stood_both_passes: true,
            missed_first_pass: a.missed_first_pass,
            missed_gate: a.missed_gate,
            no_score: parsed.raw === 0,
          };
        });
    };

    const maleEntries = createEntries(maleAthletes);
    const femaleEntries = createEntries(femaleAthletes);

    const isFinal = selectedRound === 'final';
    const maleWithRanks = calculateRankings(maleEntries, selectedDiscipline, isFinal);
    const femaleWithRanks = calculateRankings(femaleEntries, selectedDiscipline, isFinal);

    setResults(prev => ({
      ...prev,
      [selectedRound]: {
        ...prev[selectedRound],
        [selectedDiscipline]: {
          male: maleWithRanks.length > 0 ? maleWithRanks : prev[selectedRound][selectedDiscipline].male,
          female: femaleWithRanks.length > 0 ? femaleWithRanks : prev[selectedRound][selectedDiscipline].female,
        },
      },
    }));

    setAiPreviewOpen(false);
    setAllParsedResults([]);
    setUploadedFiles([]);
    
    toast({ 
      title: 'Results applied',
      description: `Added ${maleEntries.length} male and ${femaleEntries.length} female entries to ${selectedRound} round.`
    });
  };

  const validateResults = (): boolean => {
    let hasErrors = false;

    for (const [roundType, roundData] of Object.entries(results)) {
      for (const [discipline, genderData] of Object.entries(roundData)) {
        for (const [gender, entries] of Object.entries(genderData)) {
          for (const entry of entries as ResultEntry[]) {
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
    const finalsResults = results.final;

    // Build a map of actual podium positions for each discipline/gender
    const actualPodiumMap = new Map<string, Map<number, string>>(); // key: "discipline-gender", value: Map<position, athlete_id>
    
    for (const discipline of ['slalom', 'trick', 'jump'] as Discipline[]) {
      for (const gender of ['male', 'female']) {
        const disciplineResults = finalsResults[discipline]?.[gender] || [];
        const validResults = disciplineResults.filter(r => r.athlete_id && r.final_overall_rank && r.final_overall_rank <= 3);
        const positionMap = new Map<number, string>();
        for (const result of validResults) {
          positionMap.set(result.final_overall_rank!, result.athlete_id);
        }
        actualPodiumMap.set(`${discipline}-${gender}`, positionMap);
      }
    }

    for (const market of tournamentData.markets) {
      const discipline = market.discipline as Discipline;
      const genderKey = market.category.includes('men') ? 'male' : 'female';
      const disciplineResults = finalsResults[discipline]?.[genderKey] || [];

      if (disciplineResults.length === 0) continue;

      const validResults = disciplineResults.filter(r => r.athlete_id && r.raw_score > 0);

      let winningSelectionIds: string[] = [];
      let winningAthleteNames: string[] = [];

      if (market.market_type === 'WINNER') {
        const winner = validResults.find(r => r.final_overall_rank === 1);
        if (winner) {
          const selection = market.selections?.find(s => s.athlete_id === winner.athlete_id);
          if (selection) {
            winningSelectionIds = [selection.id];
            winningAthleteNames = [selection.athlete?.name || ''];
          }
        }
      } else if (market.market_type === 'PODIUM') {
        // Individual PODIUM selections: athlete just needs to be in top 3
        const podiumFinishers = validResults.filter(r => r.final_overall_rank && r.final_overall_rank <= 3);
        for (const finisher of podiumFinishers) {
          const selection = market.selections?.find(s => s.athlete_id === finisher.athlete_id);
          if (selection) {
            winningSelectionIds.push(selection.id);
            winningAthleteNames.push(selection.athlete?.name || '');
          }
        }
      } else if (market.market_type === 'HIGHEST_SCORE') {
        let maxScore = 0;
        let highestScorerId = '';
        
        for (const roundType of ['qual', 'semi', 'final'] as RoundType[]) {
          const roundResults = results[roundType][discipline]?.[genderKey] || [];
          for (const entry of roundResults) {
            if (entry.raw_score > maxScore) {
              maxScore = entry.raw_score;
              highestScorerId = entry.athlete_id;
            }
          }
        }
        
        if (highestScorerId) {
          const selection = market.selections?.find(s => s.athlete_id === highestScorerId);
          if (selection) {
            winningSelectionIds = [selection.id];
            winningAthleteNames = [selection.athlete?.name || ''];
          }
        }
      }

      // Fetch predictions with podium_selections for exact-order podium bets
      const { data: predictions } = await supabase
        .from('predictions')
        .select(`
          id, selection_id, staked_tokens, potential_payout, market_type, discipline, category,
          podium_selections (
            athlete_id,
            position_predicted
          )
        `)
        .eq('status', 'PENDING')
        .in('selection_id', market.selections?.map(s => s.id) || []);

      let winningPredictionIds: string[] = [];
      let losingPredictionIds: string[] = [];

      // Process each prediction to check if it wins
      for (const prediction of predictions || []) {
        const hasPodiumSelections = prediction.podium_selections && prediction.podium_selections.length > 0;
        
        if (prediction.market_type === 'PODIUM' && hasPodiumSelections) {
          // EXACT-ORDER PODIUM BET: All predicted positions must match actual positions
          const actualPositions = actualPodiumMap.get(`${discipline}-${genderKey}`);
          
          if (!actualPositions) {
            losingPredictionIds.push(prediction.id);
            continue;
          }

          let allMatch = true;
          for (const ps of prediction.podium_selections) {
            const actualAthleteAtPosition = actualPositions.get(ps.position_predicted);
            if (actualAthleteAtPosition !== ps.athlete_id) {
              allMatch = false;
              break;
            }
          }

          if (allMatch) {
            winningPredictionIds.push(prediction.id);
          } else {
            losingPredictionIds.push(prediction.id);
          }
        } else {
          // Standard bet: check if selection is in winning selections
          if (winningSelectionIds.includes(prediction.selection_id)) {
            winningPredictionIds.push(prediction.id);
          } else {
            losingPredictionIds.push(prediction.id);
          }
        }
      }

      const totalWagered = predictions?.reduce((sum, p) => sum + p.staked_tokens, 0) || 0;
      const totalPayout = predictions
        ?.filter(p => winningPredictionIds.includes(p.id))
        .reduce((sum, p) => sum + p.potential_payout, 0) || 0;

      previews.push({
        market_id: market.id,
        market_name: market.name,
        market_type: market.market_type,
        discipline: market.discipline as Discipline,
        category: market.category as Category,
        winning_selection_ids: winningSelectionIds,
        winning_athlete_names: winningAthleteNames,
        winning_prediction_ids: winningPredictionIds,
        losing_prediction_ids: losingPredictionIds,
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

      for (const [roundType, roundData] of Object.entries(results)) {
        for (const [discipline, genderData] of Object.entries(roundData)) {
          for (const [gender, entries] of Object.entries(genderData)) {
            for (const entry of entries as ResultEntry[]) {
              if (entry.athlete_id) {
                // Get discipline-specific fields
                let buoys = null;
                let lineLengthM = null;
                let trickPoints = null;
                let jumpDistanceM = null;

                if (discipline === 'slalom' && entry.score) {
                  const parsed = parseSlalomScore(entry.score);
                  if (parsed) {
                    buoys = parsed.buoys;
                    lineLengthM = parseFloat(parsed.rope);
                  }
                } else if (discipline === 'trick') {
                  trickPoints = entry.raw_score;
                } else if (discipline === 'jump') {
                  jumpDistanceM = entry.raw_score;
                }

                allResults.push({
                  tournament_id: selectedTournament,
                  athlete_id: entry.athlete_id,
                  discipline,
                  gender,
                  round_type: roundType,
                  raw_score: entry.raw_score,
                  score_display: entry.score,
                  round_rank: entry.round_rank || null,
                  final_overall_rank: entry.final_overall_rank || null,
                  made_finals: entry.made_finals,
                  advanced_to_next_round: entry.advanced_to_next_round,
                  stood_both_passes: entry.stood_both_passes,
                  missed_first_pass: entry.missed_first_pass,
                  missed_gate: entry.missed_gate,
                  no_score: entry.no_score || entry.raw_score === 0,
                  buoys,
                  line_length_m: lineLengthM,
                  trick_points: trickPoints,
                  jump_distance_m: jumpDistanceM,
                });
              }
            }
          }
        }
      }

      // Delete existing results for this tournament
      await supabase
        .from('tournament_results')
        .delete()
        .eq('tournament_id', selectedTournament);

      if (allResults.length > 0) {
        const { error } = await supabase.from('tournament_results').insert(allResults);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      toast({ title: 'Results saved to tournament_results' });
      calculateSettlementPreview();
      
      try {
        const { data, error } = await supabase.functions.invoke('score-fantasy', {
          body: { tournament_id: selectedTournament }
        });
        
        if (error) {
          toast({ title: 'Fantasy scoring failed', description: error.message, variant: 'destructive' });
        } else {
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
      // Collect all winning and losing prediction IDs from previews
      const winningPredictionIds = settlementPreviews.flatMap(p => p.winning_prediction_ids || []);
      const losingPredictionIds = settlementPreviews.flatMap(p => p.losing_prediction_ids || []);

      // Build settlements based on prediction IDs for accurate exact-order podium handling
      const winningSettlements = winningPredictionIds.map(id => ({
        prediction_id: id,
        result: 'won' as const,
      }));

      const losingSettlements = losingPredictionIds.map(id => ({
        prediction_id: id,
        result: 'lost' as const,
      }));

      const allSettlements = [...winningSettlements, ...losingSettlements];

      // Also build selection-based fallback for predictions without explicit IDs
      const selectionWins = settlementPreviews
        .flatMap(preview => 
          preview.winning_selection_ids.map(id => ({
            selection_id: id,
            result: 'won' as const,
          }))
        )
        .filter(s => s.selection_id);

      const allSelections = tournamentData?.markets.flatMap(m => m.selections || []) || [];
      const winningSelectionIds = selectionWins.map(s => s.selection_id);
      const losingSelections = allSelections
        .filter(s => !winningSelectionIds.includes(s.id))
        .map(s => ({ selection_id: s.id, result: 'lost' as const }));

      const response = await supabase.functions.invoke('settle-predictions', {
        body: { 
          selections: [...selectionWins, ...losingSelections],
          prediction_overrides: allSettlements, // Send explicit prediction results
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      queryClient.invalidateQueries({ queryKey: ['settlement-tournaments'] });
      
      if (data.settled_predictions === 0) {
        toast({
          title: 'Settlement completed with issues',
          description: `Found ${data.debug_info?.predictions_found || 0} predictions but settled 0.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Settlement completed',
          description: `Settled ${data.settled_predictions} predictions, paid ${data.total_payout.toLocaleString()} tokens`,
        });
      }
      
      // Settle fantasy pots
      try {
        const { data: fantasyPots } = await supabase
          .from('fantasy_pots')
          .select('id, name')
          .eq('status', 'open')
          .or(`tournament_id.eq.${selectedTournament},season_tournaments.cs.{${selectedTournament}}`);
        
        if (fantasyPots && fantasyPots.length > 0) {
          for (const pot of fantasyPots) {
            const { error: settleError } = await supabase.functions.invoke('settle-fantasy-pot', {
              body: { pot_id: pot.id }
            });
            
            if (settleError) {
              toast({ title: `Fantasy pot "${pot.name}" failed`, variant: 'destructive' });
            } else {
              toast({ title: `Fantasy pot "${pot.name}" settled` });
            }
          }
        }
      } catch (err) {
        console.error('Error settling fantasy pots:', err);
      }
      
      setSelectedTournament('');
      setResults(initializeRoundResults());
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

  const roundLabels: Record<RoundType, string> = {
    qual: 'Qualifying',
    semi: 'Semi-Finals',
    final: 'Finals',
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Tournament Settlement</h2>
          <p className="text-muted-foreground mt-1">
            Enter results by round and settle all predictions
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
            {/* AI Parser Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  AI Score Parser
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertDescription>
                    Auto-detection enabled: Gender is automatically detected. Upload files with both men's and women's results.
                  </AlertDescription>
                </Alert>

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
                <CardTitle>Enter Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Round Selector */}
                <div className="flex gap-4 items-center mb-4">
                  <Label className="whitespace-nowrap">Round:</Label>
                  <Tabs value={selectedRound} onValueChange={(v) => setSelectedRound(v as RoundType)} className="flex-1">
                    <TabsList className="grid grid-cols-3">
                      {(['qual', 'semi', 'final'] as RoundType[]).map((round) => {
                        const entryCount = getRoundEntryCount(round);
                        const hasData = entryCount > 0;
                        
                        return (
                          <TabsTrigger key={round} value={round} className="relative gap-2">
                            <span>{roundLabels[round]}</span>
                            {hasData ? (
                              <Badge variant="default" className="h-5 min-w-5 text-xs px-1.5">
                                {entryCount}
                              </Badge>
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                            )}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </Tabs>
                  {getRoundEntryCount(selectedRound) > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => clearRound(selectedRound)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear Round
                    </Button>
                  )}
                </div>

                <Alert className="mb-4 bg-muted/50 border-muted">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Tip:</strong> Leave rounds empty if they didn't exist for this tournament. Not all events have qualifying or semi-final rounds.
                  </AlertDescription>
                </Alert>

                <Alert className="mb-4">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Auto-calculated:</strong> Positions are ranked by score. Athletes with 0 score are auto-flagged as no-shows (DNF/DNS/DQ).
                  </AlertDescription>
                </Alert>

                {/* Discipline Tabs */}
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
                        const searchKey = `${selectedRound}-${discipline}-${gender}`;
                        const roundResults = results[selectedRound][discipline][gender];
                        
                        return (
                          <div key={gender} className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-lg font-semibold flex items-center gap-2">
                                {gender === 'male' ? 'Open Men' : 'Open Women'}
                                <Badge variant="outline">{roundLabels[selectedRound]}</Badge>
                              </h3>
                              <Button size="sm" onClick={() => addResultRow(selectedRound, discipline, gender)}>
                                Add Result
                              </Button>
                            </div>

                            {athletes.length === 0 && (
                              <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                  No athletes entered for this discipline. Add tournament entries first.
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="space-y-3">
                              {roundResults?.map((entry, index) => (
                                <div key={index} className="border rounded-lg p-4 space-y-3">
                                  <div className="grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-4">
                                      <Label>Athlete</Label>
                                      <Select
                                        value={entry.athlete_id}
                                        onValueChange={(v) => updateResultRow(selectedRound, discipline, gender, index, 'athlete_id', v)}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select athlete" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <div className="p-2">
                                            <Input
                                              placeholder="Search..."
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

                                    <div className="col-span-2">
                                      <Label>Rank <span className="text-xs text-muted-foreground">(auto)</span></Label>
                                      <div className="h-10 flex items-center justify-center bg-muted rounded-md border">
                                        {entry.no_score ? (
                                          <Badge variant="destructive">No Score</Badge>
                                        ) : entry.round_rank ? (
                                          <Badge variant={entry.round_rank <= 3 ? 'default' : 'secondary'}>
                                            #{entry.round_rank}
                                          </Badge>
                                        ) : (
                                          <span className="text-muted-foreground">-</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="col-span-3">
                                      <Label>
                                        Score 
                                        {discipline === 'slalom' && <span className="text-xs text-muted-foreground ml-1">(e.g., 2@43)</span>}
                                      </Label>
                                      <Input
                                        value={entry.score}
                                        onChange={(e) => updateResultRow(selectedRound, discipline, gender, index, 'score', e.target.value)}
                                        placeholder={
                                          discipline === 'slalom' ? '2@43' : 
                                          discipline === 'trick' ? '10500' : 
                                          '67.2'
                                        }
                                      />
                                    </div>

                                    <div className="col-span-2">
                                      {selectedRound === 'final' && entry.final_overall_rank && (
                                        <Badge variant="outline" className="bg-primary/10">
                                          Final: #{entry.final_overall_rank}
                                        </Badge>
                                      )}
                                    </div>

                                    <div className="col-span-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeResultRow(selectedRound, discipline, gender, index)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Trick-specific: Stood Both Passes */}
                                  {discipline === 'trick' && (
                                    <div className="flex items-center gap-4 pt-2 border-t">
                                      <div className="flex items-center gap-2">
                                        <Switch
                                          id={`stood-${index}`}
                                          checked={entry.stood_both_passes}
                                          onCheckedChange={(v) => updateResultRow(selectedRound, discipline, gender, index, 'stood_both_passes', v)}
                                        />
                                        <Label htmlFor={`stood-${index}`} className="text-sm cursor-pointer">
                                          Stood Both Passes
                                        </Label>
                                      </div>
                                      {!entry.stood_both_passes && (
                                        <Badge variant="secondary" className="bg-warning/20 text-warning">
                                          Fall on Pass
                                        </Badge>
                                      )}
                                    </div>
                                  )}

                                  {/* Status badges */}
                                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                                    {entry.no_score && (
                                      <Badge variant="destructive">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        DNF/DNS/DQ
                                      </Badge>
                                    )}
                                    {selectedRound === 'final' && entry.made_finals && (
                                      <Badge variant="outline" className="bg-success/10 text-success">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Made Finals
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {roundResults?.length === 0 && (
                                <p className="text-sm text-muted-foreground">No results entered for this round yet</p>
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

            {/* Rounds Summary Panel */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Results Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {(['qual', 'semi', 'final'] as RoundType[]).map((round) => {
                    const entryCount = getRoundEntryCount(round);
                    const hasData = entryCount > 0;
                    
                    // Count per discipline
                    const disciplineCounts: Record<string, number> = {};
                    const disciplines: Discipline[] = ['slalom', 'trick', 'jump'];
                    const genders: ('male' | 'female')[] = ['male', 'female'];
                    
                    for (const discipline of disciplines) {
                      let count = 0;
                      for (const gender of genders) {
                        count += results[round][discipline][gender].filter(e => e.athlete_id).length;
                      }
                      if (count > 0) disciplineCounts[discipline] = count;
                    }
                    
                    return (
                      <div 
                        key={round} 
                        className={`rounded-lg p-3 border ${hasData ? 'bg-success/5 border-success/20' : 'bg-muted/50 border-muted'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{roundLabels[round]}</span>
                          {hasData ? (
                            <Badge variant="default" className="h-5">
                              {entryCount}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              Empty
                            </Badge>
                          )}
                        </div>
                        {hasData ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(disciplineCounts).map(([disc, count]) => (
                              <Badge key={disc} variant="outline" className="text-xs capitalize">
                                {disc}: {count}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No round for this event</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => saveResultsMutation.mutate()} disabled={saveResultsMutation.isPending}>
                {saveResultsMutation.isPending ? 'Saving...' : 'Save All Rounds'}
              </Button>
              <Button onClick={calculateSettlementPreview} disabled={saveResultsMutation.isPending}>
                Preview Settlement
              </Button>
            </div>
          </>
        )}

        {/* Settlement Preview */}
        {settlementPreviews.length > 0 && (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Review settlement details below. Once confirmed, all predictions will be settled.
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
              >
                {settleMutation.isPending ? 'Processing...' : 'Confirm & Settle'}
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
              Review extracted results. Yellow = needs manual matching.
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
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={athlete.gender === 'female' ? 'bg-pink-500/20' : 'bg-blue-500/20'}>
                                {athlete.gender === 'female' ? '♀' : '♂'}
                              </Badge>
                              <span className="font-medium">{athlete.name}</span>
                              <span className="text-muted-foreground">Score: {athlete.score}</span>
                            </div>
                            {athlete.matched_athlete_id ? (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Matched
                              </Badge>
                            ) : (
                              <Badge variant="destructive">No Match</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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
              Apply {allParsedResults.flatMap(r => r.athletes).filter(a => a.matched_athlete_id).length} Results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
