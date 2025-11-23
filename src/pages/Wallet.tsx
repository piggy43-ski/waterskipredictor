import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { mockTokenWallet } from '@/lib/mockData';
import { Coins, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const tokenPacks = [
  { name: 'Starter', price: 5, tokens: 500, popular: false },
  { name: 'Athlete', price: 20, tokens: 2200, popular: true },
  { name: 'Pro', price: 50, tokens: 6000, popular: false },
  { name: 'Champion', price: 100, tokens: 13000, popular: false },
];

const Wallet = () => {
  const { toast } = useToast();

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
          <p className="text-sm opacity-90 mb-2">Current Balance</p>
          <div className="flex items-center gap-3">
            <Coins className="w-10 h-10" />
            <span className="text-4xl font-bold">
              {mockTokenWallet.balance.toLocaleString()}
            </span>
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
                    {pack.price > 5 && (
                      <p className="text-xs text-success">
                        +{Math.round(((pack.tokens / pack.price - 100) / 100) * 100)}% bonus
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
          <h3 className="font-semibold mb-2">Important Information</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Tokens cannot be converted back to cash</li>
            <li>Use tokens for predictions and redeem for rewards</li>
            <li>No real money gambling - entertainment only</li>
          </ul>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default Wallet;
