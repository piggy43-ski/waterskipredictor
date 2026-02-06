import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Sparkles, Loader2, HelpCircle, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/hooks/useWallet';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { TokenDisclaimer } from '@/components/TokenDisclaimer';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

// Base token packs (before any discount)
// Base tokens = price × 100 (1 token = 1 cent)
const BASE_TOKEN_PACKS = [
  { name: 'Starter', price: 25, baseTokens: 2500, baseBonus: 0, popular: false, priceId: 'price_1SkYKkCpRLHrrx2GRXBgdwXG' },
  { name: 'Standard', price: 50, baseTokens: 5000, baseBonus: 5, popular: true, priceId: 'price_1SkYLACpRLHrrx2GDI8vkP3G' },
  { name: 'Pro', price: 100, baseTokens: 10000, baseBonus: 10, popular: false, priceId: 'price_1SkYM0CpRLHrrx2GCwCNySQs' },
  { name: 'Elite', price: 250, baseTokens: 25000, baseBonus: 15, popular: false, priceId: 'price_1SkYMCCpRLHrrx2GQ6lHCyxS' },
];

interface ReferralCodeInfo {
  code: string;
  starter_bonus_pct: number;
  standard_bonus_pct: number;
  pro_bonus_pct: number;
  elite_bonus_pct: number;
  is_active: boolean;
}

const Wallet = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { wallet, loading } = useWallet();
  const [purchasingPack, setPurchasingPack] = useState<string | null>(null);

  // Fetch user's referral code info (if they have one and haven't made first purchase)
  const { data: referralInfo } = useQuery({
    queryKey: ['user-referral-info', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Get profile to check referral code and first purchase
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('referred_by_code_id, first_purchase_at')
        .eq('id', user.id)
        .single();
      
      if (profileError || !profile?.referred_by_code_id || profile.first_purchase_at) {
        return null; // No referral code OR already made first purchase
      }
      
      // Get referral code details
      const { data: code, error: codeError } = await supabase
        .from('referral_codes')
        .select('code, starter_bonus_pct, standard_bonus_pct, pro_bonus_pct, elite_bonus_pct, is_active')
        .eq('id', profile.referred_by_code_id)
        .single();
      
      if (codeError || !code?.is_active) return null;
      
      return code as ReferralCodeInfo;
    },
    enabled: !!user?.id,
  });

  // Calculate token packs with appropriate bonus (referral OR base, never both)
  const tokenPacks = BASE_TOKEN_PACKS.map(pack => {
    let bonusPct = pack.baseBonus / 100; // Default to base discount
    let isReferralBonus = false;
    
    // If user has active referral code and hasn't made first purchase, use referral bonus
    if (referralInfo) {
      isReferralBonus = true;
      switch (pack.name) {
        case 'Starter':
          bonusPct = referralInfo.starter_bonus_pct;
          break;
        case 'Standard':
          bonusPct = referralInfo.standard_bonus_pct;
          break;
        case 'Pro':
          bonusPct = referralInfo.pro_bonus_pct;
          break;
        case 'Elite':
          bonusPct = referralInfo.elite_bonus_pct;
          break;
      }
    }
    
    const bonusPercentage = Math.round(bonusPct * 100);
    const tokens = Math.floor(pack.baseTokens * (1 + bonusPct));
    
    return {
      ...pack,
      tokens,
      bonusPercentage,
      isReferralBonus,
    };
  });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const handlePurchase = async (pack: typeof tokenPacks[0]) => {
    setPurchasingPack(pack.name);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-token-checkout', {
        body: {
          priceId: pack.priceId,
          tokenAmount: pack.tokens,
          packName: pack.name,
          baseTokens: pack.baseTokens, // Pass base tokens for accurate USD calculation
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Failed to initiate checkout",
        variant: "destructive",
      });
      setPurchasingPack(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Token Balance" />
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <Card className="p-6 bg-gradient-water text-primary-foreground shadow-premium">
            <Skeleton className="h-4 w-24 mb-2 bg-primary-foreground/20" />
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="w-10 h-10 rounded-full bg-primary-foreground/20" />
              <Skeleton className="h-10 w-32 bg-primary-foreground/20" />
            </div>
            <Skeleton className="h-3 w-48 bg-primary-foreground/20" />
          </Card>
          <div className="grid gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex justify-between items-center">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                  <Skeleton className="h-10 w-20" />
                </div>
              </Card>
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const totalBalance = (wallet?.purchasedTokens || 0) + (wallet?.earnedTokens || 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Token Balance" />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Balance Card */}
        <Card className="p-6 bg-gradient-water text-primary-foreground shadow-premium">
          <p className="text-sm opacity-90">Available Balance</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Coins className="w-6 h-6" />
            </div>
            <span className="text-4xl font-bold">{totalBalance.toLocaleString()}</span>
          </div>
          <div className="mt-4 pt-4 border-t border-primary-foreground/20 flex justify-between text-sm">
            <div>
              <p className="opacity-70">Purchased</p>
              <p className="font-semibold">{(wallet?.purchasedTokens || 0).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="opacity-70">Earned</p>
              <p className="font-semibold">{(wallet?.earnedTokens || 0).toLocaleString()}</p>
            </div>
          </div>
        </Card>

        {/* Referral Code Banner (if active) */}
        {referralInfo && (
          <Card className="p-4 bg-accent/50 border-accent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                <Gift className="w-5 h-5 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  Referral Code: {referralInfo.code}
                </p>
                <p className="text-sm text-muted-foreground">
                  Exclusive bonuses applied to your first purchase!
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Token Packs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Buy Tokens</h2>
            <Link to="/help" className="text-muted-foreground hover:text-foreground">
              <HelpCircle className="w-5 h-5" />
            </Link>
          </div>
          
          <div className="grid gap-4">
            {tokenPacks.map((pack) => (
              <Card 
                key={pack.name} 
                className={`p-4 relative ${pack.popular ? 'ring-2 ring-primary' : ''}`}
              >
                {pack.popular && (
                  <div className="absolute -top-3 left-4">
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">{pack.name}</h3>
                      {pack.bonusPercentage > 0 && (
                        <Badge 
                          variant={pack.isReferralBonus ? "default" : "secondary"} 
                          className="text-xs"
                        >
                          {pack.isReferralBonus && <Gift className="w-3 h-3 mr-1" />}
                          +{pack.bonusPercentage}%
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Coins className="w-4 h-4 text-primary" />
                      <span className="text-xl font-bold text-primary">
                        {pack.tokens.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">tokens</span>
                    </div>
                    {pack.bonusPercentage > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Base: {pack.baseTokens.toLocaleString()} + {(pack.tokens - pack.baseTokens).toLocaleString()} bonus
                      </p>
                    )}
                  </div>
                  
                  <Button 
                    onClick={() => handlePurchase(pack)}
                    disabled={!!purchasingPack}
                    className="min-w-[80px]"
                  >
                    {purchasingPack === pack.name ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      `$${pack.price}`
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Transaction History Link */}
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={() => navigate('/transactions')}
        >
          View Transaction History
        </Button>

        {/* Token Disclaimer */}
        <TokenDisclaimer />
      </div>
      
      <BottomNav />
    </div>
  );
};

export default Wallet;
