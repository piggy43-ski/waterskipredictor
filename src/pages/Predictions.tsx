import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Coins, TrendingUp, Calendar, ChevronDown, Trash2, Pencil, Info } from 'lucide-react';
import { decimalToAmerican } from '@/utils/oddsConverter';
import { getBettingWindowStatus } from '@/utils/bettingWindows';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PARLAY_CONFIG } from '@/utils/parlayConfig';
import { SettlementExplanation, type SettlementData } from '@/components/betting/SettlementExplanation';

interface BetSlip {
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
  legs?: Prediction[];
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

interface Prediction {
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeBetSlips, setActiveBetSlips] = useState<BetSlip[]>([]);
  const [completedBetSlips, setCompletedBetSlips] = useState<BetSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteSlip, setDeleteSlip] = useState<BetSlip | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editSlip, setEditSlip] = useState<BetSlip | null>(null);
  const [newStakeAmount, setNewStakeAmount] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchBetSlips();
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

  const fetchBetSlips = async () => {
    if (!user) return;

    try {
      // Fetch all bet slips
      const { data: slips, error: slipsError } = await supabase
        .from('bet_slips')
        .select(`
          *,
          tournaments (name, start_datetime, end_datetime, settled_at)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (slipsError) throw slipsError;

      if (slips) {
        // Fetch legs for each slip
        const slipsWithLegs = await Promise.all(
          slips.map(async (slip: any) => {
            const { data: legs } = await supabase
              .from('predictions')
              .select(`
                *,
                podium_selections (
                  position_predicted,
                  athletes (name)
                )
              `)
              .eq('bet_slip_id', slip.id)
              .order('created_at', { ascending: true });

            // Convert settlement_metadata to proper type
            const typedLegs = (legs || []).map((leg: any) => ({
              ...leg,
              settlement_metadata: leg.settlement_metadata as SettlementMetadata | null
            }));

            return {
              ...slip,
              tournament_name: slip.tournaments?.name || 'Unknown Tournament',
              tournament_start_datetime: slip.tournaments?.start_datetime,
              tournament_end_datetime: slip.tournaments?.end_datetime,
              tournament_settled_at: slip.tournaments?.settled_at,
              legs: typedLegs
            };
          })
        );

        const active = slipsWithLegs.filter(s => s.status === 'PENDING');
        const completed = slipsWithLegs.filter(s => s.status !== 'PENDING');
        
        setActiveBetSlips(active);
        setCompletedBetSlips(completed);
      }
    } catch (error) {
      toast({
        title: "Error loading bets",
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

  const handleDeleteBet = async () => {
    if (!deleteSlip || !user) return;
    
    setIsDeleting(true);
    try {
      // Check betting window is still open (double-check before delete)
      const bettingWindow = getBettingWindowStatus(
        deleteSlip.tournament_start_datetime,
        deleteSlip.tournament_end_datetime,
        deleteSlip.tournament_settled_at
      );
      
      if (!bettingWindow.canBet) {
        toast({
          title: "Cannot cancel bet",
          description: "Betting window has closed",
          variant: "destructive"
        });
        return;
      }

      // Get all prediction IDs for this bet slip
      const predictionIds = deleteSlip.legs?.map(l => l.id) || [];
      
      // 1. Delete podium_selections first (if any)
      if (predictionIds.length > 0) {
        await supabase
          .from('podium_selections')
          .delete()
          .in('prediction_id', predictionIds);
      }
      
      // 2. Delete predictions
      await supabase
        .from('predictions')
        .delete()
        .eq('bet_slip_id', deleteSlip.id);
      
      // 3. Delete bet_slip
      const { error: deleteError } = await supabase
        .from('bet_slips')
        .delete()
        .eq('id', deleteSlip.id);
      
      if (deleteError) throw deleteError;
      
      // 4. Refund tokens to wallet
      const { data: wallet } = await supabase
        .from('token_wallets')
        .select('earned_tokens')
        .eq('user_id', user.id)
        .single();
      
      if (wallet) {
        await supabase
          .from('token_wallets')
          .update({ 
            earned_tokens: wallet.earned_tokens + deleteSlip.total_stake_tokens 
          })
          .eq('user_id', user.id);
      }
      
      toast({
        title: "Bet cancelled",
        description: `${deleteSlip.total_stake_tokens} tokens refunded to your wallet`
      });
      
      // Refresh bet list
      fetchBetSlips();
    } catch (error) {
      toast({
        title: "Error cancelling bet",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setDeleteSlip(null);
    }
  };

  const handleEditBet = async () => {
    if (!editSlip || !user) return;
    
    setIsEditing(true);
    try {
      // 1. Check betting window is still open
      const bettingWindow = getBettingWindowStatus(
        editSlip.tournament_start_datetime,
        editSlip.tournament_end_datetime,
        editSlip.tournament_settled_at
      );
      
      if (!bettingWindow.canBet) {
        toast({
          title: "Cannot edit bet",
          description: "Betting window has closed",
          variant: "destructive"
        });
        return;
      }

      const oldStake = editSlip.total_stake_tokens;
      const newStake = parseInt(newStakeAmount);
      const stakeDiff = newStake - oldStake;
      
      // 2. Validate new stake
      if (newStake <= 0 || newStake > PARLAY_CONFIG.MAX_STAKE) {
        toast({
          title: "Invalid stake",
          description: `Stake must be between 1 and ${PARLAY_CONFIG.MAX_STAKE} tokens`,
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

      // 4. Calculate new potential payout
      const newPotentialPayout = Math.floor(newStake * editSlip.total_odds_decimal);

      // 5. Update bet_slip
      await supabase
        .from('bet_slips')
        .update({
          total_stake_tokens: newStake,
          potential_payout_tokens: newPotentialPayout
        })
        .eq('id', editSlip.id);

      // 6. Update predictions (for single bets, update the leg too)
      if (editSlip.leg_count === 1 && editSlip.legs?.[0]) {
        await supabase
          .from('predictions')
          .update({
            staked_tokens: newStake,
            potential_payout: newPotentialPayout
          })
          .eq('id', editSlip.legs[0].id);
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
        title: "Bet updated",
        description: stakeDiff > 0 
          ? `Added ${stakeDiff} tokens to your bet`
          : `Refunded ${Math.abs(stakeDiff)} tokens to your wallet`
      });
      
      fetchBetSlips();
      fetchWalletBalance();
    } catch (error) {
      toast({
        title: "Error updating bet",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsEditing(false);
      setEditSlip(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'WON':
        return <Badge className="bg-success text-success-foreground">Won</Badge>;
      case 'LOST':
        return <Badge variant="destructive">Lost</Badge>;
      case 'VOID':
        return <Badge variant="secondary">Void</Badge>;
      case 'PENDING':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const BetSlipCard = ({ slip, isActive }: { slip: BetSlip; isActive: boolean }) => {
    const isParlayDisplay = slip.type === 'parlay' || slip.leg_count > 1;
    const americanOdds = decimalToAmerican(slip.total_odds_decimal);
    
    // Check if betting window is still open
    const bettingWindow = isActive ? getBettingWindowStatus(
      slip.tournament_start_datetime,
      slip.tournament_end_datetime,
      slip.tournament_settled_at
    ) : null;
    
    const canCancel = isActive && bettingWindow?.canBet;
    
    const getBetTypeLabel = (marketType: string) => {
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
              {!isParlayDisplay && slip.legs?.[0] && (
                <div className="space-y-2">
                  {/* Bet Type Badge */}
                  <Badge variant="secondary" className="text-xs mb-2">
                    {getBetTypeLabel(slip.legs[0].market_type)}
                  </Badge>
                  
                  {/* For PODIUM: Show all 3 athletes with positions */}
                  {slip.legs[0].market_type === 'PODIUM' && slip.legs[0].podium_selections && slip.legs[0].podium_selections.length > 0 && (
                    <div className="space-y-1">
                      {slip.legs[0].podium_selections
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
                  {slip.legs[0].market_type !== 'PODIUM' && (
                    <h3 className="font-semibold text-lg">{slip.legs[0].athlete_name}</h3>
                  )}
                  
                  {/* Tournament and discipline info */}
                  <p className="text-sm text-muted-foreground">📍 {slip.tournament_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    🎿 {slip.legs[0].discipline} • {slip.legs[0].category.replace('_', ' ')}
                  </p>
                </div>
              )}
              
              {/* Parlay display */}
              {isParlayDisplay && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">Parlay ({slip.leg_count} legs)</h3>
                    <Badge variant="secondary" className="text-xs">Parlay</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{slip.tournament_name}</p>
                </>
              )}
            </div>
            {getStatusBadge(slip.status)}
          </div>

          {/* Show legs for parlays */}
          {isParlayDisplay && slip.legs && slip.legs.length > 0 && (
            <Accordion type="single" collapsible className="border-t border-border pt-2">
              <AccordionItem value="legs" className="border-0">
                <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
                  <span className="flex items-center gap-1">
                    View {slip.leg_count} legs
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2">
                  {slip.legs.map((leg, idx) => (
                    <div key={leg.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{idx + 1}. {leg.athlete_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {leg.market_type.replace('_', ' ')} • {leg.discipline}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary">
                          {decimalToAmerican(leg.decimal_odds)}
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
              <p className="text-xs text-muted-foreground mb-1">Stake</p>
              <p className="font-semibold flex items-center gap-1">
                <Coins className="w-4 h-4 text-primary" />
                {slip.total_stake_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Odds</p>
              <p className="font-semibold flex items-center gap-1 text-primary">
                <TrendingUp className="w-4 h-4" />
                {americanOdds}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {isActive ? 'Potential Win' : 'Result'}
              </p>
              <p className={`font-bold ${
                slip.status === 'WON' ? 'text-success' : 
                slip.status === 'LOST' ? 'text-destructive' : 
                'text-primary'
              }`}>
                {isActive ? (
                  `${slip.potential_payout_tokens.toLocaleString()} tokens`
                ) : slip.status === 'WON' ? (
                  `+${slip.actual_payout_tokens?.toLocaleString() || 0} tokens`
                ) : slip.status === 'LOST' ? (
                  `-${slip.total_stake_tokens.toLocaleString()} tokens`
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
                {formatDate(isActive ? slip.created_at : (slip.settled_at || slip.created_at))}
              </p>
            </div>
          </div>

          {/* Settlement explanation for completed bets */}
          {!isActive && slip.legs?.[0]?.settlement_metadata && (
            <SettlementExplanation 
              settlement={{
                status: slip.legs[0].settlement_metadata.status as 'WON' | 'LOST' | 'VOID',
                explanation: slip.legs[0].settlement_metadata.explanation,
                actual_results: slip.legs[0].settlement_metadata.actual_results,
                payout_details: slip.legs[0].settlement_metadata.payout_details
              }}
              className="mt-3"
            />
          )}

          {/* Edit and Cancel buttons for active bets with open betting window */}
          {canCancel && (
            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => {
                    setEditSlip(slip);
                    setNewStakeAmount(slip.total_stake_tokens.toString());
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Stake
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => setDeleteSlip(slip)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {bettingWindow.message}
              </p>
            </div>
          )}
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="My Bets" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="My Bets" />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-6">
            <TabsTrigger value="active">
              Active ({activeBetSlips.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              History ({completedBetSlips.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3">
            {activeBetSlips.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No active bets</p>
                <p className="text-sm text-muted-foreground">
                  Browse tournaments and place your first bet!
                </p>
              </Card>
            ) : (
              activeBetSlips.map((slip) => (
                <BetSlipCard key={slip.id} slip={slip} isActive />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {completedBetSlips.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No completed bets yet</p>
                <p className="text-sm text-muted-foreground">
                  Your settled bets will appear here
                </p>
              </Card>
            ) : (
              completedBetSlips.map((slip) => (
                <BetSlipCard key={slip.id} slip={slip} isActive={false} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteSlip} onOpenChange={() => setDeleteSlip(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this bet?</AlertDialogTitle>
            <AlertDialogDescription>
              Your stake of <strong>{deleteSlip?.total_stake_tokens.toLocaleString()} tokens</strong> will be refunded to your wallet. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Bet</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteBet}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Cancelling...' : 'Cancel Bet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit stake dialog */}
      <Dialog open={!!editSlip} onOpenChange={() => setEditSlip(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bet Stake</DialogTitle>
            <DialogDescription>
              Adjust your stake for this bet. Changes will be reflected in your wallet.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Current bet info */}
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Current Stake</div>
              <div className="font-semibold">{editSlip?.total_stake_tokens.toLocaleString()} tokens</div>
            </div>
            
            {/* Wallet balance */}
            <div className="flex justify-between text-sm">
              <span>Available Balance</span>
              <span className="font-semibold">{walletBalance.toLocaleString()} tokens</span>
            </div>
            
            {/* New stake input */}
            <div className="space-y-2">
              <Label>New Stake Amount</Label>
              <Input
                type="number"
                value={newStakeAmount}
                onChange={(e) => setNewStakeAmount(e.target.value)}
                min="1"
                max={editSlip ? walletBalance + editSlip.total_stake_tokens : walletBalance}
              />
              {/* Quick amount buttons */}
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
            
            {/* New potential payout preview */}
            {editSlip && parseInt(newStakeAmount) > 0 && (
              <div className="bg-primary/10 rounded-lg p-3">
                <div className="text-sm text-muted-foreground">New Potential Payout</div>
                <div className="font-bold text-lg">
                  {Math.floor(parseInt(newStakeAmount) * editSlip.total_odds_decimal).toLocaleString()} tokens
                </div>
                <div className="text-xs text-muted-foreground">
                  {parseInt(newStakeAmount) > editSlip.total_stake_tokens 
                    ? `+${parseInt(newStakeAmount) - editSlip.total_stake_tokens} tokens from wallet`
                    : parseInt(newStakeAmount) < editSlip.total_stake_tokens
                      ? `${editSlip.total_stake_tokens - parseInt(newStakeAmount)} tokens refunded`
                      : 'No change'}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSlip(null)}>Cancel</Button>
            <Button 
              onClick={handleEditBet}
              disabled={isEditing || !newStakeAmount || parseInt(newStakeAmount) <= 0}
            >
              {isEditing ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Predictions;
