import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { SEO } from '@/components/SEO';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Coins, TrendingUp, Calendar, ChevronDown, Trash2, Pencil, Info, RotateCcw, TrendingDown, Percent, CheckCircle, Share2 } from 'lucide-react';
import { getPredictionWindowStatus } from '@/utils/predictionWindows';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PARLAY_CONFIG } from '@/utils/parlayConfig';
import { SettlementExplanation, type SettlementData } from '@/components/settlement/SettlementExplanation';
import { ShareModal } from '@/components/ShareModal';
import { useUsername } from '@/hooks/useUsername';
import type { ShareCardProps, ShareCardSelection } from '@/components/ShareCard';
import { EventShareModal } from '@/components/EventShareModal';
import type { EventShareCardProps, EventShareRow } from '@/components/EventShareCard';

// Prediction entry — stored in the `bet_slips` DB table (legacy name, treated as "entries" in code)
interface PredictionEntry {
  id: string;
  type: 'single' | 'parlay';
  tournament_id: string;
  total_stake_tokens: number;
  total_odds_american: number;
  total_odds_decimal: number;
  status: string;
  potential_payout_tokens: number;
  actual_payout_tokens?: number;
  leg_count: number;
  created_at: string;
  settled_at?: string;
  tournament_name?: string;
  tournament_start_datetime?: string;
  tournament_end_datetime?: string;
  tournament_settled_at?: string | null;
  legs?: PredictionLeg[];
}

interface SettlementMetadata {
  status: string;
  explanation: string;
  tournament_name?: string;
  market_type?: string;
  discipline?: string;
  category?: string;
  athlete_picked?: string;
  actual_results?: {
    position_1st?: string;
    position_2nd?: string;
    position_3rd?: string;
    winner_score?: string;
    highest_scorer?: string;
    highest_score?: string;
  };
  payout_details?: {
    stake: number;
    odds_decimal: number;
    payout: number;
    profit: number;
  };
}

interface PredictionLeg {
  id: string;
  athlete_name: string;
  tournament_name: string;
  discipline: string;
  category: string;
  market_type: string;
  decimal_odds: number;
  status: string;
  settlement_metadata?: SettlementMetadata | null;
  podium_selections?: {
    position_predicted: number;
    athletes: { name: string };
  }[];
}

const Predictions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeEntries, setActiveEntries] = useState<PredictionEntry[]>([]);
  const [completedEntries, setCompletedEntries] = useState<PredictionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteEntry, setDeleteEntry] = useState<PredictionEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editEntry, setEditEntry] = useState<PredictionEntry | null>(null);
  const [newStakeAmount, setNewStakeAmount] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [viewMode, setViewMode] = useState<'flat' | 'tournament'>('tournament');
  const username = useUsername();
  const [shareEntry, setShareEntry] = useState<PredictionEntry | null>(null);
  const [shareTournament, setShareTournament] = useState<PredictionEntry[] | null>(null);
  
  // Confirmation from just-placed prediction
  const confirmation = location.state?.confirmation as {
    athleteName: string;
    tournamentName: string;
    marketType: string;
    discipline: string;
    stakeAmount: number;
    potentialPayout: number;
    odds: number;
  } | undefined;
  
  // Clear the location state after reading it
  useEffect(() => {
    if (confirmation) {
      window.history.replaceState({}, document.title);
    }
  }, [confirmation]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchEntries();
    fetchWalletBalance();
  }, [user, navigate]);

  const fetchWalletBalance = async () => {
    if (!user) return;
    
    try {
      const { data: wallet } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens')
        .eq('user_id', user.id)
        .single();
      
      if (wallet) {
        setWalletBalance(wallet.earned_tokens + wallet.purchased_tokens);
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    }
  };

  const fetchEntries = async () => {
    if (!user) return;

    try {
      // Fetch all prediction entries (stored in bet_slips table)
      const { data: entries, error: entriesError } = await supabase
        .from('bet_slips')
        .select(`
          *,
          tournaments (name, start_datetime, end_datetime, settled_at)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (entriesError) throw entriesError;

      if (entries) {
        // Fetch prediction legs for each entry
        const entriesWithLegs = await Promise.all(
          entries.map(async (entry: any) => {
            const { data: legs } = await supabase
              .from('predictions')
              .select(`
                *,
                podium_selections (
                  position_predicted,
                  athletes (name)
                )
              `)
              .eq('bet_slip_id', entry.id)
              .order('created_at', { ascending: true });

            // Convert settlement_metadata to proper type
            const typedLegs = (legs || []).map((leg: any) => ({
              ...leg,
              settlement_metadata: leg.settlement_metadata as SettlementMetadata | null
            }));

            return {
              ...entry,
              tournament_name: entry.tournaments?.name || 'Unknown Tournament',
              tournament_start_datetime: entry.tournaments?.start_datetime,
              tournament_end_datetime: entry.tournaments?.end_datetime,
              tournament_settled_at: entry.tournaments?.settled_at,
              legs: typedLegs
            };
          })
        );

        const active = entriesWithLegs.filter(s => s.status === 'PENDING');
        const completed = entriesWithLegs.filter(s => s.status !== 'PENDING' && s.status !== 'CANCELLED');
        
        setActiveEntries(active);
        setCompletedEntries(completed);
      }
    } catch (error) {
      toast({
        title: "Error loading predictions",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntry || !user) return;
    
    setIsDeleting(true);
    try {
      // Check prediction window is still open
      const predictionWindow = getPredictionWindowStatus(
        deleteEntry.tournament_start_datetime,
        deleteEntry.tournament_end_datetime,
        deleteEntry.tournament_settled_at
      );
      
      if (!predictionWindow.canPredict) {
        toast({
          title: "Cannot cancel prediction",
          description: "Prediction window has closed",
          variant: "destructive"
        });
        return;
      }

      // 1. Update bet_slip status to CANCELLED (RLS allows this for own PENDING slips)
      const { data: cancelledData, error: cancelError } = await supabase
        .from('bet_slips')
        .update({ status: 'CANCELLED' })
        .eq('id', deleteEntry.id)
        .eq('user_id', user.id)
        .select();
      
      if (cancelError) throw cancelError;
      
      // Verify the update actually affected a row
      if (!cancelledData || cancelledData.length === 0) {
        toast({
          title: "Cannot cancel prediction",
          description: "This prediction may have already been cancelled or settled",
          variant: "destructive"
        });
        return;
      }
      
      // 2. Only refund tokens AFTER confirmed cancellation
      const { error: refundError } = await supabase
        .rpc('increment_earned_tokens', {
          user_id_param: user.id,
          amount: deleteEntry.total_stake_tokens
        });
      
      if (refundError) {
        console.error('Error refunding tokens:', refundError);
        toast({
          title: "Prediction cancelled but refund failed",
          description: "Please contact support for your refund",
          variant: "destructive"
        });
        fetchEntries();
        return;
      }

      // 3. Record audit transaction
      await supabase
        .from('token_transactions')
        .insert({
          user_id: user.id,
          type: 'prediction_void',
          amount: deleteEntry.total_stake_tokens,
          balance_after: 0, // Will be approximate
          reference_type: 'prediction',
          reference_id: deleteEntry.id,
          description: `Cancelled prediction - Refunded ${deleteEntry.total_stake_tokens} tokens`,
          tournament_id: deleteEntry.tournament_id,
          transaction_status: 'completed',
        });
      
      toast({
        title: "Prediction cancelled",
        description: `${deleteEntry.total_stake_tokens} tokens refunded to your wallet`
      });
      
      fetchEntries();
      fetchWalletBalance();
    } catch (error) {
      toast({
        title: "Error cancelling prediction",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setDeleteEntry(null);
    }
  };

  const handleEditEntry = async () => {
    if (!editEntry || !user) return;
    
    setIsEditing(true);
    try {
      // 1. Check prediction window is still open
      const predictionWindow = getPredictionWindowStatus(
        editEntry.tournament_start_datetime,
        editEntry.tournament_end_datetime,
        editEntry.tournament_settled_at
      );
      
      if (!predictionWindow.canPredict) {
        toast({
          title: "Cannot edit prediction",
          description: "Prediction window has closed",
          variant: "destructive"
        });
        return;
      }

      const oldStake = editEntry.total_stake_tokens;
      const newStake = parseInt(newStakeAmount);
      const stakeDiff = newStake - oldStake;
      
      // 2. Validate new stake
      if (newStake <= 0 || newStake > PARLAY_CONFIG.MAX_STAKE) {
        toast({
          title: "Invalid entry amount",
          description: `Entry must be between 1 and ${PARLAY_CONFIG.MAX_STAKE} tokens`,
          variant: "destructive"
        });
        return;
      }
      
      // 3. If increasing stake, check wallet balance
      if (stakeDiff > 0 && stakeDiff > walletBalance) {
        toast({
          title: "Insufficient balance",
          description: "You don't have enough tokens",
          variant: "destructive"
        });
        return;
      }

      // 4. Calculate new projected rewards
      const newProjectedRewards = Math.floor(newStake * editEntry.total_odds_decimal);

      // 5. Update entry
      await supabase
        .from('bet_slips')
        .update({
          total_stake_tokens: newStake,
          potential_payout_tokens: newProjectedRewards
        })
        .eq('id', editEntry.id);

      // 6. Update prediction leg (for single entries)
      if ((editEntry.legs?.length || 0) === 1 && editEntry.legs?.[0]) {
        await supabase
          .from('predictions')
          .update({
            staked_tokens: newStake,
            potential_payout: newProjectedRewards
          })
          .eq('id', editEntry.legs[0].id);
      }

      // 7. Update wallet (add/subtract difference)
      const { data: wallet } = await supabase
        .from('token_wallets')
        .select('earned_tokens')
        .eq('user_id', user.id)
        .single();
      
      if (wallet) {
        await supabase
          .from('token_wallets')
          .update({ 
            earned_tokens: wallet.earned_tokens - stakeDiff
          })
          .eq('user_id', user.id);
      }

      toast({
        title: "Prediction updated",
        description: stakeDiff > 0 
          ? `Added ${stakeDiff} tokens to your prediction`
          : `Refunded ${Math.abs(stakeDiff)} tokens to your wallet`
      });
      
      fetchEntries();
      fetchWalletBalance();
    } catch (error) {
      toast({
        title: "Error updating prediction",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsEditing(false);
      setEditEntry(null);
    }
  };

  const handlePredictAgain = async (entry: PredictionEntry) => {
    try {
      const athleteNames = entry.legs?.map(leg => leg.athlete_name) || [];
      
      if (athleteNames.length === 0) {
        toast({
          title: "No athletes found",
          description: "Unable to find athletes from this entry",
          variant: "destructive"
        });
        return;
      }

      const now = new Date().toISOString();
      const { data: upcomingTournaments, error: tournamentError } = await supabase
        .from('tournaments')
        .select('id, name, start_datetime, end_datetime, settled_at')
        .or(`start_datetime.gt.${now},start_datetime.is.null`)
        .is('settled_at', null)
        .order('start_datetime', { ascending: true })
        .limit(10);

      if (tournamentError || !upcomingTournaments?.length) {
        toast({
          title: "No upcoming tournaments",
          description: "Check back when new events are scheduled",
          variant: "destructive"
        });
        return;
      }

      for (const tournament of upcomingTournaments) {
        const predictionWindow = getPredictionWindowStatus(
          tournament.start_datetime,
          tournament.end_datetime,
          tournament.settled_at
        );
        
        if (!predictionWindow.canPredict) continue;

        navigate(`/tournaments/${tournament.id}`, {
          state: {
            predictAgainAthletes: athleteNames,
            fromEntry: entry.id
          }
        });

        toast({
          title: "Tournament found!",
          description: `Navigating to ${tournament.name}. Look for your previous picks!`
        });
        return;
      }

      toast({
        title: "No open prediction windows",
        description: "All upcoming tournaments have closed predictions",
        variant: "destructive"
      });
    } catch (error) {
      console.error('Error in predict again:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'WON':
        return <Badge className="bg-success text-success-foreground">Correct</Badge>;
      case 'LOST':
        return <Badge variant="secondary">Not Correct</Badge>;
      case 'VOID':
        return <Badge variant="outline">Voided</Badge>;
      case 'PENDING':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const EntryCard = ({ entry, isActive }: { entry: PredictionEntry; isActive: boolean }) => {
    const actualLegCount = entry.legs?.length || 0;
    const isComboDisplay = entry.type === 'parlay' || actualLegCount > 1;
    const multiplierDisplay = `${entry.total_odds_decimal.toFixed(2)}×`;
    
    // Check if prediction window is still open
    const predictionWindow = isActive ? getPredictionWindowStatus(
      entry.tournament_start_datetime,
      entry.tournament_end_datetime,
      entry.tournament_settled_at
    ) : null;
    
    const canCancel = isActive && predictionWindow?.canPredict;
    
    const getEntryTypeLabel = (marketType: string) => {
      switch (marketType) {
        case 'WINNER': return '🏆 Winner';
        case 'PODIUM': return '🥇 Podium';
        case 'HIGHEST_SCORE': return '📊 Highest Score';
        default: return marketType.replace('_', ' ');
      }
    };
    
    return (
      <Card className="p-4 hover:shadow-glow transition-all">
        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {!isComboDisplay && entry.legs?.[0] && (
                <div className="space-y-2">
                  <Badge variant="secondary" className="text-xs mb-2">
                    {getEntryTypeLabel(entry.legs[0].market_type)}
                  </Badge>
                  
                  {/* For PODIUM: Show all 3 athletes with positions */}
                  {entry.legs[0].market_type === 'PODIUM' && entry.legs[0].podium_selections && entry.legs[0].podium_selections.length > 0 && (
                    <div className="space-y-1">
                      {entry.legs[0].podium_selections
                        .sort((a, b) => a.position_predicted - b.position_predicted)
                        .map(ps => (
                          <div key={ps.position_predicted} className="flex items-center gap-2 text-sm">
                            <span className="font-medium">
                              {ps.position_predicted === 1 && '🥇'}
                              {ps.position_predicted === 2 && '🥈'}
                              {ps.position_predicted === 3 && '🥉'}
                            </span>
                            <span className="font-medium">{ps.athletes.name}</span>
                          </div>
                        ))}
                    </div>
                  )}
                  
                  {/* For non-podium: Show single athlete name */}
                  {entry.legs[0].market_type !== 'PODIUM' && (
                    <h3 className="font-semibold text-lg">{entry.legs[0].athlete_name}</h3>
                  )}
                  
                  <p className="text-sm text-muted-foreground">📍 {entry.tournament_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    🎿 {entry.legs[0].discipline} • {entry.legs[0].category.replace('_', ' ')}
                  </p>
                </div>
              )}
              
              {/* Combo display */}
              {isComboDisplay && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">Combo ({actualLegCount} picks)</h3>
                    <Badge variant="secondary" className="text-xs">Combo</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.tournament_name}</p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(entry.status)}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 press-scale"
                onClick={(e) => {
                  e.stopPropagation();
                  setShareEntry(entry);
                }}
                aria-label="Share prediction"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Show picks for combos */}
          {isComboDisplay && entry.legs && entry.legs.length > 0 && (
            <Accordion type="single" collapsible className="border-t border-border pt-2">
              <AccordionItem value="legs" className="border-0">
                <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
                  <span className="flex items-center gap-1">
                    View {actualLegCount} picks
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2">
                  {entry.legs.map((leg, idx) => (
                    <div key={leg.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{idx + 1}. {leg.athlete_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {leg.market_type.replace('_', ' ')} • {leg.discipline}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary">
                          {leg.decimal_odds.toFixed(2)}×
                        </span>
                        {getStatusBadge(leg.status)}
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Entry Amount</p>
              <p className="font-semibold flex items-center gap-1">
                <Coins className="w-4 h-4 text-primary" />
                {entry.total_stake_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Multiplier</p>
              <p className="font-semibold flex items-center gap-1 text-primary">
                <TrendingUp className="w-4 h-4" />
                {multiplierDisplay}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {isActive ? 'Projected Rewards' : 'Result'}
              </p>
              <p className={`font-bold ${
                entry.status === 'WON' ? 'text-success' : 
                entry.status === 'LOST' ? 'text-destructive' : 
                'text-primary'
              }`}>
                {isActive ? (
                  `${entry.potential_payout_tokens.toLocaleString()} tokens`
                ) : entry.status === 'WON' ? (
                  `+${entry.actual_payout_tokens?.toLocaleString() || 0} tokens`
                ) : entry.status === 'LOST' ? (
                  `-${entry.total_stake_tokens.toLocaleString()} tokens`
                ) : (
                  'Refunded'
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {isActive ? 'Placed' : 'Settled'}
              </p>
              <p className="text-sm">
                {formatDate(isActive ? entry.created_at : (entry.settled_at || entry.created_at))}
              </p>
            </div>
          </div>

          {/* Settlement explanation for completed entries */}
          {!isActive && entry.legs?.[0]?.settlement_metadata && (
            <SettlementExplanation 
              settlement={{
                status: entry.legs[0].settlement_metadata.status as 'WON' | 'LOST' | 'VOID',
                explanation: entry.legs[0].settlement_metadata.explanation,
                actual_results: entry.legs[0].settlement_metadata.actual_results,
                payout_details: entry.legs[0].settlement_metadata.payout_details,
                your_pick: {
                  athlete_name: entry.legs[0].athlete_name,
                  market_type: entry.legs[0].market_type,
                  podium_picks: entry.legs[0].podium_selections?.map(ps => ({
                    position: ps.position_predicted,
                    athlete: ps.athletes.name
                  }))
                }
              }}
              className="mt-3"
            />
          )}

          {/* Edit and Cancel buttons for active entries */}
          {canCancel && (
            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => {
                    setEditEntry(entry);
                    setNewStakeAmount(entry.total_stake_tokens.toString());
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Entry
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => setDeleteEntry(entry)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {predictionWindow?.message}
              </p>
            </div>
          )}

          {/* Predict Again button for settled entries */}
          {!isActive && (
            <div className="pt-3 border-t border-border">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => handlePredictAgain(entry)}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Predict Again
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="My Predictions" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }

  // Calculate prediction stats
  const predictionStats = (() => {
    const allSettledEntries = completedEntries;
    const totalEntered = allSettledEntries.reduce((sum, entry) => sum + entry.total_stake_tokens, 0);
    const totalWon = allSettledEntries
      .filter(entry => entry.status === 'WON')
      .reduce((sum, entry) => sum + (entry.actual_payout_tokens || 0), 0);
    const netProfit = totalWon - totalEntered;
    const roi = totalEntered > 0 ? ((netProfit / totalEntered) * 100) : 0;
    const winCount = allSettledEntries.filter(entry => entry.status === 'WON').length;
    const lossCount = allSettledEntries.filter(entry => entry.status === 'LOST').length;
    
    return { totalEntered, totalWon, netProfit, roi, winCount, lossCount };
  })();

  return (
    <div className="min-h-screen bg-background pb-20">
      <SEO title="My Predictions" description="Track your active and settled waterski predictions, picks, and parlays on WaterSki Predictor." path="/predictions" />
      <PageHeader title="My Predictions" />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Confirmation Banner */}
        {confirmation && (
          <Card className="p-4 mb-6 border-primary/50 bg-primary/10">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-primary mb-1">Prediction Saved! ✅</h3>
                <p className="font-semibold">{confirmation.athleteName}</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {confirmation.discipline} • {confirmation.marketType.replace('_', ' ')} • {confirmation.tournamentName}
                </p>
                <div className="flex gap-4 mt-2 text-sm">
                  <span><strong>{confirmation.stakeAmount}</strong> tokens entered</span>
                  <span><strong>{confirmation.odds.toFixed(2)}×</strong> multiplier</span>
                  <span className="text-primary font-bold">{confirmation.potentialPayout.toLocaleString()} potential</span>
                </div>
              </div>
            </div>
          </Card>
        )}
        {/* Stats Summary */}
        {completedEntries.length > 0 && (
          <Card className="p-4 mb-6 bg-muted/30">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Coins className="w-4 h-4" />
                  <span className="text-xs">Entered</span>
                </div>
                <p className="font-bold text-lg">{predictionStats.totalEntered.toLocaleString()}</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs">Earned</span>
                </div>
                <p className="font-bold text-lg text-success">{predictionStats.totalWon.toLocaleString()}</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Percent className="w-4 h-4" />
                  <span className="text-xs">ROI</span>
                </div>
                <p className={`font-bold text-lg ${predictionStats.roi >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {predictionStats.roi >= 0 ? '+' : ''}{predictionStats.roi.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-3 pt-3 border-t border-border text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                {predictionStats.winCount} Correct
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                {predictionStats.lossCount} Not Correct
              </span>
              <span className={`font-medium ${predictionStats.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                {predictionStats.netProfit >= 0 ? '+' : ''}{predictionStats.netProfit.toLocaleString()} net
              </span>
            </div>
          </Card>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center justify-end mb-4">
          <div className="flex bg-muted rounded-lg p-0.5">
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${viewMode === 'flat' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
              onClick={() => setViewMode('flat')}
            >
              Flat
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${viewMode === 'tournament' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
              onClick={() => setViewMode('tournament')}
            >
              By Tournament
            </button>
          </div>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-6">
            <TabsTrigger value="active">
              Active ({activeEntries.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              History ({completedEntries.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3">
            {activeEntries.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No active predictions</p>
                <p className="text-sm text-muted-foreground">
                  You haven't made any predictions yet. Start with a market you understand.
                </p>
              </Card>
            ) : viewMode === 'tournament' ? (
              <Accordion type="multiple" defaultValue={[...new Set(activeEntries.map(s => s.tournament_name || 'Unknown'))]}>
                {Object.entries(
                  activeEntries.reduce((acc, entry) => {
                    const key = entry.tournament_name || 'Unknown';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(entry);
                    return acc;
                  }, {} as Record<string, PredictionEntry[]>)
                ).map(([tournamentName, entries]) => {
                  const totalStaked = entries.reduce((s, e) => s + e.total_stake_tokens, 0);
                  return (
                    <AccordionItem key={tournamentName} value={tournamentName}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-2">
                          <span className="font-semibold">{tournamentName}</span>
                          <span className="text-sm text-muted-foreground">{entries.length} picks • {totalStaked.toLocaleString()} tokens</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pt-2">
                        <button
                          onClick={() => setShareTournament(entries)}
                          className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 text-primary py-2.5 text-sm font-semibold uppercase tracking-wide press-scale"
                        >
                          <Share2 className="w-4 h-4" /> Share my card
                        </button>
                        {entries.map(entry => (
                          <EntryCard key={entry.id} entry={entry} isActive />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              activeEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} isActive />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {completedEntries.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No completed predictions yet</p>
                <p className="text-sm text-muted-foreground">
                  Your finalized predictions will appear here
                </p>
              </Card>
            ) : viewMode === 'tournament' ? (
              <Accordion type="multiple" defaultValue={[...new Set(completedEntries.map(s => s.tournament_name || 'Unknown'))]}>
                {Object.entries(
                  completedEntries.reduce((acc, entry) => {
                    const key = entry.tournament_name || 'Unknown';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(entry);
                    return acc;
                  }, {} as Record<string, PredictionEntry[]>)
                ).map(([tournamentName, entries]) => {
                  const totalStaked = entries.reduce((s, e) => s + e.total_stake_tokens, 0);
                  const totalWon = entries.filter(e => e.status === 'WON').reduce((s, e) => s + (e.actual_payout_tokens || 0), 0);
                  const net = totalWon - totalStaked;
                  return (
                    <AccordionItem key={tournamentName} value={tournamentName}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-2">
                          <span className="font-semibold">{tournamentName}</span>
                          <span className={`text-sm font-medium ${net >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {net >= 0 ? '+' : ''}{net.toLocaleString()}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pt-2">
                        <button
                          onClick={() => setShareTournament(entries)}
                          className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 text-primary py-2.5 text-sm font-semibold uppercase tracking-wide press-scale"
                        >
                          <Share2 className="w-4 h-4" /> Share my card
                        </button>
                        {entries.map(entry => (
                          <EntryCard key={entry.id} entry={entry} isActive={false} />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              completedEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} isActive={false} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this prediction?</AlertDialogTitle>
            <AlertDialogDescription>
              Your entry of <strong>{deleteEntry?.total_stake_tokens.toLocaleString()} tokens</strong> will be refunded to your wallet. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Prediction</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteEntry}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Cancelling...' : 'Cancel Prediction'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit entry dialog */}
      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Entry Amount</DialogTitle>
            <DialogDescription>
              Adjust your entry for this prediction. Changes will be reflected in your wallet.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Current Entry</div>
              <div className="font-semibold">{editEntry?.total_stake_tokens.toLocaleString()} tokens</div>
            </div>
            
            <div className="flex justify-between text-sm">
              <span>Available Balance</span>
              <span className="font-semibold">{walletBalance.toLocaleString()} tokens</span>
            </div>
            
            <div className="space-y-2">
              <Label>New Entry Amount</Label>
              <Input
                type="number"
                value={newStakeAmount}
                onChange={(e) => setNewStakeAmount(e.target.value)}
                min="1"
                max={editEntry ? walletBalance + editEntry.total_stake_tokens : walletBalance}
              />
              <div className="flex gap-2">
                {[50, 100, 250, 500].map(amount => (
                  <Button 
                    key={amount} 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setNewStakeAmount(amount.toString())}
                  >
                    {amount}
                  </Button>
                ))}
              </div>
            </div>
            
            {editEntry && parseInt(newStakeAmount) > 0 && (
              <div className="bg-primary/10 rounded-lg p-3">
                <div className="text-sm text-muted-foreground">New Projected Rewards</div>
                <div className="font-bold text-lg">
                  {Math.floor(parseInt(newStakeAmount) * editEntry.total_odds_decimal).toLocaleString()} tokens
                </div>
                <div className="text-xs text-muted-foreground">
                  {parseInt(newStakeAmount) > editEntry.total_stake_tokens 
                    ? `+${parseInt(newStakeAmount) - editEntry.total_stake_tokens} tokens from wallet`
                    : parseInt(newStakeAmount) < editEntry.total_stake_tokens
                      ? `${editEntry.total_stake_tokens - parseInt(newStakeAmount)} tokens refunded`
                      : 'No change'}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button 
              onClick={handleEditEntry}
              disabled={isEditing || !newStakeAmount || parseInt(newStakeAmount) <= 0}
            >
              {isEditing ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {shareEntry && (
        <ShareModal
          open={!!shareEntry}
          onOpenChange={(o) => !o && setShareEntry(null)}
          username={username || 'player'}
          shareUrl={`${window.location.origin}/tournaments/${shareEntry.tournament_id}`}
          {...buildShareCardPropsFromEntry(shareEntry)}
        />
      )}

      {shareTournament && shareTournament.length > 0 && (
        <EventShareModal
          open={!!shareTournament}
          onOpenChange={(o) => !o && setShareTournament(null)}
          username={username || 'player'}
          shareUrl={`${window.location.origin}/tournaments/${shareTournament[0]?.tournament_id}`}
          {...buildEventShareProps(shareTournament)}
        />
      )}
    </div>
  );
};

export default Predictions;

function buildEventShareProps(entries: PredictionEntry[]): Omit<EventShareCardProps, 'username'> {
  const MARKET: Record<string, string> = { WINNER: 'WIN', PODIUM: 'POD', HIGHEST_SCORE: 'HIGH' };
  const rowsAll: EventShareRow[] = [];
  let parlayCount = 0, pickCount = 0, totalEntry = 0, totalReward = 0, anyPending = false;
  for (const e of entries) {
    const legs = e.legs ?? [];
    totalEntry += e.total_stake_tokens || 0;
    if (e.status === 'PENDING') { anyPending = true; totalReward += e.potential_payout_tokens || 0; }
    else totalReward += e.actual_payout_tokens || 0;
    pickCount += Math.max(1, legs.length);
    if (legs.length > 1) {
      parlayCount++;
      const discs = [...new Set(legs.map((l) => (l.discipline || '').toUpperCase()).filter(Boolean))];
      rowsAll.push({ chip: `PARLAY x${legs.length}`, text: discs.join(' + ') || 'MULTI', mult: e.total_odds_decimal });
    } else {
      const leg = legs[0];
      if (!leg) { rowsAll.push({ chip: 'PICK', text: '-', mult: e.total_odds_decimal }); continue; }
      const disc = (leg.discipline || '').toUpperCase();
      let who = (leg.athlete_name || '').trim();
      if (leg.market_type === 'PODIUM' && leg.podium_selections?.length) {
        who = [...leg.podium_selections]
          .sort((a, b) => a.position_predicted - b.position_predicted)
          .map((pp) => (pp.athletes?.name || '').split(/\s+/)[0])
          .join(' / ');
      }
      if (!who || who === '-') who = ({ WINNER: 'WINNER', PODIUM: 'PODIUM PICK', HIGHEST_SCORE: 'TOP SCORE' } as Record<string, string>)[leg.market_type] || (disc ? `${disc} PICK` : 'PICK');
      rowsAll.push({ chip: MARKET[leg.market_type] || 'PICK', text: `${who}${disc ? ` \u00b7 ${disc}` : ''}`, mult: leg.decimal_odds });
    }
  }
  const CAP = 12;
  const first = entries[0];
  const dateLabel = first?.tournament_start_datetime
    ? new Date(first.tournament_start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : undefined;
  return {
    tournamentName: first?.tournament_name || 'My Card',
    dateLabel,
    pickCount,
    entryCount: entries.length,
    parlayCount,
    totalEntryTokens: totalEntry,
    totalProjectedReward: totalReward,
    settled: !anyPending,
    rows: rowsAll.slice(0, CAP),
    moreCount: Math.max(0, rowsAll.length - CAP),
  };
}

function buildShareCardPropsFromEntry(
  entry: PredictionEntry,
): Omit<ShareCardProps, 'username'> {
  const legs = entry.legs ?? [];
  const isParlay = (legs.length || 0) > 1;

  // Build selection rows. Podium leg expands into 3 rows.
  const selections: ShareCardSelection[] = [];
  for (const leg of legs) {
    if (leg.market_type === 'PODIUM' && leg.podium_selections?.length) {
      const sorted = [...leg.podium_selections].sort(
        (a, b) => a.position_predicted - b.position_predicted,
      );
      sorted.forEach((p) => {
        selections.push({
          name: p.athletes.name,
          multiplier: leg.decimal_odds,
          positionLabel:
            p.position_predicted === 1 ? '1ST' : p.position_predicted === 2 ? '2ND' : '3RD',
        });
      });
    } else {
      selections.push({
        name: leg.athlete_name,
        multiplier: leg.decimal_odds,
      });
    }
  }

  const status: ShareCardProps['status'] =
    entry.status === 'WON' ? 'WIN' : entry.status === 'LOST' ? 'LOSS' : 'PREDICTION';
  const type: ShareCardProps['type'] = entry.status === 'PENDING' ? 'prediction' : 'settled';

  const dateLabel = entry.tournament_start_datetime
    ? new Date(entry.tournament_start_datetime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;

  return {
    type,
    status,
    tournamentName: entry.tournament_name || 'Tournament',
    discipline: legs[0]?.discipline?.toUpperCase(),
    dateLabel,
    selections,
    combinedMultiplier: isParlay ? entry.total_odds_decimal : null,
    tokenEntry: entry.total_stake_tokens,
    projectedReward: entry.potential_payout_tokens,
    actualReward: entry.actual_payout_tokens ?? null,
  };
}
