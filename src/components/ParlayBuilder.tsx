import { useState, useEffect } from 'react';
import { Tournament, Selection, Market, Discipline, Category } from '@/types';
import { ParlayLeg, ParlayStep } from '@/types/parlay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectionCard } from '@/components/SelectionCard';
import { PodiumPositionAssigner } from '@/components/PodiumPositionAssigner';
import { calculateParlayMultiplier, getParlayMultiplierDetails, getMultiplierSuggestions, isDuplicateLeg } from '@/utils/parlayMultipliers';
import { PARLAY_CONFIG } from '@/utils/parlayConfig';
import { Trophy, Target, Medal, ArrowRight, ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
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

  // Update category when gender changes
  useEffect(() => {
    setSelectedCategory(selectedGender === 'men' ? 'open_men' : 'open_women');
  }, [selectedGender]);

  const currentLeg = legs[currentLegIndex] || null;
  const multiplierDetails = getParlayMultiplierDetails(legs.filter(l => l.isComplete));
  const multiplier = multiplierDetails.finalMultiplier;
  const suggestions = getMultiplierSuggestions(legs.filter(l => l.isComplete), tournament.disciplines);

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

  const getSelectionsForMarket = (marketId: string) => {
    return selections.filter(s => s.market_id === marketId);
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
    const updatedLegs = [...legs];
    updatedLegs[currentLegIndex] = updatedLeg;
    setLegs(updatedLegs);
    
    // Reset podium state when moving to next step
    setSelectedAthletes([]);
    setShowAssigner(false);
  };

  const handlePodiumComplete = (positions: { first: Selection; second: Selection; third: Selection }) => {
    if (!currentLeg) return;
    
    const updatedLeg = { 
      ...currentLeg, 
      podium: positions
    };
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
    if (!stakeAmount || stakeAmount <= 0 || stakeAmount > PARLAY_CONFIG.MAX_STAKE) {
      toast.error(`Stake must be between 1 and ${PARLAY_CONFIG.MAX_STAKE} tokens`);
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
      const potentialPayout = stakeAmount * multiplier;

      // Create bet slip
      const { data: betSlip, error: slipError } = await supabase
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

      // Create predictions for each selection in each leg
      const predictions = [];
      for (const leg of completeLegs) {
        if (leg.winner) {
          predictions.push({
            user_id: userId,
            bet_slip_id: betSlip.id,
            selection_id: leg.winner.id,
            athlete_name: leg.winner.athlete.name,
            tournament_name: tournament.name,
            discipline: leg.discipline,
            category: leg.category,
            market_type: 'WINNER',
            staked_tokens: Math.floor(stakeAmount / (completeLegs.length * 3)), // Distribute evenly
            decimal_odds: multiplier,
            potential_payout: Math.floor(potentialPayout / (completeLegs.length * 3)),
            parlay_leg_count: completeLegs.length,
            status: 'PENDING'
          });
        }

        if (leg.podium.first && leg.podium.second && leg.podium.third) {
          [leg.podium.first, leg.podium.second, leg.podium.third].forEach((sel, idx) => {
            predictions.push({
              user_id: userId,
              bet_slip_id: betSlip.id,
              selection_id: sel.id,
              athlete_name: sel.athlete.name,
              tournament_name: tournament.name,
              discipline: leg.discipline,
              category: leg.category,
              market_type: 'PODIUM',
              staked_tokens: Math.floor(stakeAmount / (completeLegs.length * 3)),
              decimal_odds: multiplier,
              potential_payout: Math.floor(potentialPayout / (completeLegs.length * 3)),
              parlay_leg_count: completeLegs.length,
              status: 'PENDING'
            });
          });
        }

        if (leg.highestScore) {
          predictions.push({
            user_id: userId,
            bet_slip_id: betSlip.id,
            selection_id: leg.highestScore.id,
            athlete_name: leg.highestScore.athlete.name,
            tournament_name: tournament.name,
            discipline: leg.discipline,
            category: leg.category,
            market_type: 'HIGHEST_SCORE',
            staked_tokens: Math.floor(stakeAmount / (completeLegs.length * 3)),
            decimal_odds: multiplier,
            potential_payout: Math.floor(potentialPayout / (completeLegs.length * 3)),
            parlay_leg_count: completeLegs.length,
            status: 'PENDING'
          });
        }
      }

      const { error: predError } = await supabase
        .from('predictions')
        .insert(predictions);

      if (predError) throw predError;

      // Update wallet
      const { error: walletError } = await supabase
        .from('token_wallets')
        .update({
          earned_tokens: walletBalance - stakeAmount
        })
        .eq('user_id', userId);

      if (walletError) throw walletError;

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
      toast.error('Failed to place parlay');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderProgressIndicator = () => {
    const completedLegs = legs.filter(l => l.isComplete).length;
    const progressPercentage = (completedLegs / PARLAY_CONFIG.MAX_LEGS) * 100;
    
    return (
      <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Parlay Progress</span>
          </div>
          <span className="text-sm font-bold">
            {completedLegs}/{PARLAY_CONFIG.MAX_LEGS} Legs
          </span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
        {completedLegs === PARLAY_CONFIG.MAX_LEGS && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 text-center">
            ✨ All legs complete! Maximum multiplier unlocked!
          </p>
        )}
      </div>
    );
  };

  const renderStepIndicator = () => {
    const steps = [
      { key: 'context', label: 'Context', icon: Target },
      { key: 'winner', label: 'Winner', icon: Trophy },
      { key: 'podium', label: 'Podium', icon: Medal },
      { key: 'highestScore', label: 'Highest', icon: Target },
      { key: 'summary', label: 'Summary', icon: Plus }
    ];

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
            onClick={() => setCurrentStep('podium')} 
            disabled={!currentLeg?.winner}
            className="flex-1"
          >
            Continue to Podium <ArrowRight className="ml-2 w-4 h-4" />
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
              <Button variant="outline" onClick={() => setCurrentStep('winner')} className="flex-1">
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
              setCurrentStep('highestScore');
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
          <Button variant="outline" onClick={() => setCurrentStep('podium')} className="flex-1">
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

  const renderSummary = () => {
    const completeLegs = legs.filter(l => l.isComplete);
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
            <div className="space-y-4">
              {completeLegs.map((leg, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold capitalize">
                      Leg {idx + 1}: {leg.gender === 'men' ? 'Men' : 'Women'}'s {leg.discipline}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeLeg(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <div>• <strong>Winner:</strong> {leg.winner?.athlete.name}</div>
                    <div>• <strong>Podium:</strong> 1) {leg.podium.first?.athlete.name}, 2) {leg.podium.second?.athlete.name}, 3) {leg.podium.third?.athlete.name}</div>
                    <div>• <strong>Highest Score:</strong> {leg.highestScore?.athlete.name}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-primary/10 rounded-lg p-4 space-y-2">
          <div className="text-2xl font-bold text-center">
            {multiplierDetails.finalMultiplier.toFixed(0)}x Multiplier
          </div>
          
          {multiplierDetails.legCount < PARLAY_CONFIG.MAX_LEGS && (
            <div className="text-xs text-muted-foreground text-center">
              💡 Add more legs to unlock higher multipliers (up to 200x)
            </div>
          )}
          
          {multiplierDetails.legCount === PARLAY_CONFIG.MAX_LEGS && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 text-center">
              ✨ Maximum multiplier unlocked!
            </div>
          )}
          
          {suggestions.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
              {suggestions.map((sug, idx) => (
                <div key={idx} className="text-sm text-muted-foreground text-center">
                  💡 {sug}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {availableCombinations.length > 0 && completeLegs.length < PARLAY_CONFIG.MAX_LEGS && (
            <Button variant="outline" onClick={() => setCurrentStep('context')} className="flex-1">
              <Plus className="mr-2 w-4 h-4" /> Add Another Leg
            </Button>
          )}
          {completeLegs.length >= PARLAY_CONFIG.MAX_LEGS && (
            <Alert className="flex-1">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>Maximum legs reached (6/6)!</AlertDescription>
            </Alert>
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
    const multiplierDetails = getParlayMultiplierDetails(legs);
    const stakeAmount = parseInt(stake) || 0;
    const potentialPayout = stakeAmount * multiplierDetails.finalMultiplier;

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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Parlay Builder</DialogTitle>
          <DialogDescription>{tournament.name}</DialogDescription>
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

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} className="w-full">
            Cancel Parlay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
