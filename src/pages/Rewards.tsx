import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockRewards, mockTokenWallet } from '@/lib/mockData';
import { Coins, Award, ShoppingBag, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Rewards = () => {
  const { toast } = useToast();

  const handleRedeem = (reward: typeof mockRewards[0]) => {
    if (mockTokenWallet.balance >= reward.required_tokens) {
      toast({
        title: "Reward Redeemed!",
        description: `${reward.name} - Check your email for details`,
      });
    } else {
      toast({
        title: "Insufficient Tokens",
        description: `You need ${reward.required_tokens - mockTokenWallet.balance} more tokens`,
        variant: "destructive",
      });
    }
  };

  const categories = {
    coaching: mockRewards.filter(r => r.category === 'coaching'),
    gear: mockRewards.filter(r => r.category === 'gear'),
    experience: mockRewards.filter(r => r.category === 'experience'),
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader 
        title="Rewards Store" 
        action={
          <div className="flex items-center gap-2 bg-card px-3 py-2 rounded-lg border border-border">
            <Coins className="w-4 h-4 text-primary" />
            <span className="font-bold">{mockTokenWallet.balance.toLocaleString()}</span>
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
            {mockRewards.map((reward) => {
              const Icon = getCategoryIcon(reward.category);
              const canAfford = mockTokenWallet.balance >= reward.required_tokens;

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

          {Object.entries(categories).map(([category, rewards]) => (
            <TabsContent key={category} value={category} className="space-y-4">
              {rewards.map((reward) => {
                const Icon = getCategoryIcon(reward.category);
                const canAfford = mockTokenWallet.balance >= reward.required_tokens;

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
