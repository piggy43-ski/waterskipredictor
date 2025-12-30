import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Award, ShoppingBag, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Reward } from '@/types';
import { useWallet } from '@/hooks/useWallet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const Rewards = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useWallet();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchRewards();
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
        image_url: r.image_url || ''
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

  const walletBalance = wallet?.totalBalance ?? 0;

  const handleRedeemClick = (reward: Reward) => {
    if (walletBalance < reward.required_tokens) {
      toast({
        title: "Insufficient Tokens",
        description: `You need ${reward.required_tokens - walletBalance} more tokens`,
        variant: "destructive",
      });
      return;
    }
    setSelectedReward(reward);
  };

  const handleConfirmRedeem = async () => {
    if (!user || !selectedReward || isRedeeming) return;

    setIsRedeeming(true);

    try {
      // Create redemption record
      const { error: redemptionError } = await supabase
        .from('redemptions')
        .insert({
          user_id: user.id,
          reward_id: selectedReward.id,
          tokens_spent: selectedReward.required_tokens,
          status: 'pending'
        });

      if (redemptionError) throw redemptionError;

      // Update wallet - deduct from earned_tokens first
      const { data: walletData, error: walletFetchError } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletFetchError) throw walletFetchError;
      if (!walletData) throw new Error('Wallet not found');

      const earnedTokens = walletData.earned_tokens ?? 0;
      const purchasedTokens = walletData.purchased_tokens ?? 0;
      const newEarnedTokens = Math.max(0, earnedTokens - selectedReward.required_tokens);
      const remaining = selectedReward.required_tokens - earnedTokens;
      const newPurchasedTokens = remaining > 0 ? purchasedTokens - remaining : purchasedTokens;

      const { error: walletUpdateError } = await supabase
        .from('token_wallets')
        .update({
          purchased_tokens: Math.max(0, newPurchasedTokens),
          earned_tokens: newEarnedTokens
        })
        .eq('user_id', user.id);

      if (walletUpdateError) throw walletUpdateError;

      toast({
        title: "Reward Redeemed!",
        description: `${selectedReward.name} - Check your email for details`,
      });

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

    return (
      <Card className="p-4 bg-gradient-card border-border/50">
        <div className="flex gap-4">
          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className="w-10 h-10 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{reward.name}</h3>
                <Badge variant="outline" className="text-xs capitalize mb-2">
                  {reward.category}
                </Badge>
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
                disabled={!canAfford}
              >
                {canAfford ? 'Redeem' : 'Not Enough'}
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

          {Object.entries(categories).map(([category, categoryRewards]) => (
            <TabsContent key={category} value={category} className="space-y-4">
              {categoryRewards.map((reward) => (
                <RewardCard key={reward.id} reward={reward} />
              ))}
            </TabsContent>
          ))}
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
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  {(() => {
                    const Icon = getCategoryIcon(selectedReward.category);
                    return <Icon className="w-6 h-6 text-primary" />;
                  })()}
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
