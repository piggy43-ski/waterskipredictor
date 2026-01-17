import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Award, ShoppingBag, Sparkles, Loader2, Package, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet } from '@/hooks/useWallet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Reward = {
  id: string;
  name: string;
  description: string;
  required_tokens: number;
  partner: string;
  category: 'coaching' | 'gear' | 'experience';
  image_url: string | null;
  max_total: number | null;
  max_per_user: number | null;
  fulfillment_type: string | null;
  usd_cost: number | null;
};

const Rewards = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useWallet();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redemptionCounts, setRedemptionCounts] = useState<Record<string, number>>({});
  const [userRedemptionCounts, setUserRedemptionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchRewards();
    fetchRedemptionCounts();
  }, [user, navigate]);

  const fetchRewards = async () => {
    try {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('available', true)
        .order('required_tokens', { ascending: true });

      if (error) throw error;

      const mappedRewards: Reward[] = (data || []).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        required_tokens: r.required_tokens,
        partner: r.partner,
        category: r.category as 'coaching' | 'gear' | 'experience',
        image_url: r.image_url || null,
        max_total: r.max_total,
        max_per_user: r.max_per_user,
        fulfillment_type: r.fulfillment_type || 'digital',
        usd_cost: r.usd_cost,
      }));

      setRewards(mappedRewards);
    } catch (error) {
      toast({
        title: "Error loading rewards",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRedemptionCounts = async () => {
    if (!user) return;

    try {
      // Fetch total redemption counts per reward
      const { data: totalData, error: totalError } = await supabase
        .from('redemptions')
        .select('reward_id');

      if (totalError) throw totalError;

      const totalCounts: Record<string, number> = {};
      totalData?.forEach(r => {
        totalCounts[r.reward_id] = (totalCounts[r.reward_id] || 0) + 1;
      });
      setRedemptionCounts(totalCounts);

      // Fetch user-specific redemption counts
      const { data: userData, error: userError } = await supabase
        .from('redemptions')
        .select('reward_id')
        .eq('user_id', user.id);

      if (userError) throw userError;

      const userCounts: Record<string, number> = {};
      userData?.forEach(r => {
        userCounts[r.reward_id] = (userCounts[r.reward_id] || 0) + 1;
      });
      setUserRedemptionCounts(userCounts);
    } catch (error) {
      console.error('Error fetching redemption counts:', error);
    }
  };

  const walletBalance = wallet?.totalBalance ?? 0;

  const handleRedeemClick = async (reward: Reward) => {
    if (walletBalance < reward.required_tokens) {
      toast({
        title: "Insufficient Tokens",
        description: `You need ${reward.required_tokens - walletBalance} more tokens`,
        variant: "destructive",
      });
      return;
    }

    // Check total limit
    if (reward.max_total) {
      const totalRedeemed = redemptionCounts[reward.id] || 0;
      if (totalRedeemed >= reward.max_total) {
        toast({
          title: "Sold Out",
          description: "This reward is no longer available",
          variant: "destructive",
        });
        return;
      }
    }

    // Check per-user limit
    if (reward.max_per_user) {
      const userRedeemed = userRedemptionCounts[reward.id] || 0;
      if (userRedeemed >= reward.max_per_user) {
        toast({
          title: "Limit Reached",
          description: `You can only redeem this reward ${reward.max_per_user} time(s)`,
          variant: "destructive",
        });
        return;
      }
    }

    setSelectedReward(reward);
  };

  const handleConfirmRedeem = async () => {
    if (!user || !selectedReward || isRedeeming) return;

    setIsRedeeming(true);

    try {
      // Create redemption record
      const { data: redemptionData, error: redemptionError } = await supabase
        .from('redemptions')
        .insert({
          user_id: user.id,
          reward_id: selectedReward.id,
          tokens_spent: selectedReward.required_tokens,
          status: 'pending'
        })
        .select('id')
        .single();

      if (redemptionError) throw redemptionError;

      // Atomically deduct tokens using database function (prevents race conditions)
      const { data: deductResult, error: deductError } = await supabase
        .rpc('deduct_tokens', {
          user_id_param: user.id,
          amount_param: selectedReward.required_tokens
        });

      if (deductError) throw deductError;
      if (!deductResult || deductResult.length === 0 || !deductResult[0].success) {
        throw new Error('Insufficient balance or wallet not found');
      }

      const newBalance = deductResult[0].new_balance;

      // Create token transaction record for the ledger
      await supabase.from('token_transactions').insert({
        user_id: user.id,
        type: 'redeem',
        amount: -selectedReward.required_tokens,
        balance_after: newBalance,
        source_id: selectedReward.id,
        source_type: 'reward',
        counterparty: 'house',
        transaction_status: 'completed',
        description: `Redeemed: ${selectedReward.name}`,
        reference_id: redemptionData.id,
        reference_type: 'redemption'
      });

      // Create house liability record
      await supabase.from('house_rewards_liability').insert({
        redemption_id: redemptionData.id,
        reward_id: selectedReward.id,
        user_id: user.id,
        token_cost: selectedReward.required_tokens,
        usd_estimated_cost: selectedReward.usd_cost,
        fulfillment_type: selectedReward.fulfillment_type || 'digital',
        partner: selectedReward.partner,
        status: 'unfulfilled'
      });

      // Send redemption receipt email
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            type: 'redemption_receipt',
            to: user.email,
            userId: user.id,
            data: {
              rewardName: selectedReward.name,
              tokensSpent: selectedReward.required_tokens,
              redemptionId: redemptionData.id,
            }
          }
        });
        console.log('Redemption receipt email sent');
      } catch (emailError) {
        console.error('Failed to send redemption email:', emailError);
      }

      toast({
        title: "Reward Redeemed!",
        description: `${selectedReward.name} - Check your email for details`,
      });

      // Update local counts
      setRedemptionCounts(prev => ({
        ...prev,
        [selectedReward.id]: (prev[selectedReward.id] || 0) + 1
      }));
      setUserRedemptionCounts(prev => ({
        ...prev,
        [selectedReward.id]: (prev[selectedReward.id] || 0) + 1
      }));

      await refetchWallet();
      setSelectedReward(null);
    } catch (error: any) {
      let errorMessage = "Failed to redeem reward. Please try again.";
      
      if (error?.message?.includes('Wallet not found')) {
        errorMessage = "Wallet not found. Please refresh and try again.";
      } else if (!navigator.onLine) {
        errorMessage = "Network error. Please check your connection.";
      }
      
      toast({
        title: "Redemption Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const categories = {
    coaching: rewards.filter(r => r.category === 'coaching'),
    gear: rewards.filter(r => r.category === 'gear'),
    experience: rewards.filter(r => r.category === 'experience'),
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'coaching':
        return Award;
      case 'gear':
        return ShoppingBag;
      case 'experience':
        return Sparkles;
      default:
        return Award;
    }
  };

  const RewardCard = ({ reward }: { reward: Reward }) => {
    const Icon = getCategoryIcon(reward.category);
    const canAfford = walletBalance >= reward.required_tokens;
    
    const totalRedeemed = redemptionCounts[reward.id] || 0;
    const userRedeemed = userRedemptionCounts[reward.id] || 0;
    
    const isSoldOut = reward.max_total ? totalRedeemed >= reward.max_total : false;
    const isUserLimitReached = reward.max_per_user ? userRedeemed >= reward.max_per_user : false;
    const remainingStock = reward.max_total ? reward.max_total - totalRedeemed : null;

    const isDisabled = !canAfford || isSoldOut || isUserLimitReached;
    
    let buttonText = 'Redeem';
    if (isSoldOut) buttonText = 'Sold Out';
    else if (isUserLimitReached) buttonText = 'Limit Reached';
    else if (!canAfford) buttonText = 'Not Enough';

    return (
      <Card className="p-4 bg-gradient-card border-border/50">
        <div className="flex gap-4">
          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            {reward.image_url ? (
              <img 
                src={reward.image_url} 
                alt={reward.name} 
                className="w-full h-full object-cover"
              />
            ) : (
              <Icon className="w-10 h-10 text-primary" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{reward.name}</h3>
                <div className="flex flex-wrap gap-1 mb-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {reward.category}
                  </Badge>
                  {remainingStock !== null && (
                    <Badge 
                      variant={remainingStock === 0 ? "destructive" : "secondary"} 
                      className="text-xs"
                    >
                      {remainingStock === 0 ? 'Sold Out' : `${remainingStock} left`}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-3">
              {reward.description}
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" />
                <span className="font-bold text-lg">
                  {reward.required_tokens.toLocaleString()}
                </span>
              </div>
              
              <Button
                size="sm"
                onClick={() => handleRedeemClick(reward)}
                disabled={isDisabled}
                variant={isSoldOut || isUserLimitReached ? "secondary" : "default"}
              >
                {buttonText}
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2">
              By {reward.partner}
            </p>
          </div>
        </div>
      </Card>
    );
  };

  if (loading || walletLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Rewards Store" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }

  const balanceAfterRedeem = selectedReward 
    ? walletBalance - selectedReward.required_tokens 
    : walletBalance;

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader 
        title="Rewards Store" 
        action={
          <div className="flex items-center gap-2 bg-card px-3 py-2 rounded-lg border border-border">
            <Coins className="w-4 h-4 text-primary" />
            <span className="font-bold">{walletBalance.toLocaleString()}</span>
          </div>
        }
      />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex justify-end mb-4">
          <Link 
            to="/help?section=Rewards%20%26%20Redemption" 
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" />
            Need help with rewards?
          </Link>
        </div>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-6">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="coaching">Coaching</TabsTrigger>
            <TabsTrigger value="gear">Gear</TabsTrigger>
            <TabsTrigger value="experience">VIP</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {rewards.map((reward) => (
              <RewardCard key={reward.id} reward={reward} />
            ))}
          </TabsContent>

          <TabsContent value="coaching" className="space-y-4">
            {categories.coaching.map((reward) => (
              <RewardCard key={reward.id} reward={reward} />
            ))}
          </TabsContent>

          <TabsContent value="gear" className="space-y-4">
            {categories.gear.map((reward) => (
              <RewardCard key={reward.id} reward={reward} />
            ))}
          </TabsContent>

          <TabsContent value="experience" className="space-y-4">
            <Card className="p-8 bg-gradient-card border-border/50 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">VIP Experiences</h3>
                  <Badge variant="secondary" className="mb-3">Coming Soon</Badge>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                    Exclusive VIP experiences and premium rewards are on the way. Stay tuned!
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={!!selectedReward} onOpenChange={(open) => !open && !isRedeeming && setSelectedReward(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Reward Redemption</DialogTitle>
            <DialogDescription>
              Review your reward redemption before confirming.
            </DialogDescription>
          </DialogHeader>
          
          {selectedReward && (
            <div className="space-y-4 py-4">
              {/* Reward Info */}
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                  {selectedReward.image_url ? (
                    <img 
                      src={selectedReward.image_url} 
                      alt={selectedReward.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (() => {
                      const Icon = getCategoryIcon(selectedReward.category);
                      return <Icon className="w-6 h-6 text-primary" />;
                    })()
                  )}
                </div>
                <div>
                  <h4 className="font-semibold">{selectedReward.name}</h4>
                  <Badge variant="outline" className="text-xs capitalize mt-1">
                    {selectedReward.category}
                  </Badge>
                  <p className="text-sm text-muted-foreground">By {selectedReward.partner}</p>
                </div>
              </div>

              {/* Token breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cost</span>
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-red-600">
                      -{selectedReward.required_tokens.toLocaleString()}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current Balance</span>
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-primary" />
                    <span className="font-semibold">{walletBalance.toLocaleString()}</span>
                  </div>
                </div>
                
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Balance After</span>
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-primary" />
                      <span className="font-bold text-lg">{balanceAfterRedeem.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setSelectedReward(null)}
              disabled={isRedeeming}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmRedeem}
              disabled={isRedeeming}
            >
              {isRedeeming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Redeeming...
                </>
              ) : (
                'Confirm Redeem'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default Rewards;