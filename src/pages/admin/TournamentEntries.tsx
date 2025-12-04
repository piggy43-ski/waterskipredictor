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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Trash2, Search, Upload, Check, AlertTriangle, X, Loader2 } from 'lucide-react';
import type { Discipline } from '@/types';
import { decimalToAmerican } from '@/utils/oddsConverter';
import { BatchImageUploader, type UploadedFile } from '@/components/admin/BatchImageUploader';

const VALID_DISCIPLINES = ['slalom', 'trick', 'jump'] as const;

interface ParsedParticipant {
  name: string;
  gender: 'male' | 'female';
  discipline?: 'slalom' | 'trick' | 'jump';
  country?: string;
}

interface MatchedParticipant extends ParsedParticipant {
  matchedAthlete?: {
    id: string;
    name: string;
    country: string;
    gender: string;
  };
  confidence: number;
  alternatives?: Array<{ id: string; name: string; country: string }>;
  selected: boolean;
}

export default function TournamentEntries() {
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline | ''>('');
  const [selectedGender, setSelectedGender] = useState<'male' | 'female' | ''>('');
  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [customOdds, setCustomOdds] = useState<Record<string, string>>({});
  const [athleteSearch, setAthleteSearch] = useState('');
  
  // AI Import state
  const [aiFiles, setAiFiles] = useState<UploadedFile[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [matchedParticipants, setMatchedParticipants] = useState<MatchedParticipant[]>([]);
  const [detectedDiscipline, setDetectedDiscipline] = useState<string>('');

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

  // Fetch ALL athletes for matching (not filtered)
  const { data: allAthletes } = useQuery({
    queryKey: ['all-athletes-for-matching'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('id, name, country, gender, disciplines');
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

  // Fuzzy name matching function
  const matchAthleteByName = (parsedName: string, athletePool: typeof allAthletes) => {
    if (!athletePool) return { match: null, confidence: 0, alternatives: [] };
    
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z\s]/g, '');
    const normalizedParsed = normalize(parsedName);
    
    // Convert "Last, First" to "First Last"
    const flipped = parsedName.includes(',') 
      ? parsedName.split(',').reverse().map(s => s.trim()).join(' ')
      : parsedName;
    const normalizedFlipped = normalize(flipped);
    
    const scored = athletePool.map(athlete => {
      const normalizedAthlete = normalize(athlete.name);
      
      // Exact match
      if (normalizedAthlete === normalizedParsed || normalizedAthlete === normalizedFlipped) {
        return { athlete, score: 1.0 };
      }
      
      // Check if names contain each other
      if (normalizedAthlete.includes(normalizedParsed) || normalizedParsed.includes(normalizedAthlete)) {
        return { athlete, score: 0.85 };
      }
      if (normalizedAthlete.includes(normalizedFlipped) || normalizedFlipped.includes(normalizedAthlete)) {
        return { athlete, score: 0.85 };
      }
      
      // Check word overlap
      const parsedWords = normalizedParsed.split(/\s+/);
      const athleteWords = normalizedAthlete.split(/\s+/);
      const matchingWords = parsedWords.filter(w => athleteWords.some(aw => aw.includes(w) || w.includes(aw)));
      const overlapScore = matchingWords.length / Math.max(parsedWords.length, athleteWords.length);
      
      return { athlete, score: overlapScore * 0.7 };
    }).filter(s => s.score > 0.3).sort((a, b) => b.score - a.score);
    
    const best = scored[0];
    const alternatives = scored.slice(1, 4).map(s => ({
      id: s.athlete.id,
      name: s.athlete.name,
      country: s.athlete.country
    }));
    
    return {
      match: best?.athlete || null,
      confidence: best?.score || 0,
      alternatives
    };
  };

  const handleParseFiles = async () => {
    if (aiFiles.length === 0) {
      toast.error('Please add files or URLs to parse');
      return;
    }

    setIsParsing(true);
    
    try {
      const filesToSend = aiFiles.map(f => ({
        type: f.type,
        content: f.base64 || f.url || '',
        name: f.name
      }));

      const { data, error } = await supabase.functions.invoke('parse-tournament-participants', {
        body: { files: filesToSend }
      });

      if (error) throw error;

      if (!data.participants || data.participants.length === 0) {
        toast.error('No participants found in the document');
        return;
      }

      // Auto-set discipline if detected AND valid
      if (data.detected_discipline && VALID_DISCIPLINES.includes(data.detected_discipline)) {
        setDetectedDiscipline(data.detected_discipline);
        if (!selectedDiscipline) {
          setSelectedDiscipline(data.detected_discipline as Discipline);
        }
      } else if (data.detected_discipline) {
        // Invalid discipline detected (e.g., "waterski") - clear it
        console.warn(`Invalid discipline detected: ${data.detected_discipline}`);
        setDetectedDiscipline('');
      }

      // Match participants to athletes
      const matched: MatchedParticipant[] = data.participants.map((p: ParsedParticipant) => {
        // Filter by detected gender for matching
        const genderPool = allAthletes?.filter(a => a.gender === p.gender) || [];
        const { match, confidence, alternatives } = matchAthleteByName(p.name, genderPool);
        
        return {
          ...p,
          matchedAthlete: match ? {
            id: match.id,
            name: match.name,
            country: match.country,
            gender: match.gender
          } : undefined,
          confidence,
          alternatives,
          selected: confidence >= 0.7 && !!match
        };
      });

      setMatchedParticipants(matched);
      setShowPreviewDialog(true);
      
      const matchedCount = matched.filter(m => m.matchedAthlete).length;
      toast.success(`Found ${data.participants.length} participants, matched ${matchedCount} to existing athletes`);

    } catch (error) {
      console.error('Parse error:', error);
      toast.error(`Failed to parse: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Mutation to directly save AI-matched entries to database
  const addAIEntriesMutation = useMutation({
    mutationFn: async (participants: MatchedParticipant[]) => {
      if (!selectedTournamentId) {
        throw new Error('Please select a tournament first');
      }
      
      if (!selectedDiscipline || !VALID_DISCIPLINES.includes(selectedDiscipline)) {
        throw new Error('Please select a valid discipline: slalom, trick, or jump');
      }

      const toAdd = participants.filter(m => m.selected && m.matchedAthlete);
      if (toAdd.length === 0) {
        throw new Error('No athletes selected to add');
      }

      // Group by gender
      const maleAthletes = toAdd.filter(m => m.matchedAthlete?.gender === 'male');
      const femaleAthletes = toAdd.filter(m => m.matchedAthlete?.gender === 'female');

      // Create entries for all selected athletes
      const entriesToAdd = toAdd.map(m => {
        const athlete = allAthletes?.find(a => a.id === m.matchedAthlete!.id);
        const calculatedOdds = calculateDefaultOdds(athlete, selectedDiscipline);
        return {
          tournament_id: selectedTournamentId,
          athlete_id: m.matchedAthlete!.id,
          discipline: selectedDiscipline,
          custom_odds: calculatedOdds,
        };
      });

      const { error: entriesError } = await supabase
        .from('tournament_entries')
        .insert(entriesToAdd);
      
      if (entriesError) throw entriesError;

      // Create markets for each gender that has athletes
      const gendersToProcess = [];
      if (maleAthletes.length > 0) gendersToProcess.push({ gender: 'male', category: 'open_men', athletes: maleAthletes });
      if (femaleAthletes.length > 0) gendersToProcess.push({ gender: 'female', category: 'open_women', athletes: femaleAthletes });

      for (const { category, athletes: genderAthletes } of gendersToProcess) {
        // Create WINNER market
        const { data: winnerMarket, error: winnerError } = await supabase
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

        if (winnerError) throw winnerError;

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

        // Create selections for athletes in this gender
        for (const participant of genderAthletes) {
          const athlete = allAthletes?.find(a => a.id === participant.matchedAthlete!.id);
          if (!athlete) continue;

          const entry = entriesToAdd.find(e => e.athlete_id === participant.matchedAthlete!.id);
          const odds = entry?.custom_odds || 2.5;

          const selections = [
            {
              market_id: winnerMarket.id,
              athlete_id: participant.matchedAthlete!.id,
              description: `${athlete.name} to win`,
              decimal_odds: odds,
            },
            {
              market_id: podiumMarket.id,
              athlete_id: participant.matchedAthlete!.id,
              description: `${athlete.name} podium finish`,
              decimal_odds: odds * 0.7,
            },
            {
              market_id: scoreMarket.id,
              athlete_id: participant.matchedAthlete!.id,
              description: `${athlete.name} highest score`,
              decimal_odds: odds,
            },
          ];

          const { error: selectionsError } = await supabase
            .from('selections')
            .insert(selections);

          if (selectionsError) throw selectionsError;
        }
      }

      return toAdd.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['tournament-entries'] });
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['selections'] });
      queryClient.invalidateQueries({ queryKey: ['athletes-for-tournament'] });
      toast.success(`Added ${count} athletes and created markets`);
      setShowPreviewDialog(false);
      setAiFiles([]);
      setMatchedParticipants([]);
    },
    onError: (error: Error) => {
      toast.error(`Failed to add athletes: ${error.message}`);
    },
  });

  const handleApplyAIMatches = () => {
    addAIEntriesMutation.mutate(matchedParticipants);
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

  const maleParticipants = matchedParticipants.filter(p => p.gender === 'male');
  const femaleParticipants = matchedParticipants.filter(p => p.gender === 'female');

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
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  AI Import Participants
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload entry lists, start lists, or paste URLs to automatically extract and match participants.
                </p>
                
                <BatchImageUploader
                  files={aiFiles}
                  onFilesChange={setAiFiles}
                  onParseAll={handleParseFiles}
                  isParsing={isParsing}
                  disabled={false}
                />

                {detectedDiscipline && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">Detected: {detectedDiscipline}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Athletes Manually</CardTitle>
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

      {/* AI Match Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              AI Matched Participants
              <Badge variant="secondary">{matchedParticipants.length} found</Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex gap-4 text-sm mb-4">
            <div className="flex items-center gap-1">
              <Check className="h-4 w-4 text-green-500" />
              <span>Matched: {matchedParticipants.filter(m => m.confidence >= 0.7).length}</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>Uncertain: {matchedParticipants.filter(m => m.confidence > 0 && m.confidence < 0.7).length}</span>
            </div>
            <div className="flex items-center gap-1">
              <X className="h-4 w-4 text-red-500" />
              <span>Not Found: {matchedParticipants.filter(m => !m.matchedAthlete).length}</span>
            </div>
          </div>

          {/* Warning when no valid discipline is selected */}
          {(!selectedDiscipline || !VALID_DISCIPLINES.includes(selectedDiscipline)) && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 mb-4">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-medium">Discipline required:</span> Please select a discipline (slalom, trick, or jump) above before adding athletes.
              </div>
            </div>
          )}

          <ScrollArea className="h-[50vh]">
            <div className="space-y-6">
              {maleParticipants.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Badge className="bg-blue-500">♂ Male</Badge>
                    <span>{maleParticipants.length} participants</span>
                  </h3>
                  <div className="space-y-2">
                    {maleParticipants.map((participant, idx) => (
                      <ParticipantMatchRow
                        key={`male-${idx}`}
                        participant={participant}
                        onToggle={() => {
                          const updated = [...matchedParticipants];
                          const globalIdx = matchedParticipants.findIndex(p => p === participant);
                          updated[globalIdx] = { ...participant, selected: !participant.selected };
                          setMatchedParticipants(updated);
                        }}
                        onSelectAlternative={(altId) => {
                          const alt = participant.alternatives?.find(a => a.id === altId);
                          if (alt) {
                            const updated = [...matchedParticipants];
                            const globalIdx = matchedParticipants.findIndex(p => p === participant);
                            updated[globalIdx] = {
                              ...participant,
                              matchedAthlete: { ...alt, gender: 'male' },
                              confidence: 0.8,
                              selected: true
                            };
                            setMatchedParticipants(updated);
                          }
                        }}
                        allAthletes={allAthletes}
                      />
                    ))}
                  </div>
                </div>
              )}

              {femaleParticipants.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Badge className="bg-pink-500">♀ Female</Badge>
                    <span>{femaleParticipants.length} participants</span>
                  </h3>
                  <div className="space-y-2">
                    {femaleParticipants.map((participant, idx) => (
                      <ParticipantMatchRow
                        key={`female-${idx}`}
                        participant={participant}
                        onToggle={() => {
                          const updated = [...matchedParticipants];
                          const globalIdx = matchedParticipants.findIndex(p => p === participant);
                          updated[globalIdx] = { ...participant, selected: !participant.selected };
                          setMatchedParticipants(updated);
                        }}
                        onSelectAlternative={(altId) => {
                          const alt = participant.alternatives?.find(a => a.id === altId);
                          if (alt) {
                            const updated = [...matchedParticipants];
                            const globalIdx = matchedParticipants.findIndex(p => p === participant);
                            updated[globalIdx] = {
                              ...participant,
                              matchedAthlete: { ...alt, gender: 'female' },
                              confidence: 0.8,
                              selected: true
                            };
                            setMatchedParticipants(updated);
                          }
                        }}
                        allAthletes={allAthletes}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)} disabled={addAIEntriesMutation.isPending}>
              Cancel
            </Button>
            <Button 
              onClick={handleApplyAIMatches} 
              disabled={
                addAIEntriesMutation.isPending || 
                matchedParticipants.filter(m => m.selected && m.matchedAthlete).length === 0 ||
                !selectedDiscipline || 
                !VALID_DISCIPLINES.includes(selectedDiscipline)
              }
            >
              {addAIEntriesMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${matchedParticipants.filter(m => m.selected && m.matchedAthlete).length} Athletes to Tournament`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

// Sub-component for participant match rows
function ParticipantMatchRow({
  participant,
  onToggle,
  onSelectAlternative,
  allAthletes
}: {
  participant: MatchedParticipant;
  onToggle: () => void;
  onSelectAlternative: (id: string) => void;
  allAthletes: any[] | undefined;
}) {
  const isMatched = participant.confidence >= 0.7 && participant.matchedAthlete;
  const isUncertain = participant.confidence > 0 && participant.confidence < 0.7 && participant.matchedAthlete;
  const notFound = !participant.matchedAthlete;

  return (
    <div className={`p-3 border rounded-lg ${participant.selected ? 'bg-accent/50 border-primary' : ''}`}>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={participant.selected}
          onCheckedChange={onToggle}
          disabled={notFound}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isMatched && <Check className="h-4 w-4 text-green-500" />}
            {isUncertain && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            {notFound && <X className="h-4 w-4 text-red-500" />}
            <span className="font-medium">"{participant.name}"</span>
            <span className="text-muted-foreground">→</span>
            {participant.matchedAthlete ? (
              <span className="text-primary">
                {participant.matchedAthlete.name} ({participant.matchedAthlete.country})
              </span>
            ) : (
              <span className="text-destructive">No match found</span>
            )}
          </div>
          {participant.confidence > 0 && participant.confidence < 1 && (
            <div className="text-xs text-muted-foreground mt-1">
              Confidence: {Math.round(participant.confidence * 100)}%
            </div>
          )}
        </div>
        {participant.alternatives && participant.alternatives.length > 0 && (
          <Select onValueChange={onSelectAlternative}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Alternatives" />
            </SelectTrigger>
            <SelectContent>
              {participant.alternatives.map(alt => (
                <SelectItem key={alt.id} value={alt.id}>
                  {alt.name} ({alt.country})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
