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
import { AlertCircle, CheckCircle, TrendingUp, Users, Coins, Trophy, Search, Sparkles, X, AlertTriangle, Edit, Lock, Unlock } from 'lucide-react';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { compareScores, isValidSlalomScore, normalizeSlalomScore, parseSlalomScore } from '@/utils/waterskiScoring';
import { BatchImageUploader, type UploadedFile } from '@/components/admin/BatchImageUploader';
import { QuickResultsEditor } from '@/components/admin/QuickResultsEditor';
import { SettlementAuditTable } from '@/components/admin/SettlementAuditTable';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Discipline, Category } from '@/types';

type RoundType = 'qual' | 'semi' | 'final';

type ResultEntry = {
  athlete_id: string;
  round_rank?: number;
  final_overall_rank?: number;
  score: string;
  raw_score: number;
  tie_break_score: string;
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
  won_count: number;
  lost_count: number;
  unique_entries: number;
  won_entries: number;
  lost_entries: number;
  tie_count: number;
  tie_explanation: string | null;
  bet_breakdown: BetBreakdownRow[];
};

type BetBreakdownRow = {
  bet_slip_id: string;
  username: string;
  athlete_name: string;
  stake: number;
  odds: number;
  potential_payout: number;
  result: 'WON' | 'LOST';
  payout: number;
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
  round_type?: RoundType;
  confidence: number;
  raw_text?: string;
  source_file?: string;
};

const emptyResultEntry = (): ResultEntry => ({
  athlete_id: '',
  score: '',
  raw_score: 0,
  tie_break_score: '',
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
  const [selectedTournament, setSelectedTournament] = useState(
    () => sessionStorage.getItem('settlement-selected-tournament') || ''
  );
  const [selectedRound, setSelectedRound] = useState<RoundType>(
    () => (sessionStorage.getItem('settlement-selected-round') as RoundType) || 'final'
  );
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>(
    () => (sessionStorage.getItem('settlement-selected-discipline') as Discipline) || 'slalom'
  );
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
  
  // Local string state for TB inputs to allow decimal typing (e.g. "2." before "2.5")
  const [tbEditState, setTbEditState] = useState<Record<string, string>>({});
  // Track athletes whose TB was manually set (prevents auto-populate from overwriting)
  const [manualTbAthletes, setManualTbAthletes] = useState<Set<string>>(new Set());
  
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
      return data.map(applyDynamicStatus);
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
        .select('*, selections(*, athlete:athletes(name)), locked_at')
        .eq('tournament_id', selectedTournament);

      if (marketsError) throw marketsError;

      // Check if any market is locked
      const isLocked = markets.some((m: any) => m.locked_at);

      return { tournament: tournament[0], existingResults, markets, isLocked };
    },
    enabled: !!selectedTournament,
    staleTime: 5 * 60 * 1000, // 5 minutes - prevents refetching while working
    refetchOnWindowFocus: false, // Prevent refetch when switching tabs
  });

  // Persist selected tournament, round, and discipline to sessionStorage
  useEffect(() => {
    if (selectedTournament) {
      sessionStorage.setItem('settlement-selected-tournament', selectedTournament);
    }
    sessionStorage.setItem('settlement-selected-round', selectedRound);
    sessionStorage.setItem('settlement-selected-discipline', selectedDiscipline);
  }, [selectedTournament, selectedRound, selectedDiscipline]);

  // Auto-save results to sessionStorage whenever they change
  useEffect(() => {
    if (selectedTournament && hasLoadedInitialData) {
      const key = `settlement-draft-${selectedTournament}`;
      sessionStorage.setItem(key, JSON.stringify(results));
    }
  }, [results, selectedTournament, hasLoadedInitialData]);

  // Reset flag and results when tournament changes
  useEffect(() => {
    setHasLoadedInitialData(false);
    setResults(initializeRoundResults());
  }, [selectedTournament]);

  // Load existing results only once per tournament (check sessionStorage first)
  useEffect(() => {
    if (!selectedTournament || hasLoadedInitialData) return;
    // Wait for tournamentData to be available before deciding
    if (tournamentData === undefined) return;

    const key = `settlement-draft-${selectedTournament}`;
    const savedDraft = sessionStorage.getItem(key);

    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        setResults(parsed);
        setHasLoadedInitialData(true);
        toast({ title: 'Restored unsaved draft', description: 'Your previous entries were recovered.' });
        return;
      } catch {
        // Invalid draft, fall through to DB load
      }
    }

    if (tournamentData?.existingResults && tournamentData.existingResults.length > 0) {
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
          tie_break_score: result.tie_break_score || '',
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
  }, [tournamentData, hasLoadedInitialData, selectedTournament]);

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

  const getFilteredAthletes = (discipline: Discipline, gender: 'male' | 'female', currentAthleteId?: string) => {
    if (!tournamentData?.tournament?.tournament_entries) return [];
    
    const searchKey = `${selectedRound}-${discipline}-${gender}`;
    const searchTerm = athleteSearch[searchKey]?.toLowerCase() || '';

    // Collect athlete IDs already assigned in this round/discipline/gender
    const roundResults = results[selectedRound]?.[discipline]?.[gender] || [];
    const usedIds = new Set(
      roundResults
        .map(r => r.athlete_id)
        .filter(id => id && id !== currentAthleteId)
    );
    
    return tournamentData.tournament.tournament_entries
      .filter((entry: any) => 
        entry.discipline === discipline &&
        entry.athlete?.gender === gender &&
        !usedIds.has(entry.athlete?.id) &&
        (!searchTerm || entry.athlete?.name?.toLowerCase().includes(searchTerm))
      )
      .map((entry: any) => entry.athlete)
      .filter(Boolean);
  };

  // Calculate rankings based on score, with tie-break support
  // IMPORTANT: This computes rank numbers but preserves the ORIGINAL array order
  // so that index-based references (and the UI) stay stable while the user is editing.
  const calculateRankings = (entries: ResultEntry[], discipline: Discipline, isFinal: boolean, roundType?: RoundType): ResultEntry[] => {
    // Build a ranking lookup: athlete_id -> { round_rank, final_overall_rank }
    const validEntries = entries.filter(e => e.athlete_id && e.raw_score > 0);

    // Auto-populate tie-break from preliminary round when in finals (only if not manually set)
    if (isFinal && roundType === 'final') {
      for (const entry of validEntries) {
        if (!entry.tie_break_score && entry.athlete_id && !manualTbAthletes.has(entry.athlete_id)) {
          const qualResults = results.qual[discipline];
          const genderKey = Object.keys(qualResults).find(g => 
            qualResults[g].some(q => q.athlete_id === entry.athlete_id)
          );
          if (genderKey) {
            const qualEntry = qualResults[genderKey].find(q => q.athlete_id === entry.athlete_id);
            if (qualEntry && qualEntry.raw_score > 0) {
              // Store the display string (with slalom notation) rather than raw number
              entry.tie_break_score = qualEntry.score || qualEntry.raw_score.toString();
            }
          }
        }
      }
    }

    // Sort a copy to determine rank order
    const sorted = [...validEntries].sort((a, b) => {
      const scoreDiff = b.raw_score - a.raw_score;
      if (scoreDiff !== 0) return scoreDiff;
      return compareScores(b.tie_break_score || '', a.tie_break_score || '', discipline);
    });

    // Build rank map: athlete_id -> rank position
    const rankMap = new Map<string, number>();
    sorted.forEach((entry, index) => {
      rankMap.set(entry.athlete_id, index + 1);
    });

    // Apply ranks back to entries in their ORIGINAL order (no reordering)
    return entries.map(entry => {
      if (!entry.athlete_id) return entry; // empty row
      if (entry.raw_score === 0 && entry.athlete_id) {
        // Zero-score entry → no_score
        return { ...entry, no_score: true, round_rank: undefined, final_overall_rank: undefined };
      }
      const rank = rankMap.get(entry.athlete_id);
      return {
        ...entry,
        round_rank: rank,
        final_overall_rank: isFinal ? rank : undefined,
        made_finals: isFinal,
        no_score: false,
      };
    });
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
      const withRanks = calculateRankings(updated, discipline, isFinal, roundType);
      
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

    // Always use the user's selected round — never override from AI detection
    const targetRound = selectedRound;

    // Auto-detect discipline from AI results
    const disciplineVotes = allParsedResults
      .map(r => r.discipline)
      .filter(d => d === 'slalom' || d === 'trick' || d === 'jump') as Discipline[];
    const detectedDiscipline = disciplineVotes.length > 0
      ? disciplineVotes.sort((a, b) =>
          disciplineVotes.filter(v => v === b).length - disciplineVotes.filter(v => v === a).length
        )[0]
      : selectedDiscipline;

    const targetDiscipline = detectedDiscipline;
    setSelectedDiscipline(targetDiscipline);

    const allAthletes = allParsedResults.flatMap(r => r.athletes);

    // Re-fetch athletes for the detected discipline
    const malePool = getAllAthletes(targetDiscipline, 'male');
    const femalePool = getAllAthletes(targetDiscipline, 'female');

    // Re-match athletes against the correct discipline pool
    const rematchedAthletes = allAthletes.map(a => {
      const pool = a.gender === 'female' ? femalePool : malePool;
      const match = matchAthleteByName(a.name, pool);
      return { ...a, matched_athlete_id: match?.id, match_confidence: match?.confidence || 0 };
    });

    const maleAthletes = rematchedAthletes.filter(a => a.gender === 'male');
    const femaleAthletes = rematchedAthletes.filter(a => a.gender === 'female');
    
    const createEntries = (athletes: ParsedAthlete[]): ResultEntry[] => {
      const seenIds = new Set<string>();
      return athletes
        .filter(a => {
          if (!a.matched_athlete_id || seenIds.has(a.matched_athlete_id)) return false;
          seenIds.add(a.matched_athlete_id);
          return true;
        })
        .map(a => {
          const parsed = parseAndCalculateScore(a.score, targetDiscipline);
          return {
            athlete_id: a.matched_athlete_id!,
            score: a.score,
            raw_score: parsed.raw,
            tie_break_score: '',
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

    const isFinal = targetRound === 'final';
    const maleWithRanks = calculateRankings(maleEntries, targetDiscipline, isFinal);
    const femaleWithRanks = calculateRankings(femaleEntries, targetDiscipline, isFinal);

    setResults(prev => ({
      ...prev,
      [targetRound]: {
        ...prev[targetRound],
        [targetDiscipline]: {
          male: maleWithRanks.length > 0 ? maleWithRanks : prev[targetRound][targetDiscipline].male,
          female: femaleWithRanks.length > 0 ? femaleWithRanks : prev[targetRound][targetDiscipline].female,
        },
      },
    }));

    setAiPreviewOpen(false);
    setAllParsedResults([]);
    setUploadedFiles([]);

    const roundLabelsMap: Record<RoundType, string> = { qual: 'Qualifying', semi: 'Semi-Final', final: 'Final' };
    toast({ 
      title: `Detected: ${roundLabelsMap[targetRound]}, ${targetDiscipline.charAt(0).toUpperCase() + targetDiscipline.slice(1)}`,
      description: `Added ${maleEntries.length} male and ${femaleEntries.length} female entries.`
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

    // Helper: sort results by score (best first) using discipline-aware comparison
    const sortByScore = (entries: { athlete_id: string; score: string; raw_score: number }[], discipline: Discipline) => {
      return [...entries].filter(e => e.athlete_id && e.raw_score > 0).sort((a, b) => {
        // For slalom, use score_display string; for trick/jump use raw_score
        if (discipline === 'slalom') {
          return compareScores(b.score, a.score, discipline);
        }
        return b.raw_score - a.raw_score;
      });
    };

    // Helper: derive ranked positions from sorted results with tie support
    const derivePositions = (sorted: { athlete_id: string; score: string; raw_score: number }[], discipline: Discipline): Map<number, string[]> => {
      const positions = new Map<number, string[]>(); // position -> athlete_ids
      if (sorted.length === 0) return positions;
      
      let currentPos = 1;
      let i = 0;
      while (i < sorted.length) {
        // Collect all athletes tied at this position
        const tiedGroup = [sorted[i]];
        let j = i + 1;
        while (j < sorted.length) {
          const cmp = discipline === 'slalom'
            ? compareScores(sorted[i].score, sorted[j].score, discipline)
            : sorted[i].raw_score - sorted[j].raw_score;
          if (cmp === 0) {
            tiedGroup.push(sorted[j]);
            j++;
          } else {
            break;
          }
        }
        positions.set(currentPos, tiedGroup.map(g => g.athlete_id));
        currentPos += tiedGroup.length; // skip positions for ties
        i = j;
      }
      return positions;
    };

    // Build a map of actual podium positions for each discipline/gender (derived from scores)
    const actualPodiumMap = new Map<string, Map<number, string>>(); // key: "discipline-gender", value: Map<position, athlete_id>
    // Also store derived positions for winner/podium logic
    const derivedPositionsMap = new Map<string, Map<number, string[]>>();
    
    for (const discipline of ['slalom', 'trick', 'jump'] as Discipline[]) {
      for (const gender of ['male', 'female']) {
        const disciplineResults = finalsResults[discipline]?.[gender] || [];
        const sorted = sortByScore(disciplineResults, discipline);
        const positions = derivePositions(sorted, discipline);
        derivedPositionsMap.set(`${discipline}-${gender}`, positions);
        
        // Build single-athlete podium map for exact-order podium bets
        // For ties, the first athlete found gets the position (ties at a position share it)
        const positionMap = new Map<number, string>();
        for (const [pos, athleteIds] of positions) {
          if (pos <= 3) {
            for (const aid of athleteIds) {
              positionMap.set(pos, aid); // last one wins if tied — but for exact-order we need all
            }
          }
        }
        // Actually for exact-order: store first athlete at each position
        const exactPodiumMap = new Map<number, string>();
        for (const [pos, athleteIds] of positions) {
          if (pos <= 3) {
            // If there's a tie at a podium position, each tied athlete occupies the same position
            // For exact-order matching, we set each tied athlete at that position
            // But Map<number, string> only holds one — we'll handle this in the prediction matching below
            exactPodiumMap.set(pos, athleteIds[0]);
          }
        }
        actualPodiumMap.set(`${discipline}-${gender}`, exactPodiumMap);
      }
    }

    for (const market of tournamentData.markets) {
      const discipline = market.discipline as Discipline;
      const genderKey = market.category === 'open_men' ? 'male' : 'female';
      const disciplineResults = finalsResults[discipline]?.[genderKey] || [];

      if (disciplineResults.length === 0) continue;

      const validResults = disciplineResults.filter(r => r.athlete_id && r.raw_score > 0);

      let winningSelectionIds: string[] = [];
      let winningAthleteNames: string[] = [];

      const positionsKey = `${discipline}-${genderKey}`;
      const positions = derivedPositionsMap.get(positionsKey);

      if (market.market_type === 'WINNER') {
        // Winner = athlete(s) at derived position 1
        const winnersAtPos1 = positions?.get(1) || [];
        for (const athleteId of winnersAtPos1) {
          const selection = market.selections?.find(s => s.athlete_id === athleteId);
          if (selection) {
            winningSelectionIds.push(selection.id);
            winningAthleteNames.push(selection.athlete?.name || '');
          }
        }
      } else if (market.market_type === 'PODIUM') {
        // Podium = athletes at derived positions 1, 2, or 3 (ties included)
        if (positions) {
          for (const [pos, athleteIds] of positions) {
            if (pos <= 3) {
              for (const athleteId of athleteIds) {
                const selection = market.selections?.find(s => s.athlete_id === athleteId);
                if (selection) {
                  winningSelectionIds.push(selection.id);
                  winningAthleteNames.push(selection.athlete?.name || '');
                }
              }
            }
          }
        }
      } else if (market.market_type === 'HIGHEST_SCORE') {
        // Highest score across ALL rounds, with tie support and discipline-aware comparison
        type ScoreEntry = { athlete_id: string; score: string; raw_score: number };
        const allScores: ScoreEntry[] = [];
        
        // Collect in-memory results across all rounds
        for (const roundType of ['qual', 'semi', 'final'] as RoundType[]) {
          const roundResults = results[roundType][discipline]?.[genderKey] || [];
          for (const entry of roundResults) {
            if (entry.athlete_id && entry.raw_score > 0) {
              allScores.push({ athlete_id: entry.athlete_id, score: entry.score, raw_score: entry.raw_score });
            }
          }
        }
        
        // Also check saved DB results for rounds not in memory
        const { data: dbResults } = await supabase
          .from('tournament_results')
          .select('athlete_id, raw_score, score_display, round_type')
          .eq('tournament_id', selectedTournament)
          .eq('discipline', discipline)
          .eq('gender', genderKey);
        
        if (dbResults) {
          for (const dbRow of dbResults) {
            if ((dbRow.raw_score || 0) > 0) {
              // Avoid duplicates with in-memory data by checking athlete+round
              const inMemory = allScores.some(s => s.athlete_id === dbRow.athlete_id && s.raw_score === dbRow.raw_score);
              if (!inMemory) {
                allScores.push({
                  athlete_id: dbRow.athlete_id,
                  score: dbRow.score_display || dbRow.raw_score?.toString() || '',
                  raw_score: dbRow.raw_score || 0,
                });
              }
            }
          }
        }
        
        // Find highest score(s) with tie support
        if (allScores.length > 0) {
          // Sort best first
          const sorted = [...allScores].sort((a, b) => {
            if (discipline === 'slalom') {
              return compareScores(b.score, a.score, discipline);
            }
            return b.raw_score - a.raw_score;
          });
          
          // Collect all athletes tied for the top score
          const topScore = sorted[0];
          const topScorers = [topScore];
          for (let k = 1; k < sorted.length; k++) {
            const cmp = discipline === 'slalom'
              ? compareScores(topScore.score, sorted[k].score, discipline)
              : topScore.raw_score - sorted[k].raw_score;
            if (cmp === 0) {
              topScorers.push(sorted[k]);
            } else {
              break; // sorted, so no more ties
            }
          }
          
          // Deduplicate by athlete_id (same athlete might appear in multiple rounds)
          const uniqueAthleteIds = [...new Set(topScorers.map(s => s.athlete_id))];
          
          for (const athleteId of uniqueAthleteIds) {
            const selection = market.selections?.find(s => s.athlete_id === athleteId);
            if (selection) {
              winningSelectionIds.push(selection.id);
              winningAthleteNames.push(selection.athlete?.name || '');
            }
          }
        }
      }

      // Fetch predictions with podium_selections for exact-order podium bets
      // Include synthetic podium IDs (e.g. `${market.id}-podium`) so exact-order entries are found
      const selectionIdsToQuery = [...(market.selections?.map(s => s.id) || [])];
      if (market.market_type === 'PODIUM') {
        selectionIdsToQuery.push(`${market.id}-podium`);
      }

      const { data: predictions } = await supabase
        .from('predictions')
        .select(`
          id, selection_id, staked_tokens, potential_payout, market_type, discipline, category, bet_slip_id,
          podium_selections (
            athlete_id,
            position_predicted
          )
        `)
        .eq('status', 'PENDING')
        .in('selection_id', selectionIdsToQuery);

      let winningPredictionIds: string[] = [];
      let losingPredictionIds: string[] = [];

      // Process each prediction to check if it wins
      for (const prediction of predictions || []) {
        const hasPodiumSelections = prediction.podium_selections && prediction.podium_selections.length > 0;
        
        if (prediction.market_type === 'PODIUM' && hasPodiumSelections) {
          // EXACT-ORDER PODIUM BET: All predicted positions must match derived positions
          const derivedPos = derivedPositionsMap.get(`${discipline}-${genderKey}`);
          
          if (!derivedPos) {
            losingPredictionIds.push(prediction.id);
            continue;
          }

          let allMatch = true;
          for (const ps of prediction.podium_selections) {
            const athletesAtPosition = derivedPos.get(ps.position_predicted) || [];
            if (!athletesAtPosition.includes(ps.athlete_id)) {
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
      
      // Calculate payout: for singles use potential_payout, for parlays query bet_slips
      let totalPayout = 0;
      
      // Singles payout (non-parlay predictions that won)
      const winningPredictions = predictions?.filter(p => winningPredictionIds.includes(p.id)) || [];
      const singleWinners = winningPredictions.filter(p => !p.market_type?.includes('PARLAY') && (p.potential_payout || 0) > 0);
      totalPayout += singleWinners.reduce((sum, p) => sum + p.potential_payout, 0);
      
      // Parlay payout: query bet_slips for any slips linked to winning predictions
      if (winningPredictionIds.length > 0) {
        const { data: parlaySlips } = await supabase
          .from('bet_slips')
          .select('id, total_stake_tokens, total_odds_decimal, potential_payout_tokens, leg_count, status')
          .eq('tournament_id', selectedTournament)
          .eq('status', 'PENDING')
          .eq('type', 'parlay');
        
        if (parlaySlips && parlaySlips.length > 0) {
          for (const slip of parlaySlips) {
            // Get all prediction IDs for this slip
            const { data: slipPredictions } = await supabase
              .from('predictions')
              .select('id')
              .eq('bet_slip_id', slip.id)
              .eq('status', 'PENDING');
            
            if (slipPredictions) {
              // A parlay wins only if ALL its legs are in the winning set across all markets
              const allLegsWon = slipPredictions.every(sp => winningPredictionIds.includes(sp.id));
              if (allLegsWon) {
                totalPayout += slip.potential_payout_tokens;
              }
            }
          }
        }
        
        // Also handle single bet_slips with potential_payout = 0 on predictions
        // (some single bets may also have 0 potential_payout on prediction but correct on bet_slip)
        const zeroPayoutWinners = winningPredictions.filter(p => (p.potential_payout || 0) === 0);
        if (zeroPayoutWinners.length > 0) {
          const { data: singleSlips } = await supabase
            .from('bet_slips')
            .select('id, potential_payout_tokens, leg_count')
            .in('id', zeroPayoutWinners.map(p => p.bet_slip_id).filter(Boolean) as string[])
            .eq('leg_count', 1)
            .eq('status', 'PENDING');
          
          if (singleSlips) {
            totalPayout += singleSlips.reduce((sum, s) => sum + s.potential_payout_tokens, 0);
          }
        }
      }

      // Count unique entries (bet_slips) from predictions
      const uniqueEntryIds = new Set(predictions?.map(p => p.bet_slip_id).filter(Boolean) || []);

      // Group predictions by bet_slip_id for entry-level won/lost
      const predictionsBySlip = new Map<string, string[]>();
      for (const p of predictions || []) {
        if (p.bet_slip_id) {
          if (!predictionsBySlip.has(p.bet_slip_id)) {
            predictionsBySlip.set(p.bet_slip_id, []);
          }
          predictionsBySlip.get(p.bet_slip_id)!.push(p.id);
        }
      }

      const winningSet = new Set(winningPredictionIds);
      const losingSet = new Set(losingPredictionIds);
      let wonEntries = 0;
      let lostEntries = 0;
      for (const [, pIds] of predictionsBySlip) {
        if (pIds.some(id => losingSet.has(id))) {
          lostEntries++;
        } else if (pIds.every(id => winningSet.has(id))) {
          wonEntries++;
        }
      }

      // Tie detection: how many athletes share the winning position(s)?
      let tieCount = 0;
      let tieExplanation: string | null = null;
      if (market.market_type === 'WINNER') {
        const winnersAtPos1 = positions?.get(1) || [];
        if (winnersAtPos1.length > 1) {
          tieCount = winnersAtPos1.length;
          tieExplanation = `${winnersAtPos1.length}-way tie for 1st — all bets on any of these athletes are paid as winners: ${winningAthleteNames.join(', ')}.`;
        }
      } else if (market.market_type === 'HIGHEST_SCORE') {
        if (winningSelectionIds.length > 1) {
          tieCount = winningSelectionIds.length;
          tieExplanation = `${winningSelectionIds.length}-way tie for highest score — all bets on any of these athletes are paid as winners: ${winningAthleteNames.join(', ')}.`;
        }
      } else if (market.market_type === 'PODIUM') {
        // Detect ties at any of positions 1/2/3
        const tiesAtPodium: string[] = [];
        if (positions) {
          for (const [pos, athleteIds] of positions) {
            if (pos <= 3 && athleteIds.length > 1) {
              tiesAtPodium.push(`pos ${pos} (${athleteIds.length}-way)`);
            }
          }
        }
        if (tiesAtPodium.length > 0) {
          tieCount = tiesAtPodium.length;
          tieExplanation = `Podium tie detected: ${tiesAtPodium.join(', ')}. All tied athletes count as occupying that position.`;
        }
      }

      // Per-bet breakdown: enrich predictions with username + athlete + payout
      const betBreakdown: BetBreakdownRow[] = [];
      const betSlipIds = Array.from(uniqueEntryIds) as string[];
      if (betSlipIds.length > 0) {
        const { data: slipRows } = await supabase
          .from('bet_slips')
          .select('id, user_id, athlete_id, total_stake_tokens, total_odds_decimal, potential_payout_tokens')
          .in('id', betSlipIds);

        const userIds = Array.from(new Set((slipRows || []).map(s => s.user_id).filter(Boolean))) as string[];
        const athleteIds = Array.from(new Set((slipRows || []).map(s => s.athlete_id).filter(Boolean))) as string[];

        const [{ data: profiles }, { data: athleteRows }] = await Promise.all([
          userIds.length > 0
            ? supabase.from('profiles').select('id, username').in('id', userIds)
            : Promise.resolve({ data: [] as { id: string; username: string | null }[] }),
          athleteIds.length > 0
            ? supabase.from('athletes').select('id, name').in('id', athleteIds)
            : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
        ]);

        const usernameById = new Map((profiles || []).map(p => [p.id, p.username || 'Unknown']));
        const athleteNameById = new Map((athleteRows || []).map(a => [a.id, a.name || 'Unknown']));

        for (const slip of slipRows || []) {
          const slipPredIds = predictionsBySlip.get(slip.id) || [];
          const allWon = slipPredIds.length > 0 && slipPredIds.every(id => winningSet.has(id));
          const result: 'WON' | 'LOST' = allWon ? 'WON' : 'LOST';
          betBreakdown.push({
            bet_slip_id: slip.id,
            username: usernameById.get(slip.user_id) || 'Unknown',
            athlete_name: slip.athlete_id ? (athleteNameById.get(slip.athlete_id) || 'Unknown') : '—',
            stake: slip.total_stake_tokens,
            odds: Number(slip.total_odds_decimal),
            potential_payout: slip.potential_payout_tokens,
            result,
            payout: allWon ? Math.floor(slip.potential_payout_tokens) : 0,
          });
        }
        // Sort: winners first, then by stake desc
        betBreakdown.sort((a, b) => {
          if (a.result !== b.result) return a.result === 'WON' ? -1 : 1;
          return b.stake - a.stake;
        });
      }

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
        won_count: winningPredictionIds.length,
        lost_count: losingPredictionIds.length,
        unique_entries: uniqueEntryIds.size,
        won_entries: wonEntries,
        lost_entries: lostEntries,
        tie_count: tieCount,
        tie_explanation: tieExplanation,
        bet_breakdown: betBreakdown,
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
                  tie_break_score: entry.tie_break_score || null,
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
      sessionStorage.removeItem(`settlement-draft-${selectedTournament}`);
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      toast({ title: 'Results saved to tournament_results' });
      calculateSettlementPreview();
      
      try {
        const { data, error } = await supabase.functions.invoke('score-fantasy', {
          body: { tournament_id: selectedTournament, rescore: true }
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

  // Helper to get actual results for a market (discipline/category)
  // Uses score-derived positions instead of manual final_overall_rank
  const getActualResultsForMarket = (discipline: Discipline, category: Category): {
    position_1st?: string;
    position_2nd?: string;
    position_3rd?: string;
    highest_scorer?: string;
    highest_score?: string;
  } => {
    const gender = category === 'open_men' ? 'male' : 'female';
    const rawResults = results.final[discipline][gender]
      .filter(r => r.athlete_id && r.raw_score > 0);
    
    // Sort by score (discipline-aware) to derive positions
    const sorted = [...rawResults].sort((a, b) => {
      if (discipline === 'slalom') {
        return compareScores(b.score, a.score, discipline);
      }
      return b.raw_score - a.raw_score;
    });
    
    const getAthleteName = (athleteId: string) => {
      const entry = tournamentData?.tournament?.tournament_entries?.find(
        (e: any) => e.athlete_id === athleteId
      );
      return entry?.athlete?.name || 'Unknown';
    };

    const actualResults: {
      position_1st?: string;
      position_2nd?: string;
      position_3rd?: string;
      highest_scorer?: string;
      highest_score?: string;
    } = {};

    if (sorted[0]) {
      actualResults.position_1st = getAthleteName(sorted[0].athlete_id);
    }
    if (sorted[1]) {
      actualResults.position_2nd = getAthleteName(sorted[1].athlete_id);
    }
    if (sorted[2]) {
      actualResults.position_3rd = getAthleteName(sorted[2].athlete_id);
    }

    // Highest scorer: scan ALL rounds for the best score
    let bestScore: { name: string; score: string } | null = null;
    let bestRaw = -1;
    let bestSlalom = -Infinity;

    for (const roundType of ['qual', 'semi', 'final'] as RoundType[]) {
      const roundResults = results[roundType][discipline]?.[gender] || [];
      for (const entry of roundResults) {
        if (!entry.athlete_id || entry.raw_score <= 0) continue;
        
        if (discipline === 'slalom') {
          const cmp = compareScores(entry.score, bestScore?.score || '', discipline);
          if (cmp > 0 || !bestScore) {
            bestScore = { name: getAthleteName(entry.athlete_id), score: entry.score };
          }
        } else {
          if (entry.raw_score > bestRaw) {
            bestRaw = entry.raw_score;
            bestScore = { name: getAthleteName(entry.athlete_id), score: entry.score || entry.raw_score.toString() };
          }
        }
      }
    }

    if (bestScore) {
      actualResults.highest_scorer = bestScore.name;
      actualResults.highest_score = bestScore.score;
    }

    return actualResults;
  };

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

      // Build selection-based settlements WITH actual results
      const selectionsWithResults = settlementPreviews.flatMap(preview => {
        const actualResults = getActualResultsForMarket(preview.discipline, preview.category);
        
        // Add actual_results to all selections (both winning and losing)
        const allMarketSelections = tournamentData?.markets
          .filter(m => m.id === preview.market_id)
          .flatMap(m => m.selections || []) || [];
        
        const mapped = allMarketSelections.map(selection => ({
          selection_id: selection.id,
          result: preview.winning_selection_ids.includes(selection.id) ? 'won' as const : 'lost' as const,
          actual_results: actualResults,
        }));

        // For PODIUM markets, also include synthetic selection context so backend can settle exact-order entries
        if (preview.market_type === 'PODIUM') {
          mapped.push({
            selection_id: `${preview.market_id}-podium`,
            result: 'lost' as const, // default; overrides handle individual won/lost
            actual_results: actualResults,
          });
        }

        return mapped;
      });

      const response = await supabase.functions.invoke('settle-predictions', {
        body: { 
          selections: selectionsWithResults,
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

  // Lock Results mutation - marks market results as finalized and immutable
  const lockResultsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTournament || !tournamentData?.markets) {
        throw new Error('No tournament or markets selected');
      }

      const marketIds = tournamentData.markets.map((m: any) => m.id);
      const lockedAt = new Date().toISOString();

      // Lock all markets for this tournament
      const { error: lockError } = await supabase
        .from('markets')
        .update({ locked_at: lockedAt })
        .in('id', marketIds);

      if (lockError) throw lockError;

      // Write audit log for MARKET_RESULTS_LOCKED
      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          actor_type: 'admin',
          action_type: 'MARKET_RESULTS_LOCKED',
          entity_type: 'tournament',
          entity_id: selectedTournament,
          metadata: {
            tournament_name: tournamentData.tournament?.name,
            markets_locked: marketIds.length,
            locked_at: lockedAt,
          }
        });

      if (auditError) console.error('Failed to write audit log:', auditError);

      return { lockedAt, marketsCount: marketIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      toast({ 
        title: 'Results Locked',
        description: `${data.marketsCount} market(s) are now finalized and cannot be re-settled.`
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Lock failed', description: error.message, variant: 'destructive' });
    },
  });

  // Void All Pending Predictions mutation
  const voidAllMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTournament) throw new Error('No tournament selected');

      // Fetch all pending predictions for this tournament via bet_slips
      const { data: pendingPredictions, error: fetchErr } = await supabase
        .from('predictions')
        .select('id, user_id, staked_tokens, bet_slip_id, bet_slips!bet_slip_id(tournament_id)')
        .eq('status', 'PENDING')
        .eq('bet_slips.tournament_id', selectedTournament);

      if (fetchErr) throw fetchErr;

      // Filter to only those matching the tournament (inner join filter)
      const toVoid = (pendingPredictions || []).filter(
        (p: any) => p.bet_slips && (Array.isArray(p.bet_slips) ? p.bet_slips.length > 0 : p.bet_slips.tournament_id === selectedTournament)
      );

      if (toVoid.length === 0) {
        return { voided: 0, refunded: 0 };
      }

      // Void predictions
      const predictionIds = toVoid.map((p: any) => p.id);
      const { error: voidErr } = await supabase
        .from('predictions')
        .update({
          status: 'VOID',
          settled_at: new Date().toISOString(),
          payout_tokens: 0,
          settlement_metadata: {
            status: 'VOID',
            explanation: 'Voided by admin - all predictions cancelled',
            void_reason: 'Admin bulk void',
            settled_at: new Date().toISOString(),
          },
        })
        .in('id', predictionIds);

      if (voidErr) throw voidErr;

      // Void corresponding bet_slips
      const betSlipIds = [...new Set(toVoid.map((p: any) => p.bet_slip_id).filter(Boolean))];
      if (betSlipIds.length > 0) {
        await supabase
          .from('bet_slips')
          .update({ status: 'VOID', settled_at: new Date().toISOString() })
          .in('id', betSlipIds)
          .eq('status', 'pending');
      }

      // Refund stakes per user
      const refundsByUser = new Map<string, number>();
      for (const p of toVoid) {
        refundsByUser.set(p.user_id, (refundsByUser.get(p.user_id) || 0) + (p.staked_tokens || 0));
      }

      let totalRefunded = 0;
      for (const [userId, amount] of refundsByUser) {
        if (amount > 0) {
          await supabase.rpc('increment_earned_tokens', { user_id_param: userId, amount });
          totalRefunded += amount;
        }
      }

      return { voided: toVoid.length, refunded: totalRefunded };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data'] });
      toast({
        title: 'Predictions Voided',
        description: `Voided ${data.voided} predictions, refunded ${data.refunded} tokens`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Void failed', description: error.message, variant: 'destructive' });
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
            <div className="flex items-center gap-3 mt-4">
              <Button
                variant="destructive"
                size="sm"
                disabled={!selectedTournament || voidAllMutation.isPending}
                onClick={() => {
                  if (confirm('Are you sure you want to VOID all pending predictions for this tournament and refund all stakes? This cannot be undone.')) {
                    voidAllMutation.mutate();
                  }
                }}
              >
                {voidAllMutation.isPending ? 'Voiding...' : 'Void All Pending Predictions'}
              </Button>
              <span className="text-xs text-muted-foreground">Voids all PENDING predictions and refunds stakes</span>
            </div>
          </CardContent>
        </Card>

        {/* Locked Results Indicator */}
        {selectedTournament && tournamentData?.isLocked && (
          <Card className="border-success/50 bg-success/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-success" />
                <div className="flex-1">
                  <p className="font-medium text-success">Results Locked</p>
                  <p className="text-sm text-muted-foreground">
                    Market results are finalized and explanations are immutable. Re-settlement is disabled.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Re-settlement Options for already-settled tournaments */}
        {selectedTournament && tournamentData?.tournament?.settled_at && !tournamentData?.isLocked && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                Tournament Already Settled
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This tournament was settled on {new Date(tournamentData.tournament.settled_at).toLocaleDateString()}.
                  You can edit individual results or rescore fantasy entries.
                </AlertDescription>
              </Alert>

              {/* Lock Results Button */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Finalize Results</p>
                    <p className="text-sm text-muted-foreground">Lock results to prevent re-settlement and preserve explanations.</p>
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => lockResultsMutation.mutate()}
                    disabled={lockResultsMutation.isPending}
                  >
                    <Lock className="w-4 h-4" />
                    {lockResultsMutation.isPending ? 'Locking...' : 'Lock Results'}
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase.functions.invoke('score-fantasy', {
                        body: { tournament_id: selectedTournament, rescore: true }
                      });
                      if (error) throw error;
                      toast({
                        title: 'Fantasy Rescored',
                        description: `Rescored ${data?.entries_scored || 0} entries with ${data?.scoring_events || 0} events`
                      });
                    } catch (err: any) {
                      toast({ title: 'Rescore Failed', description: err.message, variant: 'destructive' });
                    }
                  }}
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Rescore Fantasy
                </Button>
              </div>

              {/* Quick Results Editor */}
              <Collapsible className="border rounded-lg">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto">
                    <div className="flex items-center gap-2">
                      <Edit className="w-4 h-4" />
                      <span className="font-medium">Edit Individual Results</span>
                    </div>
                    <Badge variant="secondary">Click to expand</Badge>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-0 border-t">
                  <QuickResultsEditor 
                    tournamentId={selectedTournament}
                    onResultUpdated={() => {
                      queryClient.invalidateQueries({ queryKey: ['tournament-settlement-data', selectedTournament] });
                    }}
                  />
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )}

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

                            {getFilteredAthletes(discipline, gender).length === 0 && (
                              <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                  No athletes entered for this discipline. Add tournament entries first.
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="space-y-3">
                              {roundResults?.map((entry, index) => {
                                const athletes = getFilteredAthletes(discipline, gender, entry.athlete_id);
                                return (
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

                                    <div className="col-span-2">
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
                                      <Label>
                                        TB <span className="text-xs text-muted-foreground">(tie-break)</span>
                                      </Label>
                                      <Input
                                         value={tbEditState[`tb-${entry.athlete_id}`] ?? (entry.tie_break_score || '')}
                                         onChange={(e) => {
                                           const tbKey = `tb-${entry.athlete_id}`;
                                           setTbEditState(prev => ({ ...prev, [tbKey]: e.target.value }));
                                         }}
                                         onBlur={() => {
                                           const tbKey = `tb-${entry.athlete_id}`;
                                           const raw = tbEditState[tbKey];
                                           if (raw !== undefined) {
                                             const trimmed = raw.trim();
                                             if (trimmed) {
                                               setManualTbAthletes(prev => new Set(prev).add(entry.athlete_id));
                                             }
                                             updateResultRow(selectedRound, discipline, gender, index, 'tie_break_score', trimmed);
                                             setTbEditState(prev => { const next = { ...prev }; delete next[tbKey]; return next; });
                                           }
                                         }}
                                         placeholder="auto"
                                         className={entry.tie_break_score ? 'border-primary/50' : ''}
                                      />
                                    </div>

                                    <div className="col-span-1">
                                      {selectedRound === 'final' && entry.final_overall_rank && (
                                        <Badge variant="outline" className="bg-primary/10">
                                          #{entry.final_overall_rank}
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
                              );
                              })}

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

        {/* Settlement Audit Table - Show when tournament is settled */}
        {selectedTournament && tournamentData?.tournament?.settled_at && (
          <SettlementAuditTable 
            tournamentId={selectedTournament} 
            tournamentName={tournamentData.tournament.name}
          />
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

                    {preview.tie_explanation && (
                      <Alert className="border-warning bg-warning/10">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        <AlertDescription className="text-sm">
                          <strong>Tie handling:</strong> {preview.tie_explanation}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="grid grid-cols-4 gap-3 pt-3 border-t">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <Users className="w-4 h-4" />
                          <span className="text-xs">Entries</span>
                        </div>
                        <p className="text-lg font-bold">{preview.unique_entries}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-success mb-1">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs">Won</span>
                        </div>
                        <p className="text-lg font-bold text-success">{preview.won_entries}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-destructive mb-1">
                          <X className="w-4 h-4" />
                          <span className="text-xs">Lost</span>
                        </div>
                        <p className="text-lg font-bold text-destructive">{preview.lost_entries}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <Coins className="w-4 h-4" />
                          <span className="text-xs">Payout</span>
                        </div>
                        <p className="text-lg font-bold">{preview.total_payout.toLocaleString()}</p>
                      </div>
                    </div>

                    {preview.bet_breakdown.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between">
                            <span>View per-bet breakdown ({preview.bet_breakdown.length})</span>
                            <span className="text-xs text-muted-foreground">click to expand</span>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 border rounded-md overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted text-muted-foreground">
                                <tr>
                                  <th className="text-left px-3 py-2">User</th>
                                  <th className="text-left px-3 py-2">Pick</th>
                                  <th className="text-right px-3 py-2">Stake</th>
                                  <th className="text-right px-3 py-2">Odds</th>
                                  <th className="text-right px-3 py-2">Payout</th>
                                  <th className="text-center px-3 py-2">Result</th>
                                </tr>
                              </thead>
                              <tbody>
                                {preview.bet_breakdown.map((row) => (
                                  <tr key={row.bet_slip_id} className="border-t">
                                    <td className="px-3 py-2 font-medium">{row.username}</td>
                                    <td className="px-3 py-2">{row.athlete_name}</td>
                                    <td className="px-3 py-2 text-right">{row.stake.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">{row.odds.toFixed(2)}x</td>
                                    <td className={`px-3 py-2 text-right font-semibold ${row.result === 'WON' ? 'text-success' : 'text-muted-foreground'}`}>
                                      {row.result === 'WON' ? `+${row.payout.toLocaleString()}` : '0'}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {row.result === 'WON' ? (
                                        <Badge className="bg-success text-success-foreground">WON</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-destructive border-destructive">LOST</Badge>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
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
          
          <div className="flex items-center gap-4 py-2 px-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Target Round:</span>
              <Select value={selectedRound} onValueChange={(v) => setSelectedRound(v as RoundType)}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qual">Qualifying</SelectItem>
                  <SelectItem value="semi">Semi-Finals</SelectItem>
                  <SelectItem value="final">Finals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {allParsedResults.some(r => r.round_type) && (
              <Badge variant="secondary" className="text-xs">
                AI detected: {roundLabels[allParsedResults.find(r => r.round_type)?.round_type as RoundType] || 'unknown'}
              </Badge>
            )}
          </div>
          
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
