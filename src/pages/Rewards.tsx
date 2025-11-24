import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Award, ShoppingBag, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Reward } from '@/types';

const Rewards = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchRewards();
    fetchWalletBalance();
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

  const handleRedeem = async (reward: Reward) => {
    if (!user) return;

    if (walletBalance >= reward.required_tokens) {
      try {
        // Create redemption record
        const { error: redemptionError } = await supabase
          .from('redemptions')
          .insert({
            user_id: user.id,
            reward_id: reward.id,
            tokens_spent: reward.required_tokens,
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
        if (!walletData) return;

        const newEarnedTokens = Math.max(0, walletData.earned_tokens - reward.required_tokens);
        const remaining = reward.required_tokens - walletData.earned_tokens;
        const newPurchasedTokens = remaining > 0 ? walletData.purchased_tokens - remaining : walletData.purchased_tokens;

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
          description: `${reward.name} - Check your email for details`,
        });

        await fetchWalletBalance();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to redeem reward. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Insufficient Tokens",
        description: `You need ${reward.required_tokens - walletBalance} more tokens`,
        variant: "destructive",
      });
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

  if (loading) {
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
            {rewards.map((reward) => {
              const Icon = getCategoryIcon(reward.category);
              const canAfford = walletBalance >= reward.required_tokens;

              return (
                <Card key={reward.id} className="p-4 bg-gradient-card border-border/50">
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
                          onClick={() => handleRedeem(reward)}
                          disabled={!canAfford}
                          className={canAfford ? 'bg-primary hover:bg-primary/90' : ''}
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
            })}
          </TabsContent>

          {Object.entries(categories).map(([category, categoryRewards]) => (
            <TabsContent key={category} value={category} className="space-y-4">
              {categoryRewards.map((reward) => {
                const Icon = getCategoryIcon(reward.category);
                const canAfford = walletBalance >= reward.required_tokens;

                return (
                  <Card key={reward.id} className="p-4 bg-gradient-card border-border/50">
                    <div className="flex gap-4">
                      <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="w-10 h-10 text-primary" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold mb-1">{reward.name}</h3>
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
                            onClick={() => handleRedeem(reward)}
                            disabled={!canAfford}
                            className={canAfford ? 'bg-primary hover:bg-primary/90' : ''}
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
              })}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

export default Rewards;
