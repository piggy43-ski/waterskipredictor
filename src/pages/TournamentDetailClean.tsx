import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useParams, useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { SelectionCard } from '@/components/SelectionCard';
import { PredictionDialog } from '@/components/PredictionDialog';
import { PodiumSelectionCard } from '@/components/PodiumSelectionCard';
import { PodiumPredictionDialog } from '@/components/PodiumPredictionDialog';
import { PodiumPositionAssigner } from '@/components/PodiumPositionAssigner';
import { TournamentResults } from '@/components/TournamentResults';
import { UserTournamentResults } from '@/components/UserTournamentResults';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Selection, Tournament, Market, MarketType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock, AlertCircle, Users, HelpCircle, Settings2, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ParlayBuilder } from '@/components/ParlayBuilder';
import { Button } from '@/components/ui/button';
import { getPredictionWindowStatus } from '@/utils/predictionWindows';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SimulationDetails } from '@/components/SimulationDetails';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { SEO } from '@/components/SEO';
import { EventShareModal } from '@/components/EventShareModal';
import type { EventShareCardProps, EventShareRow } from '@/components/EventShareCard';
import { useUsername } from '@/hooks/useUsername';
import { Share2 } from 'lucide-react';

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  exposureInfo?: {
    athleteName: string;
    currentExposurePct: number;
    maxExposurePct: number;
    remainingCapacity: number;
    isAtCapacity: boolean;
  };
}


function buildEventShareFromPredictions(
  rows: any[],
  tournamentName: string,
  dateLabel?: string,
): Omit<EventShareCardProps, 'username'> {
  const MARKET: Record<string, string> = { WINNER: 'WIN', PODIUM: 'POD', HIGHEST_SCORE: 'HIGH' };
  const slipCounts: Record<string, number> = {};
  rows.forEach((r) => { if (r.bet_slip_id) slipCounts[r.bet_slip_id] = (slipCounts[r.bet_slip_id] || 0) + 1; });
  const entryCount = Object.keys(slipCounts).length || rows.length;
  const parlayCount = Object.values(slipCounts).filter((c) => c > 1).length;
  let totalEntry = 0, totalReward = 0, anyPending = false;
  const rowsAll: EventShareRow[] = rows.map((r) => {
    totalEntry += r.staked_tokens || 0;
    if (r.status === 'PENDING') anyPending = true;
    totalReward += (r.status === 'WON' ? (r.payout_tokens ?? r.potential_payout ?? 0) : (r.status === 'PENDING' ? (r.potential_payout || 0) : 0));
    const disc = (r.discipline || '').toUpperCase();
    const who = r.athlete_name || '-';
    const mult = r.decimal_odds != null ? parseFloat(String(r.decimal_odds)) : undefined;
    return { chip: MARKET[r.market_type] || 'PICK', text: `${who}${disc ? ` \u00b7 ${disc}` : ''}`, mult };
  });
  const CAP = 12;
  return {
    tournamentName,
    dateLabel,
    pickCount: rows.length,
    entryCount,
    parlayCount,
    totalEntryTokens: totalEntry,
    totalProjectedReward: totalReward,
    settled: !anyPending,
    rows: rowsAll.slice(0, CAP),
    moreCount: Math.max(0, rowsAll.length - CAP),
  };
}

const TournamentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const username = useUsername();
  const [shareOpen, setShareOpen] = useState(false);
  
  // Determine initial discipline from URL query param
  const initialDiscipline = searchParams.get('discipline') || '';
  const [activeDiscipline, setActiveDiscipline] = useState(initialDiscipline);
  
  // Get highlighted athletes from "Predict Again" navigation
  const predictAgainAthletes: string[] = location.state?.predictAgainAthletes || location.state?.betAgainAthletes || [];
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [markets, setMarkets] = useState<Array<Market & { locked_at?: string | null; is_published?: boolean }>>([]);
  const [predictionsOpenAt, setPredictionsOpenAt] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [tournamentEntries, setTournamentEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [predictionWindow, setPredictionWindow] = useState<ReturnType<typeof getPredictionWindowStatus> | null>(null);
  const [athleteResults, setAthleteResults] = useState<any[]>([]);
  const [userPredictions, setUserPredictions] = useState<any[]>([]);

  // Auto-select first discipline when tournament loads
  useEffect(() => {
    if (!activeDiscipline && tournament?.disciplines?.length) {
      setActiveDiscipline(tournament.disciplines[0]);
    }
  }, [tournament, activeDiscipline]);

  
  const [podiumStateMap, setPodiumStateMap] = useState<Record<string, {
    selectedAthletes: Selection[];
    assignedPositions: { first: Selection; second: Selection; third: Selection } | null;
  }>>({});
  const [podiumDialogOpen, setPodiumDialogOpen] = useState(false);
  const [positionAssignerOpen, setPositionAssignerOpen] = useState(false);
  const [currentPodiumContext, setCurrentPodiumContext] = useState<{
    market: Market;
    discipline: string;
    gender: string;
  } | null>(null);
  
  // Parlay Builder state
  const [parlayBuilderOpen, setParlayBuilderOpen] = useState(false);
  
  // Gender state per discipline
  const [genderByDiscipline, setGenderByDiscipline] = useState<Record<string, 'men' | 'women'>>({});
  
  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    if (!user) return; // Just skip if no user - ProtectedRoute handles auth
    
    fetchTournamentData();
    fetchWalletBalance();
  }, [user, id]);

  // Show toast if user came from "Predict Again"
  useEffect(() => {
    if (predictAgainAthletes.length > 0 && !loading) {
      toast({
        title: "Previous picks highlighted",
      description: `${predictAgainAthletes.length} athlete(s) from your previous prediction are highlighted below`
      });
    }
  }, [predictAgainAthletes.length, loading]);

  useEffect(() => {
    if (!tournament) return;

    const updatePredictionWindow = () => {
      const startTime = tournament.start_datetime || tournament.start_date;
      const endTime = tournament.end_datetime || tournament.end_date;
      const lockTimes = markets.map((m) => m.locked_at).filter(Boolean) as string[];
      setPredictionWindow(
        getPredictionWindowStatus(startTime, endTime, tournament.settled_at, predictionsOpenAt, lockTimes)
      );
    };

    updatePredictionWindow();
    const interval = setInterval(updatePredictionWindow, 1000);

    return () => clearInterval(interval);
  }, [tournament, markets, predictionsOpenAt]);

  const fetchTournamentData = async () => {
    try {
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

      if (tournamentError) throw tournamentError;

      if (tournamentData) {
        setPredictionsOpenAt((tournamentData as any).betting_open_time ?? null);
        setTournament({
          id: tournamentData.id,
          name: tournamentData.name,
          location: tournamentData.location,
          start_date: tournamentData.start_date,
          end_date: tournamentData.end_date,
          start_datetime: tournamentData.start_datetime,
          end_datetime: tournamentData.end_datetime,
          disciplines: tournamentData.disciplines as ('slalom' | 'trick' | 'jump')[],
          status: tournamentData.status as 'upcoming' | 'live' | 'finished',
          settled_at: tournamentData.settled_at
        });

        // Fetch markets
        const { data: marketsData, error: marketsError } = await supabase
          .from('markets')
          .select('*')
          .eq('tournament_id', tournamentData.id)
          .eq('is_published', true);

        if (marketsError) throw marketsError;
        if (marketsData) setMarkets(marketsData as Market[]);

        const marketIds = marketsData?.map(m => m.id) || [];
        
        // Fetch selections with athletes (separate from overrides to avoid FK issues)
        const { data: selectionsData, error: selectionsError } = await supabase
          .from('selections')
          .select(`*, athlete:athletes(*)`)
          .in('market_id', marketIds);

        if (selectionsError) throw selectionsError;
        
        // Fetch enabled multiplier overrides separately
        const { data: overridesData } = await supabase
          .from('market_multiplier_overrides')
          .select('market_id, athlete_id, manual_multiplier, is_enabled')
          .in('market_id', marketIds)
          .eq('is_enabled', true);

        // Fetch market_odds for engine/field rank (athlete_rank) — this is the rank
        // the pricing engine actually used. UI must display this so cards match the math.
        const { data: marketOddsData } = await supabase
          .from('market_odds')
          .select('market_id, athlete_id, athlete_rank')
          .in('market_id', marketIds);

        // Merge overrides + engine rank into selections client-side
        if (selectionsData) {
          const processedSelections = selectionsData.map((sel: any) => {
            const override = overridesData?.find(
              o => o.market_id === sel.market_id && o.athlete_id === sel.athlete_id
            );
            const odds = marketOddsData?.find(
              o => o.market_id === sel.market_id && o.athlete_id === sel.athlete_id
            );

            return {
              ...sel,
              decimal_odds: override?.manual_multiplier ?? sel.decimal_odds,
              multiplier_source: override ? 'manual' : 'auto',
              field_rank: odds?.athlete_rank ?? null,
            };
          });
          setSelections(processedSelections as any);
        }

        // Fetch tournament entries for ranking data
        const { data: entriesData, error: entriesError } = await supabase
          .from('tournament_entries')
          .select('athlete_id, discipline, discipline_rank, seed_rank, rating_0_100')
          .eq('tournament_id', tournamentData.id);
        
        if (!entriesError && entriesData) {
          setTournamentEntries(entriesData);
        }

        // If finished, fetch results
        if (tournamentData.status === 'finished') {
          const { data: resultsData, error: resultsError } = await supabase
            .from('athlete_results')
            .select(`
              *,
              athlete:athletes(*)
            `)
            .eq('tournament_id', tournamentData.id)
            .order('position', { ascending: true });

          if (!resultsError && resultsData) {
            setAthleteResults(resultsData);
          }

          // Fetch user's predictions for this tournament
          if (user) {
            const { data: slipsData } = await supabase
              .from('bet_slips')
              .select('id')
              .eq('user_id', user.id)
              .eq('tournament_id', tournamentData.id);
            
            const slipIds = slipsData?.map(s => s.id) || [];
            
            if (slipIds.length > 0) {
              const { data: predictionsData, error: predictionsError } = await supabase
                .from('predictions')
                .select('*')
                .in('bet_slip_id', slipIds)
                .order('created_at', { ascending: false });

              if (!predictionsError && predictionsData) {
                setUserPredictions(predictionsData);
              }
            } else {
              // Fallback: query by tournament_name
              const { data: predictionsData, error: predictionsError } = await supabase
                .from('predictions')
                .select('*')
                .eq('user_id', user.id)
                .eq('tournament_name', tournamentData.name)
                .order('created_at', { ascending: false });

              if (!predictionsError && predictionsData) {
                setUserPredictions(predictionsData);
              }
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error loading tournament",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletBalance = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('token_wallets')
      .select('purchased_tokens, earned_tokens')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      toast({
        title: "Error loading wallet",
        description: "Please try again later",
        variant: "destructive"
      });
      return;
    }

    if (data) {
      setWalletBalance(data.purchased_tokens + data.earned_tokens);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Tournament" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }
  
  if (!tournament) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Tournament" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Tournament not found
        </div>
        <BottomNav />
      </div>
    );
  }

  const menMarkets = markets.filter(m => m.category === 'open_men');
  const womenMarkets = markets.filter(m => m.category === 'open_women');

  // Helper to get effective rank for an athlete in a specific discipline
  const getEffectiveRank = (athleteId: string, discipline: string): number => {
    // First check tournament_entries for discipline-specific rank
    const entry = tournamentEntries.find(
      e => e.athlete_id === athleteId && e.discipline === discipline
    );
    
    if (entry) {
      // Prefer discipline_rank (world rank), fall back to seed_rank
      if (entry.discipline_rank !== null && entry.discipline_rank !== undefined) {
        return entry.discipline_rank;
      }
      if (entry.seed_rank !== null && entry.seed_rank !== undefined) {
        return 1000 + entry.seed_rank; // Seed ranks come after world ranks
      }
    }
    
    return 9999; // Unknown rank goes last
  };

  // Helper to get rating for tie-breaking
  const getEffectiveRating = (athleteId: string, discipline: string): number => {
    const entry = tournamentEntries.find(
      e => e.athlete_id === athleteId && e.discipline === discipline
    );
    return entry?.rating_0_100 ?? 50;
  };

  // Sorting function for selections
  const sortSelections = (a: Selection, b: Selection, discipline: string) => {
    // Primary: lowest odds first (best chance)
    if (a.decimal_odds !== b.decimal_odds) {
      return a.decimal_odds - b.decimal_odds;
    }
    // Secondary: by discipline-specific rank (from tournament_entries)
    const rankA = getEffectiveRank(a.athlete_id, discipline);
    const rankB = getEffectiveRank(b.athlete_id, discipline);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    // Tertiary: by rating (higher is better)
    const ratingA = getEffectiveRating(a.athlete_id, discipline);
    const ratingB = getEffectiveRating(b.athlete_id, discipline);
    return ratingB - ratingA;
  };

  const handleSelectSelection = (selection: Selection) => {
    if (!predictionWindow?.canPredict) {
      toast({
        title: "Predictions Closed",
        description: predictionWindow?.message || "Predictions are not available for this tournament",
        variant: "destructive"
      });
      return;
    }
    
    setSelectedSelection(selection);
    setDialogOpen(true);
  };

  const getPodiumKey = (discipline: string, gender: string) => `${discipline}-${gender}`;

  const getPodiumState = (discipline: string, gender: string) => {
    const key = getPodiumKey(discipline, gender);
    return podiumStateMap[key] || { selectedAthletes: [], assignedPositions: null };
  };

  const handleTogglePodiumAthlete = (athlete: Selection, discipline: string, gender: string, market: Market) => {
    const key = getPodiumKey(discipline, gender);
    const currentState = getPodiumState(discipline, gender);
    
    let newSelectedAthletes: Selection[];
    
    if (currentState.selectedAthletes.some(a => a.id === athlete.id)) {
      newSelectedAthletes = currentState.selectedAthletes.filter(a => a.id !== athlete.id);
    } else if (currentState.selectedAthletes.length < 3) {
      newSelectedAthletes = [...currentState.selectedAthletes, athlete];
      
      if (newSelectedAthletes.length === 3) {
        setCurrentPodiumContext({ market, discipline, gender });
        setPositionAssignerOpen(true);
      }
    } else {
      return;
    }
    
    setPodiumStateMap(prev => ({
      ...prev,
      [key]: {
        ...currentState,
        selectedAthletes: newSelectedAthletes
      }
    }));
  };

  const handleAssignPositions = (positions: { first: Selection; second: Selection; third: Selection }) => {
    if (!currentPodiumContext) return;
    
    const key = getPodiumKey(currentPodiumContext.discipline, currentPodiumContext.gender);
    setPodiumStateMap(prev => ({
      ...prev,
      [key]: {
        selectedAthletes: [positions.first, positions.second, positions.third],
        assignedPositions: positions
      }
    }));
    
    setPositionAssignerOpen(false);
  };

  // Validate entry against risk controls
  const validateEntry = async (
    athleteId: string,
    marketId: string,
    stakeAmount: number,
    currentOdds: number,
    marketType: MarketType
  ): Promise<ValidationResult | null> => {
    if (!user || !tournament) return null;
    
    try {
      const { data, error } = await supabase.functions.invoke('validate-entry', {
        body: {
          userId: user.id,
          tournamentId: tournament.id,
          marketId,
          athleteId,
          stakeAmount,
          currentOdds,
          marketType
        }
      });
      
      if (error) throw error;
      return data as ValidationResult;
    } catch (error) {
      console.error('Validation error:', error);
      return null;
    }
  };

  const handleConfirmPodiumPrediction = async (stakeAmount: number) => {
    if (!user || !currentPodiumContext || !tournament) return;
    
    const podiumState = getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender);
    if (!podiumState.assignedPositions) return;
    
    try {
      const podiumMarket = currentPodiumContext.market;
      
      // Resolve combined multiplier through the safe ordering-override path.
      // Falls back to the formula (PODIUM_BONUS_FACTOR=1, cap 150x) when no
      // override row matches the chosen (1st, 2nd, 3rd) triple.
      const { resolvePodiumOrderedMultiplier } = await import('@/utils/podiumMultipliers');
      const podiumResolution = await resolvePodiumOrderedMultiplier({
        marketId: podiumMarket.id,
        firstAthleteId: podiumState.assignedPositions.first.athlete_id,
        secondAthleteId: podiumState.assignedPositions.second.athlete_id,
        thirdAthleteId: podiumState.assignedPositions.third.athlete_id,
        decimalOdds: [
          podiumState.assignedPositions.first.decimal_odds,
          podiumState.assignedPositions.second.decimal_odds,
          podiumState.assignedPositions.third.decimal_odds,
        ],
      });
      const combinedOdds = podiumResolution.multiplier;
      
      // Validate entry before placing
      setIsValidating(true);
      const validation = await validateEntry(
        podiumState.assignedPositions.first.athlete_id,
        podiumMarket.id,
        stakeAmount,
        combinedOdds,
        'PODIUM'
      );
      setIsValidating(false);
      
      if (!validation) {
        toast({
          title: "Validation Error",
          description: "Unable to validate entry. Please try again.",
          variant: "destructive"
        });
        return;
      }
      
      if (!validation.allowed) {
        toast({
          title: "Entry Not Allowed",
          description: validation.reason || "This entry cannot be placed",
          variant: "destructive"
        });
        return;
      }
      
      // Show warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          toast({
            title: "Notice",
            description: warning,
          });
        });
      }
      
      // OPTION A: No odds adjustment - multipliers are fixed
      // Just use the original combined odds
      const potentialPayout = Math.floor(stakeAmount * combinedOdds);

      // Step 1: Create bet_slip FIRST
      const americanOdds = combinedOdds >= 2 
        ? Math.round((combinedOdds - 1) * 100)
        : Math.round(-100 / (combinedOdds - 1));
        
      const { data: entrySlip, error: slipError } = await supabase
        .from('bet_slips')
        .insert({
          user_id: user.id,
          tournament_id: tournament.id,
          type: 'single',
          leg_count: 1,
          total_stake_tokens: stakeAmount,
          total_odds_decimal: combinedOdds,
          total_odds_american: americanOdds,
          potential_payout_tokens: potentialPayout,
          status: 'PENDING'
        })
        .select()
        .single();

      if (slipError) throw slipError;

      // Step 2: Create the main parent prediction linked to bet_slip
      const { data: parentPrediction, error: parentError } = await supabase
        .from('predictions')
        .insert({
          user_id: user.id,
          selection_id: `${podiumMarket.id}-podium`,
          athlete_name: `Podium: ${podiumState.assignedPositions.first.athlete.name}, ${podiumState.assignedPositions.second.athlete.name}, ${podiumState.assignedPositions.third.athlete.name}`,
          tournament_name: tournament.name,
          discipline: currentPodiumContext.discipline,
          category: podiumMarket.category,
          market_type: 'PODIUM',
          staked_tokens: stakeAmount,
          decimal_odds: combinedOdds,
          potential_payout: potentialPayout,
          bet_slip_id: entrySlip.id,
          is_parlay_parent: true,
          status: 'PENDING'
        })
        .select()
        .single();

      if (parentError) throw parentError;

      // Insert podium selections
      const podiumInserts = [
        {
          prediction_id: parentPrediction.id,
          athlete_id: podiumState.assignedPositions.first.athlete_id,
          position_predicted: 1
        },
        {
          prediction_id: parentPrediction.id,
          athlete_id: podiumState.assignedPositions.second.athlete_id,
          position_predicted: 2
        },
        {
          prediction_id: parentPrediction.id,
          athlete_id: podiumState.assignedPositions.third.athlete_id,
          position_predicted: 3
        }
      ];

      const { error: podiumError } = await supabase
        .from('podium_selections')
        .insert(podiumInserts);

      if (podiumError) throw podiumError;

      // Deduct from wallet
      const { data: walletData, error: walletFetchError } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletFetchError) throw walletFetchError;
      if (!walletData) return;

      const newPurchasedTokens = Math.max(0, walletData.purchased_tokens - stakeAmount);
      const remaining = stakeAmount - walletData.purchased_tokens;
      const newEarnedTokens = remaining > 0 ? walletData.earned_tokens - remaining : walletData.earned_tokens;

      const { error: walletUpdateError } = await supabase
        .from('token_wallets')
        .update({
          purchased_tokens: newPurchasedTokens,
          earned_tokens: Math.max(0, newEarnedTokens)
        })
        .eq('user_id', user.id);

      if (walletUpdateError) throw walletUpdateError;

      const newBalance = newPurchasedTokens + Math.max(0, newEarnedTokens);

      // Log transaction
      await supabase.from('token_transactions').insert({
        user_id: user.id,
        type: 'entry_placed',
        amount: -stakeAmount,
        balance_after: newBalance,
        reference_type: 'bet_slip',
        reference_id: entrySlip.id,
        description: `Podium prediction: ${podiumState.assignedPositions.first.athlete.name}, ${podiumState.assignedPositions.second.athlete.name}, ${podiumState.assignedPositions.third.athlete.name} - ${tournament.name}`,
        metadata: {
          tournament_name: tournament.name,
          discipline: currentPodiumContext.discipline,
          category: podiumMarket.category,
          market_type: 'PODIUM',
          decimal_odds: combinedOdds,
          potential_payout: potentialPayout,
          athletes: [
            podiumState.assignedPositions.first.athlete.name,
            podiumState.assignedPositions.second.athlete.name,
            podiumState.assignedPositions.third.athlete.name
          ]
        }
      });

      toast({
        title: "Podium Prediction Placed!",
        description: `${stakeAmount} tokens entered on podium prediction`,
      });

      // Navigate to predictions page with confirmation data
      navigate('/predictions', {
        state: {
          confirmation: {
            athleteName: `Podium: ${podiumState.assignedPositions.first.athlete.name}, ${podiumState.assignedPositions.second.athlete.name}, ${podiumState.assignedPositions.third.athlete.name}`,
            tournamentName: tournament.name,
            marketType: 'PODIUM',
            discipline: currentPodiumContext.discipline,
            stakeAmount,
            potentialPayout,
            odds: combinedOdds,
          }
        }
      });

      // Send entry confirmation email (non-blocking)
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.email) {
          const athleteNames = `${podiumState.assignedPositions.first.athlete.name}, ${podiumState.assignedPositions.second.athlete.name}, ${podiumState.assignedPositions.third.athlete.name}`;
          await supabase.functions.invoke('send-email', {
            body: {
              type: 'entry_confirmation',
              to: userData.user.email,
              userId: user.id,
              data: {
                username: userData.user.email.split('@')[0],
                athleteName: athleteNames,
                tournamentName: tournament.name,
                discipline: currentPodiumContext.discipline,
                marketType: 'PODIUM',
                stakedTokens: stakeAmount,
                potentialPayout: potentialPayout,
                odds: combinedOdds
              }
            }
          });
        }
      } catch (emailError) {
        console.error('Podium entry confirmation email failed:', emailError);
        // Don't block prediction placement
      }

      await fetchWalletBalance();
      setPodiumDialogOpen(false);
      
      const key = getPodiumKey(currentPodiumContext.discipline, currentPodiumContext.gender);
      setPodiumStateMap(prev => ({
        ...prev,
        [key]: { selectedAthletes: [], assignedPositions: null }
      }));
      setCurrentPodiumContext(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to place podium prediction. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleConfirmPrediction = async (stakeAmount: number) => {
    if (!user || !tournament || !selectedSelection) return;

    try {
      const market = markets.find(m => m.id === selectedSelection.market_id);
      if (!market) return;

      // OPTION A: Multipliers are fixed at publish - use original odds
      const finalOdds = selectedSelection.decimal_odds;
      
      // Validate entry before placing
      setIsValidating(true);
      setValidationResult(null);
      const validation = await validateEntry(
        selectedSelection.athlete_id,
        selectedSelection.market_id,
        stakeAmount,
        finalOdds,
        market.market_type as MarketType
      );
      setIsValidating(false);
      
      if (!validation) {
        toast({
          title: "Validation Error",
          description: "Unable to validate entry. Please try again.",
          variant: "destructive"
        });
        return;
      }
      
      if (!validation.allowed) {
        toast({
          title: "Entry Not Allowed",
          description: validation.reason || "This entry cannot be placed",
          variant: "destructive"
        });
        return;
      }
      
      // Show warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          toast({
            title: "Notice",
            description: warning,
          });
        });
      }
      
      // Calculate potential payout with fixed odds
      const potentialPayout = Math.floor(stakeAmount * finalOdds);

      // Step 1: Create bet_slip FIRST
      const americanOdds = finalOdds >= 2 
        ? Math.round((finalOdds - 1) * 100)
        : Math.round(-100 / (finalOdds - 1));
        
      const { data: entrySlip, error: slipError } = await supabase
        .from('bet_slips')
        .insert({
          user_id: user.id,
          tournament_id: tournament.id,
          athlete_id: selectedSelection.athlete_id,
          market_id: selectedSelection.market_id,
          type: 'single',
          leg_count: 1,
          total_stake_tokens: stakeAmount,
          total_odds_decimal: finalOdds,
          total_odds_american: americanOdds,
          potential_payout_tokens: potentialPayout,
          status: 'PENDING'
        })
        .select()
        .single();

      if (slipError) throw slipError;

      // Step 2: Insert prediction linked to bet_slip
      const { error: predictionError } = await supabase
        .from('predictions')
        .insert({
          user_id: user.id,
          selection_id: selectedSelection.id,
          athlete_name: selectedSelection.athlete.name,
          tournament_name: tournament.name,
          discipline: market.discipline,
          category: market.category,
          market_type: market.market_type,
          staked_tokens: stakeAmount,
          decimal_odds: finalOdds,
          potential_payout: potentialPayout,
          bet_slip_id: entrySlip.id,
          status: 'PENDING'
        });

      if (predictionError) throw predictionError;

      // Deduct from wallet
      const { data: walletData, error: walletFetchError } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletFetchError) throw walletFetchError;
      if (!walletData) return;

      const newPurchasedTokens = Math.max(0, walletData.purchased_tokens - stakeAmount);
      const remaining = stakeAmount - walletData.purchased_tokens;
      const newEarnedTokens = remaining > 0 ? walletData.earned_tokens - remaining : walletData.earned_tokens;

      const { error: walletUpdateError } = await supabase
        .from('token_wallets')
        .update({
          purchased_tokens: newPurchasedTokens,
          earned_tokens: Math.max(0, newEarnedTokens)
        })
        .eq('user_id', user.id);

      if (walletUpdateError) throw walletUpdateError;

      const newBalance = newPurchasedTokens + Math.max(0, newEarnedTokens);

      // Log transaction
      await supabase.from('token_transactions').insert({
        user_id: user.id,
        type: 'entry_placed',
        amount: -stakeAmount,
        balance_after: newBalance,
        reference_type: 'bet_slip',
        reference_id: entrySlip.id,
        description: `Prediction placed on ${selectedSelection.athlete.name} - ${tournament.name}`,
        metadata: {
          tournament_name: tournament.name,
          athlete_name: selectedSelection.athlete.name,
          discipline: market.discipline,
          category: market.category,
          market_type: market.market_type,
          decimal_odds: selectedSelection.decimal_odds,
          potential_payout: potentialPayout
        }
      });

      toast({
        title: "Prediction Placed!",
        description: `${stakeAmount} tokens entered on ${selectedSelection.athlete.name}`,
      });

      // Navigate to predictions page with confirmation data
      navigate('/predictions', {
        state: {
          confirmation: {
            athleteName: selectedSelection.athlete.name,
            tournamentName: tournament.name,
            marketType: market.market_type,
            discipline: market.discipline,
            stakeAmount,
            potentialPayout,
            odds: finalOdds,
          }
        }
      });

      // Send entry confirmation email (non-blocking)
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.email) {
          await supabase.functions.invoke('send-email', {
            body: {
              type: 'entry_confirmation',
              to: userData.user.email,
              userId: user.id,
              data: {
                username: userData.user.email.split('@')[0],
                athleteName: selectedSelection.athlete.name,
                tournamentName: tournament.name,
                discipline: market.discipline,
                marketType: market.market_type,
                stakedTokens: stakeAmount,
                potentialPayout: potentialPayout,
                odds: finalOdds
              }
            }
          });
        }
      } catch (emailError) {
        console.error('Entry confirmation email failed:', emailError);
        // Don't block prediction placement
      }

      await fetchWalletBalance();
      setDialogOpen(false);
      setSelectedSelection(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to place prediction. Please try again.",
        variant: "destructive"
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <SEO
        title={`${tournament.name} — Predictions & Picks`}
        description={`Make slalom, trick, and jump predictions for ${tournament.name}${tournament.location ? ' in ' + tournament.location : ''}. Live odds, podium picks, and parlays on WaterSki Predictor.`}
        path={`/tournaments/${tournament.id}`}
        type="event"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: tournament.name,
          startDate: tournament.start_datetime || tournament.start_date,
          endDate: tournament.end_datetime || tournament.end_date,
          eventStatus: tournament.status === 'finished' ? 'https://schema.org/EventCompleted' : 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: tournament.location ? {
            "@type": "Place",
            name: tournament.location,
            address: tournament.location,
          } : undefined,
          sport: 'Water skiing',
          url: `https://waterskipredictor.com/tournaments/${tournament.id}`,
        })}</script>
      </Helmet>
      <PageHeader title="Event" showBack showBalance={false} />

      {(() => {
        const status = tournament.status;
        const statusLabel = status === 'live' ? 'LIVE' : status === 'finished' ? 'FINAL' : 'UPCOMING';
        const startIso = tournament.start_datetime || tournament.start_date;
        const startMs = startIso ? new Date(startIso).getTime() : 0;
        const diffMs = startMs - Date.now();
        const fmtCountdown = () => {
          if (status === 'live') return 'LIVE NOW';
          if (status === 'finished') return 'CLOSED';
          if (diffMs <= 0) return 'STARTING';
          const totalMin = Math.floor(diffMs / 60000);
          const days = Math.floor(totalMin / (60 * 24));
          const hours = Math.floor((totalMin % (60 * 24)) / 60);
          const mins = totalMin % 60;
          if (days > 0) return `${days}D ${hours}H`;
          if (hours > 0) return `${hours}H ${mins}M`;
          return `${mins}M`;
        };
        const entrantCount = tournamentEntries.length
          ? new Set(tournamentEntries.map((e) => e.athlete_id)).size
          : selections.length
          ? new Set(selections.map((s) => s.athlete_id)).size
          : 0;

        return (
          <section className="border-b border-border bg-background">
            <div className="mx-auto max-w-6xl px-4 pt-4 pb-5">
              <div className="mb-4 flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                    status === 'live'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : status === 'finished'
                      ? 'border-border bg-secondary text-muted-foreground'
                      : 'border-primary/30 bg-primary/[0.06] text-primary',
                  )}
                >
                  {status === 'live' && <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
                  {statusLabel}
                </span>
                {isAdmin && (
                  <Button variant="outline" size="sm" asChild className="gap-1.5 h-7 text-[10px]">
                    <Link to={`/admin/odds-review?tournament=${id}`}>
                      <Settings2 className="h-3 w-3" />
                      Edit
                    </Link>
                  </Button>
                )}
              </div>

              <h1 className="font-display uppercase text-foreground leading-[0.92] tracking-[0.005em] text-[clamp(2.5rem,9vw,5rem)]">
                {tournament.name}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {tournament.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    {tournament.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {formatDate(tournament.start_datetime || tournament.start_date)} – {formatDate(tournament.end_datetime || tournament.end_date)}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card">
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Entrants</div>
                  <div className="mt-0.5 font-display text-3xl leading-none text-foreground tabular-nums">
                    {entrantCount || '—'}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Disciplines</div>
                  <div className="mt-0.5 font-display text-3xl leading-none text-foreground tabular-nums">
                    {tournament.disciplines.length}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {status === 'finished' ? 'Status' : status === 'live' ? 'Status' : 'Closes In'}
                  </div>
                  <div className={cn(
                    'mt-0.5 font-condensed text-3xl font-extrabold leading-none tabular-nums',
                    status === 'live' ? 'text-primary live-dot' : status === 'finished' ? 'text-muted-foreground' : 'text-primary',
                  )}>
                    {fmtCountdown()}
                  </div>
                </div>
              </div>

              <Link
                to="/help?section=Predictions & Rules"
                className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <HelpCircle className="h-3 w-3" />
                How predictions work
              </Link>
            </div>
          </section>
        );
      })()}

      <div className="max-w-6xl mx-auto px-4 py-5">
        {predictionWindow && !predictionWindow.canPredict && predictionWindow.status !== 'preview' && (
          <Alert className="mb-4 border-destructive/40 bg-destructive/5">
            <Clock className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm font-medium">{predictionWindow.message}</span>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </AlertDescription>
          </Alert>
        )}
        {predictionWindow && predictionWindow.canPredict && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Zap className="h-3 w-3" />
            {predictionWindow.message}
          </div>
        )}

        {userPredictions.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => navigate('/predictions')}
              >
                My Picks ({userPredictions.length}) — View All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="press-scale"
                onClick={() => setShareOpen(true)}
                aria-label="Share my card"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share my card
              </Button>
            </div>
          </div>
        )}

        {tournament.status !== 'finished' && (
          <div className="mb-6">
            <Button
              onClick={() => {
                if (predictionWindow?.canPredict) {
                  setParlayBuilderOpen(true);
                } else {
                  toast({
                    title: 'Predictions not open yet',
                    description: predictionWindow?.message || 'Check back soon.',
                  });
                }
              }}
              size="lg"
              disabled={!predictionWindow?.canPredict}
              className="w-full"
            >
              Build Parlay Prediction
            </Button>
          </div>
        )}

        {/* User Results Section */}
        {tournament.status === 'finished' && (
          <div className="mb-6">
            <UserTournamentResults predictions={userPredictions} />
          </div>
        )}

        {/* Results Section */}
        {tournament.status === 'finished' && athleteResults.length > 0 && (
          <div className="mb-6">
            <TournamentResults 
              results={athleteResults}
              disciplines={tournament.disciplines}
            />
          </div>
        )}

        {/* Markets by Discipline */}
        {selections.length === 0 ? (
          <Card className="p-6 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold mb-2">Markets configuring</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Prediction markets for this event will appear here once finalized.
            </p>
            <Button variant="outline" onClick={() => navigate('/tournaments')}>
              Browse Other Events
            </Button>
          </Card>
        ) : (
          <Tabs value={activeDiscipline} onValueChange={setActiveDiscipline} className="w-full tabs-underline">
            <TabsList className="mb-6">
              {tournament.disciplines.map((disc) => (
                <TabsTrigger key={disc} value={disc} className="capitalize">
                  {disc}
                </TabsTrigger>
              ))}
            </TabsList>

          {tournament.disciplines.map((discipline) => {
            const currentGender = genderByDiscipline[discipline] || 'men';
            
            return (
              <TabsContent key={discipline} value={discipline}>
                <Tabs 
                  value={currentGender} 
                  onValueChange={(value) => setGenderByDiscipline(prev => ({ ...prev, [discipline]: value as 'men' | 'women' }))}
                  className="w-full mb-4 tabs-underline"
                >
                  <TabsList className="mb-4">
                    <TabsTrigger value="men">Men</TabsTrigger>
                    <TabsTrigger value="women">Women</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="men">
                    {/* Simulation Details Info Box */}
                    <SimulationDetails isAdmin={isAdmin} className="mb-4" />
                    
                    <Tabs defaultValue="winner" className="w-full tabs-underline">
                      <TabsList id="contest-types" className="mb-4">
                        <TabsTrigger value="winner">Winner</TabsTrigger>
                        <TabsTrigger value="podium">Podium</TabsTrigger>
                        <TabsTrigger value="highest">Highest</TabsTrigger>
                      </TabsList>

                      <TabsContent value="winner" className="space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                          Winner Market - Select One
                        </h3>
                        <div id="athlete-list" className="space-y-3">
                          {selections
                            .filter(s => {
                              const market = markets.find(m => m.id === s.market_id);
                              return market?.discipline === discipline && 
                                     market?.category === 'open_men' && 
                                     market?.market_type === 'WINNER';
                            })
                            .sort((a, b) => sortSelections(a, b, discipline))
                            .map((selection) => (
                              <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                                <SelectionCard
                                  selection={selection}
                                  onSelect={handleSelectSelection}
                                  discipline={discipline}
                                  highlighted={predictAgainAthletes.includes(selection.athlete.name)}
                                />
                              </div>
                            ))}
                        </div>
                      </TabsContent>

                      <TabsContent value="podium" className="space-y-3">
                        {(() => {
                          const podiumMarket = markets.find(m => 
                            m.discipline === discipline && 
                            m.category === 'open_men' && 
                            m.market_type === 'PODIUM'
                          );
                          const podiumSelections = selections
                            .filter(s => s.market_id === podiumMarket?.id)
                            .sort((a, b) => sortSelections(a, b, discipline));
                          
                          const podiumState = getPodiumState(discipline, 'men');
                          
                          return podiumMarket ? (
                            <div className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <PodiumSelectionCard
                                athletes={podiumSelections}
                                selectedAthletes={podiumState.selectedAthletes}
                                onToggleAthlete={(athlete) => handleTogglePodiumAthlete(athlete, discipline, 'men', podiumMarket)}
                                discipline={discipline}
                              />
                              {podiumState.selectedAthletes.length === 3 && podiumState.assignedPositions && (
                              <button
                                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                                  onClick={() => {
                                    setCurrentPodiumContext({ market: podiumMarket, discipline, gender: 'men' });
                                    setPodiumDialogOpen(true);
                                  }}
                                >
                                  Place Podium Entry
                                </button>
                              )}
                            </div>
                          ) : <p className="text-muted-foreground text-center py-8">No podium market available</p>;
                        })()}
                      </TabsContent>

                      <TabsContent value="highest" className="space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                          Highest Score Market
                        </h3>
                        {selections
                          .filter(s => {
                            const market = markets.find(m => m.id === s.market_id);
                            return market?.discipline === discipline && 
                                   market?.category === 'open_men' && 
                                   market?.market_type === 'HIGHEST_SCORE';
                          })
                          .sort((a, b) => sortSelections(a, b, discipline))
                          .map((selection) => (
                            <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={handleSelectSelection}
                                discipline={discipline}
                                highlighted={predictAgainAthletes.includes(selection.athlete.name)}
                              />
                            </div>
                          ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* Women's markets - similar structure */}
                  <TabsContent value="women">
                    {/* Simulation Details Info Box */}
                    <SimulationDetails isAdmin={isAdmin} className="mb-4" />
                    
                    <Tabs defaultValue="winner" className="w-full tabs-underline">
                      <TabsList className="mb-4">
                        <TabsTrigger value="winner">Winner</TabsTrigger>
                        <TabsTrigger value="podium">Podium</TabsTrigger>
                        <TabsTrigger value="highest">Highest</TabsTrigger>
                      </TabsList>

                      <TabsContent value="winner" className="space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                          Winner Market - Select One
                        </h3>
                        {selections
                          .filter(s => {
                            const market = markets.find(m => m.id === s.market_id);
                            return market?.discipline === discipline && 
                                   market?.category === 'open_women' && 
                                   market?.market_type === 'WINNER';
                          })
                          .sort((a, b) => sortSelections(a, b, discipline))
                          .map((selection) => (
                            <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={handleSelectSelection}
                                discipline={discipline}
                                highlighted={predictAgainAthletes.includes(selection.athlete.name)}
                              />
                            </div>
                          ))}
                      </TabsContent>

                      <TabsContent value="podium" className="space-y-3">
                        {(() => {
                          const podiumMarket = markets.find(m => 
                            m.discipline === discipline && 
                            m.category === 'open_women' && 
                            m.market_type === 'PODIUM'
                          );
                          const podiumSelections = selections
                            .filter(s => s.market_id === podiumMarket?.id)
                            .sort((a, b) => sortSelections(a, b, discipline));
                          
                          const podiumState = getPodiumState(discipline, 'women');
                          
                          return podiumMarket ? (
                            <div className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <PodiumSelectionCard
                                athletes={podiumSelections}
                                selectedAthletes={podiumState.selectedAthletes}
                                onToggleAthlete={(athlete) => handleTogglePodiumAthlete(athlete, discipline, 'women', podiumMarket)}
                                discipline={discipline}
                              />
                              {podiumState.selectedAthletes.length === 3 && podiumState.assignedPositions && (
                              <button
                                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                                  onClick={() => {
                                    setCurrentPodiumContext({ market: podiumMarket, discipline, gender: 'women' });
                                    setPodiumDialogOpen(true);
                                  }}
                                >
                                  Place Podium Entry
                                </button>
                              )}
                            </div>
                          ) : <p className="text-muted-foreground text-center py-8">No podium market available</p>;
                        })()}
                      </TabsContent>

                      <TabsContent value="highest" className="space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                          Highest Score Market
                        </h3>
                        {selections
                          .filter(s => {
                            const market = markets.find(m => m.id === s.market_id);
                            return market?.discipline === discipline && 
                                   market?.category === 'open_women' && 
                                   market?.market_type === 'HIGHEST_SCORE';
                          })
                          .sort((a, b) => sortSelections(a, b, discipline))
                          .map((selection) => (
                            <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={handleSelectSelection}
                                discipline={discipline}
                                highlighted={predictAgainAthletes.includes(selection.athlete.name)}
                              />
                            </div>
                          ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                </Tabs>
              </TabsContent>
            );
          })}
        </Tabs>
        )}
      </div>

      {/* Prediction Dialog */}
      <PredictionDialog
        selection={selectedSelection}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirmPrediction}
        walletBalance={walletBalance}
        isValidating={isValidating}
        marketContext={
          selectedSelection
            ? (() => {
                const market = markets.find(m => m.id === selectedSelection.market_id);
                return market
                  ? {
                      tournamentName: tournament.name,
                      discipline: market.discipline,
                      gender: market.category === 'open_men' ? 'men' : 'women',
                      marketType: market.market_type.replace('_', ' '),
                    }
                  : undefined;
              })()
            : undefined
        }
      />

      {/* Position Assigner Dialog */}
      {currentPodiumContext && positionAssignerOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <PodiumPositionAssigner
              athletes={getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender).selectedAthletes}
              onAssignPositions={handleAssignPositions}
              onCancel={() => {
                setPositionAssignerOpen(false);
                const key = getPodiumKey(currentPodiumContext.discipline, currentPodiumContext.gender);
                setPodiumStateMap(prev => ({
                  ...prev,
                  [key]: { selectedAthletes: [], assignedPositions: null }
                }));
                setCurrentPodiumContext(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Podium Prediction Dialog */}
      {currentPodiumContext && (
        <PodiumPredictionDialog
          selections={
            getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender).assignedPositions
              ? [
                  getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender).assignedPositions!.first,
                  getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender).assignedPositions!.second,
                  getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender).assignedPositions!.third,
                ]
              : []
          }
          open={podiumDialogOpen}
          onOpenChange={setPodiumDialogOpen}
          onConfirm={handleConfirmPodiumPrediction}
          walletBalance={walletBalance}
          tournamentName={tournament.name}
          discipline={currentPodiumContext.discipline}
          gender={currentPodiumContext.gender}
          marketId={currentPodiumContext.market?.id}
        />
      )}

      {/* Parlay Builder Modal */}
      {user && tournament && (
        <ParlayBuilder
          open={parlayBuilderOpen}
          onClose={() => setParlayBuilderOpen(false)}
          tournament={tournament}
          markets={markets}
          selections={selections}
          onComplete={() => {
            fetchWalletBalance();
            setParlayBuilderOpen(false);
          }}
          userId={user.id}
          walletBalance={walletBalance}
        />
      )}

      <BottomNav />

      {shareOpen && tournament && userPredictions.length > 0 && (
        <EventShareModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          username={username || 'player'}
          shareUrl={`${window.location.origin}/tournaments/${tournament.id}`}
          {...buildEventShareFromPredictions(
            userPredictions,
            tournament.name,
            tournament.start_date
              ? new Date(tournament.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : undefined,
          )}
        />
      )}
    </div>
  );
};

export default TournamentDetail;
