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
import { Plus, Trash2, Search, Upload, Check, AlertTriangle, X, Loader2, UserPlus } from 'lucide-react';
import type { Discipline } from '@/types';
import { decimalToAmerican } from '@/utils/oddsConverter';
import { BatchImageUploader, type UploadedFile } from '@/components/admin/BatchImageUploader';
import { ProbabilityReviewPanel } from '@/components/admin/ProbabilityReviewPanel';

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
    disciplines: string[];
    rankings: {
      slalom?: number;
      trick?: number;
      jump?: number;
    };
    ratings: {
      slalom?: number;
      trick?: number;
      jump?: number;
    };
  };
  selectedDisciplines: string[]; // Which disciplines to add for this athlete
  overrideRatings: Record<string, number | undefined>; // Override rating per discipline
  confidence: number;
  alternatives?: Array<{ id: string; name: string; country: string; disciplines: string[] }>;
  selected: boolean;
  // New athlete creation fields
  createNewAthlete?: boolean;
  newAthleteCountry?: string;
  newAthleteGender?: 'male' | 'female';
  // Reject match fields
  matchRejected?: boolean;
  originalMatchedAthlete?: MatchedParticipant['matchedAthlete']; // Store original for undo
  alsoAddRejectedAthlete?: boolean; // Also add the rejected athlete to tournament
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
  // Pre-selected discipline for AI import
  const [uploadDiscipline, setUploadDiscipline] = useState<Discipline | ''>('');

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

  // Fetch ALL athletes for matching with disciplines, rankings, and ratings
  const { data: allAthletes } = useQuery({
    queryKey: ['all-athletes-for-matching'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('id, name, country, gender, disciplines, current_rank_slalom, current_rank_trick, current_rank_jump, current_rating_slalom, current_rating_trick, current_rating_jump');
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
    if (!athlete) return 15.0; // Very high odds for unknown athletes
    const rankField = `current_rank_${discipline}` as keyof typeof athlete;
    const rank = athlete[rankField] as number | undefined;
    if (!rank) return 15.0; // Unranked = high odds (15x = unlikely to win)
    return 1.5 + (rank / 10);
  };

  // Fuzzy name matching function - now returns disciplines and rankings
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
      country: s.athlete.country,
      disciplines: s.athlete.disciplines || []
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

    if (!uploadDiscipline) {
      toast.error('Please select a discipline for this running order');
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

      // Set discipline from pre-selection (ignore AI detection)
      setDetectedDiscipline(uploadDiscipline);

      // Match participants to athletes - using database for gender/disciplines
      const matched: MatchedParticipant[] = data.participants.map((p: ParsedParticipant) => {
        // Filter by detected gender for matching
        const genderPool = allAthletes?.filter(a => a.gender === p.gender) || [];
        const { match, confidence, alternatives } = matchAthleteByName(p.name, genderPool);
        
        return {
          ...p,
          // Override gender with database value if matched
          gender: match ? match.gender as 'male' | 'female' : p.gender,
          matchedAthlete: match ? {
            id: match.id,
            name: match.name,
            country: match.country,
            gender: match.gender,
            disciplines: match.disciplines || [],
            rankings: {
              slalom: match.current_rank_slalom || undefined,
              trick: match.current_rank_trick || undefined,
              jump: match.current_rank_jump || undefined,
            },
            ratings: {
              slalom: match.current_rating_slalom || undefined,
              trick: match.current_rating_trick || undefined,
              jump: match.current_rating_jump || undefined,
            }
          } : undefined,
          // ONLY select the pre-selected uploadDiscipline, NOT all athlete disciplines
          selectedDisciplines: match ? [uploadDiscipline] : [uploadDiscipline],
          overrideRatings: {}, // Start with no overrides
          confidence,
          alternatives,
          selected: confidence >= 0.7 && !!match,
          // Initialize new athlete fields for unmatched
          createNewAthlete: false,
          newAthleteCountry: p.country || '',
          newAthleteGender: p.gender,
        };
      });

      // Deduplicate athletes - merge disciplines from duplicate entries
      const athleteMap = new Map<string, MatchedParticipant>();
      const unmatched: MatchedParticipant[] = [];

      for (const m of matched) {
        if (m.matchedAthlete) {
          const key = m.matchedAthlete.id;
          if (athleteMap.has(key)) {
            // Merge disciplines from duplicate entries
            const existing = athleteMap.get(key)!;
            const mergedDisciplines = [...new Set([
              ...existing.selectedDisciplines, 
              ...m.selectedDisciplines
            ])];
            existing.selectedDisciplines = mergedDisciplines;
            // Use highest confidence
            existing.confidence = Math.max(existing.confidence, m.confidence);
          } else {
            athleteMap.set(key, m);
          }
        } else {
          // Keep unmatched entries separate (can't dedupe without athlete ID)
          unmatched.push(m);
        }
      }

      const deduplicated = [...athleteMap.values(), ...unmatched];
      setMatchedParticipants(deduplicated);
      setShowPreviewDialog(true);
      
      const matchedCount = deduplicated.filter(m => m.matchedAthlete).length;
      toast.success(`Found ${data.participants.length} participants, matched ${matchedCount} to existing athletes`);

    } catch (error) {
      console.error('Parse error:', error);
      toast.error(`Failed to parse: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Handle updating new athlete fields for unmatched participants
  const handleUpdateNewAthlete = (participantIdx: number, field: 'country' | 'gender' | 'create' | 'alsoAddRejected', value: any) => {
    const updated = [...matchedParticipants];
    const p = updated[participantIdx];
    if (field === 'country') {
      p.newAthleteCountry = value;
    } else if (field === 'gender') {
      p.newAthleteGender = value;
    } else if (field === 'create') {
      p.createNewAthlete = value;
      // Auto-select if creating
      if (value && uploadDiscipline) {
        p.selectedDisciplines = [uploadDiscipline];
        p.selected = true;
      }
    } else if (field === 'alsoAddRejected') {
      p.alsoAddRejectedAthlete = value;
    }
    setMatchedParticipants(updated);
  };

  // Handle rejecting a suggested match
  const handleRejectMatch = (participantIdx: number) => {
    const updated = [...matchedParticipants];
    const p = updated[participantIdx];
    // Store original match for undo
    p.originalMatchedAthlete = p.matchedAthlete;
    p.matchRejected = true;
    p.selected = false;
    p.selectedDisciplines = [];
    setMatchedParticipants(updated);
  };

  // Handle undoing a rejected match
  const handleUndoRejectMatch = (participantIdx: number) => {
    const updated = [...matchedParticipants];
    const p = updated[participantIdx];
    p.matchRejected = false;
    // Clear create new athlete if it was set
    p.createNewAthlete = false;
    // Restore selection with upload discipline
    if (p.matchedAthlete && uploadDiscipline) {
      p.selectedDisciplines = [uploadDiscipline];
      p.selected = p.confidence >= 0.7;
    }
    setMatchedParticipants(updated);
  };

  // Mutation to directly save AI-matched entries to database - handles multiple disciplines per athlete
  const addAIEntriesMutation = useMutation({
    mutationFn: async (participants: MatchedParticipant[]) => {
      if (!selectedTournamentId) {
        throw new Error('Please select a tournament first');
      }

      if (!uploadDiscipline) {
        throw new Error('No discipline selected for import');
      }

      // Handle participants that need new athletes created first
      const newAthleteRequests = participants.filter(
        p => p.createNewAthlete && !p.matchedAthlete && p.newAthleteCountry
      );

      for (const p of newAthleteRequests) {
        const { data: newAthlete, error: createError } = await supabase
          .from('athletes')
          .insert({
            name: p.name,
            gender: p.newAthleteGender || p.gender,
            country: p.newAthleteCountry || 'UNK',
            federation: 'Unknown',
            year_of_birth: 2000, // Default
            disciplines: [uploadDiscipline],
            // LOW ratings for unranked athletes
            current_rating_slalom: uploadDiscipline === 'slalom' ? 55 : null,
            current_rating_trick: uploadDiscipline === 'trick' ? 55 : null,
            current_rating_jump: uploadDiscipline === 'jump' ? 55 : null,
            // No ranking (null = unranked)
            current_rank_slalom: null,
            current_rank_trick: null,
            current_rank_jump: null,
          })
          .select()
          .single();

        if (createError) throw createError;
        
        // Update the participant with the new athlete data
        p.matchedAthlete = {
          id: newAthlete.id,
          name: newAthlete.name,
          country: newAthlete.country,
          gender: newAthlete.gender,
          disciplines: newAthlete.disciplines || [],
          rankings: {},
          ratings: { [uploadDiscipline]: 55 }
        };
        p.selectedDisciplines = [uploadDiscipline];
        p.selected = true;
      }

      const toAdd = participants.filter(m => m.selected && m.matchedAthlete && m.selectedDisciplines.length > 0);
      if (toAdd.length === 0) {
        throw new Error('No athletes with disciplines selected to add');
      }

      // Validate all selected disciplines
      for (const p of toAdd) {
        for (const disc of p.selectedDisciplines) {
          if (!VALID_DISCIPLINES.includes(disc as any)) {
            throw new Error(`Invalid discipline: ${disc}`);
          }
        }
      }

      // Get existing entries to avoid duplicates
      const { data: existingEntries } = await supabase
        .from('tournament_entries')
        .select('athlete_id, discipline')
        .eq('tournament_id', selectedTournamentId);

      const existingSet = new Set(existingEntries?.map(e => `${e.athlete_id}-${e.discipline}`) || []);

      // Refetch allAthletes to include newly created ones
      const { data: refreshedAthletes } = await supabase
        .from('athletes')
        .select('id, name, country, gender, disciplines, current_rank_slalom, current_rank_trick, current_rank_jump, current_rating_slalom, current_rating_trick, current_rating_jump');

      // Create entries for each athlete's selected disciplines WITH rank/rating data
      const entriesToAdd: Array<{
        tournament_id: string;
        athlete_id: string;
        discipline: string;
        custom_odds: number;
        override_rating: number | null;
        discipline_rank: number | null;
        rating_0_100: number;
        seed_rank: number | null;
      }> = [];

      // Helper to get discipline-specific rank/rating
      const getDisciplineData = (athlete: any, discipline: string) => {
        const rankField = `current_rank_${discipline}` as keyof typeof athlete;
        const ratingField = `current_rating_${discipline}` as keyof typeof athlete;
        return {
          rank: athlete?.[rankField] as number | null ?? null,
          rating: athlete?.[ratingField] as number | null ?? 70,
        };
      };

      // Handle "also add rejected athletes" - add original matched athletes that were rejected
      const alsoAddAthletes = participants.filter(
        p => p.matchRejected && p.alsoAddRejectedAthlete && p.originalMatchedAthlete
      );

      for (const p of alsoAddAthletes) {
        const athlete = p.originalMatchedAthlete!;
        const key = `${athlete.id}-${uploadDiscipline}`;
        
        if (!existingSet.has(key)) {
          // Find full athlete data for odds calculation
          const fullAthlete = refreshedAthletes?.find(a => a.id === athlete.id);
          const odds = calculateDefaultOdds(fullAthlete, uploadDiscipline);
          const { rank, rating } = getDisciplineData(fullAthlete, uploadDiscipline);
          
          entriesToAdd.push({
            tournament_id: selectedTournamentId,
            athlete_id: athlete.id,
            discipline: uploadDiscipline,
            custom_odds: odds,
            override_rating: null,
            discipline_rank: rank,
            rating_0_100: rating,
            seed_rank: null, // Will be auto-assigned by trigger if rank is null
          });
          existingSet.add(key); // Prevent duplicates
          console.log(`[ENTRY] AI-rejected-also-add: athlete=${athlete.name}, discipline=${uploadDiscipline}, rank=${rank}, rating=${rating}`);
        }
      }

      for (const p of toAdd) {
        const athlete = refreshedAthletes?.find(a => a.id === p.matchedAthlete!.id);
        for (const discipline of p.selectedDisciplines) {
          const key = `${p.matchedAthlete!.id}-${discipline}`;
          if (!existingSet.has(key)) {
            const calculatedOdds = calculateDefaultOdds(athlete, discipline);
            const overrideRating = p.overrideRatings[discipline];
            const { rank, rating } = getDisciplineData(athlete, discipline);
            
            entriesToAdd.push({
              tournament_id: selectedTournamentId,
              athlete_id: p.matchedAthlete!.id,
              discipline,
              custom_odds: calculatedOdds,
              override_rating: overrideRating !== undefined ? overrideRating : null,
              discipline_rank: rank,
              rating_0_100: overrideRating ?? rating,
              seed_rank: null, // Will be auto-assigned by trigger if rank is null
            });
            existingSet.add(key); // Prevent duplicates
            console.log(`[ENTRY] AI-add: athlete=${p.matchedAthlete!.name}, discipline=${discipline}, rank=${rank}, rating=${overrideRating ?? rating}`);
          }
        }
      }

      if (entriesToAdd.length === 0) {
        throw new Error('All selected athletes are already entered for their disciplines');
      }

      const { error: entriesError } = await supabase
        .from('tournament_entries')
        .insert(entriesToAdd);
      
      if (entriesError) throw entriesError;

      // Group entries by discipline and gender to create markets
      const disciplineGenderGroups = new Map<string, typeof entriesToAdd>();
      for (const entry of entriesToAdd) {
        const athlete = refreshedAthletes?.find(a => a.id === entry.athlete_id);
        const key = `${entry.discipline}-${athlete?.gender}`;
        if (!disciplineGenderGroups.has(key)) {
          disciplineGenderGroups.set(key, []);
        }
        disciplineGenderGroups.get(key)!.push(entry);
      }

      for (const [key, groupEntries] of disciplineGenderGroups) {
        const [discipline, gender] = key.split('-');
        const category = gender === 'male' ? 'open_men' : 'open_women';

        const marketTypes = ['WINNER', 'PODIUM', 'HIGHEST_SCORE'];
        const marketIds: Record<string, string> = {};

        for (const marketType of marketTypes) {
          // Use upsert to create or get existing market
          const { data: market, error: marketError } = await supabase
            .from('markets')
            .upsert({
              tournament_id: selectedTournamentId,
              discipline,
              category,
              market_type: marketType,
              name: `${discipline} ${category} ${marketType.replace('_', ' ')}`,
            }, {
              onConflict: 'tournament_id,discipline,category,market_type',
              ignoreDuplicates: false
            })
            .select()
            .single();

          if (marketError) throw marketError;
          if (market) marketIds[marketType] = market.id;
        }

        // Create selections for each athlete in this group
        for (const entry of groupEntries) {
          const athlete = refreshedAthletes?.find(a => a.id === entry.athlete_id);
          if (!athlete) continue;

          const selections = [];
          
          if (marketIds['WINNER']) {
            selections.push({
              market_id: marketIds['WINNER'],
              athlete_id: entry.athlete_id,
              description: `${athlete.name} to win`,
              decimal_odds: entry.custom_odds,
            });
          }
          
          if (marketIds['PODIUM']) {
            selections.push({
              market_id: marketIds['PODIUM'],
              athlete_id: entry.athlete_id,
              description: `${athlete.name} podium finish`,
              decimal_odds: entry.custom_odds * 0.7,
            });
          }
          
          if (marketIds['HIGHEST_SCORE']) {
            selections.push({
              market_id: marketIds['HIGHEST_SCORE'],
              athlete_id: entry.athlete_id,
              description: `${athlete.name} highest score`,
              decimal_odds: entry.custom_odds,
            });
          }

          if (selections.length > 0) {
            const { error: selectionsError } = await supabase
              .from('selections')
              .upsert(selections, { 
                onConflict: 'market_id,athlete_id',
                ignoreDuplicates: false 
              });

            if (selectionsError) throw selectionsError;
          }
        }
      }

      // After creating all markets and selections, generate proper Monte Carlo odds
      const { data: allMarkets } = await supabase
        .from('markets')
        .select('id')
        .eq('tournament_id', selectedTournamentId);

      for (const market of allMarkets || []) {
        try {
          await supabase.functions.invoke('generate-market-odds', {
            body: { market_id: market.id }
          });
        } catch (err) {
          console.error(`Failed to generate odds for market ${market.id}:`, err);
        }
      }

      return entriesToAdd.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['tournament-entries'] });
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['selections'] });
      queryClient.invalidateQueries({ queryKey: ['athletes-for-tournament'] });
      queryClient.invalidateQueries({ queryKey: ['all-athletes-for-matching'] });
      toast.success(`Added ${count} entries, created markets & generated odds`);
      setShowPreviewDialog(false);
      setAiFiles([]);
      setMatchedParticipants([]);
      setUploadDiscipline('');
      setDetectedDiscipline('');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add athletes: ${error.message}`);
    },
  });

  const handleApplyAIMatches = () => {
    addAIEntriesMutation.mutate(matchedParticipants);
  };

  // Toggle a discipline for a participant
  const handleToggleDiscipline = (participantIdx: number, discipline: string) => {
    const updated = [...matchedParticipants];
    const p = updated[participantIdx];
    if (p.selectedDisciplines.includes(discipline)) {
      p.selectedDisciplines = p.selectedDisciplines.filter(d => d !== discipline);
    } else {
      p.selectedDisciplines = [...p.selectedDisciplines, discipline];
    }
    // Auto-select if any discipline is selected
    p.selected = p.selectedDisciplines.length > 0 && !!p.matchedAthlete;
    setMatchedParticipants(updated);
  };

  // Handle override rating change
  const handleOverrideRatingChange = (participantIdx: number, discipline: string, value: string) => {
    const updated = [...matchedParticipants];
    const p = updated[participantIdx];
    const numValue = value === '' ? undefined : parseInt(value, 10);
    p.overrideRatings = {
      ...p.overrideRatings,
      [discipline]: numValue !== undefined && numValue >= 50 && numValue <= 100 ? numValue : undefined
    };
    setMatchedParticipants(updated);
  };

  const addEntriesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDiscipline || !athletes || athletes.length === 0) {
        throw new Error('Please wait for athletes data to load and try again.');
      }

      // Get discipline-specific rank/rating for each athlete
      const getDisciplineData = (athlete: any) => {
        const rankField = `current_rank_${selectedDiscipline}` as keyof typeof athlete;
        const ratingField = `current_rating_${selectedDiscipline}` as keyof typeof athlete;
        return {
          rank: athlete?.[rankField] as number | null ?? null,
          rating: athlete?.[ratingField] as number | null ?? 70,
        };
      };

      const entriesToAdd = Array.from(selectedAthletes).map(athleteId => {
        const athlete = athletes.find(a => a.id === athleteId);
        const customOddsValue = customOdds[athleteId];
        const calculatedOdds = customOddsValue 
          ? parseFloat(customOddsValue) 
          : calculateDefaultOdds(athlete, selectedDiscipline);
        const { rank, rating } = getDisciplineData(athlete);

        console.log(`[ENTRY] Manual-add: athlete=${athlete?.name}, discipline=${selectedDiscipline}, rank=${rank}, rating=${rating}`);

        return {
          tournament_id: selectedTournamentId,
          athlete_id: athleteId,
          discipline: selectedDiscipline,
          custom_odds: calculatedOdds,
          discipline_rank: rank,
          rating_0_100: rating,
          seed_rank: null, // Will be auto-assigned by trigger if rank is null
        };
      });

      const { error } = await supabase
        .from('tournament_entries')
        .upsert(entriesToAdd, {
          onConflict: 'tournament_id,athlete_id,discipline',
          ignoreDuplicates: false
        });
      
      if (error) throw error;

      // Auto-generate markets and selections
      const tournament = tournaments?.find(t => t.id === selectedTournamentId);
      if (!tournament) return;

      const filteredAthletes = athletes.filter(a => 
        entriesToAdd.some(e => e.athlete_id === a.id)
      );
      const genders = [...new Set(filteredAthletes.map(a => a.gender))];

      for (const gender of genders) {
        const category = gender === 'male' ? 'open_men' : 'open_women';
        
        // Create or get existing WINNER market
        const { data: winnerMarket, error: marketError } = await supabase
          .from('markets')
          .upsert({
            tournament_id: selectedTournamentId,
            discipline: selectedDiscipline,
            category,
            market_type: 'WINNER',
            name: `${selectedDiscipline} ${category} Winner`,
          }, {
            onConflict: 'tournament_id,discipline,category,market_type',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (marketError) throw marketError;

        // Create or get existing PODIUM market
        const { data: podiumMarket, error: podiumError } = await supabase
          .from('markets')
          .upsert({
            tournament_id: selectedTournamentId,
            discipline: selectedDiscipline,
            category,
            market_type: 'PODIUM',
            name: `${selectedDiscipline} ${category} Podium`,
          }, {
            onConflict: 'tournament_id,discipline,category,market_type',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (podiumError) throw podiumError;

        // Create or get existing HIGHEST_SCORE market
        const { data: scoreMarket, error: scoreError } = await supabase
          .from('markets')
          .upsert({
            tournament_id: selectedTournamentId,
            discipline: selectedDiscipline,
            category,
            market_type: 'HIGHEST_SCORE',
            name: `${selectedDiscipline} ${category} Highest Score`,
          }, {
            onConflict: 'tournament_id,discipline,category,market_type',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (scoreError) throw scoreError;

        // Create selections for all markets
        const relevantEntries = entriesToAdd.filter(e => {
          const athlete = filteredAthletes.find(a => a.id === e.athlete_id);
          return athlete?.gender === gender;
        });

        for (const entry of relevantEntries) {
          const athlete = filteredAthletes.find(a => a.id === entry.athlete_id);
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

      // After creating all markets and selections, generate proper Monte Carlo odds
      const { data: allMarkets } = await supabase
        .from('markets')
        .select('id')
        .eq('tournament_id', selectedTournamentId);

      for (const market of allMarkets || []) {
        try {
          await supabase.functions.invoke('generate-market-odds', {
            body: { market_id: market.id }
          });
        } catch (err) {
          console.error(`Failed to generate odds for market ${market.id}:`, err);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-entries'] });
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['selections'] });
      toast.success('Athletes added, markets created & odds generated');
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

  // Count total entries to be added (athlete-discipline combos)
  const alsoAddCount = matchedParticipants.filter(
    m => m.matchRejected && m.alsoAddRejectedAthlete && m.originalMatchedAthlete
  ).length;
  const totalEntriesToAdd = matchedParticipants
    .filter(m => (m.selected && m.matchedAthlete) || (m.createNewAthlete && m.newAthleteCountry))
    .reduce((sum, m) => sum + m.selectedDisciplines.length, 0) + alsoAddCount;

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

            {/* Probability Review Panel - shows after entries exist */}
            {entries && entries.length > 0 && (
              <ProbabilityReviewPanel 
                tournamentId={selectedTournamentId}
                onPublish={() => {
                  queryClient.invalidateQueries({ queryKey: ['tournament-entries'] });
                  toast.success('Markets are now live for betting!');
                }}
              />
            )}

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
                
                {/* Discipline pre-selection - REQUIRED before upload */}
                <div className="space-y-2">
                  <Label className="text-base font-medium">What discipline is this running order for? *</Label>
                  <Select 
                    value={uploadDiscipline} 
                    onValueChange={(v) => setUploadDiscipline(v as Discipline)}
                  >
                    <SelectTrigger className={!uploadDiscipline ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select discipline (required)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slalom">Slalom</SelectItem>
                      <SelectItem value="trick">Trick</SelectItem>
                      <SelectItem value="jump">Jump</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    All athletes in this upload will be added ONLY for this discipline, regardless of their other events.
                  </p>
                </div>
                
                <BatchImageUploader
                  files={aiFiles}
                  onFilesChange={setAiFiles}
                  onParseAll={handleParseFiles}
                  isParsing={isParsing}
                  disabled={!uploadDiscipline}
                />

                {detectedDiscipline && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">Import discipline: {detectedDiscipline}</Badge>
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
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              AI Matched Participants
              <Badge variant="secondary">{matchedParticipants.length} found</Badge>
              {uploadDiscipline && (
                <Badge className="bg-primary">{uploadDiscipline.toUpperCase()}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-wrap gap-4 text-sm mb-4">
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
            <div className="flex items-center gap-1 ml-auto">
              <Badge variant="outline">{totalEntriesToAdd} entries to add</Badge>
            </div>
          </div>

          {/* Info about discipline selection */}
          <div className="flex items-center gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 mb-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium">Single discipline import:</span> All athletes will be added for <strong>{uploadDiscipline}</strong> only. Unmatched athletes can be created as new profiles with low ratings.
            </div>
          </div>

          <ScrollArea className="h-[50vh]">
            <div className="space-y-6">
              {maleParticipants.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Badge className="bg-blue-500">♂ Male</Badge>
                    <span>{maleParticipants.length} participants</span>
                  </h3>
                  <div className="space-y-2">
                    {maleParticipants.map((participant, idx) => {
                      const globalIdx = matchedParticipants.findIndex(p => p === participant);
                      return (
                        <ParticipantMatchRow
                          key={`male-${idx}`}
                          participant={participant}
                          uploadDiscipline={uploadDiscipline}
                          onToggle={() => {
                            const updated = [...matchedParticipants];
                            updated[globalIdx] = { ...participant, selected: !participant.selected };
                            setMatchedParticipants(updated);
                          }}
                          onToggleDiscipline={(disc) => handleToggleDiscipline(globalIdx, disc)}
                          onOverrideRatingChange={(disc, val) => handleOverrideRatingChange(globalIdx, disc, val)}
                          onUpdateNewAthlete={(field, value) => handleUpdateNewAthlete(globalIdx, field, value)}
                          onRejectMatch={() => handleRejectMatch(globalIdx)}
                          onUndoRejectMatch={() => handleUndoRejectMatch(globalIdx)}
                          onSelectAlternative={(altId) => {
                            const alt = participant.alternatives?.find(a => a.id === altId);
                            const altAthlete = allAthletes?.find(a => a.id === altId);
                            if (alt && altAthlete) {
                              const updated = [...matchedParticipants];
                              updated[globalIdx] = {
                                ...participant,
                                matchedAthlete: { 
                                  ...alt, 
                                  gender: 'male',
                                  rankings: {
                                    slalom: altAthlete.current_rank_slalom || undefined,
                                    trick: altAthlete.current_rank_trick || undefined,
                                    jump: altAthlete.current_rank_jump || undefined,
                                  },
                                  ratings: {
                                    slalom: altAthlete.current_rating_slalom || undefined,
                                    trick: altAthlete.current_rating_trick || undefined,
                                    jump: altAthlete.current_rating_jump || undefined,
                                  }
                                },
                                selectedDisciplines: [uploadDiscipline],
                                overrideRatings: {},
                                confidence: 0.8,
                                selected: true,
                                createNewAthlete: false,
                                matchRejected: false,
                              };
                              setMatchedParticipants(updated);
                            }
                          }}
                          allAthletes={allAthletes}
                        />
                      );
                    })}
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
                    {femaleParticipants.map((participant, idx) => {
                      const globalIdx = matchedParticipants.findIndex(p => p === participant);
                      return (
                        <ParticipantMatchRow
                          key={`female-${idx}`}
                          participant={participant}
                          uploadDiscipline={uploadDiscipline}
                          onToggle={() => {
                            const updated = [...matchedParticipants];
                            updated[globalIdx] = { ...participant, selected: !participant.selected };
                            setMatchedParticipants(updated);
                          }}
                          onToggleDiscipline={(disc) => handleToggleDiscipline(globalIdx, disc)}
                          onOverrideRatingChange={(disc, val) => handleOverrideRatingChange(globalIdx, disc, val)}
                          onUpdateNewAthlete={(field, value) => handleUpdateNewAthlete(globalIdx, field, value)}
                          onRejectMatch={() => handleRejectMatch(globalIdx)}
                          onUndoRejectMatch={() => handleUndoRejectMatch(globalIdx)}
                          onSelectAlternative={(altId) => {
                            const alt = participant.alternatives?.find(a => a.id === altId);
                            const altAthlete = allAthletes?.find(a => a.id === altId);
                            if (alt && altAthlete) {
                              const updated = [...matchedParticipants];
                              updated[globalIdx] = {
                                ...participant,
                                matchedAthlete: { 
                                  ...alt, 
                                  gender: 'female',
                                  rankings: {
                                    slalom: altAthlete.current_rank_slalom || undefined,
                                    trick: altAthlete.current_rank_trick || undefined,
                                    jump: altAthlete.current_rank_jump || undefined,
                                  },
                                  ratings: {
                                    slalom: altAthlete.current_rating_slalom || undefined,
                                    trick: altAthlete.current_rating_trick || undefined,
                                    jump: altAthlete.current_rating_jump || undefined,
                                  }
                                },
                                selectedDisciplines: [uploadDiscipline],
                                overrideRatings: {},
                                confidence: 0.8,
                                selected: true,
                                createNewAthlete: false,
                                matchRejected: false,
                              };
                              setMatchedParticipants(updated);
                            }
                          }}
                          allAthletes={allAthletes}
                        />
                      );
                    })}
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
                totalEntriesToAdd === 0
              }
            >
              {addAIEntriesMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${totalEntriesToAdd} Entries to Tournament`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

// Sub-component for participant match rows with discipline checkboxes
function ParticipantMatchRow({
  participant,
  uploadDiscipline,
  onToggle,
  onToggleDiscipline,
  onOverrideRatingChange,
  onUpdateNewAthlete,
  onSelectAlternative,
  onRejectMatch,
  onUndoRejectMatch,
  allAthletes
}: {
  participant: MatchedParticipant;
  uploadDiscipline: Discipline | '';
  onToggle: () => void;
  onToggleDiscipline: (discipline: string) => void;
  onOverrideRatingChange: (discipline: string, value: string) => void;
  onUpdateNewAthlete: (field: 'country' | 'gender' | 'create' | 'alsoAddRejected', value: any) => void;
  onSelectAlternative: (id: string) => void;
  onRejectMatch: () => void;
  onUndoRejectMatch: () => void;
  allAthletes: any[] | undefined;
}) {
  const isRejected = participant.matchRejected;
  const isMatched = !isRejected && participant.confidence >= 0.7 && participant.matchedAthlete;
  const isUncertain = !isRejected && participant.confidence > 0 && participant.confidence < 0.7 && participant.matchedAthlete;
  const notFound = !participant.matchedAthlete;
  const showCreateSection = notFound || isRejected;

  const athleteDisciplines = participant.matchedAthlete?.disciplines || [];
  const rankings = participant.matchedAthlete?.rankings || {};
  const ratings = participant.matchedAthlete?.ratings || {};

  return (
    <div className={`p-3 border rounded-lg ${participant.selected || participant.createNewAthlete ? 'bg-accent/50 border-primary' : ''} ${isRejected ? 'border-yellow-500/50' : ''}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={participant.selected}
          onCheckedChange={onToggle}
          disabled={(notFound || isRejected) && !participant.createNewAthlete}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isMatched && <Check className="h-4 w-4 text-green-500 flex-shrink-0" />}
            {isUncertain && <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
            {isRejected && !participant.createNewAthlete && <X className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
            {notFound && !participant.createNewAthlete && !isRejected && <X className="h-4 w-4 text-red-500 flex-shrink-0" />}
            {participant.createNewAthlete && <UserPlus className="h-4 w-4 text-blue-500 flex-shrink-0" />}
            <span className="font-medium truncate">"{participant.name}"</span>
            <span className="text-muted-foreground">→</span>
            {isRejected && participant.matchedAthlete ? (
              <span className="text-muted-foreground line-through truncate">
                {participant.matchedAthlete.name} ({participant.matchedAthlete.country})
              </span>
            ) : participant.matchedAthlete && !isRejected ? (
              <span className="text-primary truncate">
                {participant.matchedAthlete.name} ({participant.matchedAthlete.country})
              </span>
            ) : participant.createNewAthlete ? (
              <span className="text-blue-500 truncate">
                Will create: {participant.name} ({participant.newAthleteCountry || 'UNK'})
              </span>
            ) : (
              <span className="text-destructive">No match found</span>
            )}
            
            {/* Reject match button */}
            {participant.matchedAthlete && !isRejected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onRejectMatch}
              >
                <X className="h-3 w-3 mr-1" />
                Not this person
              </Button>
            )}
            
            {/* Undo reject button */}
            {isRejected && participant.matchedAthlete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                onClick={onUndoRejectMatch}
              >
                Undo reject
              </Button>
            )}
          </div>
          
          {/* Rankings display - only show if not rejected */}
          {participant.matchedAthlete && !isRejected && (
            <div className="text-xs text-muted-foreground mt-1">
              Rankings: 
              {rankings.slalom && <span className="ml-1">S#{rankings.slalom}</span>}
              {rankings.trick && <span className="ml-1">T#{rankings.trick}</span>}
              {rankings.jump && <span className="ml-1">J#{rankings.jump}</span>}
              {!rankings.slalom && !rankings.trick && !rankings.jump && <span className="ml-1">N/A</span>}
            </div>
          )}

          {/* Discipline checkboxes with override rating - for matched athletes (not rejected) */}
          {participant.matchedAthlete && uploadDiscipline && !isRejected && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">Event:</span>
                {(() => {
                  const disc = uploadDiscipline;
                  const isSelected = participant.selectedDisciplines.includes(disc);
                  const currentRating = ratings[disc as keyof typeof ratings];
                  const overrideRating = participant.overrideRatings[disc];
                  
                  return (
                    <div key={disc} className="flex items-center gap-2">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleDiscipline(disc)}
                          className="h-3 w-3"
                        />
                        <span className={`text-xs capitalize ${isSelected ? 'font-medium' : 'text-muted-foreground'}`}>
                          {disc}
                        </span>
                      </label>
                      {isSelected && (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {currentRating || 70}
                          </Badge>
                          <Input
                            type="number"
                            min="50"
                            max="100"
                            placeholder="Override"
                            value={overrideRating ?? ''}
                            onChange={(e) => onOverrideRatingChange(disc, e.target.value)}
                            className={`h-6 w-16 text-xs ${overrideRating ? 'border-yellow-500 bg-yellow-500/10' : ''}`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Create new athlete section - show for unmatched OR rejected matches */}
          {showCreateSection && (
            <div className="mt-2 p-2 bg-muted rounded border border-dashed">
              {isRejected && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1">
                  Match rejected - create new profile or select an alternative
                </p>
              )}
              <p className="text-xs text-muted-foreground mb-2">
                Create temporary profile for this athlete (wildcard/qualifier) - will have low rating & high odds
              </p>
              <div className="flex gap-2 flex-wrap items-center">
                <Input
                  placeholder="Country (e.g., USA)"
                  value={participant.newAthleteCountry || ''}
                  onChange={(e) => onUpdateNewAthlete('country', e.target.value)}
                  className="h-7 w-24 text-xs"
                />
                <Select 
                  value={participant.newAthleteGender || participant.gender} 
                  onValueChange={(v) => onUpdateNewAthlete('gender', v)}
                >
                  <SelectTrigger className="h-7 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Checkbox
                    id={`create-${participant.name}`}
                    checked={participant.createNewAthlete || false}
                    onCheckedChange={(c) => onUpdateNewAthlete('create', c)}
                  />
                  <Label htmlFor={`create-${participant.name}`} className="text-xs cursor-pointer">
                    Create & Add
                  </Label>
                </div>
              </div>
              
              {/* Option to also add the rejected athlete */}
              {isRejected && participant.originalMatchedAthlete && (
                <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`also-add-${participant.name}`}
                      checked={participant.alsoAddRejectedAthlete || false}
                      onCheckedChange={(c) => onUpdateNewAthlete('alsoAddRejected', c)}
                    />
                    <Label htmlFor={`also-add-${participant.name}`} className="text-xs cursor-pointer">
                      Also add <strong>{participant.originalMatchedAthlete.name}</strong> ({participant.originalMatchedAthlete.country}) to tournament
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Check this if both athletes should be in the tournament
                  </p>
                </div>
              )}
            </div>
          )}

          {participant.confidence > 0 && participant.confidence < 1 && !isRejected && (
            <div className="text-xs text-muted-foreground mt-1">
              Confidence: {Math.round(participant.confidence * 100)}%
            </div>
          )}
        </div>
        
        {participant.alternatives && participant.alternatives.length > 0 && (
          <Select onValueChange={onSelectAlternative}>
            <SelectTrigger className="w-36 flex-shrink-0">
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
