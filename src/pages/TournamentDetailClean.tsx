import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
import { Selection, Tournament, Market } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock, AlertCircle, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ParlayBuilder } from '@/components/ParlayBuilder';
import { Button } from '@/components/ui/button';
import { getPredictionWindowStatus } from '@/utils/predictionWindows';
import { Alert, AlertDescription } from '@/components/ui/alert';

const TournamentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Get highlighted athletes from "Bet Again" navigation
  const betAgainAthletes: string[] = location.state?.betAgainAthletes || [];
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [predictionWindow, setPredictionWindow] = useState<ReturnType<typeof getPredictionWindowStatus> | null>(null);
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
  
  // Parlay Builder state
  const [parlayBuilderOpen, setParlayBuilderOpen] = useState(false);
  
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

  // Show toast if user came from "Predict Again"
  useEffect(() => {
    if (betAgainAthletes.length > 0 && !loading) {
      toast({
        title: "Previous picks highlighted",
        description: `${betAgainAthletes.length} athlete(s) from your previous prediction are highlighted below`
      });
    }
  }, [betAgainAthletes.length, loading]);

  useEffect(() => {
    if (!tournament) return;

    const updatePredictionWindow = () => {
      const startTime = tournament.start_datetime || tournament.start_date;
      const endTime = tournament.end_datetime || tournament.end_date;
      setPredictionWindow(getPredictionWindowStatus(startTime, endTime, tournament.settled_at));
    };

    updatePredictionWindow();
    const interval = setInterval(updatePredictionWindow, 1000);

    return () => clearInterval(interval);
  }, [tournament]);

  const fetchTournamentData = async () => {
    try {
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
          disciplines: tournamentData.disciplines as ('slalom' | 'trick' | 'jump')[],
          status: tournamentData.status as 'upcoming' | 'live' | 'finished',
          settled_at: tournamentData.settled_at
        });

        // Fetch markets
        const { data: marketsData, error: marketsError } = await supabase
          .from('markets')
          .select('*')
          .eq('tournament_id', tournamentData.id);

        if (marketsError) throw marketsError;
        if (marketsData) setMarkets(marketsData as Market[]);

        // Fetch selections with athletes
        const { data: selectionsData, error: selectionsError } = await supabase
          .from('selections')
          .select(`
            *,
            athlete:athletes(*)
          `)
          .in('market_id', marketsData?.map(m => m.id) || []);

        if (selectionsError) throw selectionsError;
        if (selectionsData) setSelections(selectionsData as any);

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

  const handleConfirmPodiumPrediction = async (stakeAmount: number) => {
    if (!user || !currentPodiumContext || !tournament) return;
    
    const podiumState = getPodiumState(currentPodiumContext.discipline, currentPodiumContext.gender);
    if (!podiumState.assignedPositions) return;
    
    try {
      const podiumMarket = currentPodiumContext.market;
      
      // Calculate multiplier based on combined odds (simplified)
      const combinedOdds = 1.5;
      const potentialPayout = Math.floor(stakeAmount * combinedOdds);

      // Step 1: Create bet_slip FIRST
      const americanOdds = combinedOdds >= 2 
        ? Math.round((combinedOdds - 1) * 100)
        : Math.round(-100 / (combinedOdds - 1));
        
      const { data: betSlip, error: slipError } = await supabase
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
          bet_slip_id: betSlip.id,
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
        type: 'bet_placed',
        amount: -stakeAmount,
        balance_after: newBalance,
        reference_type: 'bet_slip',
        reference_id: betSlip.id,
        description: `Podium bet: ${podiumState.assignedPositions.first.athlete.name}, ${podiumState.assignedPositions.second.athlete.name}, ${podiumState.assignedPositions.third.athlete.name} - ${tournament.name}`,
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
        description: `${stakeAmount} tokens staked on podium prediction`,
      });

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

      const potentialPayout = Math.floor(stakeAmount * selectedSelection.decimal_odds);

      // Step 1: Create bet_slip FIRST
      const americanOdds = selectedSelection.decimal_odds >= 2 
        ? Math.round((selectedSelection.decimal_odds - 1) * 100)
        : Math.round(-100 / (selectedSelection.decimal_odds - 1));
        
      const { data: betSlip, error: slipError } = await supabase
        .from('bet_slips')
        .insert({
          user_id: user.id,
          tournament_id: tournament.id,
          type: 'single',
          leg_count: 1,
          total_stake_tokens: stakeAmount,
          total_odds_decimal: selectedSelection.decimal_odds,
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
          decimal_odds: selectedSelection.decimal_odds,
          potential_payout: potentialPayout,
          bet_slip_id: betSlip.id,
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
        type: 'bet_placed',
        amount: -stakeAmount,
        balance_after: newBalance,
        reference_type: 'bet_slip',
        reference_id: betSlip.id,
        description: `Bet placed on ${selectedSelection.athlete.name} - ${tournament.name}`,
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
        description: `${stakeAmount} tokens staked on ${selectedSelection.athlete.name}`,
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title={tournament.name} showBack />

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tournament Info */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{tournament.location}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>
              {formatDate(tournament.start_datetime || tournament.start_date)} - {formatDate(tournament.end_datetime || tournament.end_date)}
            </span>
          </div>
          
          {/* Prediction Window Status */}
          {predictionWindow && (
            <Alert className={
              predictionWindow.canPredict 
                ? 'border-primary/50 bg-primary/10' 
                : predictionWindow.status === 'upcoming'
                  ? 'border-border bg-muted/30'
                  : 'border-destructive/50 bg-destructive/10'
            }>
              <Clock className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span className="font-medium">{predictionWindow.message}</span>
                {!predictionWindow.canPredict && predictionWindow.status !== 'upcoming' && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Parlay Builder Button */}
        {tournament.status !== 'finished' && predictionWindow?.canPredict && (
          <div className="mb-6 flex items-center justify-center">
            <Button 
              onClick={() => setParlayBuilderOpen(true)}
              size="lg"
              className="w-full max-w-md"
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
            <h3 className="font-semibold mb-2">Athletes Coming Soon</h3>
            <p className="text-sm text-muted-foreground mb-4">
              We're waiting for the tournament organizer to confirm the athletes list. 
              Check back closer to the event for betting markets.
            </p>
            <Button variant="outline" onClick={() => navigate('/tournaments')}>
              Browse Other Events
            </Button>
          </Card>
        ) : (
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
                    <Tabs defaultValue="winner" className="w-full">
                      <TabsList className="w-full grid grid-cols-3 mb-4">
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
                                   market?.category === 'open_men' && 
                                   market?.market_type === 'WINNER';
                          })
                          .sort((a, b) => a.decimal_odds - b.decimal_odds)
                          .map((selection) => (
                            <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={handleSelectSelection}
                                discipline={discipline}
                                highlighted={betAgainAthletes.includes(selection.athlete.name)}
                              />
                            </div>
                          ))}
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
                            .sort((a, b) => a.decimal_odds - b.decimal_odds);
                          
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
                                  Place Podium Bet
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
                          .sort((a, b) => a.decimal_odds - b.decimal_odds)
                          .map((selection) => (
                            <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={handleSelectSelection}
                                discipline={discipline}
                                highlighted={betAgainAthletes.includes(selection.athlete.name)}
                              />
                            </div>
                          ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* Women's markets - similar structure */}
                  <TabsContent value="women">
                    <Tabs defaultValue="winner" className="w-full">
                      <TabsList className="w-full grid grid-cols-3 mb-4">
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
                          .sort((a, b) => a.decimal_odds - b.decimal_odds)
                          .map((selection) => (
                            <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={handleSelectSelection}
                                discipline={discipline}
                                highlighted={betAgainAthletes.includes(selection.athlete.name)}
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
                            .sort((a, b) => a.decimal_odds - b.decimal_odds);
                          
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
                                  Place Podium Bet
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
                          .sort((a, b) => a.decimal_odds - b.decimal_odds)
                          .map((selection) => (
                            <div key={selection.id} className={!predictionWindow?.canPredict ? 'opacity-50 pointer-events-none' : ''}>
                              <SelectionCard
                                selection={selection}
                                onSelect={handleSelectSelection}
                                discipline={discipline}
                                highlighted={betAgainAthletes.includes(selection.athlete.name)}
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
    </div>
  );
};

export default TournamentDetail;
