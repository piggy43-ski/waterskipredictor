import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { SelectionCard } from '@/components/SelectionCard';
import { PredictionDialog } from '@/components/PredictionDialog';
import { PodiumSelectionCard } from '@/components/PodiumSelectionCard';
import { PodiumPredictionDialog } from '@/components/PodiumPredictionDialog';
import { PodiumPositionAssigner } from '@/components/PodiumPositionAssigner';
import { ParlayCart } from '@/components/ParlayCart';
import { TournamentResults } from '@/components/TournamentResults';
import { UserTournamentResults } from '@/components/UserTournamentResults';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Selection, Tournament, Market } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getBettingWindowStatus } from '@/utils/bettingWindows';
import { Alert, AlertDescription } from '@/components/ui/alert';

const TournamentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [bettingWindow, setBettingWindow] = useState<ReturnType<typeof getBettingWindowStatus> | null>(null);
  const [athleteResults, setAthleteResults] = useState<any[]>([]);
  const [userPredictions, setUserPredictions] = useState<any[]>([]);
  
  // Podium betting state - scoped by discipline+gender
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
  
  // Parlay state
  const [parlaySelections, setParlaySelections] = useState<Selection[]>([]);
  
  // Gender state per discipline
  const [genderByDiscipline, setGenderByDiscipline] = useState<Record<string, 'men' | 'women'>>({});

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchTournamentData();
    fetchWalletBalance();
  }, [user, navigate, id]);

  useEffect(() => {
    if (!tournament) return;

    const updateBettingWindow = () => {
      const startTime = tournament.start_datetime || tournament.start_date;
      const endTime = tournament.end_datetime || tournament.end_date;
      setBettingWindow(getBettingWindowStatus(startTime, endTime));
    };

    updateBettingWindow();
    const interval = setInterval(updateBettingWindow, 1000);

    return () => clearInterval(interval);
  }, [tournament]);

  const fetchTournamentData = async () => {
    try {
      // Fetch tournament
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

      if (tournamentError) throw tournamentError;

      if (tournamentData) {
        setTournament({
          id: tournamentData.id,
          name: tournamentData.name,
          location: tournamentData.location,
          start_date: tournamentData.start_date,
          end_date: tournamentData.end_date,
          start_datetime: tournamentData.start_datetime,
          end_datetime: tournamentData.end_datetime,
          disciplines: tournamentData.disciplines as Array<'slalom' | 'trick' | 'jump'>,
          status: tournamentData.status as 'upcoming' | 'live' | 'finished'
        });

        // Fetch markets
        const { data: marketsData, error: marketsError } = await supabase
          .from('markets')
          .select('*')
          .eq('tournament_id', id);

        if (marketsError) throw marketsError;

          const mappedMarkets: Market[] = (marketsData || []).map(m => ({
          id: m.id,
          tournament_id: m.tournament_id,
          discipline: m.discipline as 'slalom' | 'trick' | 'jump',
          category: m.category as 'open_men' | 'open_women',
          market_type: m.market_type as 'WINNER' | 'PODIUM' | 'HEAD_TO_HEAD' | 'OVER_UNDER' | 'HIGHEST_SCORE',
          name: m.name
        }));

        setMarkets(mappedMarkets);

        // Fetch selections with athletes
        if (marketsData && marketsData.length > 0) {
          const marketIds = marketsData.map(m => m.id);
          const { data: selectionsData, error: selectionsError } = await supabase
            .from('selections')
            .select(`
              *,
              athlete:athletes (
                id,
                name,
                gender,
                country,
                federation,
                year_of_birth,
                disciplines,
                current_rank_slalom,
                current_rank_trick,
                current_rank_jump
              )
            `)
            .in('market_id', marketIds);

          if (selectionsError) throw selectionsError;

          const mappedSelections: Selection[] = (selectionsData || []).map((s: any) => ({
            id: s.id,
            market_id: s.market_id,
            athlete_id: s.athlete_id,
            athlete: {
              id: s.athlete.id,
              name: s.athlete.name,
              gender: s.athlete.gender,
              country: s.athlete.country,
              federation: s.athlete.federation,
              disciplines: s.athlete.disciplines,
              current_rank_slalom: s.athlete.current_rank_slalom,
              current_rank_trick: s.athlete.current_rank_trick,
              current_rank_jump: s.athlete.current_rank_jump,
            },
            description: s.description,
            decimal_odds: Number(s.decimal_odds),
          }));

          setSelections(mappedSelections);
        }

        // Fetch athlete results if tournament is finished
        if (tournamentData.status === 'finished') {
          const { data: resultsData, error: resultsError } = await supabase
            .from('athlete_results')
            .select(`
              *,
              athlete:athletes (
                name,
                country
              )
            `)
            .eq('tournament_id', id);

          if (!resultsError && resultsData) {
            setAthleteResults(resultsData);
          }

          // Fetch user predictions for finished tournaments
          if (user) {
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

  const handleSelectSelection = (selection: Selection, isParlay: boolean = false, discipline?: string, gender?: string, marketType?: string) => {
    if (!bettingWindow?.canBet) {
      toast({
        title: "Betting Closed",
        description: bettingWindow?.message || "Betting is not available for this tournament",
        variant: "destructive"
      });
      return;
    }
    
    if (isParlay) {
      // Add to parlay cart
      if (parlaySelections.some(s => s.id === selection.id)) {
        setParlaySelections(parlaySelections.filter(s => s.id !== selection.id));
      } else {
        setParlaySelections([...parlaySelections, selection]);
      }
    } else {
      setSelectedSelection(selection);
      setDialogOpen(true);
    }
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
      
      // When 3 athletes selected, open position assigner
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
        selectedAthletes: prev[key]?.selectedAthletes || [],
        assignedPositions: positions
      }
    }));
    setPositionAssignerOpen(false);
    setPodiumDialogOpen(true);
  };

  const handleConfirmPodiumPrediction = async (stakeAmount: number) => {
    if (!user || !currentPodiumContext) return;
    
    const state = getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender);
    if (!state.assignedPositions) return;

    const orderedSelections = [state.assignedPositions.first, state.assignedPositions.second, state.assignedPositions.third];
    const combinedOdds = orderedSelections.reduce((acc, sel) => acc * sel.decimal_odds, 1) * 0.3;
    const potentialPayout = Math.floor(stakeAmount * combinedOdds);

    try {
      // Insert parent prediction for podium
      const { data: predictionData, error: predictionError } = await supabase
        .from('predictions')
        .insert({
          user_id: user.id,
          selection_id: orderedSelections[0].id,
          athlete_name: 'Podium Bet',
          tournament_name: tournament?.name || '',
          discipline: currentPodiumContext.market.discipline,
          category: currentPodiumContext.market.category,
          market_type: 'PODIUM',
          staked_tokens: stakeAmount,
          decimal_odds: combinedOdds,
          potential_payout: potentialPayout,
          status: 'PENDING'
        })
        .select()
        .single();

      if (predictionError) throw predictionError;

      // Insert podium selections with correct positions
      const podiumSelections = orderedSelections.map((athlete, index) => ({
        prediction_id: predictionData.id,
        athlete_id: athlete.athlete_id,
        position_predicted: index + 1
      }));

      const { error: podiumError } = await supabase
        .from('podium_selections')
        .insert(podiumSelections);

      if (podiumError) throw podiumError;

      // Update wallet
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

      toast({
        title: "Podium Bet Placed!",
        description: `You've staked ${stakeAmount} tokens on a podium finish`,
      });

      await fetchWalletBalance();
      setPodiumDialogOpen(false);
      
      // Clear this podium context
      const key = getPodiumKey(currentPodiumContext.discipline, currentPodiumContext.gender);
      setPodiumStateMap(prev => ({
        ...prev,
        [key]: { selectedAthletes: [], assignedPositions: null }
      }));
      setCurrentPodiumContext(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to place podium bet. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handlePlaceParlay = () => {
    if (parlaySelections.length < 2) return;
    setDialogOpen(true);
  };

  const handleRemoveFromParlay = (selection: Selection) => {
    setParlaySelections(parlaySelections.filter(s => s.id !== selection.id));
  };

  const handleClearParlay = () => {
    setParlaySelections([]);
  };

  const handleConfirmPrediction = async (stakeAmount: number) => {
    if (!user) return;

    // Handle parlay bet
    if (parlaySelections.length >= 2) {
      const combinedOdds = parlaySelections.reduce((acc, sel) => acc * sel.decimal_odds, 1);
      const potentialPayout = Math.floor(stakeAmount * combinedOdds);

      try {
        // Insert parent parlay prediction
        const { data: parentPrediction, error: parentError } = await supabase
          .from('predictions')
          .insert({
            user_id: user.id,
            selection_id: parlaySelections[0].id,
            athlete_name: 'Parlay Bet',
            tournament_name: tournament?.name || '',
            discipline: 'slalom',
            category: 'open_men',
            market_type: 'WINNER',
            staked_tokens: stakeAmount,
            decimal_odds: combinedOdds,
            potential_payout: potentialPayout,
            status: 'PENDING',
            is_parlay_parent: true,
            parlay_leg_count: parlaySelections.length
          })
          .select()
          .single();

        if (parentError) throw parentError;

        // Insert individual legs
        const legInserts = parlaySelections.map(selection => {
          const market = markets.find(m => m.id === selection.market_id);
          return {
            user_id: user.id,
            selection_id: selection.id,
            athlete_name: selection.athlete.name,
            tournament_name: tournament?.name || '',
            discipline: market?.discipline || 'slalom',
            category: market?.category || 'open_men',
            market_type: market?.market_type || 'WINNER',
            staked_tokens: 0,
            decimal_odds: selection.decimal_odds,
            potential_payout: 0,
            status: 'PENDING',
            parlay_id: parentPrediction.id,
            parlay_leg_count: 1
          };
        });

        const { error: legsError } = await supabase
          .from('predictions')
          .insert(legInserts);

        if (legsError) throw legsError;

        // Update wallet
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

        toast({
          title: "Parlay Bet Placed!",
          description: `You've staked ${stakeAmount} tokens on a ${parlaySelections.length}-leg parlay`,
        });

        await fetchWalletBalance();
        setParlaySelections([]);
        setDialogOpen(false);
        setSelectedSelection(null);
        return;
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to place parlay bet. Please try again.",
          variant: "destructive"
        });
        return;
      }
    }

    // Handle single bet
    if (!selectedSelection) return;

    const market = markets.find(m => m.id === selectedSelection.market_id);
    if (!market) return;

    const potentialPayout = Math.floor(stakeAmount * selectedSelection.decimal_odds);

    try {
      // Insert prediction
      const { error: predictionError } = await supabase
        .from('predictions')
        .insert({
          user_id: user.id,
          selection_id: selectedSelection.id,
          athlete_name: selectedSelection.athlete.name,
          tournament_name: tournament?.name || '',
          discipline: market.discipline,
          category: market.category,
          market_type: market.market_type,
          staked_tokens: stakeAmount,
          decimal_odds: selectedSelection.decimal_odds,
          potential_payout: potentialPayout,
          status: 'PENDING'
        });

      if (predictionError) throw predictionError;

      // Update wallet - deduct from purchased_tokens first
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

      toast({
        title: "Prediction Placed!",
        description: `You've staked ${stakeAmount} tokens on ${selectedSelection?.athlete.name}`,
      });

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader 
        title={tournament.name} 
        subtitle={tournament.location}
        showBack 
      />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Tournament Info */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{tournament.location}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>
              {formatDate(tournament.start_date)} - {formatDate(tournament.end_date)}
            </span>
          </div>
          
          {/* Betting Window Status */}
          {bettingWindow && (
            <Alert className={
              bettingWindow.canBet 
                ? 'border-primary/50 bg-primary/10' 
                : bettingWindow.status === 'upcoming'
                  ? 'border-border bg-muted/30'
                  : 'border-destructive/50 bg-destructive/10'
            }>
              <Clock className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span className="font-medium">{bettingWindow.message}</span>
                {!bettingWindow.canBet && bettingWindow.status !== 'upcoming' && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* User Results Section - Show only for finished tournaments */}
        {tournament.status === 'finished' && (
          <div className="mb-6">
            <UserTournamentResults predictions={userPredictions} />
          </div>
        )}

        {/* Results Section - Show only for finished tournaments */}
        {tournament.status === 'finished' && athleteResults.length > 0 && (
          <div className="mb-6">
            <TournamentResults 
              results={athleteResults}
              disciplines={tournament.disciplines}
            />
          </div>
        )}

        {/* Markets by Discipline */}
        <Tabs defaultValue="slalom" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-6">
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
                {/* Gender Selection - Persistent across market types */}
                <Tabs 
                  value={currentGender} 
                  onValueChange={(value) => setGenderByDiscipline(prev => ({ ...prev, [discipline]: value as 'men' | 'women' }))}
                  className="w-full mb-4"
                >
                  <TabsList className="w-full grid grid-cols-2 mb-4">
                    <TabsTrigger value="men">Men</TabsTrigger>
                    <TabsTrigger value="women">Women</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="men">
                    {/* Market Type Tabs - Men */}
                    <Tabs defaultValue="winner" className="w-full">
                      <TabsList className="w-full grid grid-cols-3 mb-4">
                        <TabsTrigger value="winner">Winner</TabsTrigger>
                        <TabsTrigger value="podium">Podium</TabsTrigger>
                        <TabsTrigger value="highest">Highest</TabsTrigger>
                      </TabsList>

                      {/* Winner Market - Men */}
                      <TabsContent value="winner" className="space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                          Winner Market - Select One or Add to Parlay
                        </h3>
                        {selections
                          .filter(s => {
                            const market = markets.find(m => m.id === s.market_id);
                            return market?.discipline === discipline && 
                                   market?.category === 'open_men' && 
                                   market?.market_type === 'WINNER';
                          })
                          .sort((a, b) => {
                            const rankA = discipline === 'slalom' ? a.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? a.athlete.current_rank_trick : 
                                         a.athlete.current_rank_jump;
                            const rankB = discipline === 'slalom' ? b.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? b.athlete.current_rank_trick : 
                                         b.athlete.current_rank_jump;
                            return (rankA || 999) - (rankB || 999);
                          })
                          .map((selection) => (
                            <div key={selection.id} className={!bettingWindow?.canBet ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={(sel) => handleSelectSelection(sel, false)}
                                discipline={discipline}
                              />
                            </div>
                          ))}
                      </TabsContent>

                      {/* Podium Market - Men */}
                      <TabsContent value="podium" className="space-y-3">
                        {(() => {
                          const podiumMarket = markets.find(m => 
                            m.discipline === discipline && 
                            m.category === 'open_men' && 
                            m.market_type === 'PODIUM'
                          );
                          const podiumSelections = selections
                            .filter(s => s.market_id === podiumMarket?.id)
                            .sort((a, b) => {
                              const rankA = discipline === 'slalom' ? a.athlete.current_rank_slalom : 
                                           discipline === 'trick' ? a.athlete.current_rank_trick : 
                                           a.athlete.current_rank_jump;
                              const rankB = discipline === 'slalom' ? b.athlete.current_rank_slalom : 
                                           discipline === 'trick' ? b.athlete.current_rank_trick : 
                                           b.athlete.current_rank_jump;
                              return (rankA || 999) - (rankB || 999);
                            });
                          
                          const podiumState = getPodiumState(discipline, 'men');
                          
                          return podiumMarket ? (
                            <>
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
                                  Place Podium Bet
                                </button>
                              )}
                              {podiumState.selectedAthletes.length === 3 && !podiumState.assignedPositions && (
                                <div className="text-sm text-center text-muted-foreground py-2">
                                  Please assign positions in the dialog above
                                </div>
                              )}
                            </>
                          ) : <p className="text-muted-foreground text-center py-8">No podium market available</p>;
                        })()}
                      </TabsContent>

                      {/* Highest Score Market - Men */}
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
                          .sort((a, b) => {
                            const rankA = discipline === 'slalom' ? a.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? a.athlete.current_rank_trick : 
                                         a.athlete.current_rank_jump;
                            const rankB = discipline === 'slalom' ? b.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? b.athlete.current_rank_trick : 
                                         b.athlete.current_rank_jump;
                            return (rankA || 999) - (rankB || 999);
                          })
                          .map((selection) => (
                            <div key={selection.id} className={!bettingWindow?.canBet ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={(sel) => handleSelectSelection(sel, false)}
                                discipline={discipline}
                              />
                            </div>
                          ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  <TabsContent value="women">
                    {/* Market Type Tabs - Women */}
                    <Tabs defaultValue="winner" className="w-full">
                      <TabsList className="w-full grid grid-cols-3 mb-4">
                        <TabsTrigger value="winner">Winner</TabsTrigger>
                        <TabsTrigger value="podium">Podium</TabsTrigger>
                        <TabsTrigger value="highest">Highest</TabsTrigger>
                      </TabsList>

                      {/* Winner Market - Women */}
                      <TabsContent value="winner" className="space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                          Winner Market - Select One or Add to Parlay
                        </h3>
                        {selections
                          .filter(s => {
                            const market = markets.find(m => m.id === s.market_id);
                            return market?.discipline === discipline && 
                                   market?.category === 'open_women' && 
                                   market?.market_type === 'WINNER';
                          })
                          .sort((a, b) => {
                            const rankA = discipline === 'slalom' ? a.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? a.athlete.current_rank_trick : 
                                         a.athlete.current_rank_jump;
                            const rankB = discipline === 'slalom' ? b.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? b.athlete.current_rank_trick : 
                                         b.athlete.current_rank_jump;
                            return (rankA || 999) - (rankB || 999);
                          })
                          .map((selection) => (
                            <div key={selection.id} className={!bettingWindow?.canBet ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={(sel) => handleSelectSelection(sel, false)}
                                discipline={discipline}
                              />
                            </div>
                          ))}
                      </TabsContent>

                      {/* Podium Market - Women */}
                      <TabsContent value="podium" className="space-y-3">
                        {(() => {
                          const podiumMarket = markets.find(m => 
                            m.discipline === discipline && 
                            m.category === 'open_women' && 
                            m.market_type === 'PODIUM'
                          );
                          const podiumSelections = selections
                            .filter(s => s.market_id === podiumMarket?.id)
                            .sort((a, b) => {
                              const rankA = discipline === 'slalom' ? a.athlete.current_rank_slalom : 
                                           discipline === 'trick' ? a.athlete.current_rank_trick : 
                                           a.athlete.current_rank_jump;
                              const rankB = discipline === 'slalom' ? b.athlete.current_rank_slalom : 
                                           discipline === 'trick' ? b.athlete.current_rank_trick : 
                                           b.athlete.current_rank_jump;
                              return (rankA || 999) - (rankB || 999);
                            });
                          
                          const podiumState = getPodiumState(discipline, 'women');
                          
                          return podiumMarket ? (
                            <>
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
                                  Place Podium Bet
                                </button>
                              )}
                              {podiumState.selectedAthletes.length === 3 && !podiumState.assignedPositions && (
                                <div className="text-sm text-center text-muted-foreground py-2">
                                  Please assign positions in the dialog above
                                </div>
                              )}
                            </>
                          ) : <p className="text-muted-foreground text-center py-8">No podium market available</p>;
                        })()}
                      </TabsContent>

                      {/* Highest Score Market - Women */}
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
                          .sort((a, b) => {
                            const rankA = discipline === 'slalom' ? a.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? a.athlete.current_rank_trick : 
                                         a.athlete.current_rank_jump;
                            const rankB = discipline === 'slalom' ? b.athlete.current_rank_slalom : 
                                         discipline === 'trick' ? b.athlete.current_rank_trick : 
                                         b.athlete.current_rank_jump;
                            return (rankA || 999) - (rankB || 999);
                          })
                          .map((selection) => (
                            <div key={selection.id} className={!bettingWindow?.canBet ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={(sel) => handleSelectSelection(sel, false)}
                                discipline={discipline}
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

        {/* Parlay Cart */}
        {parlaySelections.length > 0 && (
          <div className="mt-6">
            <ParlayCart
              selections={parlaySelections}
              markets={markets}
              onRemove={handleRemoveFromParlay}
              onPlaceParlay={handlePlaceParlay}
              onClear={handleClearParlay}
            />
          </div>
        )}
      </div>

      {/* Prediction Dialog with context */}
      <PredictionDialog
        selection={selectedSelection}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirmPrediction}
        walletBalance={walletBalance}
        parlaySelections={parlaySelections}
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
                // Clear selections for this context
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
        />
      )}

      <BottomNav />
    </div>
  );
};

export default TournamentDetail;
