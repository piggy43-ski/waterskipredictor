import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Token pack calculation: base_tokens = price * 100 (1 token = 1 cent)
// Then apply bonus percentage on top
const tokenPacks = [
  { name: 'Starter', price: 25, baseTokens: 2500, bonus: 0, popular: false },
  { name: 'Standard', price: 50, baseTokens: 5000, bonus: 10, popular: true },
  { name: 'Pro', price: 100, baseTokens: 10000, bonus: 15, popular: false },
  { name: 'Elite', price: 250, baseTokens: 25000, bonus: 25, popular: false },
].map(pack => ({
  ...pack,
  tokens: Math.floor(pack.baseTokens * (1 + pack.bonus / 100))
}));

const Wallet = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [purchasedTokens, setPurchasedTokens] = useState(0);
  const [earnedTokens, setEarnedTokens] = useState(0);
  const walletBalance = purchasedTokens + earnedTokens;

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchWalletBalance();
  }, [user, navigate]);

  const fetchWalletBalance = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('token_wallets')
      .select('purchased_tokens, earned_tokens')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching wallet:', error);
      return;
    }

    if (data) {
      setPurchasedTokens(data.purchased_tokens);
      setEarnedTokens(data.earned_tokens);
    }
  };

  const handlePurchase = (pack: typeof tokenPacks[0]) => {
    toast({
      title: "Purchase Initiated",
      description: `Payment integration coming soon for ${pack.name} pack`,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Token Wallet" />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Current Balance */}
        <Card className="p-6 bg-gradient-water text-primary-foreground shadow-premium">
          <p className="text-sm opacity-90 mb-2">Total Balance</p>
          <div className="flex items-center gap-3 mb-4">
            <Coins className="w-10 h-10" />
            <span className="text-4xl font-bold">
              {walletBalance.toLocaleString()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary-foreground/20">
            <div>
              <p className="text-xs opacity-75 mb-1">Purchased</p>
              <p className="text-xl font-bold">{purchasedTokens.toLocaleString()}</p>
              <p className="text-xs opacity-60 mt-0.5">For bets & fantasy</p>
            </div>
            <div>
              <p className="text-xs opacity-75 mb-1">Earned</p>
              <p className="text-xl font-bold">{earnedTokens.toLocaleString()}</p>
              <p className="text-xs opacity-60 mt-0.5">For rewards only</p>
            </div>
          </div>
        </Card>

        {/* Token Packs */}
        <div>
          <h2 className="text-lg font-bold mb-4">Buy Token Packs</h2>
          <div className="grid grid-cols-1 gap-3">
            {tokenPacks.map((pack) => (
              <Card 
                key={pack.name} 
                className={`p-5 relative overflow-hidden ${
                  pack.popular 
                    ? 'bg-gradient-card border-primary/50 shadow-glow' 
                    : 'bg-card'
                }`}
              >
                {pack.popular && (
                  <div className="absolute top-2 right-2">
                    <div className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Popular
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold mb-1">{pack.name}</h3>
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-5 h-5 text-primary" />
                      <span className="text-2xl font-bold text-primary">
                        {pack.tokens.toLocaleString()}
                      </span>
                      <span className="text-sm text-muted-foreground">tokens</span>
                    </div>
                    {pack.bonus > 0 ? (
                      <p className="text-xs text-success font-semibold">
                        +{pack.bonus}% bonus ({pack.baseTokens.toLocaleString()} + {(pack.tokens - pack.baseTokens).toLocaleString()})
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {pack.baseTokens.toLocaleString()} tokens
                      </p>
                    )}
                  </div>
                  
                  <div className="text-right">
                    <div className="text-3xl font-bold mb-2">
                      ${pack.price}
                    </div>
                    <Button
                      onClick={() => handlePurchase(pack)}
                      className={
                        pack.popular
                          ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                          : ''
                      }
                    >
                      Purchase
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Info */}
        <Card className="p-4 bg-muted/30 border-border/50">
          <h3 className="font-semibold mb-2">Token Usage Rules</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span><strong>Purchased tokens</strong> can be used for bets and fantasy entries</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success font-bold">•</span>
              <span><strong>Earned tokens</strong> (from winnings) can be used for bets, fantasy, AND rewards redemptions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Tokens cannot be converted back to cash - entertainment only</span>
            </li>
          </ul>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default Wallet;
