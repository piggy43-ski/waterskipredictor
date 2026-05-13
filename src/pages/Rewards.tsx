import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Award, ShoppingBag, Sparkles, Loader2, Package, HelpCircle, Gift, Trophy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet, broadcastWalletRefresh } from '@/hooks/useWallet';
import { RedemptionFormDialog, RedemptionFormData } from '@/components/RedemptionFormDialog';

type Reward = {
  id: string;
  name: string;
  description: string;
  required_tokens: number;
  partner: string;
  category: 'coaching' | 'gear' | 'experience' | 'store_credit' | 'elite_skis';
  tier: 'ENTRY' | 'MID' | 'PRO' | 'ELITE' | null;
  sort_order: number;
  image_url: string | null;
  max_total: number | null;
  max_per_user: number | null;
  fulfillment_type: string | null;
  usd_cost: number | null;
};

type SectionProps = {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Reward[];
  renderCard: (r: Reward) => React.ReactNode;
};

const CatalogSection = ({ title, subtitle, icon: Icon, items, renderCard }: SectionProps) => (
  <section className="space-y-3">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="font-bold tracking-tight uppercase text-sm">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
    {items.length === 0 ? (
      <Card className="p-6 bg-gradient-card border-border/50 text-center">
        <p className="text-sm text-muted-foreground">Nothing in this vault yet — keep earning.</p>
      </Card>
    ) : (
      <div className="space-y-3">{items.map(renderCard)}</div>
    )}
  </section>
);

type _RewardLegacyPlaceholder = {
  id: string;
  name: string;
  description: string;
  required_tokens: number;
  partner: string;
  category: 'coaching' | 'gear' | 'experience' | 'store_credit' | 'elite_skis';
  tier: 'ENTRY' | 'MID' | 'PRO' | 'ELITE' | null;
  sort_order: number;
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
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const mappedRewards: Reward[] = (data || []).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        required_tokens: r.required_tokens,
        partner: r.partner,
        category: r.category as Reward['category'],
        tier: ((r as any).tier ?? null) as Reward['tier'],
        sort_order: (r as any).sort_order ?? 0,
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

  const handleConfirmRedeem = async (formData: RedemptionFormData) => {
    if (!user || !selectedReward || isRedeeming) return;

    setIsRedeeming(true);

    try {
      const fulfillmentStatus =
        selectedReward.category === 'elite_skis' ? 'concierge_review' : 'pending_fulfillment';

      // Create redemption record
      const { data: redemptionData, error: redemptionError } = await supabase
        .from('redemptions')
        .insert({
          user_id: user.id,
          reward_id: selectedReward.id,
          tokens_spent: selectedReward.required_tokens,
          status: 'pending',
          fulfillment_status: fulfillmentStatus,
          glove_size: formData.glove_size ?? null,
          shipping_name: formData.shipping_name ?? null,
          shipping_address_line1: formData.shipping_address_line1 ?? null,
          shipping_address_line2: formData.shipping_address_line2 ?? null,
          shipping_city: formData.shipping_city ?? null,
          shipping_state: formData.shipping_state ?? null,
          shipping_zip: formData.shipping_zip ?? null,
          shipping_phone: formData.shipping_phone ?? null,
          gift_card_email: formData.gift_card_email ?? null,
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

      // Send branded redemption confirmation email
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            type: 'redemption_confirmation',
            to: user.email,
            userId: user.id,
            dry_run: typeof window !== 'undefined' && (
              window.localStorage.getItem('__EMAIL_DRY_RUN__') === 'true' ||
              window.location.search.includes('dryrun=1')
            ),
            data: {
              username: (user.user_metadata as any)?.username || user.email?.split('@')[0] || 'Champion',
              rewardName: selectedReward.name,
              tokensSpent: selectedReward.required_tokens,
              redemptionId: redemptionData.id,
              category: selectedReward.category,
              shipping: formData.shipping_name ? {
                shipping_name: formData.shipping_name,
                shipping_address_line1: formData.shipping_address_line1,
                shipping_address_line2: formData.shipping_address_line2 || '',
                shipping_city: formData.shipping_city,
                shipping_state: formData.shipping_state,
                shipping_zip: formData.shipping_zip,
                shipping_phone: formData.shipping_phone,
              } : null,
              gloveSize: formData.glove_size || null,
              giftCardEmail: formData.gift_card_email || null,
            }
          }
        });
        console.log('Redemption confirmation email sent');
      } catch (emailError) {
        console.error('Failed to send redemption confirmation email:', emailError);
      }

      // Notify admins (email + in-app). Both are best-effort and respect dry_run.
      const isDryRun = typeof window !== 'undefined' && (
        window.localStorage.getItem('__EMAIL_DRY_RUN__') === 'true' ||
        window.location.search.includes('dryrun=1')
      );
      const shippingPayload = formData.shipping_name ? {
        shipping_name: formData.shipping_name,
        shipping_address_line1: formData.shipping_address_line1,
        shipping_address_line2: formData.shipping_address_line2 || '',
        shipping_city: formData.shipping_city,
        shipping_state: formData.shipping_state,
        shipping_zip: formData.shipping_zip,
        shipping_phone: formData.shipping_phone,
      } : null;
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            type: 'admin_redemption_new',
            to: 'robert@waterskipredictor.com',
            dry_run: isDryRun,
            data: {
              userUsername: (user.user_metadata as any)?.username || user.email?.split('@')[0] || 'user',
              userEmail: user.email,
              rewardName: selectedReward.name,
              rewardCategory: selectedReward.category,
              partner: selectedReward.partner,
              tokensSpent: selectedReward.required_tokens,
              redemptionId: redemptionData.id,
              shipping: shippingPayload,
              gloveSize: formData.glove_size || null,
              giftCardEmail: formData.gift_card_email || null,
            }
          }
        });
      } catch (e) {
        console.error('Failed to send admin redemption notification:', e);
      }

      // In-app admin notification — insert one row per admin user
      try {
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');
        if (admins && admins.length > 0) {
          const rows = admins.map(a => ({
            user_id: a.user_id,
            type: 'redemption_new',
            title: 'New redemption',
            message: `${selectedReward.name} — ${selectedReward.required_tokens.toLocaleString()} tokens`,
            link: '/admin/liabilities',
            read: false,
            metadata: { redemption_id: redemptionData.id, reward_id: selectedReward.id },
          }));
          await supabase.from('notifications').insert(rows);
        }
      } catch (e) {
        console.error('Failed to insert admin in-app notification:', e);
      }

      toast({
        title: "Redemption confirmed",
        description: `${selectedReward.name} — ID ${redemptionData.id.slice(0,8).toUpperCase()}`,
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
      broadcastWalletRefresh();
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

  const sections = {
    gear: rewards.filter(r => r.category === 'gear'),
    store_credit: rewards.filter(r => r.category === 'store_credit'),
    elite_skis: rewards.filter(r => r.category === 'elite_skis'),
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'coaching': return Award;
      case 'gear': return ShoppingBag;
      case 'experience': return Sparkles;
      case 'store_credit': return Gift;
      case 'elite_skis': return Trophy;
      default: return Award;
    }
  };

  const tierLabel = (tier: Reward['tier']) => {
    switch (tier) {
      case 'ENTRY': return 'Entry Tier';
      case 'MID': return 'Mid Tier';
      case 'PRO': return 'Pro Tier';
      case 'ELITE': return 'Elite Tier';
      default: return null;
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
    else if (!canAfford) buttonText = 'Locked';

    const tLabel = tierLabel(reward.tier);

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
                  {tLabel && (
                    <Badge variant="outline" className="text-xs">
                      {tLabel}
                    </Badge>
                  )}
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader 
        title="Rewards Store" 
      />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Trust Banner */}
        <Card className="p-4 bg-primary/5 border-primary/20 mb-6">
          <p className="text-sm text-center">
            Redeem your tokens for real rewards like gear, lessons, and experiences.
          </p>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Rewards only. Tokens cannot be exchanged for cash.
          </p>
        </Card>

        <div className="flex justify-end mb-4">
          <Link 
            to="/help?section=Rewards%20%26%20Redemption" 
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" />
            Need help with rewards?
          </Link>
        </div>
        {rewards.length === 0 ? (
          <Card className="p-8 bg-gradient-card border-border/50 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Rewards Coming Soon</h3>
                <Badge variant="secondary" className="mb-3">Coming Soon</Badge>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                  We're working on exciting rewards for you. Keep earning tokens!
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-8">
            <CatalogSection
              title="Gear"
              subtitle="PIGOSKI gloves — built for the line"
              icon={ShoppingBag}
              items={sections.gear}
              renderCard={(r) => <RewardCard key={r.id} reward={r} />}
            />
            <CatalogSection
              title="Store Credit"
              subtitle="Spend anywhere in the PIGOSKI catalog"
              icon={Gift}
              items={sections.store_credit}
              renderCard={(r) => <RewardCard key={r.id} reward={r} />}
            />
            <CatalogSection
              title="Elite Tier · Skis"
              subtitle="Shortline · Season-Long Grind"
              icon={Trophy}
              items={sections.elite_skis}
              renderCard={(r) => <RewardCard key={r.id} reward={r} />}
            />
          </div>
        )}
      </div>

      {selectedReward && (
        <RedemptionFormDialog
          open={!!selectedReward}
          onOpenChange={(open) => { if (!open) setSelectedReward(null); }}
          rewardName={selectedReward.name}
          rewardCategory={selectedReward.category}
          requiredTokens={selectedReward.required_tokens}
          walletBalance={walletBalance}
          defaultEmail={user?.email || ''}
          isSubmitting={isRedeeming}
          onConfirm={handleConfirmRedeem}
        />
      )}

      <BottomNav />
    </div>
  );
};

export default Rewards;