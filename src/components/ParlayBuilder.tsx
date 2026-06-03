import { useState, useEffect } from 'react';
import { Tournament, Selection, Market, Discipline, Category } from '@/types';
import { ParlayLeg, ParlayStep } from '@/types/parlay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectionCard } from '@/components/SelectionCard';
import { PodiumPositionAssigner } from '@/components/PodiumPositionAssigner';
import { getParlayMultiplierDetails, isDuplicateLeg, getLegBreakdown } from '@/utils/parlayMultipliers';
import { PARLAY_CONFIG } from '@/utils/parlayConfig';
import { resolvePodiumOrderedMultiplier } from '@/utils/podiumMultipliers';
import { Trophy, Target, Medal, ArrowRight, ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatMultiplier } from '@/utils/multiplierUtils';
import { toast } from 'sonner';

interface ParlayBuilderProps {
  open: boolean;
  onClose: () => void;
  tournament: Tournament;
  markets: Market[];
  selections: Selection[];
  onComplete: () => void;
  userId: string;
  walletBalance: number;
}

export function ParlayBuilder({
  open,
  onClose,
  tournament,
  markets,
  selections,
  onComplete,
  userId,
  walletBalance
}: ParlayBuilderProps) {
  const [legs, setLegs] = useState<ParlayLeg[]>([]);
  const [currentStep, setCurrentStep] = useState<ParlayStep>('context');
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  
  // Context selection
  const [selectedGender, setSelectedGender] = useState<'men' | 'women'>('men');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>('slalom');
  const [selectedCategory, setSelectedCategory] = useState<Category>('open_men');
  
  // Podium step state
  const [selectedAthletes, setSelectedAthletes] = useState<Selection[]>([]);
  const [showAssigner, setShowAssigner] = useState(false);
  
  // Stake
  const [stake, setStake] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Update category when gender changes
  useEffect(() => {
    setSelectedCategory(selectedGender === 'men' ? 'open_men' : 'open_women');
  }, [selectedGender]);

  const currentLeg = legs[currentLegIndex] || null;
  const multiplierDetails = getParlayMultiplierDetails(legs.filter(l => l.isComplete));
  const multiplier = multiplierDetails.finalMultiplier;

  // Get available discipline+gender combinations
  const getAvailableCombinations = () => {
    const allCombos = [
      { discipline: 'slalom', gender: 'men' },
      { discipline: 'slalom', gender: 'women' },
      { discipline: 'trick', gender: 'men' },
      { discipline: 'trick', gender: 'women' },
      { discipline: 'jump', gender: 'men' },
      { discipline: 'jump', gender: 'women' },
    ];
    return allCombos.filter(combo => 
      !legs.some(leg => leg.discipline === combo.discipline && leg.gender === combo.gender)
    );
  };

  // Filter markets and selections for current context
  const getMarketForType = (marketType: string) => {
    return markets.find(m => 
      m.discipline === selectedDiscipline && 
      m.category === selectedCategory && 
      m.market_type === marketType
    );
  };

  const hasMarketType = (marketType: string) => !!getMarketForType(marketType);

  // Get the ordered list of available steps for the current discipline/gender
  const getAvailableSteps = (): ParlayStep[] => {
    const steps: ParlayStep[] = ['winner'];
    // Podium / Highest Score are now eligible as parlay legs.
    // Podium is priced as ONE leg via the combined override-aware multiplier.
    if (hasMarketType('PODIUM')) steps.push('podium');
    if (hasMarketType('HIGHEST_SCORE')) steps.push('highestScore');
    return steps;
  };

  const getNextStep = (current: ParlayStep): ParlayStep => {
    const steps = getAvailableSteps();
    const idx = steps.indexOf(current);
    if (idx >= 0 && idx < steps.length - 1) return steps[idx + 1];
    return 'summary';
  };

  const getPrevStep = (current: ParlayStep): ParlayStep => {
    const steps = getAvailableSteps();
    const idx = steps.indexOf(current);
    if (idx > 0) return steps[idx - 1];
    return 'context';
  };

  const isLastMarketStep = (current: ParlayStep): boolean => {
    const steps = getAvailableSteps();
    return current === steps[steps.length - 1];
  };

  const getSelectionsForMarket = (marketId: string) => {
    return selections.filter(s => s.market_id === marketId);
  };

  // Reset parlay to initial state
  const resetParlay = () => {
    setLegs([]);
    setCurrentStep('context');
    setCurrentLegIndex(0);
    setSelectedGender('men');
    setSelectedDiscipline('slalom');
    setSelectedAthletes([]);
    setShowAssigner(false);
    setStake('');
  };

  // Handle close with confirmation if progress exists
  const handleClose = () => {
    if (legs.length > 0) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  // Handle discard and exit
  const handleDiscardAndExit = () => {
    resetParlay();
    setShowExitConfirm(false);
    onClose();
  };

  const startNewLeg = () => {
    // Check for duplicates
    if (isDuplicateLeg(legs, selectedDiscipline, selectedGender)) {
      toast.error('You already have a leg for this discipline and gender');
      return;
    }

    const newLeg: ParlayLeg = {
      discipline: selectedDiscipline,
      gender: selectedGender,
      category: selectedCategory,
      winner: null,
      podium: { first: null, second: null, third: null },
      highestScore: null,
      isComplete: false
    };

    setLegs([...legs, newLeg]);
    setCurrentLegIndex(legs.length);
    setCurrentStep('winner');
  };

  const handleWinnerSelect = (selection: Selection) => {
    if (!currentLeg) return;
    
    const updatedLeg = { ...currentLeg, winner: selection };
    // Mark complete if winner is the last available step
    if (isLastMarketStep('winner')) {
      updatedLeg.isComplete = true;
    }
    const updatedLegs = [...legs];
    updatedLegs[currentLegIndex] = updatedLeg;
    setLegs(updatedLegs);
    
    // Reset podium state when moving to next step
    setSelectedAthletes([]);
    setShowAssigner(false);
  };

  const handlePodiumComplete = async (positions: { first: Selection; second: Selection; third: Selection }) => {
    if (!currentLeg) return;

    const podiumMarket = getMarketForType('PODIUM');
    const marketId = podiumMarket?.id ?? positions.first.market_id;

    // Resolve combined podium multiplier (override-aware) so this counts as
    // ONE leg factor in the parlay product.
    let combined = 0;
    try {
      const res = await resolvePodiumOrderedMultiplier({
        marketId,
        firstAthleteId: positions.first.athlete_id,
        secondAthleteId: positions.second.athlete_id,
        thirdAthleteId: positions.third.athlete_id,
        decimalOdds: [
          positions.first.decimal_odds ?? 1,
          positions.second.decimal_odds ?? 1,
          positions.third.decimal_odds ?? 1,
        ],
      });
      combined = res.multiplier;
    } catch {
      combined =
        (positions.first.decimal_odds ?? 1) +
        (positions.second.decimal_odds ?? 1) +
        (positions.third.decimal_odds ?? 1);
    }

    const updatedLeg = {
      ...currentLeg,
      podium: positions,
      podiumMarketId: marketId,
      podiumMultiplier: combined,
    };
    if (isLastMarketStep('podium')) {
      updatedLeg.isComplete = true;
    }
    const updatedLegs = [...legs];
    updatedLegs[currentLegIndex] = updatedLeg;
    setLegs(updatedLegs);
  };

  const handleHighestScoreSelect = (selection: Selection) => {
    if (!currentLeg) return;
    
    const updatedLeg = { 
      ...currentLeg, 
      highestScore: selection,
      isComplete: true // Mark as complete
    };
    const updatedLegs = [...legs];
    updatedLegs[currentLegIndex] = updatedLeg;
    setLegs(updatedLegs);
  };

  const removeLeg = (index: number) => {
    const updatedLegs = legs.filter((_, i) => i !== index);
    setLegs(updatedLegs);
    if (currentLegIndex >= updatedLegs.length) {
      setCurrentLegIndex(Math.max(0, updatedLegs.length - 1));
    }
  };

  const handleSubmit = async () => {
    const stakeAmount = parseInt(stake);
    if (!stakeAmount || stakeAmount < 100) {
      toast.error(`Minimum stake is 100 tokens`);
      return;
    }

    if (stakeAmount > walletBalance) {
      toast.error('Insufficient balance');
      return;
    }

    const completeLegs = legs.filter(l => l.isComplete);
    if (completeLegs.length === 0) {
      toast.error('Complete at least one leg to place parlay');
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate via backend before placing
      const firstLeg = completeLegs[0];
      const firstAthleteId = firstLeg.winner?.athlete_id || firstLeg.podium.first?.athlete_id || '';
      const firstMarketId = firstLeg.winner?.market_id || firstLeg.podium.first?.market_id || '';
      
      const { data: validation, error: valError } = await supabase.functions.invoke('validate-entry', {
        body: {
          userId,
          tournamentId: tournament.id,
          marketId: firstMarketId,
          athleteId: firstAthleteId,
          stakeAmount,
          currentOdds: multiplier,
          marketType: 'WINNER',
          entryType: 'parlay'
        }
      });

      if (valError || !validation?.allowed) {
        toast.error(validation?.reason || 'Entry validation failed. Please try again.');
        setIsSubmitting(false);
        return;
      }
      const potentialPayout = Math.floor(stakeAmount * multiplier);

      // Create entry record (stored in bet_slips table)
      const { data: entryRecord, error: slipError } = await supabase
        .from('bet_slips')
        .insert({
          user_id: userId,
          tournament_id: tournament.id,
          type: 'parlay',
          leg_count: completeLegs.length,
          total_stake_tokens: stakeAmount,
          total_odds_decimal: multiplier,
          total_odds_american: Math.round((multiplier - 1) * 100),
          potential_payout_tokens: potentialPayout,
          status: 'PENDING'
        })
        .select()
        .single();

      if (slipError) throw slipError;

      // Build one row per "selection unit" in each leg. Podium is a SINGLE
      // row with selection_id='<marketId>-podium' priced at the combined
      // override-aware multiplier — settlement (settle-predictions) already
      // handles the -podium suffix shape for exact-order payouts.
      const predictions: any[] = [];
      for (const leg of completeLegs) {
        const unitsInLeg =
          (leg.winner ? 1 : 0) +
          (leg.podium.first && leg.podium.second && leg.podium.third ? 1 : 0) +
          (leg.highestScore ? 1 : 0);
        const perLegStake = Math.floor(stakeAmount / completeLegs.length);
        const perUnitStake = unitsInLeg > 0 ? Math.floor(perLegStake / unitsInLeg) : 0;

        if (leg.winner) {
          predictions.push({
            user_id: userId,
            bet_slip_id: entryRecord.id,
            selection_id: leg.winner.id,
            athlete_name: leg.winner.athlete.name,
            tournament_name: tournament.name,
            discipline: leg.discipline,
            category: leg.category,
            market_type: 'WINNER',
            staked_tokens: perUnitStake,
            decimal_odds: leg.winner.decimal_odds,
            potential_payout: 0,
            parlay_leg_count: completeLegs.length,
            status: 'PENDING',
          });
        }

        if (leg.podium.first && leg.podium.second && leg.podium.third) {
          const marketId = leg.podiumMarketId ?? leg.podium.first.market_id;
          predictions.push({
            user_id: userId,
            bet_slip_id: entryRecord.id,
            // Synthetic composite — matches standalone podium predictions and
            // is allowed by the updated enforce_parlay_leg_rules trigger.
            selection_id: `${marketId}-podium`,
            athlete_name: `${leg.podium.first.athlete.name}, ${leg.podium.second.athlete.name}, ${leg.podium.third.athlete.name}`,
            tournament_name: tournament.name,
            discipline: leg.discipline,
            category: leg.category,
            market_type: 'PODIUM',
            staked_tokens: perUnitStake,
            decimal_odds: leg.podiumMultiplier ?? 1,
            potential_payout: 0,
            parlay_leg_count: completeLegs.length,
            status: 'PENDING',
            settlement_metadata: {
              podium_picks: {
                first: { athlete_id: leg.podium.first.athlete_id, name: leg.podium.first.athlete.name },
                second: { athlete_id: leg.podium.second.athlete_id, name: leg.podium.second.athlete.name },
                third: { athlete_id: leg.podium.third.athlete_id, name: leg.podium.third.athlete.name },
              },
              combined_multiplier: leg.podiumMultiplier ?? 1,
            },
          });
        }

        if (leg.highestScore) {
          predictions.push({
            user_id: userId,
            bet_slip_id: entryRecord.id,
            selection_id: leg.highestScore.id,
            athlete_name: leg.highestScore.athlete.name,
            tournament_name: tournament.name,
            discipline: leg.discipline,
            category: leg.category,
            market_type: 'HIGHEST_SCORE',
            staked_tokens: perUnitStake,
            decimal_odds: leg.highestScore.decimal_odds,
            potential_payout: 0,
            parlay_leg_count: completeLegs.length,
            status: 'PENDING',
          });
        }
      }

      const { error: predError } = await supabase
        .from('predictions')
        .insert(predictions);

      if (predError) throw predError;

      // Fetch current wallet state
      const { data: walletData, error: walletFetchError } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletFetchError) throw walletFetchError;
      if (!walletData) throw new Error('Wallet not found');

      // Deduct from purchased first, then earned (correct accounting)
      const newPurchasedTokens = Math.max(0, walletData.purchased_tokens - stakeAmount);
      const remaining = stakeAmount - walletData.purchased_tokens;
      const newEarnedTokens = remaining > 0 
        ? walletData.earned_tokens - remaining 
        : walletData.earned_tokens;

      const { error: walletUpdateError } = await supabase
        .from('token_wallets')
        .update({
          purchased_tokens: newPurchasedTokens,
          earned_tokens: Math.max(0, newEarnedTokens)
        })
        .eq('user_id', userId);

      if (walletUpdateError) throw walletUpdateError;

      const newBalance = newPurchasedTokens + Math.max(0, newEarnedTokens);

      // Log transaction for audit trail
      await supabase.from('token_transactions').insert({
        user_id: userId,
        type: 'entry_placed',
        amount: -stakeAmount,
        balance_after: newBalance,
        reference_type: 'entry',
        reference_id: entryRecord.id,
        description: `Parlay entry (${completeLegs.length} legs) - ${tournament.name}`,
        metadata: {
          tournament_name: tournament.name,
          leg_count: completeLegs.length,
          multiplier: multiplier,
          potential_payout: potentialPayout,
          legs: completeLegs.map(leg => ({
            discipline: leg.discipline,
            gender: leg.gender,
            winner: leg.winner?.athlete.name
          }))
        }
      });

      // Send entry confirmation email (non-blocking)
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.email) {
          // Build athlete names summary
          const athleteNames = completeLegs.map(leg => leg.winner?.athlete.name || 'Unknown').join(', ');
          const disciplines = completeLegs.map(leg => leg.discipline).join(', ');
          
          await supabase.functions.invoke('send-email', {
            body: {
              type: 'entry_confirmation',
              to: userData.user.email,
              userId: userId,
              data: {
                username: userData.user.email.split('@')[0],
                athleteName: `Parlay: ${athleteNames}`,
                tournamentName: tournament.name,
                discipline: disciplines,
                marketType: `PARLAY (${completeLegs.length} legs)`,
                stakedTokens: stakeAmount,
                potentialPayout: potentialPayout,
                odds: multiplier
              }
            }
          });
        }
      } catch (emailError) {
        console.error('Parlay entry confirmation email failed:', emailError);
        // Don't block parlay placement
      }

      toast.success(`Parlay placed! ${multiplier}x multiplier`);
      onComplete();
      onClose();
      
      // Reset state
      setLegs([]);
      setCurrentStep('context');
      setCurrentLegIndex(0);
      setStake('');
    } catch (error: any) {
      console.error('Error placing parlay:', error);
      toast.error(error.message || 'Failed to place parlay. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderProgressIndicator = () => {
    const completedLegs = legs.filter(l => l.isComplete).length;
    return (
      <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Parlay Progress</span>
          </div>
          <span className="text-sm font-bold">
            {completedLegs} Leg{completedLegs === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    );
  };

  const renderStepIndicator = () => {
    const allSteps = [
      { key: 'context', label: 'Context', icon: Target },
      { key: 'winner', label: 'Winner', icon: Trophy },
      { key: 'podium', label: 'Podium', icon: Medal },
      { key: 'highestScore', label: 'Highest', icon: Target },
      { key: 'summary', label: 'Summary', icon: Plus }
    ];
    // Only render steps that are actually enabled in the parlay flow.
    // PODIUM and HIGHEST_SCORE are parlay-ineligible (see getAvailableSteps
    // + DB trigger enforce_parlay_leg_rules), so they must not appear in the
    // progress indicator even when the markets exist on the tournament.
    const enabledKeys = new Set<string>(['context', 'summary', ...getAvailableSteps()]);
    const steps = allSteps.filter(step => enabledKeys.has(step.key));

    return (
      <div className="flex items-center justify-between mb-6">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = currentStep === step.key;
          const isPast = steps.findIndex(s => s.key === currentStep) > idx;
          
          return (
            <div key={step.key} className="flex items-center">
              <div className={`flex items-center gap-2 ${isActive ? 'text-primary' : isPast ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${isActive ? 'border-primary bg-primary/10' : isPast ? 'border-primary bg-primary' : 'border-border'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
              </div>
              {idx < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground/30" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderContextStep = () => {
    const usedCombinations = legs.map(l => `${l.discipline}-${l.gender}`);
    const completedLegs = legs.filter(l => l.isComplete);
    const availableCombinations = getAvailableCombinations();
    
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Select Discipline & Gender</h3>
          
          {availableCombinations.length === 0 ? (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>Maximum legs reached! All discipline+gender combinations are used.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Gender</Label>
                <div className="flex gap-2 mt-2">
                  {['men', 'women'].map(gender => (
                    <Button
                      key={gender}
                      variant={selectedGender === gender ? 'default' : 'outline'}
                      onClick={() => setSelectedGender(gender as 'men' | 'women')}
                      className="flex-1"
                    >
                      {gender === 'men' ? 'Men' : 'Women'}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Discipline</Label>
                <div className="flex gap-2 mt-2">
                  {tournament.disciplines.map(disc => {
                    const key = `${disc}-${selectedGender}`;
                    const isUsed = usedCombinations.includes(key);
                    
                    return (
                      <Button
                        key={disc}
                        variant={selectedDiscipline === disc ? 'default' : 'outline'}
                        onClick={() => !isUsed && setSelectedDiscipline(disc as Discipline)}
                        disabled={isUsed}
                        className="flex-1 capitalize"
                      >
                        {disc}
                        {isUsed && <Badge variant="secondary" className="ml-2">Used</Badge>}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {completedLegs.length > 0 && (
            <Button variant="outline" onClick={() => setCurrentStep('summary')} className="flex-1">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back to Summary
            </Button>
          )}
          {availableCombinations.length > 0 && (
            <Button onClick={startNewLeg} className="flex-1" size="lg">
              Continue to Winner <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderWinnerStep = () => {
    const winnerMarket = getMarketForType('WINNER');
    if (!winnerMarket) return <Alert><AlertDescription>No winner market available</AlertDescription></Alert>;

    const winnerSelections = getSelectionsForMarket(winnerMarket.id);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Select Winner</h3>
          <Badge>{selectedGender === 'men' ? 'Men' : 'Women'} • {selectedDiscipline}</Badge>
        </div>

        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>Select exactly 1 athlete to win this event</AlertDescription>
        </Alert>

        <div className="grid gap-2 max-h-[400px] overflow-y-auto">
          {winnerSelections.map(selection => (
            <div 
              key={selection.id}
              className={currentLeg?.winner?.id === selection.id ? 'ring-2 ring-primary rounded-lg' : ''}
            >
              <SelectionCard
                selection={selection}
                onSelect={() => handleWinnerSelect(selection)}
                discipline={selectedDiscipline}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep('context')} className="flex-1">
            <ArrowLeft className="mr-2 w-4 h-4" /> Back
          </Button>
          <Button 
            onClick={() => setCurrentStep(getNextStep('winner'))} 
            disabled={!currentLeg?.winner}
            className="flex-1"
          >
            Continue to {getNextStep('winner') === 'podium' ? 'Podium' : getNextStep('winner') === 'highestScore' ? 'Highest Score' : 'Summary'} <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  const renderPodiumStep = () => {
    const podiumMarket = getMarketForType('PODIUM');
    if (!podiumMarket) return <Alert><AlertDescription>No podium market available</AlertDescription></Alert>;

    const podiumSelections = getSelectionsForMarket(podiumMarket.id);

    const toggleAthlete = (selection: Selection) => {
      if (selectedAthletes.find(s => s.id === selection.id)) {
        setSelectedAthletes(selectedAthletes.filter(s => s.id !== selection.id));
      } else if (selectedAthletes.length < 3) {
        setSelectedAthletes([...selectedAthletes, selection]);
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Select Podium (Top 3)</h3>
          <Badge>{selectedGender === 'men' ? 'Men' : 'Women'} • {selectedDiscipline}</Badge>
        </div>

        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            Select 3 athletes for the podium ({selectedAthletes.length}/3 selected)
          </AlertDescription>
        </Alert>

        {!showAssigner ? (
          <>
            <div className="grid gap-2 max-h-[400px] overflow-y-auto">
              {podiumSelections.map(selection => {
                const isSelected = !!selectedAthletes.find(s => s.id === selection.id);
                const isDisabled = selectedAthletes.length >= 3 && !isSelected;
                
                return (
                  <div 
                    key={selection.id}
                    className={isSelected ? 'ring-2 ring-primary rounded-lg' : ''}
                  >
                    <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
                      <SelectionCard
                        selection={selection}
                        onSelect={() => toggleAthlete(selection)}
                        discipline={selectedDiscipline}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep(getPrevStep('podium'))} className="flex-1">
            <ArrowLeft className="mr-2 w-4 h-4" /> Back
              </Button>
              <Button 
                onClick={() => setShowAssigner(true)} 
                disabled={selectedAthletes.length !== 3}
                className="flex-1"
              >
                Assign Positions <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <PodiumPositionAssigner
            athletes={selectedAthletes}
            onAssignPositions={(positions) => {
              handlePodiumComplete(positions);
              setCurrentStep(getNextStep('podium'));
            }}
            onCancel={() => setShowAssigner(false)}
          />
        )}
      </div>
    );
  };

  const renderHighestScoreStep = () => {
    const highestMarket = getMarketForType('HIGHEST_SCORE');
    if (!highestMarket) return <Alert><AlertDescription>No highest score market available</AlertDescription></Alert>;

    const highestSelections = getSelectionsForMarket(highestMarket.id);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Select Highest Score</h3>
          <Badge>{selectedGender === 'men' ? 'Men' : 'Women'} • {selectedDiscipline}</Badge>
        </div>

        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>Select 1 athlete to achieve the highest score</AlertDescription>
        </Alert>

        <div className="grid gap-2 max-h-[400px] overflow-y-auto">
          {highestSelections.map(selection => (
            <div 
              key={selection.id}
              className={currentLeg?.highestScore?.id === selection.id ? 'ring-2 ring-primary rounded-lg' : ''}
            >
              <SelectionCard
                selection={selection}
                onSelect={() => handleHighestScoreSelect(selection)}
                discipline={selectedDiscipline}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep(getPrevStep('highestScore'))} className="flex-1">
            <ArrowLeft className="mr-2 w-4 h-4" /> Back
          </Button>
          <Button 
            onClick={() => setCurrentStep('summary')} 
            disabled={!currentLeg?.highestScore}
            className="flex-1"
          >
            Review Leg <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  const handleEditLeg = (legIndex: number) => {
    setCurrentLegIndex(legIndex);
    const leg = legs[legIndex];
    setSelectedDiscipline(leg.discipline);
    setSelectedGender(leg.gender);
    setCurrentStep('winner'); // Start from winner step to allow editing
  };

  const renderSummary = () => {
    const completeLegs = legs.filter(l => l.isComplete);
    // TODO(shadow): rename when touching this code
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const multiplierDetails = getParlayMultiplierDetails(legs);
    const availableCombinations = getAvailableCombinations();

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Parlay Summary</h3>
          
          {completeLegs.length === 0 ? (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>No complete legs yet. Add your first leg to continue.</AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-3">
              {completeLegs.map((leg, idx) => {
                const actualIndex = legs.findIndex(l => l === leg);
                return (
                  <div 
                    key={idx} 
                    className="group border rounded-lg p-4 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer bg-card relative"
                    onClick={() => handleEditLeg(actualIndex)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            Leg {idx + 1}
                          </Badge>
                          <span className="font-semibold capitalize text-sm">
                            {leg.gender === 'men' ? 'Men' : 'Women'}'s {leg.discipline}
                          </span>
                        </div>
                        
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Trophy className="w-3 h-3 text-yellow-600 dark:text-yellow-500" />
                              <strong>Winner:</strong> {leg.winner?.athlete.name}
                            </div>
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">
                              {formatMultiplier(leg.winner?.decimal_odds || 1)}
                            </Badge>
                          </div>
                          {(leg.podium.first || leg.podium.second || leg.podium.third) && (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Medal className="w-3 h-3 text-orange-600 dark:text-orange-500" />
                              <strong>Podium:</strong> 
                              <span className="truncate">
                                {leg.podium.first?.athlete.name}, {leg.podium.second?.athlete.name}, {leg.podium.third?.athlete.name}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-xs h-5 px-1.5 whitespace-nowrap">
                              {formatMultiplier(leg.podiumMultiplier || 1)}
                            </Badge>
                          </div>
                          )}
                          {leg.highestScore && (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Target className="w-3 h-3 text-blue-600 dark:text-blue-500" />
                              <strong>Highest:</strong> {leg.highestScore?.athlete.name}
                            </div>
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">
                              {formatMultiplier(leg.highestScore?.decimal_odds || 1)}
                            </Badge>
                          </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditLeg(actualIndex);
                          }}
                          title="Edit leg"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLeg(actualIndex);
                          }}
                          title="Delete leg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="absolute inset-0 rounded-lg bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-primary/10 rounded-lg p-4 space-y-2">
          <div className="text-2xl font-bold text-center">
            {multiplierDetails.finalMultiplier.toFixed(2)}x Multiplier
          </div>
          <div className="text-xs text-muted-foreground text-center">
            Add Winner, Podium and Highest Score legs across disciplines and genders to stack.
          </div>
        </div>

        <div className="flex gap-2">
          {availableCombinations.length > 0 && (
            <Button variant="outline" onClick={() => setCurrentStep('context')} className="flex-1">
              <Plus className="mr-2 w-4 h-4" /> Add Another Leg
            </Button>
          )}
          <Button 
            onClick={() => setCurrentStep('stake')} 
            disabled={completeLegs.length === 0}
            className="flex-1"
          >
            Set Stake & Confirm <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  const renderStakeStep = () => {
    const completeLegs = legs.filter(l => l.isComplete);
    // TODO(shadow): rename when touching this code
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const multiplierDetails = getParlayMultiplierDetails(legs);
    const stakeAmount = parseInt(stake) || 0;
    const potentialPayout = Math.floor(stakeAmount * multiplierDetails.finalMultiplier);

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Set Your Stake</h3>
          
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total Legs</span>
                <span className="font-semibold">{completeLegs.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Multiplier</span>
                <span className="font-semibold">{multiplierDetails.finalMultiplier.toFixed(1)}x</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Available Balance</span>
                <span className="font-semibold">{walletBalance.toLocaleString()} tokens</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Stake Amount</Label>
              <Input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Enter stake amount"
                max={PARLAY_CONFIG.MAX_STAKE}
              />
              <div className="flex gap-2">
                {[100, 250, 500, 1000].map(amount => (
                  <Button 
                    key={amount} 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setStake(amount.toString())}
                  >
                    {amount}
                  </Button>
                ))}
              </div>
            </div>

            {stakeAmount > 0 && (
              <div className="bg-primary/10 rounded-lg p-4">
                <div className="text-sm text-muted-foreground">Potential Payout</div>
                <div className="text-2xl font-bold">{potentialPayout.toLocaleString()} tokens</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep('summary')} className="flex-1">
            <ArrowLeft className="mr-2 w-4 h-4" /> Back
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || stakeAmount <= 0 || stakeAmount > walletBalance}
            className="flex-1"
          >
            {isSubmitting ? 'Placing...' : 'Confirm Parlay'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Parlay Builder</DialogTitle>
                <DialogDescription>{tournament.name}</DialogDescription>
              </div>
              {legs.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetParlay}
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Start Fresh
                </Button>
              )}
            </div>
          </DialogHeader>

        {renderProgressIndicator()}
        {renderStepIndicator()}

        <div className="py-4">
          {currentStep === 'context' && renderContextStep()}
          {currentStep === 'winner' && renderWinnerStep()}
          {currentStep === 'podium' && renderPodiumStep()}
          {currentStep === 'highestScore' && renderHighestScoreStep()}
          {currentStep === 'summary' && renderSummary()}
          {currentStep === 'stake' && renderStakeStep()}
        </div>

        <DialogFooter className="mt-4 gap-2">
          {legs.length > 0 ? (
            <>
              <Button variant="destructive" onClick={() => setShowExitConfirm(true)}>
                Discard Parlay
              </Button>
              <Button variant="outline" onClick={onClose}>
                Save & Exit Later
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You have {legs.length} leg{legs.length !== 1 ? 's' : ''} in progress</AlertDialogTitle>
          <AlertDialogDescription>
            What would you like to do with your parlay?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Building</AlertDialogCancel>
          <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => { setShowExitConfirm(false); onClose(); }}>
            Save & Exit
          </AlertDialogAction>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDiscardAndExit}>
            Discard All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
